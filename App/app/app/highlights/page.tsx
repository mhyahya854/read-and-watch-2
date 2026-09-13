import { StaticProductPage } from '@/components/static-product-page';

export default function HighlightsPage() {
  return (
    <StaticProductPage title="Highlights" eyebrow="Workspace">
      <section className="rounded-md border border-border bg-surface p-6">
        <h2 className="font-editorial text-xl font-semibold text-foreground">
          No highlights yet
        </h2>
        <p className="mt-2">
          Highlights will appear here when annotation support is available.
          Your library and notes continue to work independently.
        </p>
      </section>
    </StaticProductPage>
  );
}
