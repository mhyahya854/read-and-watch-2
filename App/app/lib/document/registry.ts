/**
 * Document Adapter Registry and Factory.
 * Maps document formats to adapter factories without heavyweight plugin frameworks.
 */

import { DocumentError } from './errors.ts';
import { type DocumentFormat, type ReadonlyDocumentSource, validateDocumentSource } from './source.ts';
import { type DocumentAdapter } from './adapter.ts';

export type DocumentAdapterFactory = (source: ReadonlyDocumentSource) => DocumentAdapter;

export type EngineFamily = 'pdf' | 'reflowable';

export interface AdapterRegistration {
  readonly format: DocumentFormat;
  readonly family: EngineFamily;
  readonly factory: DocumentAdapterFactory;
  readonly displayName?: string;
}

export class DocumentAdapterRegistry {
  private readonly registrations = new Map<DocumentFormat, AdapterRegistration>();

  /** Register an adapter factory for a given format */
  register(registration: AdapterRegistration, allowOverwrite = false): void {
    if (!registration.format) {
      throw DocumentError.invalidSource('Cannot register adapter without valid format');
    }
    if (typeof registration.factory !== 'function') {
      throw DocumentError.invalidSource('Adapter registration requires a factory function');
    }

    if (this.registrations.has(registration.format) && !allowOverwrite) {
      throw new DocumentError({
        code: 'INVALID_SOURCE',
        message: `An adapter factory is already registered for format "${registration.format}". Use allowOverwrite to replace.`,
        retryable: false,
      });
    }

    this.registrations.set(registration.format, registration);
  }

  /** Retrieve the factory for a given document format */
  getFactory(format: DocumentFormat): DocumentAdapterFactory | undefined {
    return this.registrations.get(format)?.factory;
  }

  /** Retrieve the full registration record for a given format */
  getRegistration(format: DocumentFormat): AdapterRegistration | undefined {
    return this.registrations.get(format);
  }

  /** Check if a format has a registered adapter */
  supportsFormat(format: DocumentFormat): boolean {
    return this.registrations.has(format);
  }

  /** Return the set of all registered formats */
  getSupportedFormats(): ReadonlySet<DocumentFormat> {
    return new Set(this.registrations.keys());
  }

  /** Instantiate a DocumentAdapter for the given document source */
  createAdapter(source: ReadonlyDocumentSource): DocumentAdapter {
    const validSource = validateDocumentSource(source);
    const factory = this.getFactory(validSource.format);

    if (!factory) {
      throw DocumentError.unsupportedFormat(validSource.format);
    }

    return factory(validSource);
  }

  /** Clear all registrations (primarily useful in test suites) */
  clear(): void {
    this.registrations.clear();
  }
}

/** Global default registry instance */
export const defaultAdapterRegistry = new DocumentAdapterRegistry();

import { FoliateReflowableAdapter } from './reflowable-adapter.ts';

export function registerReflowableAdapters(
  registry: DocumentAdapterRegistry = defaultAdapterRegistry,
  allowOverwrite = false
): void {
  const formats: DocumentFormat[] = ['epub', 'mobi', 'azw', 'azw3', 'fb2', 'cbz'];
  for (const fmt of formats) {
    registry.register(
      {
        format: fmt,
        family: 'reflowable',
        factory: () => new FoliateReflowableAdapter(),
        displayName: `Foliate ${fmt.toUpperCase()} Adapter`,
      },
      allowOverwrite
    );
  }
}

registerReflowableAdapters(defaultAdapterRegistry, true);

