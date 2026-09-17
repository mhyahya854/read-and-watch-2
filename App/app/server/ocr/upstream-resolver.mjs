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
const DEFAULT_HF_API_ROOT = 'https://huggingface.co';

export class UpstreamResolutionError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'UpstreamResolutionError';
    this.code = 'UPDATE_FAILED';
    this.details = details;
  }
}

export function createUpstreamResolver({
  fetchImpl = globalThis.fetch,
  apiRoot = DEFAULT_API_ROOT,
  huggingFaceApiRoot = DEFAULT_HF_API_ROOT,
} = {}) {
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

  /**
   * Resolves the current revision and public file list of a Hugging Face model
   * repository. Used for the Urdu Nastaliq specialist, whose weights are only
   * published there. Only public model metadata is fetched: no document, page
   * image, or recognised text is ever sent.
   */
  async function resolveHuggingFaceModelRevision({
    modelId,
    signal,
    userAgent = 'read-and-watch-ocr',
    expectedRevision = null,
  }) {
    if (typeof modelId !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(modelId)) {
      throw new UpstreamResolutionError(`Invalid Hugging Face model identifier: ${String(modelId)}`);
    }
    const headers = { accept: 'application/json', 'user-agent': userAgent };
    let info;
    try {
      const response = await fetchImpl(`${huggingFaceApiRoot}/api/models/${modelId}`, { signal, headers });
      if (!response.ok) {
        throw new UpstreamResolutionError(
          `Hugging Face lookup for ${modelId} returned HTTP ${response.status}`,
          { modelId, status: response.status },
        );
      }
      info = await response.json();
    } catch (error) {
      if (error instanceof UpstreamResolutionError) throw error;
      throw new UpstreamResolutionError(`Hugging Face lookup failed for ${modelId}: ${error.message}`, {
        modelId,
      });
    }
    if (typeof info?.sha !== 'string' || info.sha.length === 0) {
      throw new UpstreamResolutionError(`Hugging Face lookup for ${modelId} returned no revision`, {
        modelId,
      });
    }
    if (expectedRevision && info.sha !== expectedRevision) {
      // The pinned revision is the authorised one. A moving upstream head is
      // reported as an update candidate, never silently adopted.
      return {
        revision: info.sha,
        pinnedRevision: expectedRevision,
        pinnedRevisionIsCurrent: false,
        provenance: {
          authority: 'official-upstream',
          host: 'huggingface.co',
          repository: modelId,
          revision: info.sha,
          lastModified: info.lastModified ?? null,
          resolvedAt: new Date().toISOString(),
          license: info.cardData?.license ?? null,
        },
      };
    }

    let files = [];
    try {
      const treeResponse = await fetchImpl(
        `${huggingFaceApiRoot}/api/models/${modelId}/tree/${encodeURIComponent(info.sha)}?recursive=true&expand=true`,
        { signal, headers },
      );
      if (treeResponse.ok) {
        const tree = await treeResponse.json();
        files = (Array.isArray(tree) ? tree : [])
          .filter((entry) => entry?.type === 'file')
          .map((entry) => ({
            path: entry.path,
            size: entry.size ?? null,
            upstreamSha256: entry.lfs?.oid ?? entry.lfs?.sha256 ?? null,
          }));
      }
    } catch {
      // A tree failure is not fatal: the download step verifies each file again.
      files = [];
    }

    return {
      revision: info.sha,
      pinnedRevision: expectedRevision,
      pinnedRevisionIsCurrent: expectedRevision ? expectedRevision === info.sha : true,
      files,
      provenance: {
        authority: 'official-upstream',
        host: 'huggingface.co',
        repository: modelId,
        revision: info.sha,
        lastModified: info.lastModified ?? null,
        resolvedAt: new Date().toISOString(),
        license: info.cardData?.license ?? null,
        fileCount: files.length,
      },
    };
  }

  return { resolveUpstreamHead, resolveHuggingFaceModelRevision };
}
