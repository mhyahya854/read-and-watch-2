/**
 * Universal DocumentAdapter Conformance Test Suite.
 * Exercises any DocumentAdapter implementation to prove contract conformance,
 * lifecycle integrity, cancellation safety, error normalization, and anchor validity.
 */

import { DocumentError } from '../errors.ts';
import { type ReadonlyDocumentSource } from '../source.ts';
import { type DocumentAdapter } from '../adapter.ts';
import { type TextAnchor } from '../anchor.ts';

export interface ConformanceCheckResult {
  readonly checkName: string;
  readonly passed: boolean;
  readonly detail?: string;
}

export interface ConformanceReport {
  readonly adapterName: string;
  readonly passed: boolean;
  readonly checks: ReadonlyArray<ConformanceCheckResult>;
  readonly durationMs: number;
}

export async function runDocumentAdapterConformanceSuite(
  adapterName: string,
  createFreshAdapter: () => DocumentAdapter,
  testSource: ReadonlyDocumentSource
): Promise<ConformanceReport> {
  const startTime = Date.now();
  const checks: ConformanceCheckResult[] = [];

  function record(checkName: string, passed: boolean, detail?: string) {
    checks.push({ checkName, passed, detail });
    if (!passed) {
      // console.warn(`[Conformance FAIL] ${adapterName} - ${checkName}: ${detail || 'failed'}`);
    }
  }

  // 1. Initial State Check
  try {
    const adapter = createFreshAdapter();
    record('initial-state-is-created', adapter.lifecycleState === 'created');
    record('initial-source-is-null', adapter.source === null);
  } catch (err) {
    record('initial-state-is-created', false, String(err));
  }

  // 2. Lifecycle: Open & State
  const liveAdapter = createFreshAdapter();
  try {
    await liveAdapter.open(testSource);
    record('open-transitions-to-open', liveAdapter.lifecycleState === 'open');
    record('open-attaches-source', liveAdapter.source?.itemId === testSource.itemId);
  } catch (err) {
    record('open-transitions-to-open', false, String(err));
  }

  // 3. Lifecycle: Double Open Prevention
  try {
    let threw = false;
    try {
      await liveAdapter.open(testSource);
    } catch (err) {
      threw = DocumentError.isDocumentError(err) && err.code === 'INVALID_LIFECYCLE_STATE';
    }
    record('double-open-throws-invalid-state', threw);
  } catch (err) {
    record('double-open-throws-invalid-state', false, String(err));
  }

  // 4. Metadata Contract
  try {
    const meta = await liveAdapter.getMetadata();
    record(
      'metadata-returns-valid-shape',
      Boolean(meta && typeof meta.format === 'string' && meta.format.length > 0)
    );
  } catch (err) {
    record('metadata-returns-valid-shape', false, String(err));
  }

  // 5. TOC Contract
  let tocTarget: import('../location').DocumentLocation | null = null;
  try {
    const toc = await liveAdapter.getTOC();
    const valid =
      Array.isArray(toc) &&
      toc.length > 0 &&
      toc.every((entry) => Boolean(entry.id && entry.title && entry.targetLocation));
    if (valid && toc.length > 0) {
      tocTarget = toc[0].targetLocation;
    }
    record('toc-returns-structured-entries', valid);
  } catch (err) {
    record('toc-returns-structured-entries', false, String(err));
  }

  // 6. Current Location Contract
  try {
    const loc = await liveAdapter.getCurrentLocation();
    const valid =
      loc.schemaVersion === 1 &&
      loc.sourceHash === testSource.sourceHash &&
      Boolean(loc.kind && loc.payload);
    record('get-current-location-valid', valid);
  } catch (err) {
    record('get-current-location-valid', false, String(err));
  }

  // 7. Navigation Contract
  if (tocTarget) {
    try {
      await liveAdapter.goTo(tocTarget);
      const newLoc = await liveAdapter.getCurrentLocation();
      record(
        'navigation-updates-location',
        newLoc.sourceHash === testSource.sourceHash && newLoc.kind === tocTarget.kind
      );
    } catch (err) {
      record('navigation-updates-location', false, String(err));
    }
  }

  // 8. Search Contract & Cancellation
  try {
    const results = await liveAdapter.search('Chapter');
    const valid =
      Array.isArray(results) &&
      results.every(
        (r) =>
          Boolean(r.id && r.matchText && r.snippet && r.location) &&
          r.location.sourceHash === testSource.sourceHash
      );
    record('search-returns-valid-results', valid);

    // Test Search Cancellation
    const abortController = new AbortController();
    abortController.abort();
    let cancelled = false;
    try {
      await liveAdapter.search('test', {}, abortController.signal);
    } catch (err) {
      cancelled = DocumentError.isDocumentError(err) && err.code === 'CANCELLED';
    }
    record('search-respects-cancellation', cancelled);
  } catch (err) {
    record('search-returns-valid-results', false, String(err));
  }

  // 9. Selection & Text Anchor Creation Contract
  let createdAnchor: TextAnchor | null = null;
  try {
    const selection = await liveAdapter.getSelection();
    if (selection) {
      record(
        'selection-returns-text-and-location',
        Boolean(selection.text && selection.location)
      );
      createdAnchor = await liveAdapter.createTextAnchor(selection);
      const validAnchor =
        createdAnchor.schemaVersion === 1 &&
        createdAnchor.sourceHash === testSource.sourceHash &&
        Boolean(createdAnchor.kind && createdAnchor.quote && createdAnchor.payload);
      record('create-anchor-returns-versioned-anchor', validAnchor);
    } else {
      record('selection-returns-text-and-location', true, 'Selection was null');
    }
  } catch (err) {
    record('create-anchor-returns-versioned-anchor', false, String(err));
  }

  // 10. Anchor Resolution: Exact Match
  if (createdAnchor) {
    try {
      const resolved = await liveAdapter.resolveTextAnchor(createdAnchor);
      record(
        'resolve-matching-anchor-is-exact',
        resolved.status === 'exact' && resolved.confidence === 1.0 && Boolean(resolved.location)
      );
    } catch (err) {
      record('resolve-matching-anchor-is-exact', false, String(err));
    }

    // 11. Anchor Resolution: Source Mismatch
    try {
      const mismatchedAnchor: TextAnchor = {
        ...createdAnchor,
        sourceHash: '0000000000000000000000000000000000000000000000000000000000000000',
      };
      const resolved = await liveAdapter.resolveTextAnchor(mismatchedAnchor);
      record(
        'resolve-mismatched-anchor-reports-source-mismatch',
        resolved.status === 'source-mismatch' && resolved.confidence === 0
      );
    } catch (err) {
      record('resolve-mismatched-anchor-reports-source-mismatch', false, String(err));
    }

    // 12. Anchor Resolution: Unsupported Future Version
    try {
      const futureAnchor: TextAnchor = {
        ...createdAnchor,
        schemaVersion: 999 as unknown as 1,
      };
      const resolved = await liveAdapter.resolveTextAnchor(futureAnchor);
      record(
        'resolve-future-version-reports-unsupported',
        resolved.status === 'version-unsupported' && resolved.confidence === 0
      );
    } catch (err) {
      record('resolve-future-version-reports-unsupported', false, String(err));
    }
  }

  // 13. Capabilities Discovery
  try {
    const caps = liveAdapter.getCapabilities();
    record('capabilities-is-valid-set', caps instanceof Set && caps.size > 0);
  } catch (err) {
    record('capabilities-is-valid-set', false, String(err));
  }

  // 14. Lifecycle: Close
  try {
    await liveAdapter.close();
    record('close-transitions-to-closed', liveAdapter.lifecycleState === 'closed');
  } catch (err) {
    record('close-transitions-to-closed', false, String(err));
  }

  // 15. Lifecycle: Double Close Idempotency
  try {
    await liveAdapter.close();
    record('double-close-is-idempotent', liveAdapter.lifecycleState === 'closed');
  } catch (err) {
    record('double-close-is-idempotent', false, String(err));
  }

  // 16. Guard: Calls When Closed Throw ADAPTER_CLOSED
  try {
    let threw = false;
    try {
      await liveAdapter.getCurrentLocation();
    } catch (err) {
      threw = DocumentError.isDocumentError(err) && err.code === 'ADAPTER_CLOSED';
    }
    record('calls-when-closed-throw-adapter-closed', threw);
  } catch (err) {
    record('calls-when-closed-throw-adapter-closed', false, String(err));
  }

  // 17. Lifecycle: Cancellation During Open
  try {
    const freshAdapter = createFreshAdapter();
    const abortCtrl = new AbortController();
    abortCtrl.abort();
    let aborted = false;
    try {
      await freshAdapter.open(testSource, abortCtrl.signal);
    } catch (err) {
      aborted = DocumentError.isDocumentError(err) && err.code === 'CANCELLED';
    }
    record('cancellation-during-open-aborts', aborted);
    record(
      'cancellation-leaves-clean-state',
      freshAdapter.lifecycleState === 'failed' || freshAdapter.lifecycleState === 'closed'
    );
  } catch (err) {
    record('cancellation-during-open-aborts', false, String(err));
  }

  // 18. Lifecycle: Close Before Open Works Cleanly
  try {
    const unopened = createFreshAdapter();
    await unopened.close();
    record('close-before-open-is-safe', unopened.lifecycleState === 'closed');
  } catch (err) {
    record('close-before-open-is-safe', false, String(err));
  }

  const allPassed = checks.every((c) => c.passed);
  return {
    adapterName,
    passed: allPassed,
    checks,
    durationMs: Date.now() - startTime,
  };
}
