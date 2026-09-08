'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import type { UserDataType } from '@/lib/user-data';
import { UserDataService } from '@/lib/user-data';

type EditorStatus = 'loading' | 'ready' | 'saving' | 'saved' | 'error' | 'conflict';

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (char) =>
    (
      {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      } as Record<string, string>
    )[char],
  );
}

function inlineMarkdown(escaped: string) {
  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" rel="noreferrer" target="_blank">$1</a>',
    );
}

function renderMarkdown(source: string) {
  const lines = source.split('\n');
  const out: string[] = [];
  let inCode = false;
  let codeLines: string[] = [];
  let listOpen = false;

  function closeList() {
    if (listOpen) {
      out.push('</ul>');
      listOpen = false;
    }
  }

  for (const raw of lines) {
    if (raw.startsWith('```')) {
      closeList();
      if (inCode) {
        out.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    const line = escapeHtml(raw);
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    const listItem = line.match(/^[-*]\s+(.*)$/);
    if (listItem) {
      if (!listOpen) {
        out.push('<ul>');
        listOpen = true;
      }
      out.push(`<li>${inlineMarkdown(listItem[1])}</li>`);
      continue;
    }
    if (!line.trim()) {
      closeList();
      continue;
    }
    closeList();
    out.push(`<p>${inlineMarkdown(line)}</p>`);
  }
  if (inCode) out.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
  closeList();
  return out.join('\n');
}

export function UserDataEditor({
  itemId,
  type,
  title,
  onDirtyChange,
}: {
  itemId: string;
  type: UserDataType;
  title: string;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [revision, setRevision] = useState<string | null>(null);
  const [status, setStatus] = useState<EditorStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const onDirtyRef = useRef(onDirtyChange);
  const dirty = content !== savedContent;

  useEffect(() => {
    onDirtyRef.current = onDirtyChange;
  });

  useEffect(() => {
    onDirtyRef.current?.(dirty);
  }, [dirty]);

  useEffect(() => {
    let cancelled = false;
    UserDataService.load(type, itemId)
      .then((doc) => {
        if (cancelled) return;
        const text = doc.content ?? '';
        setContent(text);
        setSavedContent(text);
        setRevision(doc.revision);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setStatus('error');
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [itemId, type]);

  async function persist(text: string, base: string | null) {
    setStatus('saving');
    setError(null);
    const result = await UserDataService.save(type, itemId, text, base);
    if (!result.ok) {
      setStatus('conflict');
      setError('This note changed on disk since it was opened.');
      return;
    }
    setContent(result.content);
    setSavedContent(result.content);
    setRevision(result.revision);
    setStatus('saved');
  }

  async function save() {
    try {
      await persist(content, revision);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function overwrite() {
    try {
      const doc = await UserDataService.load(type, itemId);
      await persist(content, doc.revision);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function reloadFromDisk() {
    setStatus('loading');
    setError(null);
    try {
      const doc = await UserDataService.load(type, itemId);
      const text = doc.content ?? '';
      setContent(text);
      setSavedContent(text);
      setRevision(doc.revision);
      setStatus('ready');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void save();
    }
  }

  const statusText =
    status === 'loading'
      ? 'Loading…'
      : status === 'saving'
        ? 'Saving…'
        : status === 'saved' || (!dirty && status !== 'error' && status !== 'conflict')
          ? 'Saved'
          : dirty
            ? 'Unsaved changes'
            : '';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant={mode === 'edit' ? 'secondary' : 'ghost'}
            onClick={() => setMode('edit')}
            aria-pressed={mode === 'edit'}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant={mode === 'preview' ? 'secondary' : 'ghost'}
            onClick={() => setMode('preview')}
            aria-pressed={mode === 'preview'}
          >
            Preview
          </Button>
        </div>
        <Button size="sm" onClick={() => void save()} disabled={status === 'loading' || !dirty}>
          Save
        </Button>
      </div>

      {mode === 'edit' ? (
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          onKeyDown={handleKeyDown}
          aria-label={title}
          placeholder={`Write your ${title.toLowerCase()} as Markdown…`}
          className="min-h-[180px] w-full resize-y rounded-md border border-white/10 bg-black/20 px-3 py-2 font-mono text-sm leading-6 text-foreground/90 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      ) : (
        <div
          aria-label={`${title} preview`}
          className="markdown-preview min-h-[180px] w-full overflow-auto rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
        />
      )}

      <p aria-live="polite" className="text-[11px] text-muted-foreground">
        {statusText}
      </p>
      {status === 'error' && <p className="text-[11px] text-destructive">{error}</p>}
      {status === 'conflict' && (
        <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <p className="text-[11px] text-amber-200">{error}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => void reloadFromDisk()}>
              Load on-disk version
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void overwrite()}>
              Keep mine (overwrite)
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
