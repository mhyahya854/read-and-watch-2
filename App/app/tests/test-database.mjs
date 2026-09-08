import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function writeTestDatabase(databasePath, items) {
  const database = new DatabaseSync(databasePath);
  const migrationPath = resolve(
    import.meta.dirname,
    '..',
    '..',
    'import',
    'migrations',
    '001_initial.sql',
  );
  const template = readFileSync(migrationPath, 'utf8');
  const checksum = createHash('sha256').update(template).digest('hex');
  database.exec(template.replace('__CHECKSUM__', checksum));
  database
    .prepare("INSERT INTO library_meta VALUES('catalog_schema_version','1')")
    .run();
  database
    .prepare(
      "INSERT INTO library_meta VALUES('generated_from_import_utc','\"test\"')",
    )
    .run();
  database
    .prepare("INSERT INTO library_meta VALUES('source_fingerprint','\"test\"')")
    .run();
  items.forEach((item, sourceOrder) => {
    database
      .prepare(
        "INSERT INTO items(id,collection,source_order,item_path,title,item_type,status,summary,source_added,provenance_kind,created_at_utc,updated_at_utc) VALUES(?,?,?,?,?,?,?,?,?,'manual','test','test')",
      )
      .run(
        item.id,
        item.collection,
        sourceOrder,
        item.itemPath,
        item.title ?? 'Test',
        item.type ?? '',
        item.status ?? '',
        item.summary ?? '',
        item.added ?? '',
      );
    database
      .prepare(
        `INSERT INTO ${item.collection === 'read' ? 'read_items' : 'watch_items'}(item_id) VALUES(?)`,
      )
      .run(item.id);
    database
      .prepare(
        "INSERT INTO item_properties VALUES(?, 'catalog_internal', 'cover', 'null', 'null', 0)",
      )
      .run(item.id);
    database
      .prepare(
        "INSERT INTO item_properties VALUES(?, 'catalog_internal', 'preview', 'null', 'null', 1)",
      )
      .run(item.id);
    for (const [position, media] of (item.media ?? []).entries()) {
      const assetId = `asset-${createHash('sha256').update(`${item.id}\0${media.path}`).digest('hex').slice(0, 32)}`;
      database
        .prepare(
          'INSERT INTO item_assets(id,item_id,relative_path,display_name,format,extension,source_order,is_primary) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(
          assetId,
          item.id,
          media.path,
          media.name,
          media.extension.slice(1).toUpperCase(),
          media.extension,
          position,
          0,
        );
      database
        .prepare("INSERT INTO asset_roles VALUES(?,'catalog_media')")
        .run(assetId);
    }
  });
  database.close();
}
