/**
 * Synthetic Fixture Generator for Phase 16 Hardening Benchmarks.
 * Generates deterministic synthetic databases and large documents outside Git.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import { resolveDataPaths } from '../server/data-paths.mjs';

function sha256(val) {
  return createHash('sha256').update(val).digest('hex');
}

export function createSyntheticDatabase(dbPath, count) {
  rmSync(dbPath, { force: true });
  const db = new DatabaseSync(dbPath);
  const migrationPath = resolve(import.meta.dirname, '..', '..', 'import', 'migrations', '001_initial.sql');
  const template = readFileSync(migrationPath, 'utf8');
  const checksum = sha256(template);
  db.exec(template.replace('__CHECKSUM__', checksum));

  db.prepare("INSERT INTO library_meta VALUES('catalog_schema_version','1')").run();
  db.prepare("INSERT INTO library_meta VALUES('generated_from_import_utc','\"synthetic\"')").run();
  db.prepare("INSERT INTO library_meta VALUES('source_fingerprint','\"synthetic\"')").run();

  const insertItem = db.prepare(
    `INSERT INTO items(
      id, collection, source_order, item_path, title, item_type, status,
      rating, summary, source_added, provenance_kind, revision, created_at_utc, updated_at_utc
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', 1, ?, ?)`
  );
  const insertRead = db.prepare('INSERT INTO read_items(item_id, page_count) VALUES(?, ?)');
  const insertWatch = db.prepare('INSERT INTO watch_items(item_id, watch_progress_json) VALUES(?, ?)');
  const insertProp = db.prepare(
    'INSERT INTO item_properties(item_id, namespace, property_key, value_type, value_json, source_order) VALUES(?, ?, ?, ?, ?, ?)'
  );
  const insertPerson = db.prepare('INSERT OR IGNORE INTO people(id, display_name, sort_name) VALUES(?, ?, ?)');
  const insertItemPerson = db.prepare('INSERT INTO item_people(item_id, person_id, role, position) VALUES(?, ?, ?, ?)');
  const insertSeries = db.prepare('INSERT OR IGNORE INTO series(id, name, sort_name) VALUES(?, ?, ?)');
  const insertReadSeries = db.prepare('INSERT INTO read_series(item_id, series_id, position) VALUES(?, ?, ?)');
  const insertTag = db.prepare('INSERT OR IGNORE INTO tags(id, name) VALUES(?, ?)');
  const insertItemTag = db.prepare('INSERT INTO item_tags(item_id, tag_id, position) VALUES(?, ?, ?)');
  const insertAsset = db.prepare(
    'INSERT INTO item_assets(id, item_id, relative_path, display_name, format, extension, source_order, is_primary) VALUES(?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const insertRole = db.prepare('INSERT INTO asset_roles(asset_id, role) VALUES(?, ?)');

  const genres = ['Philosophy', 'Science', 'History', 'Technology', 'Architecture', 'Literature', 'Urdu Classic'];
  const authors = [
    'Aristotle', 'Ada Lovelace', 'Ibn Khaldun', 'Mirza Ghalib', 'Allama Iqbal',
    'Alan Turing', 'Grace Hopper', 'Hypatia of Alexandria', 'Claude Shannon', 'Margaret Hamilton'
  ];
  const seriesList = ['Great Books', 'Foundations of Computing', 'Classical Literature', 'Islamic Golden Age'];

  db.exec('BEGIN IMMEDIATE');

  for (let i = 0; i < count; i++) {
    const isRead = i % 4 !== 0; // 75% read, 25% watch
    const coll = isRead ? 'read' : 'watch';
    const hex32 = sha256(`synthetic-item-${i}`).slice(0, 32);
    const itemId = `${coll}-${hex32}`;
    const itemPath = `${coll}/item-${i}`;
    const author = authors[i % authors.length];
    const genre = genres[i % genres.length];
    const ser = seriesList[i % seriesList.length];
    const title = isRead
      ? `Synthetic Volume ${i + 1}: ${genre} Studies by ${author}`
      : `Documentary Recording ${i + 1}: ${genre} in Focus`;
    const rating = (i % 5) + 1;
    const now = new Date(Date.UTC(2026, 0, 1 + (i % 300))).toISOString();

    insertItem.run(
      itemId,
      coll,
      i,
      itemPath,
      title,
      isRead ? 'book' : 'video',
      i % 3 === 0 ? 'completed' : 'reading',
      rating,
      `Comprehensive reference volume analyzing ${genre.toLowerCase()} concepts and historical developments across epochs.`,
      now,
      now,
      now
    );

    if (isRead) {
      insertRead.run(itemId, 100 + (i % 400));
      // Series
      const seriesId = `series-${sha256(ser).slice(0, 16)}`;
      insertSeries.run(seriesId, ser, ser);
      insertReadSeries.run(itemId, seriesId, String((i % 10) + 1));
    } else {
      insertWatch.run(itemId, JSON.stringify({ progress: (i % 100) / 100 }));
    }

    // Properties
    insertProp.run(itemId, 'catalog_internal', 'cover', 'null', 'null', 0);
    insertProp.run(itemId, 'catalog_internal', 'preview', 'null', 'null', 1);
    insertProp.run(itemId, 'notion', 'Difficulty', 'string', JSON.stringify(i % 2 === 0 ? 'Advanced' : 'Standard'), 2);
    insertProp.run(itemId, 'custom', 'Edition', 'number', JSON.stringify((i % 3) + 1), 3);

    // Person
    const personId = `person-${sha256(author).slice(0, 16)}`;
    insertPerson.run(personId, author, author);
    insertItemPerson.run(itemId, personId, isRead ? 'author' : 'creator', 0);

    // Tags
    const tag1Id = `tag-${sha256(genre).slice(0, 16)}`;
    insertTag.run(tag1Id, genre);
    insertItemTag.run(itemId, tag1Id, 0);

    const extraTag = i % 2 === 0 ? 'Urdu / Eastern Studies' : 'Peer-Reviewed';
    const tag2Id = `tag-${sha256(extraTag).slice(0, 16)}`;
    insertTag.run(tag2Id, extraTag);
    insertItemTag.run(itemId, tag2Id, 1);

    // Asset
    const ext = isRead ? (i % 2 === 0 ? '.pdf' : '.epub') : '.mp4';
    const assetHex = sha256(`${itemId}-asset-0`).slice(0, 32);
    const assetId = `asset-${assetHex}`;
    insertAsset.run(
      assetId,
      itemId,
      `${itemPath}/content${ext}`,
      `content${ext}`,
      ext.slice(1).toUpperCase(),
      ext,
      0,
      1
    );
    insertRole.run(assetId, 'catalog_media');
  }

  db.exec('COMMIT');
  db.close();
}

export async function createSyntheticLargePdf(filePath, pageCount = 100) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  for (let i = 1; i <= pageCount; i++) {
    const isRotated = i % 15 === 0;
    const width = isRotated ? 800 : 600;
    const height = isRotated ? 600 : 800;
    const page = pdfDoc.addPage([width, height]);
    if (isRotated) {
      page.setRotation(degrees(90));
    }

    page.drawText(`Chapter ${Math.ceil(i / 10)}: Section ${i}`, {
      x: 50,
      y: height - 60,
      size: 16,
      font: boldFont,
    });

    page.drawText(`Page ${i} of ${pageCount} — Read & Watch Synthetic Performance Fixture`, {
      x: 50,
      y: height - 90,
      size: 10,
      font,
    });

    const lines = [
      `This synthetic document evaluates PDF page layout parsing, text rendering, and search traversal.`,
      `Performance invariant: page navigation must remain sub-150ms regardless of document length.`,
      `High-DPI backing store scaling must honor memory bounds and prevent GPU context memory exhaustion.`,
      `Unique token for indexing and cancellation stress: QueryMatchToken_${i} and common term SearchBenchmarkCorpus.`,
      `Geometry attributes: width=${width}, height=${height}, rotation=${isRotated ? 90 : 0} degrees.`,
    ];

    let y = height - 130;
    for (const line of lines) {
      page.drawText(line, { x: 50, y, size: 11, font });
      y -= 25;
    }
  }

  const bytes = await pdfDoc.save();
  writeFileSync(filePath, bytes);
  return bytes.length;
}

export async function generateAllSyntheticFixtures(outputDir) {
  mkdirSync(outputDir, { recursive: true });

  console.log('[fixtures] Generating synthetic 151-item database...');
  createSyntheticDatabase(join(outputDir, 'db-151.sqlite3'), 151);

  console.log('[fixtures] Generating synthetic 1,000-item database...');
  createSyntheticDatabase(join(outputDir, 'db-1000.sqlite3'), 1000);

  console.log('[fixtures] Generating synthetic 5,000-item database...');
  createSyntheticDatabase(join(outputDir, 'db-5000.sqlite3'), 5000);

  console.log('[fixtures] Generating synthetic 100-page PDF document...');
  const pdfBytes = await createSyntheticLargePdf(join(outputDir, 'large-doc-100pages.pdf'), 100);
  console.log(`[fixtures] 100-page PDF generated (${pdfBytes} bytes).`);

  console.log('[fixtures] All synthetic fixtures successfully generated.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { dataRoot } = resolveDataPaths({ appRoot: process.cwd() });
  const targetDir = join(dataRoot, 'hardening', 'phase-16', 'benchmarks');
  generateAllSyntheticFixtures(targetDir).catch(console.error);
}
