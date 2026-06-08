/**
 * lib/verification.ts — Verification orchestration facade
 * v1.2 — Phase D architectural restructuring
 *
 * Public API: runChecks() and aggregateDecision().
 * All check implementations are delegated to purpose-built sub-modules:
 *
 *   lib/comparison/comparator.ts  — name match, address legibility, recency,
 *                                   address cross-match
 *   lib/compliance/rules.ts       — authenticity signals, ID expiry,
 *                                   ID number format
 *   lib/config/nigeria.ts         — all Nigeria-specific constants
 *
 * The route (app/api/verify/route.ts) imports only from this facade —
 * sub-module changes are invisible to callers.
 *
 * History:
 *   v1.0  Initial — 4 checks (name, legibility, recency, authenticity)
 *   v1.1  Phase B — added checkIDExpiry, checkIDNumberFormat; expanded title list;
 *                   hyphen normalisation; WARN threshold 0.7 → 0.6
 *   v1.2  Phase D — decomposed into sub-modules; added checkAddressCrossMatch
 *                   (fixes TC-020: different-city addresses now trigger REVIEW)
 */

import type { IDExtraction, PoAExtraction, Check, Decision } from "./types";
import {
  checkNameMatch,
  checkAddressLegibility,
  checkDocumentRecency,
  checkAddressCrossMatch,
} from "./comparison/comparator";
import {
  checkAuthenticity,
  checkIDExpiry,
  checkIDNumberFormat,
} from "./compliance/rules";

// Re-export individual checks so other modules can import them from this
// single well-known path if needed (e.g. tests, direct comparator use).
export {
  checkNameMatch,
  checkAddressLegibility,
  checkDocumentRecency,
  checkAddressCrossMatch,
  checkAuthenticity,
  checkIDExpiry,
  checkIDNumberFormat,
};

// ---------------------------------------------------------------------------
// Decision aggregation
// ---------------------------------------------------------------------------

/**
 * Aggregate a list of check results and document confidence levels into a
 * single KYC decision and confidence score.
 *
 * Priority: FAIL → REJECTED, WARN → REVIEW_REQUIRED, all PASS → VERIFIED.
 * Confidence is weighted by document quality (HIGH/MEDIUM/LOW) and scaled
 * down proportionally when faults are present.
 */
export function aggregateDecision(
  checks: Check[],
  idConfidence: "HIGH" | "MEDIUM" | "LOW",
  poaConfidence: "HIGH" | "MEDIUM" | "LOW"
): { decision: Decision; confidence: number } {
  const hasFail = checks.some((c) => c.status === "FAIL");
  const hasWarn = checks.some((c) => c.status === "WARN");

  const confidenceMap = { HIGH: 1, MEDIUM: 0.75, LOW: 0.5 };
  const baseConfidence =
    (confidenceMap[idConfidence] + confidenceMap[poaConfidence]) / 2;

  if (hasFail) {
    return {
      decision: "REJECTED",
      confidence: Math.round(baseConfidence * 0.6 * 100) / 100,
    };
  }

  if (hasWarn) {
    return {
      decision: "REVIEW_REQUIRED",
      confidence: Math.round(baseConfidence * 0.8 * 100) / 100,
    };
  }

  return {
    decision: "VERIFIED",
    confidence: Math.round(baseConfidence * 0.95 * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Main check orchestrator
// ---------------------------------------------------------------------------

/**
 * Run all verification checks against a pair of extracted documents.
 *
 * Returns an ordered array of 7 Check objects:
 *   1. Name match           (comparison/comparator)
 *   2. Address legible      (comparison/comparator)
 *   3. Document recency     (comparison/comparator)
 *   4. Authenticity signals (compliance/rules)
 *   5. ID expiry            (compliance/rules)
 *   6. ID number format     (compliance/rules)
 *   7. Address cross-match  (comparison/comparator — Phase D, gated on idAddress)
 */
export function runChecks(id: IDExtraction, poa: PoAExtraction): Check[] {
  return [
    checkNameMatch(id.name, poa.name_on_document),
    checkAddressLegibility(poa.address),
    checkDocumentRecency(poa.issue_date),
    checkAuthenticity(id, poa),
    checkIDExpiry(id.expiry_date),
    checkIDNumberFormat(id.id_number, id.type),
    checkAddressCrossMatch(id.address_on_id, poa.address), // Phase D — new
  ];
}
