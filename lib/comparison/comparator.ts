/**
 * lib/comparison/comparator.ts — Field-level comparison checks
 *
 * Each function takes extracted document fields and returns a Check result.
 * All Nigeria-specific thresholds and constants are imported from
 * lib/config/nigeria.ts — the comparison logic itself is jurisdiction-agnostic.
 *
 * Exports:
 *   checkNameMatch        — Token-overlap name comparison between ID and PoA
 *   checkAddressLegibility — Structural completeness of the PoA address
 *   checkDocumentRecency  — Age of proof-of-address against CBN recency window
 *   checkAddressCrossMatch — Optional: compare location tokens on ID vs PoA
 */

import type { Check, CheckStatus } from "@/lib/types";
import { NAME_WARN_THRESHOLD, RECENCY_RULES } from "@/lib/config/nigeria";
import { normalizeName, tokenOverlap, extractLocationTokens } from "./similarity";

// ---------------------------------------------------------------------------
// Name match
// ---------------------------------------------------------------------------

/**
 * Compare the name extracted from the identity document against the name on
 * the proof-of-address document using prefix-aware token overlap.
 *
 * Thresholds (from nigeria config):
 *   overlap = 1.0       → PASS
 *   overlap ≥ WARN_THRESHOLD → WARN (REVIEW_REQUIRED)
 *   overlap < WARN_THRESHOLD → FAIL (REJECTED)
 */
export function checkNameMatch(idName: string | null, poaName: string | null): Check {
  if (!idName || !poaName) {
    return {
      name: "Name match",
      status: "FAIL",
      detail: `Cannot compare names — ${!idName ? "ID name" : "bill name"} is missing`,
    };
  }

  const idTokens = normalizeName(idName);
  const poaTokens = normalizeName(poaName);
  const overlap = tokenOverlap(idTokens, poaTokens);
  const detail = `ID: '${idName}' vs Bill: '${poaName}'`;

  let status: CheckStatus;
  if (overlap === 1) {
    status = "PASS";
  } else if (overlap >= NAME_WARN_THRESHOLD) {
    status = "WARN";
  } else {
    status = "FAIL";
  }

  return {
    name: "Name match",
    status,
    detail: `${detail} — ${Math.round(overlap * 100)}% token match`,
  };
}

// ---------------------------------------------------------------------------
// Address legibility
// ---------------------------------------------------------------------------

/**
 * Check that the proof-of-address document contains a sufficiently complete
 * address (street, area, and at least one further component).
 *
 * Heuristic: ≥2 commas or ≥6 words → PASS; some text but sparse → WARN; null → FAIL.
 */
export function checkAddressLegibility(address: string | null): Check {
  if (!address) {
    return {
      name: "Address legible",
      status: "FAIL",
      detail: "No address found on proof-of-address document",
    };
  }

  const commaCount = (address.match(/,/g) || []).length;
  const wordCount = address.split(/\s+/).length;

  if (commaCount >= 2 || wordCount >= 6) {
    return {
      name: "Address legible",
      status: "PASS",
      detail: `Address has sufficient components: "${address}"`,
    };
  }

  return {
    name: "Address legible",
    status: "WARN",
    detail: `Address present but may be incomplete: "${address}"`,
  };
}

// ---------------------------------------------------------------------------
// Document recency
// ---------------------------------------------------------------------------

/**
 * Check the age of the proof-of-address document against the CBN recency window.
 *
 *   ≤ PASS_DAYS (90)               → PASS
 *   > PASS_DAYS and ≤ WARN_DAYS (180) → WARN
 *   > WARN_DAYS                    → FAIL
 *
 * Source: CBN Guidelines on Mobile Money Services (Revised) 2015, Section 10.3.
 */
export function checkDocumentRecency(issueDate: string | null): Check {
  if (!issueDate) {
    return {
      name: "Document recency",
      status: "FAIL",
      detail: "Issue date is missing — cannot verify document recency",
    };
  }

  const issued = new Date(issueDate);
  const now = new Date();
  const daysDiff = (now.getTime() - issued.getTime()) / (1000 * 60 * 60 * 24);

  if (daysDiff <= RECENCY_RULES.PASS_DAYS) {
    return {
      name: "Document recency",
      status: "PASS",
      detail: `Document dated ${issueDate} — ${Math.round(daysDiff)} days old (within 90-day window)`,
    };
  }

  if (daysDiff <= RECENCY_RULES.WARN_DAYS) {
    return {
      name: "Document recency",
      status: "WARN",
      detail: `Document dated ${issueDate} — ${Math.round(daysDiff)} days old (CBN recommends under 90 days)`,
    };
  }

  return {
    name: "Document recency",
    status: "FAIL",
    detail: `Document dated ${issueDate} — ${Math.round(daysDiff)} days old (exceeds 180-day limit)`,
  };
}

// ---------------------------------------------------------------------------
// Address cross-match (Phase D — new check)
// ---------------------------------------------------------------------------

/**
 * Optionally compare the geographic location tokens on the identity document's
 * address against those on the proof-of-address document.
 *
 * This check is gated: if the identity document has no address field (common
 * for NIN slips), it returns PASS immediately rather than penalising the case.
 * The check only has meaningful signal when the ID carries an address (e.g.
 * driver's licences, passports) and that address references a different
 * state/city from the PoA.
 *
 * Result logic:
 *   idAddress is null            → PASS (NIN slips — benefit of the doubt)
 *   poaAddress is null           → PASS (already caught by legibility check)
 *   no recognisable location tokens on either → PASS (inconclusive)
 *   shared location tokens found → PASS
 *   no shared tokens             → WARN (manual cross-check recommended)
 *
 * WARN (not FAIL) because: the person may have moved since the ID was issued,
 * and addresses across documents are often expressed differently. Human review
 * should confirm — auto-rejection would be too aggressive.
 *
 * Fixes TC-020: Lagos (ID) vs Port Harcourt/Rivers (PoA) → WARN → REVIEW_REQUIRED.
 * Source: CBN AML/CFT Regulations 2022, Regulation 11(b).
 */
export function checkAddressCrossMatch(
  idAddress: string | null,
  poaAddress: string | null
): Check {
  if (!idAddress) {
    return {
      name: "Address cross-match",
      status: "PASS",
      detail:
        "No address on identity document — cross-check not applicable (NIN slips typically omit address field)",
    };
  }

  if (!poaAddress) {
    return {
      name: "Address cross-match",
      status: "PASS",
      detail: "No address on proof-of-address — already flagged by address legibility check",
    };
  }

  const idTokens = extractLocationTokens(idAddress);
  const poaTokens = extractLocationTokens(poaAddress);

  if (idTokens.length === 0 || poaTokens.length === 0) {
    return {
      name: "Address cross-match",
      status: "PASS",
      detail: `Address cross-check inconclusive — no recognisable Nigerian state/city tokens found in one or both addresses`,
    };
  }

  const shared = idTokens.filter((t) => poaTokens.includes(t));

  if (shared.length > 0) {
    return {
      name: "Address cross-match",
      status: "PASS",
      detail: `Addresses share location token(s) [${shared.join(", ")}] — geographic cross-check passed`,
    };
  }

  return {
    name: "Address cross-match",
    status: "WARN",
    detail: `Address locations appear inconsistent — ID suggests [${idTokens.join(", ")}], PoA suggests [${poaTokens.join(", ")}]. Manual geographic cross-check recommended.`,
  };
}
