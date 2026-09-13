import { LibraryBrowser } from '@/components/library-browser';

export default async function Home(props: {
  searchParams?: Promise<{ collection?: string }>;
}) {
  const searchParams = await props.searchParams;
  const initialCollection =
    searchParams?.collection === 'watch' ? 'watch' : 'read';
  return <LibraryBrowser initialCollection={initialCollection} />;
}
