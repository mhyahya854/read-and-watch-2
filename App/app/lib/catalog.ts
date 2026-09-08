export type Collection = 'read' | 'watch';

export type CatalogMedia = {
  name: string;
  path: string;
  extension: string;
};

export type LibraryItem = {
  id: string;
  title: string;
  collection: Collection;
  itemPath: string;
  type: string;
  status: string;
  added: string;
  tags: string[];
  summary: string;
  cover: string | null;
  preview: string | null;
  notionProperties: Record<string, string>;
  media: CatalogMedia[];
  relationshipIds: string[];
};

export type LibraryCatalog = {
  schemaVersion: number;
  generatedFromImportUtc: string;
  counts: { read: number; watch: number; total: number };
  items: LibraryItem[];
};

export function libraryAssetUrl(path: string) {
  return `/library-assets/${path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;
}
