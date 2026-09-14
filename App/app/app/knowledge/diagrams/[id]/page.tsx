'use client';

/**
 * Mermaid Diagram Detail Route.
 * Phase 13 — Knowledge and Diagram System.
 */

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileCode } from 'lucide-react';
import { MermaidEditor } from '@/components/knowledge';
import type { MermaidDocument } from '@/lib/knowledge';

export default function MermaidDiagramDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [doc, setDoc] = useState<MermaidDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/knowledge/diagrams/${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to load diagram (HTTP ${res.status})`);
        }
        return (await res.json()) as MermaidDocument;
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
        <FileCode className="h-5 w-5 animate-spin mr-2 text-primary" />
        Loading diagram editor...
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-background text-foreground p-6 gap-3">
        <h2 className="text-base font-semibold">Diagram Not Found</h2>
        <p className="text-xs text-muted-foreground">{error || 'Could not load requested diagram.'}</p>
        <Link
          href="/knowledge?tab=diagrams"
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          <ArrowLeft size={13} /> Back to Knowledge Hub
        </Link>
      </div>
    );
  }

  return (
    <main className="h-screen w-screen overflow-hidden bg-background">
      <MermaidEditor initialDocument={doc} onDocumentChange={setDoc} />
    </main>
  );
}
