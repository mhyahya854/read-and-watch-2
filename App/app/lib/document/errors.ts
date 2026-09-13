/**
 * Normalized Read & Watch Document Error Model.
 * Provides stable machine-readable codes, user-safe messages, and technical causes.
 * Never leaks personal absolute machine paths to application consumers.
 */

export type DocumentErrorCode =
  | 'UNSUPPORTED_FORMAT'
  | 'UNSUPPORTED_CAPABILITY'
  | 'INVALID_SOURCE'
  | 'SOURCE_NOT_FOUND'
  | 'SOURCE_CHANGED'
  | 'OPEN_FAILED'
  | 'PARSE_FAILED'
  | 'NAVIGATION_FAILED'
  | 'SEARCH_FAILED'
  | 'ANCHOR_INVALID'
  | 'ANCHOR_VERSION_UNSUPPORTED'
  | 'ANCHOR_SOURCE_MISMATCH'
  | 'CANCELLED'
  | 'ADAPTER_CLOSED'
  | 'INVALID_LIFECYCLE_STATE';

export interface DocumentErrorOptions {
  readonly code: DocumentErrorCode;
  readonly message: string;
  readonly cause?: unknown;
  readonly retryable?: boolean;
}

export class DocumentError extends Error {
  readonly code: DocumentErrorCode;
  readonly retryable: boolean;

  constructor(options: DocumentErrorOptions) {
    super(options.message);
    this.name = 'DocumentError';
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
    // Maintain proper prototype chain for instanceof checks across compilation targets
    Object.setPrototypeOf(this, DocumentError.prototype);
  }

  static isDocumentError(error: unknown): error is DocumentError {
    return error instanceof DocumentError || (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error as { name: unknown }).name === 'DocumentError' &&
      'code' in error &&
      typeof (error as { code: unknown }).code === 'string'
    );
  }

  static unsupportedFormat(format: string): DocumentError {
    return new DocumentError({
      code: 'UNSUPPORTED_FORMAT',
      message: `The document format "${format}" is not supported by any registered document adapter.`,
      retryable: false,
    });
  }

  static unsupportedCapability(capability: string, format?: string): DocumentError {
    const context = format ? ` for format "${format}"` : '';
    return new DocumentError({
      code: 'UNSUPPORTED_CAPABILITY',
      message: `The capability "${capability}" is not supported by this document adapter${context}.`,
      retryable: false,
    });
  }

  static invalidSource(reason: string): DocumentError {
    return new DocumentError({
      code: 'INVALID_SOURCE',
      message: `Document source descriptor is invalid: ${reason}`,
      retryable: false,
    });
  }

  static sourceNotFound(itemId: string, formatId?: string): DocumentError {
    const detail = formatId ? ` (format "${formatId}")` : '';
    return new DocumentError({
      code: 'SOURCE_NOT_FOUND',
      message: `Document source for item "${itemId}"${detail} could not be found.`,
      retryable: true,
    });
  }

  static sourceChanged(expectedHash: string, actualHash: string): DocumentError {
    return new DocumentError({
      code: 'SOURCE_CHANGED',
      message: `Document source content hash mismatch. Expected ${expectedHash.slice(0, 8)}..., found ${actualHash.slice(0, 8)}...`,
      retryable: false,
    });
  }

  static openFailed(reason: string, cause?: unknown): DocumentError {
    return new DocumentError({
      code: 'OPEN_FAILED',
      message: `Failed to open document: ${reason}`,
      cause,
      retryable: true,
    });
  }

  static parseFailed(reason: string, cause?: unknown): DocumentError {
    return new DocumentError({
      code: 'PARSE_FAILED',
      message: `Failed to parse document content: ${reason}`,
      cause,
      retryable: false,
    });
  }

  static navigationFailed(reason: string, cause?: unknown): DocumentError {
    return new DocumentError({
      code: 'NAVIGATION_FAILED',
      message: `Navigation to requested location failed: ${reason}`,
      cause,
      retryable: true,
    });
  }

  static searchFailed(reason: string, cause?: unknown): DocumentError {
    return new DocumentError({
      code: 'SEARCH_FAILED',
      message: `Document search failed: ${reason}`,
      cause,
      retryable: true,
    });
  }

  static anchorInvalid(reason: string): DocumentError {
    return new DocumentError({
      code: 'ANCHOR_INVALID',
      message: `Text anchor payload is malformed or invalid: ${reason}`,
      retryable: false,
    });
  }

  static anchorVersionUnsupported(version: number): DocumentError {
    return new DocumentError({
      code: 'ANCHOR_VERSION_UNSUPPORTED',
      message: `Text anchor schema version ${version} is not supported by this application.`,
      retryable: false,
    });
  }

  static anchorSourceMismatch(anchorHash: string, documentHash: string): DocumentError {
    return new DocumentError({
      code: 'ANCHOR_SOURCE_MISMATCH',
      message: `Text anchor source hash (${anchorHash.slice(0, 8)}...) does not match active document (${documentHash.slice(0, 8)}...).`,
      retryable: false,
    });
  }

  static cancelled(operation = 'Operation'): DocumentError {
    return new DocumentError({
      code: 'CANCELLED',
      message: `${operation} was cancelled.`,
      retryable: true,
    });
  }

  static adapterClosed(operation = 'Operation'): DocumentError {
    return new DocumentError({
      code: 'ADAPTER_CLOSED',
      message: `Cannot perform ${operation}: document adapter is closed or closing.`,
      retryable: false,
    });
  }

  static invalidLifecycleState(action: string, currentState: string): DocumentError {
    return new DocumentError({
      code: 'INVALID_LIFECYCLE_STATE',
      message: `Cannot ${action} when document adapter is in state "${currentState}".`,
      retryable: false,
    });
  }
}
