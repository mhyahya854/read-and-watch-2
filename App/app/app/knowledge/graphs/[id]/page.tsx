'use client';

/**
 * Concept Graph Detail Route.
 * Phase 13 — Knowledge and Diagram System.
 */

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Workflow } from 'lucide-react';
import { ConceptGraphCanvas } from '@/components/knowledge';
import type { KnowledgeGraphDocument } from '@/lib/knowledge';

export default function ConceptGraphDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [doc, setDoc] = useState<KnowledgeGraphDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/knowledge/graphs/${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to load concept graph (HTTP ${res.status})`);
        }
        return (await res.json()) as KnowledgeGraphDocument;
      })
      .then((data) => {
        if (active) {
          setDoc(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(String(err));
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-muted-foreground text-xs">
        <Workflow className="h-5 w-5 animate-spin mr-2 text-primary" />
        Loading concept graph...
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-background text-foreground p-6 gap-3">
        <h2 className="text-base font-semibold">Graph Not Found</h2>
        <p className="text-xs text-muted-foreground">{error || 'Could not load requested graph.'}</p>
        <Link
          href="/knowledge?tab=graphs"
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          <ArrowLeft size={13} /> Back to Knowledge Hub
        </Link>
      </div>
    );
  }

  return (
    <main className="h-screen w-screen overflow-hidden bg-background">
      <ConceptGraphCanvas initialDocument={doc} onDocumentChange={setDoc} />
    </main>
  );
}
