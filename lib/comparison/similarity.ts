/**
 * lib/comparison/similarity.ts — Generic text-similarity utilities
 *
 * Pure functions for name normalisation and token-overlap scoring.
 * No Nigeria-specific knowledge lives here — that's imported from
 * lib/config/nigeria.ts so the same functions work for any locale
 * if a different config is supplied.
 */

import { NIGERIAN_TITLE_REGEX, NIGERIAN_STATES, NIGERIAN_CITIES } from "@/lib/config/nigeria";

// ---------------------------------------------------------------------------
// Name normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise a personal name string into a de-titled, de-hyphenated array of
 * lowercase tokens ready for token-overlap comparison.
 *
 * Steps:
 *  1. Lowercase
 *  2. Strip honorific / professional titles (list from nigeria config)
 *  3. Replace hyphens with spaces — "Obi-Nwosu" → "Obi Nwosu" (two tokens)
 *  4. Strip remaining non-alpha characters
 *  5. Split on whitespace and filter empty strings
 */
export function normalizeName(name: string): string[] {
  return name
    .toLowerCase()
    .replace(NIGERIAN_TITLE_REGEX, "")
    .replace(/-/g, " ")
    .replace(/[^a-z\s]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Token-overlap scoring
// ---------------------------------------------------------------------------

/**
 * Compute the fraction of `aTokens` that have a prefix-aware match in `bTokens`.
 *
 * Prefix matching handles abbreviated names: "O." matches "Olumide" because
 * "olumide".startsWith("o") is true. This is the standard eKYC tolerance for
 * abbreviated first/middle names on utility bills.
 *
 * Returns a value in [0, 1]. 1.0 means every token in `a` found a match in `b`.
 */
export function tokenOverlap(aTokens: string[], bTokens: string[]): number {
  if (aTokens.length === 0) return 0;
  const matched = aTokens.filter((t) =>
    bTokens.some((b) => b.startsWith(t) || t.startsWith(b))
  );
  return matched.length / aTokens.length;
}

// ---------------------------------------------------------------------------
// Address geography tokenisation
// ---------------------------------------------------------------------------

/**
 * Extract recognisable Nigerian state and city tokens from an address string.
 *
 * Uses substring matching against the NIGERIAN_STATES and NIGERIAN_CITIES lists
 * from the Nigeria config. Returns a de-duplicated array of matched location tokens.
 *
 * Used by checkAddressCrossMatch to detect when two addresses reference
 * geographically incompatible locations (e.g. Lagos vs Rivers State).
 */
export function extractLocationTokens(address: string): string[] {
  const lower = address.toLowerCase();
  const found = new Set<string>();

  for (const state of NIGERIAN_STATES) {
    if (lower.includes(state)) found.add(state);
  }
  for (const city of NIGERIAN_CITIES) {
    if (lower.includes(city)) found.add(city);
  }

  return [...found];
}
