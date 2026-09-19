import { LibraryBrowser } from '@/components/library-browser';

export default async function Home(props: {
  searchParams?: Promise<{
    collection?: string;
    selected?: string;
    mode?: 'split' | 'maximized' | 'closed';
    sidebar?: 'collapsed' | 'expanded';
    tab?: 'overview' | 'thoughts' | 'notes' | 'metadata' | 'media' | 'relationships' | 'highlights' | 'canvas';
    media?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const initialCollection =
    searchParams?.collection === 'watch' ? 'watch' : 'read';
  const initialSelectedId = searchParams?.selected ?? null;
  const initialDetailMode =
    searchParams?.mode === 'maximized'
      ? 'maximized'
      : searchParams?.mode === 'closed'
        ? 'closed'
        : 'split';
  const initialSidebarCollapsed = searchParams?.sidebar === 'collapsed';
  const initialTab = searchParams?.tab ?? 'overview';
  const initialPreviewIndex =
    searchParams?.media !== undefined
      ? parseInt(searchParams.media, 10)
      : undefined;

  return (
    <LibraryBrowser
      initialCollection={initialCollection}
      initialSelectedId={initialSelectedId}
      initialDetailMode={initialDetailMode}
      initialSidebarCollapsed={initialSidebarCollapsed}
      initialTab={initialTab}
      initialPreviewIndex={initialPreviewIndex}
    />
  );
}
