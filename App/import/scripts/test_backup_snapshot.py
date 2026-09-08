import tempfile
import unittest
from pathlib import Path

import backup_snapshot


class BackupSnapshotTests(unittest.TestCase):
    def test_scan_and_compare_detects_changed_content(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            read = root / "Read"
            watch = root / "Watch"
            read.mkdir()
            watch.mkdir()
            (read / "nested").mkdir()
            (read / "empty").mkdir()
            (read / "nested" / "Book.md").write_text("alpha", encoding="utf-8")
            (watch / "Show.html").write_text("beta", encoding="utf-8")
            roots = {"Read": read, "Watch": watch}

            expected = backup_snapshot.scan_roots(roots, "test")
            self.assertEqual(expected["summary"]["file_count"], 2)
            self.assertEqual(expected["summary"]["directory_count"], 2)
            self.assertEqual(
                [entry["relative_path"] for entry in expected["files"]],
                ["nested/Book.md", "Show.html"],
            )

            (watch / "Show.html").write_text("changed", encoding="utf-8")
            actual = backup_snapshot.scan_roots(roots, "test")
            comparison = backup_snapshot.compare_manifests(expected, actual)
            self.assertEqual(comparison["missing"], [])
            self.assertEqual(comparison["extra"], [])
            self.assertEqual(len(comparison["changed"]), 1)
            self.assertEqual(comparison["missing_directories"], [])
            self.assertEqual(comparison["extra_directories"], [])
            self.assertIn("sha256", comparison["changed"][0]["differences"])

    def test_compare_detects_missing_and_extra_paths(self) -> None:
        expected = {
            "files": [
                {
                    "source_collection": "Read",
                    "relative_path": "a.md",
                    "filename": "a.md",
                    "extension": ".md",
                    "byte_size": 1,
                    "sha256": "a",
                }
            ]
        }
        actual = {
            "files": [
                {
                    "source_collection": "Watch",
                    "relative_path": "b.md",
                    "filename": "b.md",
                    "extension": ".md",
                    "byte_size": 1,
                    "sha256": "b",
                }
            ]
        }
        comparison = backup_snapshot.compare_manifests(expected, actual)
        self.assertEqual(comparison["missing"], ["Read/a.md"])
        self.assertEqual(comparison["extra"], ["Watch/b.md"])
        self.assertEqual(comparison["changed"], [])
        self.assertEqual(comparison["missing_directories"], [])
        self.assertEqual(comparison["extra_directories"], [])


if __name__ == "__main__":
    unittest.main()
