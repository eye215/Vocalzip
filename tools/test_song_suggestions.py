"""Run: python3 -m unittest discover -s tools -p 'test_song_suggestions.py'"""
import unittest
from song_suggestions import normalize, parse_songs, suggest


class SongSuggestionTests(unittest.TestCase):
    def setUp(self):
        self.songs = parse_songs([
            {"id": "s1", "title": "Out Here on My Own", "aliases": "", "lyric_hints": "when i'm down"},
            {"id": "s2", "title": "The Winner Takes It All", "aliases": "winner takes it all", "lyric_hints": "the winner takes it all"},
        ])

    def test_match_title_even_with_date(self):
        result = suggest("2026-11-05 Out Here on My Own.m4a", "", self.songs)
        self.assertEqual(result[0][1], "s1")

    def test_match_lyric_hint(self):
        result = suggest("11-05 #21.m4a", "The winner takes it all tonight", self.songs)
        self.assertEqual(result[0][1], "s2")

    def test_no_unjustified_guess(self):
        self.assertEqual(suggest("2026-11-05 #21.m4a", "", self.songs), [])

    def test_normalization(self):
        self.assertEqual(normalize("2026-11-05 My_song.M4A"), "my song")
        self.assertEqual(normalize("20261125 My_song.M4A"), "my song")
        self.assertEqual(normalize("2026-12-31 My_song.M4A"), "my song")


if __name__ == "__main__":
    unittest.main()
