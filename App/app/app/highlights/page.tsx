import { StaticProductPage } from '@/components/static-product-page';
import { StudyBrowser } from '@/components/study';

export default function HighlightsPage() {
  return (
    <StaticProductPage title="Study & Highlights" eyebrow="Workspace">
      <div className="h-[680px] flex flex-col">
        <StudyBrowser />
      </div>
    </StaticProductPage>
  );
}
