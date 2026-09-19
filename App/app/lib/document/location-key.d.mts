import type { DocumentLocation } from './location.ts';

export function canonicalLocationKey(location: unknown): string | null;
export function locationsEqual(a: unknown, b: unknown): boolean;
export function isValidLocation(location: unknown): boolean;
export function describeLocation(location: DocumentLocation): string;
