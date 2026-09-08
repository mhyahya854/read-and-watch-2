#!/usr/bin/env python3
"""Create, verify, export, rebuild, back up, and promote the local library DB."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from project_paths import DATA_APP_ROOT, DATA_ROOT, PROJECT_ROOT

SCHEMA_VERSION = 1
MIGRATION_PATH = PROJECT_ROOT / "import" / "migrations" / "001_initial.sql"
LIBRARY_ROOT = DATA_APP_ROOT / "library"
CATALOG_PATH = LIBRARY_ROOT / "catalog.json"
STATE_ROOT = DATA_APP_ROOT / "state"
DATABASE_PATH = STATE_ROOT / "read-watch.sqlite3"
STAGING_ROOT = DATA_APP_ROOT / "migration" / "staging"
EXPORT_ROOT = DATA_APP_ROOT / "exports"
BACKUP_ROOT = DATA_APP_ROOT / "database-backups"
USER_DATA_ROOT = DATA_APP_ROOT / "user-data"
SUPPORTED_READ_FORMATS = {".epub", ".pdf", ".mobi", ".azw", ".azw3", ".fb2", ".fbz", ".cbz", ".txt", ".md", ".markdown"}
ITEM_TABLES = (
    "items", "read_items", "watch_items", "item_properties", "item_people",
    "read_series", "item_tags", "provenance_sources", "item_assets",
    "asset_roles", "relationships", "notes",
)
GLOBAL_TABLES = ("library_meta", "people", "series", "tags", "saved_views")


class LibraryDatabaseError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def stable_evidence_digest(path: Path) -> str:
    if path.suffix.lower() != ".json":
        return sha256_file(path)
    value = json.loads(path.read_text(encoding="utf-8"))

    def without_verification_times(node: Any) -> Any:
        if isinstance(node, dict):
            return {
                key: without_verification_times(child)
                for key, child in node.items()
                if key not in {"updated_at_utc", "verified_at_utc"}
            }
        if isinstance(node, list):
            return [without_verification_times(child) for child in node]
        return node

    return sha256_bytes(canonical_json(without_verification_times(value)).encode("utf-8"))


def write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp-{os.getpid()}")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def load_catalog(path: Path = CATALOG_PATH) -> dict[str, Any]:
    try:
        catalog = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise LibraryDatabaseError(f"Cannot read catalog: {error}") from error
    required = {"schemaVersion", "generatedFromImportUtc", "counts", "items"}
    if set(catalog) != required:
        raise LibraryDatabaseError(f"Unexpected catalog fields: {sorted(set(catalog) ^ required)}")
    return catalog


def source_fingerprint(catalog_path: Path = CATALOG_PATH) -> str:
    inputs: list[tuple[str, str]] = [("library/catalog.json", sha256_file(catalog_path))]
    for relative in (
        "import/manifests/import-plan.json",
        "import/manifests/user-added-items.json",
        "import/checkpoints/import-state.json",
        "import/checkpoints/backup-state.json",
    ):
        path = DATA_APP_ROOT / relative
        if path.is_file():
            inputs.append((relative, stable_evidence_digest(path)))
    catalog = load_catalog(catalog_path)
    for item in catalog["items"]:
        for relative in [item["itemPath"], *(media["path"] for media in item["media"])]:
            path = LIBRARY_ROOT / Path(relative)
            marker = f"{path.stat().st_size}:{sha256_file(path)}" if path.is_file() else "MISSING"
            inputs.append((f"library/{relative}", marker))
        for kind in ("thoughts", "notes"):
            path = USER_DATA_ROOT / "items" / item["id"] / f"{kind}.md"
            if path.is_file():
                inputs.append((f"user-data/items/{item['id']}/{kind}.md", f"{path.stat().st_size}:{sha256_file(path)}"))
    return sha256_bytes(canonical_json(inputs).encode("utf-8"))


def migration_sql() -> tuple[str, str]:
    template = MIGRATION_PATH.read_text(encoding="utf-8")
    checksum = sha256_bytes(template.encode("utf-8"))
    return template.replace("__CHECKSUM__", checksum), checksum


def connect(path: Path, *, writable: bool = True) -> sqlite3.Connection:
    if not writable:
        connection = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
    else:
        connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 5000")
    return connection


def create_empty_database(path: Path) -> str:
    if path.exists():
        raise LibraryDatabaseError(f"Refusing to overwrite database: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    sql, checksum = migration_sql()
    connection = connect(path)
    try:
        connection.executescript(sql)
        connection.execute("PRAGMA journal_mode = WAL")
    finally:
        connection.close()
    return checksum


def stable_id(prefix: str, value: str) -> str:
    return f"{prefix}-{sha256_bytes(value.encode('utf-8'))[:32]}"


def relative_asset_path(item: dict[str, Any], value: str | None) -> str | None:
    if not value:
        return None
    return str((Path(item["itemPath"]).parent / value.removeprefix("./")).as_posix())


def read_provenance(item: dict[str, Any]) -> tuple[str, str, dict[str, Any], str | None]:
    item_root = LIBRARY_ROOT / Path(item["itemPath"]).parent
    candidates = [item_root / "source" / "provenance.json", item_root / "_user_added.json", item_root / "_import.json"]
    payload: dict[str, Any] = {}
    selected: Path | None = None
    for candidate in candidates:
        if candidate.is_file():
            try:
                payload[candidate.name] = json.loads(candidate.read_text(encoding="utf-8"))
                selected = selected or candidate
            except json.JSONDecodeError as error:
                raise LibraryDatabaseError(f"Invalid provenance JSON for {item['id']}: {error}") from error
    provenance = payload.get("provenance.json", {})
    kind = "personal_book" if provenance.get("source_type") == "personal_book" or provenance.get("user_added") is True else "notion"
    if kind == "personal_book":
        source = provenance.get("original_source", provenance.get("source", {}))
        expected_size = source.get("byte_size")
        expected_hash = source.get("sha256")
        historical = source.get("original_path")
        resolved: list[Path] = []
        if expected_size is not None and expected_hash:
            original = Path(historical) if historical else None
            if original and original.is_file() and original.stat().st_size == expected_size and sha256_file(original) == expected_hash:
                resolved = [original]
            else:
                search_root = DATA_ROOT / "Read"
                if search_root.is_dir():
                    for candidate in search_root.rglob("*"):
                        if candidate.is_file() and candidate.stat().st_size == expected_size and sha256_file(candidate) == expected_hash:
                            resolved.append(candidate)
        payload["read_watch_resolution"] = {
            "historical_path_retained": bool(historical),
            "status": "verified_unique" if len(resolved) == 1 else "unresolved" if not resolved else "ambiguous",
            "current_logical_path": resolved[0].relative_to(DATA_ROOT).as_posix() if len(resolved) == 1 else None,
            "matched_size_and_sha256": len(resolved) == 1,
        }
    identity = item["id"].split("-", 1)[1]
    relative = selected.relative_to(DATA_APP_ROOT).as_posix() if selected else None
    return kind, identity, payload, relative


def insert_item(connection: sqlite3.Connection, item: dict[str, Any], source_order: int, stamp: str, fail_item_id: str | None = None) -> None:
    if fail_item_id == item["id"]:
        raise LibraryDatabaseError(f"Injected migration failure for {item['id']}")
    kind, source_identity, provenance_payload, provenance_path = read_provenance(item)
    connection.execute(
        "INSERT INTO items(id,collection,source_order,item_path,title,item_type,status,summary,source_added,provenance_kind,created_at_utc,updated_at_utc) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        (item["id"], item["collection"], source_order, item["itemPath"], item["title"], item["type"], item["status"], item["summary"], item["added"], kind, stamp, stamp),
    )
    extension_table = "read_items" if item["collection"] == "read" else "watch_items"
    connection.execute(f"INSERT INTO {extension_table}(item_id) VALUES(?)", (item["id"],))
    internal = {"cover": item["cover"], "preview": item["preview"]}
    for position, (key, value) in enumerate(internal.items()):
        connection.execute(
            "INSERT INTO item_properties VALUES(?,?,?,?,?,?)",
            (item["id"], "catalog_internal", key, "null" if value is None else "string", canonical_json(value), position),
        )
    for position, (key, value) in enumerate(item["notionProperties"].items()):
        connection.execute(
            "INSERT INTO item_properties VALUES(?,?,?,?,?,?)",
            (item["id"], "notion", key, "string", canonical_json(value), position),
        )
    for position, tag in enumerate(item["tags"]):
        tag_id = stable_id("tag", tag.casefold())
        connection.execute("INSERT OR IGNORE INTO tags VALUES(?,?)", (tag_id, tag))
        connection.execute("INSERT INTO item_tags VALUES(?,?,?)", (item["id"], tag_id, position))
    provenance_id = stable_id("source", f"{item['id']}\0{source_identity}")
    provenance_hash = None
    if isinstance(provenance_payload.get("provenance.json"), dict):
        provenance_hash = provenance_payload["provenance.json"].get("page_sha256")
    connection.execute(
        "INSERT INTO provenance_sources VALUES(?,?,?,?,?,?,?,?)",
        (provenance_id, item["id"], kind, source_identity, provenance_path, provenance_hash, canonical_json(provenance_payload), stamp),
    )
    preview_path = relative_asset_path(item, item["preview"])
    cover_path = relative_asset_path(item, item["cover"])
    for position, media in enumerate(item["media"]):
        relative_path = media["path"]
        path = LIBRARY_ROOT / Path(relative_path)
        size = path.stat().st_size if path.is_file() else None
        digest = sha256_file(path) if path.is_file() else None
        extension = media["extension"].lower()
        asset_id = stable_id("asset", f"{item['id']}\0{relative_path}")
        reading = item["collection"] == "read" and extension in SUPPORTED_READ_FORMATS
        connection.execute(
            "INSERT INTO item_assets(id,item_id,provenance_id,relative_path,display_name,format,extension,byte_size,sha256,source_sha256,source_order,is_primary) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            (asset_id, item["id"], provenance_id, relative_path, media["name"], extension.removeprefix(".").upper(), extension, size, digest, digest, position, int(reading and position == 0)),
        )
        roles = {"catalog_media"}
        if reading:
            roles.add("reading_format")
        if relative_path == preview_path:
            roles.add("preview")
        if relative_path == cover_path:
            roles.add("cover")
        for role in sorted(roles):
            connection.execute("INSERT INTO asset_roles VALUES(?,?)", (asset_id, role))
    for position, target_id in enumerate(item["relationshipIds"]):
        relation_id = stable_id("relation", f"{item['id']}\0{target_id}\0{position}")
        connection.execute(
            "INSERT INTO relationships(id,source_item_id,target_item_id,relationship_type,direction,position,provenance_json,created_at_utc) VALUES(?,?,?,?,?,?,?,?)",
            (relation_id, item["id"], target_id, "notion_link", "directed", position, "{}", stamp),
        )


def import_catalog(database_path: Path, catalog_path: Path = CATALOG_PATH, *, mode: str = "dry_run", fail_item_id: str | None = None) -> dict[str, Any]:
    catalog = load_catalog(catalog_path)
    fingerprint = source_fingerprint(catalog_path)
    stamp = catalog["generatedFromImportUtc"]
    run_id = f"{mode}-{fingerprint[:16]}"
    connection = connect(database_path)
    try:
        expected_meta = {
            "catalog_schema_version": catalog["schemaVersion"],
            "generated_from_import_utc": stamp,
            "source_fingerprint": fingerprint,
        }
        with connection:
            for key, value in expected_meta.items():
                existing = connection.execute("SELECT value_json FROM library_meta WHERE key=?", (key,)).fetchone()
                if existing and parse_json(existing[0]) != value:
                    raise LibraryDatabaseError(f"Migration target metadata conflict: {key}")
                connection.execute("INSERT OR IGNORE INTO library_meta VALUES(?,?)", (key, canonical_json(value)))
            run = connection.execute("SELECT * FROM migration_runs WHERE id=?", (run_id,)).fetchone()
            if run and (run["source_fingerprint"] != fingerprint or run["target_schema_version"] != SCHEMA_VERSION):
                raise LibraryDatabaseError("Migration run fingerprint/version conflict")
            if run and run["status"] in {"passed", "promoted"}:
                return {**verify_database(database_path, catalog_path), "run_id": run_id, "source_fingerprint": fingerprint, "resumed": True}
            if run:
                connection.execute("UPDATE migration_runs SET status='running',finished_at_utc=NULL WHERE id=?", (run_id,))
            else:
                connection.execute(
                    "INSERT INTO migration_runs VALUES(?,?,?,?,?,?,?,?)",
                    (run_id, fingerprint, SCHEMA_VERSION, mode, "running", utc_now(), None, "reports/PHASE_02_LIBRARY_DATABASE.md"),
                )
        for source_order, item in enumerate(catalog["items"]):
            item_digest = sha256_bytes(canonical_json(item).encode("utf-8"))
            checkpoint = connection.execute("SELECT source_sha256,status FROM migration_items WHERE run_id=? AND item_id=?", (run_id, item["id"])).fetchone()
            if checkpoint:
                if checkpoint["source_sha256"] != item_digest or checkpoint["status"] != "passed":
                    raise LibraryDatabaseError(f"Migration checkpoint conflict: {item['id']}")
                if not connection.execute("SELECT 1 FROM items WHERE id=?", (item["id"],)).fetchone():
                    raise LibraryDatabaseError(f"Passed checkpoint has no item: {item['id']}")
                continue
            if connection.execute("SELECT 1 FROM items WHERE id=?", (item["id"],)).fetchone():
                raise LibraryDatabaseError(f"Uncheckpointed target item conflict: {item['id']}")
            try:
                with connection:
                    insert_item(connection, item, source_order, stamp, fail_item_id)
                    connection.execute("INSERT INTO migration_items VALUES(?,?,?,?,NULL)", (run_id, item["id"], item_digest, "passed"))
            except Exception:
                with connection:
                    connection.execute("UPDATE migration_runs SET status='failed',finished_at_utc=? WHERE id=?", (utc_now(), run_id))
                raise
        with connection:
            for item in catalog["items"]:
                for kind in ("thoughts", "notes"):
                    path = USER_DATA_ROOT / "items" / item["id"] / f"{kind}.md"
                    if not path.is_file():
                        continue
                    stamp = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat().replace("+00:00", "Z")
                    note_id = stable_id("note", f"{item['id']}\0{kind}")
                    connection.execute(
                        "INSERT INTO notes VALUES(?,?,?,?,1,?,?)",
                        (note_id, item["id"], kind, path.read_text(encoding="utf-8"), stamp, stamp),
                    )
        with connection:
            connection.execute("UPDATE migration_runs SET status='passed',finished_at_utc=? WHERE id=?", (utc_now(), run_id))
    finally:
        connection.close()
    result = verify_database(database_path, catalog_path)
    result.update({"run_id": run_id, "source_fingerprint": fingerprint})
    return result


def parse_json(value: str) -> Any:
    return json.loads(value)


def scalar(connection: sqlite3.Connection, sql: str, values: tuple[Any, ...] = ()) -> Any:
    return connection.execute(sql, values).fetchone()[0]


def get_catalog(connection: sqlite3.Connection) -> dict[str, Any]:
    meta = {row["key"]: json.loads(row["value_json"]) for row in connection.execute("SELECT * FROM library_meta")}
    items = []
    for row in connection.execute("SELECT * FROM items ORDER BY source_order"):
        item_id = row["id"]
        properties = list(connection.execute("SELECT * FROM item_properties WHERE item_id=? ORDER BY namespace,source_order", (item_id,)))
        internal = {p["property_key"]: json.loads(p["value_json"]) for p in properties if p["namespace"] == "catalog_internal"}
        notion = {p["property_key"]: json.loads(p["value_json"]) for p in properties if p["namespace"] == "notion"}
        tags = [r[0] for r in connection.execute("SELECT t.name FROM item_tags it JOIN tags t ON t.id=it.tag_id WHERE it.item_id=? ORDER BY it.position", (item_id,))]
        media = [dict(name=r["display_name"], path=r["relative_path"], extension=r["extension"]) for r in connection.execute("SELECT * FROM item_assets WHERE item_id=? AND EXISTS(SELECT 1 FROM asset_roles ar WHERE ar.asset_id=item_assets.id AND ar.role='catalog_media') ORDER BY source_order", (item_id,))]
        relations = [r[0] for r in connection.execute("SELECT target_item_id FROM relationships WHERE source_item_id=? AND target_item_id IS NOT NULL ORDER BY position", (item_id,))]
        items.append({"id": item_id, "title": row["title"], "collection": row["collection"], "itemPath": row["item_path"], "type": row["item_type"], "status": row["status"], "added": row["source_added"], "tags": tags, "summary": row["summary"], "cover": internal.get("cover"), "preview": internal.get("preview"), "notionProperties": notion, "media": media, "relationshipIds": relations})
    read = sum(item["collection"] == "read" for item in items)
    watch = len(items) - read
    return {"schemaVersion": meta["catalog_schema_version"], "generatedFromImportUtc": meta["generated_from_import_utc"], "counts": {"read": read, "watch": watch, "total": len(items)}, "items": items}


def canonical_rows(connection: sqlite3.Connection, *, include_operational: bool = False) -> dict[str, list[dict[str, Any]]]:
    tables = list(GLOBAL_TABLES + ITEM_TABLES)
    if include_operational:
        tables += ["schema_migrations", "migration_runs", "migration_items"]
    output = {}
    for table in tables:
        columns = [row[1] for row in connection.execute(f"PRAGMA table_info({table})")]
        order = ",".join(columns)
        output[table] = [dict(row) for row in connection.execute(f"SELECT * FROM {table} ORDER BY {order}")]
    return output


def verify_database(database_path: Path, catalog_path: Path = CATALOG_PATH) -> dict[str, Any]:
    expected = load_catalog(catalog_path)
    connection = connect(database_path, writable=False)
    try:
        quick = scalar(connection, "PRAGMA quick_check")
        foreign = [dict(row) for row in connection.execute("PRAGMA foreign_key_check")]
        actual = get_catalog(connection)
        extension_mismatch = scalar(connection, "SELECT count(*) FROM items i WHERE (i.collection='read')<>(EXISTS(SELECT 1 FROM read_items r WHERE r.item_id=i.id)) OR (i.collection='watch')<>(EXISTS(SELECT 1 FROM watch_items w WHERE w.item_id=i.id))")
        counts = {table: scalar(connection, f"SELECT count(*) FROM {table}") for table in ("items", "read_items", "watch_items", "item_assets", "item_properties", "provenance_sources")}
    finally:
        connection.close()
    if quick != "ok" or foreign or extension_mismatch or actual != expected:
        raise LibraryDatabaseError(f"Database parity failed: quick={quick}, foreign={len(foreign)}, extensions={extension_mismatch}, catalog_equal={actual == expected}")
    return {"status": "PASS", "catalog_equal": True, "quick_check": quick, "foreign_key_violations": 0, "extension_mismatches": 0, "counts": counts, "database_sha256": sha256_file(database_path)}


def table_bundle(connection: sqlite3.Connection, item_id: str) -> dict[str, Any]:
    bundle: dict[str, Any] = {}
    for table in ITEM_TABLES:
        if table == "asset_roles":
            rows = connection.execute("SELECT ar.* FROM asset_roles ar JOIN item_assets a ON a.id=ar.asset_id WHERE a.item_id=? ORDER BY ar.asset_id,ar.role", (item_id,))
        elif table == "relationships":
            rows = connection.execute("SELECT * FROM relationships WHERE source_item_id=? ORDER BY id", (item_id,))
        else:
            key = "id" if table == "items" else "item_id"
            rows = connection.execute(f"SELECT * FROM {table} WHERE {key}=? ORDER BY rowid", (item_id,))
        bundle[table] = [dict(row) for row in rows]
    return bundle


def export_snapshot(database_path: Path, destination: Path) -> dict[str, Any]:
    if destination.exists():
        raise LibraryDatabaseError(f"Refusing to overwrite snapshot: {destination}")
    temporary = destination.with_name(f".{destination.name}.tmp-{os.getpid()}")
    temporary.mkdir(parents=True)
    connection = connect(database_path, writable=False)
    try:
        item_ids = [row[0] for row in connection.execute("SELECT id FROM items ORDER BY id")]
        for item_id in item_ids:
            write_json_atomic(temporary / "items" / f"{item_id}.json", table_bundle(connection, item_id))
        globals_payload = {table: [dict(row) for row in connection.execute(f"SELECT * FROM {table} ORDER BY rowid")] for table in GLOBAL_TABLES}
        write_json_atomic(temporary / "globals.json", globals_payload)
        files = [dict(row) for row in connection.execute("SELECT id,item_id,relative_path,byte_size,sha256,source_sha256 FROM item_assets ORDER BY id")]
        write_json_atomic(temporary / "files.json", files)
        for row in connection.execute("SELECT item_id,kind,body_markdown FROM notes ORDER BY item_id,kind"):
            note = temporary / "notes" / row["item_id"] / f"{row['kind']}.md"
            note.parent.mkdir(parents=True, exist_ok=True)
            note.write_text(row["body_markdown"], encoding="utf-8", newline="\n")
    finally:
        connection.close()
    components = sorted(path for path in temporary.rglob("*") if path.is_file())
    checksums = "".join(f"{sha256_file(path)}  {path.relative_to(temporary).as_posix()}\n" for path in components)
    (temporary / "checksums.sha256").write_text(checksums, encoding="utf-8", newline="\n")
    manifest = {"schema_version": SCHEMA_VERSION, "snapshot_id": destination.name, "created_at_utc": utc_now(), "source_database_sha256": sha256_file(database_path), "item_count": len(item_ids), "component_count": len(components), "status": "complete"}
    write_json_atomic(temporary / "manifest.json", manifest)
    os.replace(temporary, destination)
    return manifest


def verify_snapshot(snapshot: Path) -> dict[str, Any]:
    manifest = json.loads((snapshot / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("status") != "complete" or manifest.get("schema_version") != SCHEMA_VERSION:
        raise LibraryDatabaseError("Snapshot manifest is not complete or compatible")
    for line in (snapshot / "checksums.sha256").read_text(encoding="utf-8").splitlines():
        digest, relative = line.split("  ", 1)
        path = snapshot / relative
        if not path.is_file() or sha256_file(path) != digest:
            raise LibraryDatabaseError(f"Snapshot checksum mismatch: {relative}")
    return manifest


def insert_rows(connection: sqlite3.Connection, table: str, rows: list[dict[str, Any]]) -> None:
    for row in rows:
        columns = list(row)
        placeholders = ",".join("?" for _ in columns)
        connection.execute(f"INSERT INTO {table}({','.join(columns)}) VALUES({placeholders})", tuple(row[column] for column in columns))


def rebuild_snapshot(snapshot: Path, destination: Path) -> dict[str, Any]:
    verify_snapshot(snapshot)
    create_empty_database(destination)
    connection = connect(destination)
    try:
        globals_payload = json.loads((snapshot / "globals.json").read_text(encoding="utf-8"))
        with connection:
            for table in GLOBAL_TABLES:
                insert_rows(connection, table, globals_payload[table])
            bundles = [json.loads(path.read_text(encoding="utf-8")) for path in sorted((snapshot / "items").glob("*.json"))]
            for table in ITEM_TABLES:
                for bundle in bundles:
                    insert_rows(connection, table, bundle[table])
    finally:
        connection.close()
    return verify_database(destination)


def backup_database(database_path: Path, destination: Path, snapshot: Path) -> dict[str, Any]:
    if destination.exists():
        raise LibraryDatabaseError(f"Refusing to overwrite backup: {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    verify_snapshot(snapshot)
    source = connect(database_path, writable=False)
    target = connect(destination)
    try:
        source.backup(target)
    finally:
        target.close()
        source.close()
    verification = verify_database(destination)
    manifest = {"schema_version": SCHEMA_VERSION, "created_at_utc": utc_now(), "database_sha256": sha256_file(destination), "snapshot_id": snapshot.name, "verification": verification}
    write_json_atomic(destination.with_suffix(destination.suffix + ".json"), manifest)
    return manifest


def promote(candidate: Path, destination: Path = DATABASE_PATH) -> Path | None:
    verify_database(candidate)
    destination.parent.mkdir(parents=True, exist_ok=True)
    rollback = None
    if destination.exists():
        active = connect(destination)
        try:
            busy, _remaining, _checkpointed = active.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()
            if busy:
                raise LibraryDatabaseError("Active database is busy; promotion refused")
        finally:
            active.close()
        rollback = destination.with_name(f"{destination.stem}.rollback-{datetime.now().strftime('%Y%m%dT%H%M%S')}{destination.suffix}")
        os.replace(destination, rollback)
        for suffix in ("-wal", "-shm"):
            sidecar = Path(f"{destination}{suffix}")
            if sidecar.exists():
                sidecar.unlink()
    try:
        os.replace(candidate, destination)
        verify_database(destination)
    except Exception:
        if destination.exists():
            destination.unlink()
        if rollback:
            os.replace(rollback, destination)
        raise
    return rollback


def run_candidate(mode: str, destination: Path, catalog_path: Path = CATALOG_PATH, fail_item_id: str | None = None) -> dict[str, Any]:
    create_empty_database(destination)
    try:
        return import_catalog(destination, catalog_path, mode=mode, fail_item_id=fail_item_id)
    except Exception:
        raise


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    candidate = commands.add_parser("candidate")
    candidate.add_argument("--mode", choices=("dry_run", "apply"), default="dry_run")
    candidate.add_argument("--output", type=Path, required=True)
    candidate.add_argument("--catalog", type=Path, default=CATALOG_PATH)
    verify = commands.add_parser("verify")
    verify.add_argument("database", type=Path)
    export = commands.add_parser("export")
    export.add_argument("database", type=Path)
    export.add_argument("destination", type=Path)
    rebuild = commands.add_parser("rebuild")
    rebuild.add_argument("snapshot", type=Path)
    rebuild.add_argument("destination", type=Path)
    backup = commands.add_parser("backup")
    backup.add_argument("database", type=Path)
    backup.add_argument("destination", type=Path)
    backup.add_argument("snapshot", type=Path)
    promote_command = commands.add_parser("promote")
    promote_command.add_argument("candidate", type=Path)
    promote_command.add_argument("--destination", type=Path, default=DATABASE_PATH)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        if args.command == "candidate":
            result = run_candidate(args.mode, args.output, args.catalog)
        elif args.command == "verify":
            result = verify_database(args.database)
        elif args.command == "export":
            result = export_snapshot(args.database, args.destination)
        elif args.command == "rebuild":
            result = rebuild_snapshot(args.snapshot, args.destination)
        elif args.command == "backup":
            result = backup_database(args.database, args.destination, args.snapshot)
        else:
            rollback = promote(args.candidate, args.destination)
            result = {"status": "PASS", "database": str(args.destination), "rollback": str(rollback) if rollback else None}
        print(json.dumps(result, indent=2))
        return 0
    except (OSError, sqlite3.Error, LibraryDatabaseError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
