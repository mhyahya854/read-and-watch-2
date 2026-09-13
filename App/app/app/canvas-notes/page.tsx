import { StaticProductPage } from '@/components/static-product-page';

export default function CanvasNotesPage() {
  return (
    <StaticProductPage title="Canvas Notes" eyebrow="Workspace">
      <section className="rounded-md border border-border bg-surface p-6">
        <h2 className="font-editorial text-xl font-semibold text-foreground">
          Canvas Notes are not available yet
        </h2>
        <p className="mt-2">
          This entry point is ready, but drawing and linked-canvas tools are not
          part of the current application.
        </p>
      </section>
    </StaticProductPage>
  );
}
