import { Suspense } from 'react';
import { StaticProductPage } from '@/components/static-product-page';
import { KnowledgeHub } from '@/components/knowledge';

export default function KnowledgePage() {
  return (
    <StaticProductPage title="Knowledge & Diagrams" eyebrow="Workspace">
      <Suspense fallback={<div className="p-8 text-center text-xs text-muted-foreground">Loading knowledge system...</div>}>
        <KnowledgeHub />
      </Suspense>
    </StaticProductPage>
  );
}
