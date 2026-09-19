import { StaticProductPage } from '@/components/static-product-page';
import { CanvasList } from '@/components/canvas';

export default function CanvasNotesPage() {
  return (
    <StaticProductPage title="Canvas Notes" eyebrow="Workspace">
      <section className="rounded-lg border border-border bg-surface shadow-xs overflow-hidden h-[600px] flex flex-col">
        <CanvasList globalScope />
      </section>
    </StaticProductPage>
  );
}
