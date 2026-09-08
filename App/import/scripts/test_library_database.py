#!/usr/bin/env python3
"""Regression tests for the Phase 02 database and recovery pipeline."""

from __future__ import annotations

import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import library_database as database


class LibraryDatabaseTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="rw-library-db-")
        self.root = Path(self.temporary.name)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def candidate(self, name: str = "candidate.sqlite3") -> Path:
        path = self.root / name
        result = database.run_candidate("dry_run", path)
        self.assertEqual(result["status"], "PASS")
        return path

    def test_current_catalog_has_exact_parity(self) -> None:
        path = self.candidate()
        result = database.verify_database(path)
        self.assertEqual(result["counts"]["items"], 91)
        self.assertEqual(result["counts"]["read_items"], 20)
        self.assertEqual(result["counts"]["watch_items"], 71)
        self.assertEqual(result["counts"]["item_assets"], 75)
        self.assertTrue(result["catalog_equal"])
        connection = database.connect(path, writable=False)
        try:
            self.assertEqual(connection.execute("SELECT count(*) FROM items WHERE provenance_kind='notion'").fetchone()[0], 90)
            self.assertEqual(connection.execute("SELECT count(*) FROM items WHERE provenance_kind='personal_book'").fetchone()[0], 1)
            payload = json.loads(connection.execute("SELECT payload_json FROM provenance_sources p JOIN items i ON i.id=p.item_id WHERE i.provenance_kind='personal_book'").fetchone()[0])
            self.assertEqual(payload["read_watch_resolution"]["status"], "verified_unique")
        finally:
            connection.close()

    def test_existing_database_is_never_overwritten(self) -> None:
        path = self.candidate()
        before = database.sha256_file(path)
        with self.assertRaises(database.LibraryDatabaseError):
            database.run_candidate("dry_run", path)
        self.assertEqual(database.sha256_file(path), before)

    def test_item_transaction_rolls_back_on_injected_failure(self) -> None:
        path = self.root / "interrupted.sqlite3"
        database.create_empty_database(path)
        item_id = database.load_catalog()["items"][3]["id"]
        with self.assertRaises(database.LibraryDatabaseError):
            database.import_catalog(path, fail_item_id=item_id)
        connection = database.connect(path)
        try:
            self.assertEqual(
                connection.execute("SELECT count(*) FROM items WHERE id=?", (item_id,)).fetchone()[0],
                0,
            )
            self.assertGreater(connection.execute("SELECT count(*) FROM items").fetchone()[0], 0)
        finally:
            connection.close()
        resumed = database.import_catalog(path)
        self.assertEqual(resumed["status"], "PASS")
        self.assertEqual(resumed["counts"]["items"], 91)

    def test_export_rebuild_is_semantically_identical(self) -> None:
        source = self.candidate()
        snapshot = self.root / "snapshot"
        database.export_snapshot(source, snapshot)
        rebuilt = self.root / "rebuilt.sqlite3"
        database.rebuild_snapshot(snapshot, rebuilt)
        left = database.connect(source, writable=False)
        right = database.connect(rebuilt, writable=False)
        try:
            self.assertEqual(database.canonical_rows(left), database.canonical_rows(right))
        finally:
            left.close()
            right.close()

    def test_snapshot_tamper_is_detected(self) -> None:
        source = self.candidate()
        snapshot = self.root / "snapshot"
        database.export_snapshot(source, snapshot)
        item = next((snapshot / "items").glob("*.json"))
        item.write_text("{}\n", encoding="utf-8")
        with self.assertRaises(database.LibraryDatabaseError):
            database.verify_snapshot(snapshot)

    def test_online_backup_and_restore_candidate(self) -> None:
        source = self.candidate()
        snapshot = self.root / "snapshot"
        database.export_snapshot(source, snapshot)
        backup = self.root / "backup.sqlite3"
        manifest = database.backup_database(source, backup, snapshot)
        self.assertEqual(manifest["verification"]["status"], "PASS")
        restored = self.root / "restored.sqlite3"
        restored.write_bytes(backup.read_bytes())
        self.assertEqual(database.verify_database(restored)["status"], "PASS")

    def test_failed_promotion_restores_prior_database(self) -> None:
        active = self.candidate("active.sqlite3")
        before = database.sha256_file(active)
        invalid = self.root / "invalid.sqlite3"
        sqlite3.connect(invalid).close()
        with self.assertRaises((database.LibraryDatabaseError, sqlite3.Error)):
            database.promote(invalid, active)
        self.assertEqual(database.sha256_file(active), before)

    def test_successful_promotion_retains_verified_rollback(self) -> None:
        active = self.candidate("active.sqlite3")
        candidate = self.candidate("replacement.sqlite3")
        rollback = database.promote(candidate, active)
        self.assertIsNotNone(rollback)
        self.assertTrue(rollback.is_file())
        self.assertFalse(candidate.exists())
        self.assertEqual(database.verify_database(active)["status"], "PASS")
        self.assertEqual(database.verify_database(rollback)["status"], "PASS")

    def test_read_and_watch_property_names_remain_distinct(self) -> None:
        path = self.candidate()
        connection = database.connect(path, writable=False)
        try:
            read_keys = {row[0] for row in connection.execute("SELECT DISTINCT p.property_key FROM item_properties p JOIN items i ON i.id=p.item_id WHERE i.collection='read' AND p.namespace='notion'")}
            watch_keys = {row[0] for row in connection.execute("SELECT DISTINCT p.property_key FROM item_properties p JOIN items i ON i.id=p.item_id WHERE i.collection='watch' AND p.namespace='notion'")}
        finally:
            connection.close()
        self.assertEqual(read_keys, {"Added", "Added on", "Book", "From"})
        self.assertEqual(watch_keys, {"Added From", "Added On", "Category", "Place i Was", "Recommended by", "Show"})


if __name__ == "__main__":
    unittest.main()
