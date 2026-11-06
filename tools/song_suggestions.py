#!/usr/bin/env python3
"""Read-only, one-off STT song suggestions for VOCAL.zip.

Inputs: 1) media CSV: id,name,path,songId (path points to a LOCAL audio copy)
        2) songs CSV: id,title,aliases,lyric_hints
Outputs: review.csv and per-file cache. Never uploads, deletes, renames, or edits media.
Use --dry-run to inspect filename-based suggestions without installing an STT model.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
from difflib import SequenceMatcher
from pathlib import Path

STOPWORDS = {"m4a", "mp3", "wav", "flac", "audio", "recording", "녹음", "레슨", "연습", "take"}
DATE = re.compile(r"(?:20\d\d)[-_./ ]?(?:0?[1-9]|1[0-2])[-_./ ]?(?:[0-2]?\d|3[01])")
EXT = re.compile(r"\.(?:m4a|mp3|wav|flac|aac|ogg)$", re.I)
NUMBER = re.compile(r"\b(?:20\d\d|\d{1,2})\b")


def normalize(value: str) -> str:
    value = DATE.sub(" ", value or "")
    value = EXT.sub(" ", value)
    value = re.sub(r"[_#()[\]{}.,!?:/\\\-]+", " ", value.casefold())
    return " ".join(token for token in value.split() if token not in STOPWORDS)


def read_csv(path: Path):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def parse_songs(rows):
    songs = []
    for row in rows:
        song_id, title = (row.get("id") or "").strip(), (row.get("title") or "").strip()
        if not song_id or not title:
            continue
        aliases = [title] + [part.strip() for part in (row.get("aliases") or "").split("|") if part.strip()]
        hints = [part.strip() for part in (row.get("lyric_hints") or "").split("|") if part.strip()]
        songs.append({"id": song_id, "title": title, "aliases": aliases, "hints": hints})
    return songs


def score_song(filename: str, transcript: str, song: dict):
    name = normalize(filename)
    transcript = normalize(transcript)
    alias_scores = []
    for alias in song["aliases"]:
        query = normalize(alias)
        if not query:
            continue
        # Avoid matching short generic words embedded in filenames.
        if len(query) >= 5 and query in name:
            alias_scores.append(0.96)
        elif name and len(query) >= 5:
            alias_scores.append(0.68 * SequenceMatcher(None, name, query).ratio())
    filename_score = max(alias_scores, default=0.0)
    # Only user-supplied lyric hints are compared; no scraping copyrighted lyrics.
    lyric_score = 0.0
    for hint in song["hints"]:
        key = normalize(hint)
        if len(key) < 8 or not transcript:
            continue
        if key in transcript:
            lyric_score = max(lyric_score, 0.94)
        else:
            # Compare overlapping windows to avoid entire-transcript length penalty.
            tokens, width = transcript.split(), max(1, len(key.split()))
            for index in range(0, max(1, len(tokens) - width + 1)):
                window = " ".join(tokens[index:index + width + 2])
                lyric_score = max(lyric_score, 0.7 * SequenceMatcher(None, key, window).ratio())
    return max(filename_score, lyric_score), "가사 단서" if lyric_score > filename_score else "파일명"


def suggest(filename, transcript, songs, top=3):
    candidates = []
    for song in songs:
        score, method = score_song(filename, transcript, song)
        if score >= 0.32:
            candidates.append((score, song["id"], song["title"], method))
    candidates.sort(key=lambda item: (-item[0], item[2]))
    return candidates[:top]


def fingerprint(row, source: Path):
    stat = source.stat() if source.exists() else None
    raw = json.dumps([row.get("id"), str(source), stat.st_size if stat else None,
                      stat.st_mtime_ns if stat else None], ensure_ascii=False)
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


def run(args):
    rows, songs = read_csv(args.media), parse_songs(read_csv(args.songs))
    if not songs:
        raise ValueError("곡 목록이 비어 있습니다. songs.csv에서 id,title을 확인하세요.")
    args.output.mkdir(parents=True, exist_ok=True)
    cache_dir = args.output / "cache"
    cache_dir.mkdir(exist_ok=True)
    eligible = [row for row in rows if not (row.get("songId") or row.get("song_id") or "").strip()]
    if args.ids:
        selected = set(args.ids.split(","))
        eligible = [row for row in eligible if row.get("id") in selected]
    if args.limit:
        eligible = eligible[:args.limit]
    transcriber = None
    output = []
    print(f"대상 {len(eligible)}개 / 전체 {len(rows)}개; 원본 변경 없음")
    for number, row in enumerate(eligible, 1):
        media_id = (row.get("id") or "").strip()
        if not media_id:
            continue
        name = (row.get("name") or row.get("filename") or "").strip()
        path = Path(row.get("path") or name)
        if not path.is_absolute():
            path = args.audio_dir / path
        text = (row.get("transcript") or "").strip()
        error = ""
        # First-pass matching does not need any STT or audio download.
        proposals = suggest(name, text, songs)
        if not text and not args.dry_run and (not proposals or proposals[0][0] < 0.9):
            if not path.is_file():
                error = "로컬 파일 없음 (원본은 변경하지 않음)"
            else:
                key = fingerprint(row, path)
                cache_file = cache_dir / f"{key}.json"
                if cache_file.exists():
                    text = json.loads(cache_file.read_text(encoding="utf-8")).get("text", "")
                else:
                    try:
                        if transcriber is None:
                            from faster_whisper import WhisperModel
                            transcriber = WhisperModel(args.model, device="auto", compute_type="int8")
                        # Scan short excerpts instead of transcribing the full library.
                        from subprocess import run as subprocess_run
                        import tempfile
                        with tempfile.TemporaryDirectory() as temporary:
                            snippet = Path(temporary) / "snippet.wav"
                            result = subprocess_run([
                                "ffmpeg", "-v", "error", "-y", "-ss", str(args.offset),
                                "-i", str(path), "-t", str(args.seconds),
                                "-ac", "1", "-ar", "16000", str(snippet)
                            ], capture_output=True, text=True)
                            if result.returncode != 0:
                                raise RuntimeError("ffmpeg 구간 추출 실패: " + result.stderr[-240:])
                            segments, _ = transcriber.transcribe(str(snippet), beam_size=3,
                                                                  vad_filter=False,
                                                                  language=args.language or None)
                            text = " ".join(segment.text.strip() for segment in segments)
                        cache_file.write_text(json.dumps({"text": text}, ensure_ascii=False), encoding="utf-8")
                    except Exception as exc:
                        error = f"STT 실패: {type(exc).__name__}: {str(exc)[:120]}"
                proposals = suggest(name, text, songs)
        out = {"media_id": media_id, "filename": name, "recorded_date": row.get("recordedDate") or "",
               "transcript_excerpt": text[:500], "status": "검토 필요" if proposals else "식별 불가",
               "approved_song_id": "", "error": error}
        for idx in range(3):
            candidate = proposals[idx] if idx < len(proposals) else None
            out.update({f"candidate_{idx+1}_id": candidate[1] if candidate else "",
                        f"candidate_{idx+1}_title": candidate[2] if candidate else "",
                        f"candidate_{idx+1}_score": round(candidate[0], 3) if candidate else "",
                        f"candidate_{idx+1}_method": candidate[3] if candidate else ""})
        output.append(out)
        print(f"[{number}/{len(eligible)}] {name}: " +
              (proposals[0][2] if proposals else error or "미분류"))
    columns = ["media_id", "filename", "recorded_date", "transcript_excerpt", "status",
               "approved_song_id", "error"] + [
               f"candidate_{idx}_{field}" for idx in range(1, 4)
               for field in ("id", "title", "score", "method")]
    destination = args.output / "review.csv"
    with destination.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=columns)
        writer.writeheader()
        writer.writerows(output)
    print(f"검토용 결과 저장: {destination} (승인·DB 반영은 하지 않음)")
    return 0


def main():
    parser = argparse.ArgumentParser(description="VOCAL.zip 일회성 STT 곡 후보 생성 (읽기 전용)")
    parser.add_argument("--media", type=Path, required=True, help="id,name,path,songId 열의 CSV")
    parser.add_argument("--songs", type=Path, required=True, help="id,title,aliases,lyric_hints 열의 CSV")
    parser.add_argument("--audio-dir", type=Path, default=Path("."), help="로컬 녹음파일 폴더")
    parser.add_argument("--output", type=Path, default=Path("stt-song-review"))
    parser.add_argument("--dry-run", action="store_true", help="STT 없이 파일명과 전사 텍스트만 검사")
    parser.add_argument("--ids", help="선택한 media id만 쉼표로 구분")
    parser.add_argument("--limit", type=int, default=0, help="샘플 10개처럼 처리 건수 제한")
    parser.add_argument("--model", default="small", help="faster-whisper 모델명")
    parser.add_argument("--language", default="", help="ko 또는 en; 비우면 자동 감지")
    parser.add_argument("--offset", type=int, default=20, help="STT 시작 초")
    parser.add_argument("--seconds", type=int, default=30, help="STT 분석 구간 길이")
    args = parser.parse_args()
    if args.seconds < 1 or args.seconds > 180 or args.offset < 0:
        parser.error("--offset / --seconds 범위를 확인하세요.")
    try:
        return run(args)
    except Exception as exc:
        print(f"오류: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
