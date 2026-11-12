/* Guesses whether an unsorted recording is a lesson or a training (vocal exercise) recording, from free signals only:
 * the lesson calendar, the file name, its length and a transcript that was already paid for.
 * It only suggests. Nothing is changed until the user applies the suggestion; a type the user chose always wins. */
(function (root) {
  const LESSON_NAME = /레슨|수업|lesson/i;
  const TRAINING_NAME = /발성|트레이닝|training|립\s*트릴|lip\s*-?\s*trill|허밍|humming|스케일|scale|워밍\s*업|warm\s*-?\s*up|호흡\s*연습|vocali[sz]e/i;
  // Words a teacher says while coaching; lyrics rarely string several of them together.
  const COACHING = ['다시', '한번 더', '한 번 더', '좋아', '좋아요', '잘했', '호흡', '발음', '선생님', '해볼게', '해 볼게', '해봐', '해 봐', '느낌', '힘 빼', '힘빼', '턱', '배에', '소리를', '여기서', '이렇게', '천천히', '높게', '낮게', '자 이번', '쉬고'];
  // Sung exercise syllables: vowels and simple syllables held or repeated ("아아아", "마메미모무", "랄라").
  const SYLLABLE = /^(?:[아오우이에으음마메미모무나네니노누라레리로루야여요유하호후브르부랄]{1,3}|([아오우이에으음마메미모무나네니노누라레리로루야하호후랄])\1+|[a-z]{1,2})$/u;

  const norm = s => String(s || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const hm = t => { const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const monthDay = d => { const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(d || ''); return m ? Number(m[1]) + '월 ' + Number(m[2]) + '일' : d; };

  /** Coaching words found in a transcript (distinct). */
  function coachingWords(transcript) {
    const text = ' ' + norm(transcript) + ' ';
    return COACHING.filter(w => text.includes(w));
  }
  /** A transcript that is mostly exercise syllables, not words: at least 6 tokens and 70% syllables. */
  function trainingLike(transcript) {
    const tokens = norm(transcript).split(' ').filter(Boolean);
    if (tokens.length < 6) return false;
    return tokens.filter(t => SYLLABLE.test(t)).length / tokens.length >= 0.7;
  }
  /** The lesson this recording was made in, by date and (when both have one) time of day. */
  function lessonAt(item, lessons, dateOf) {
    const day = dateOf(item);
    if (!day) return null;
    const minutes = Number(item?.durationSeconds) / 60 || 0;
    const created = Number(item?.created) > 0 ? new Date(Number(item.created)) : null;
    const at = created && !/^\d{4}-\d{2}-\d{2}$/.test(item?.recordedDate || '') ? created.getHours() * 60 + created.getMinutes() : null;
    for (const lesson of lessons || []) {
      if (!lesson || lesson.date !== day || lesson.status === 'cancelled' || lesson.status === 'canceled') continue;
      const start = hm(lesson.startTime), end = hm(lesson.endTime) ?? (start == null ? null : start + 90);
      if (at != null && start != null) {
        // Made between an hour before the lesson starts and an hour after it ends.
        if (at >= start - 60 && at <= end + 60) return {lesson, why: monthDay(day) + ' ' + lesson.startTime + ' 레슨 시간에 녹음'};
        continue;
      }
      if (minutes >= 15) return {lesson, why: monthDay(day) + ' 레슨 날 녹음 · ' + Math.round(minutes) + '분'};
    }
    return null;
  }
  /**
   * @returns {{kind:'lesson'|'training', why:string}|null} a suggestion, or null when nothing points elsewhere.
   * options: lessons (db.lessons), dateOf (item → 'YYYY-MM-DD'), transcript (already paid for), current (its type now).
   */
  function guess(item, {lessons = [], dateOf = () => '', transcript = '', current = 'song'} = {}) {
    if (!item || ['song', 'lesson', 'training', 'room'].includes(String(item.recordingCategory || ''))) return null; // the user chose
    const name = String(item.originalFilename || item.name || '');
    let lesson = null;
    if (LESSON_NAME.test(name)) lesson = {why: '파일 이름에 ‘레슨’'};
    else lesson = lessonAt(item, lessons, dateOf);
    if (!lesson) { const words = coachingWords(transcript); if (words.length >= 3) lesson = {why: '설명하는 말이 많아요 (' + words.slice(0, 3).join(', ') + ')'}; }
    if (lesson) return current === 'lesson' ? null : {kind: 'lesson', why: lesson.why};
    if (TRAINING_NAME.test(name)) return {kind: 'training', why: '파일 이름이 발성 연습'};
    if (trainingLike(transcript)) return {kind: 'training', why: '가사 대신 발성 소리(아·오·마…)가 대부분'};
    return null;
  }

  const api = {guess, trainingLike, coachingWords, lessonAt};
  root.VzipRecordingKind = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
