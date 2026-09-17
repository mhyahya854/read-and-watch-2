/**
 * Upstream revision resolution — Phase 17.
 *
 * The update mechanism prefers authoritative official upstream provenance
 * (baidu/Unlimited-OCR, PaddlePaddle/PaddleOCR) over the personal fork. The
 * fork exists for continuity, inspection, and as a patch escape hatch; it is not
 * the version authority.
 *
 * Only public engine/model metadata is fetched. No user document, page image, or
 * recognised text ever leaves the machine.
 */

const DEFAULT_API_ROOT = 'https://api.github.com';

export class UpstreamResolutionError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'UpstreamResolutionError';
    this.code = 'UPDATE_FAILED';
    this.details = details;
  }
}

export function createUpstreamResolver({ fetchImpl = globalThis.fetch, apiRoot = DEFAULT_API_ROOT } = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new UpstreamResolutionError('No fetch implementation available for upstream resolution');
  }

  /**
   * Resolves the current head commit of an official upstream default branch.
   * @param {{repository: string, branch?: string, signal?: AbortSignal, userAgent?: string}} input
   */
  async function resolveUpstreamHead({ repository, branch = 'main', signal, userAgent = 'read-and-watch-ocr' }) {
    if (typeof repository !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(repository)) {
      throw new UpstreamResolutionError(`Invalid upstream repository identifier: ${String(repository)}`);
    }
    const url = `${apiRoot}/repos/${repository}/commits/${encodeURIComponent(branch)}`;
    let response;
    try {
      response = await fetchImpl(url, {
        signal,
        headers: {
          accept: 'application/vnd.github+json',
          'user-agent': userAgent,
        },
      });
    } catch (error) {
      throw new UpstreamResolutionError(`Upstream lookup failed for ${repository}: ${error.message}`, {
        repository,
      });
    }
    if (!response.ok) {
      throw new UpstreamResolutionError(
        `Upstream lookup for ${repository} returned HTTP ${response.status}`,
        { repository, status: response.status },
      );
    }
    const body = await response.json();
    if (typeof body?.sha !== 'string' || body.sha.length === 0) {
      throw new UpstreamResolutionError(`Upstream lookup for ${repository} returned no commit sha`, {
        repository,
      });
    }
    return {
      revision: body.sha,
      provenance: {
        repository,
        branch,
        commitUrl: body.html_url ?? null,
        committedAt: body.commit?.committer?.date ?? null,
        resolvedAt: new Date().toISOString(),
        authority: 'official-upstream',
      },
    };
  }

  return { resolveUpstreamHead };
}
