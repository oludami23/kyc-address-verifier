// Pure verification logic — no AI calls, no side effects.
// Runs after extraction, before the reasoning prompt.
// v1.1: expanded title list, hyphen normalisation, lower WARN threshold,
//        new checkIDExpiry and checkIDNumberFormat checks.

import type { IDExtraction, PoAExtraction, Check, CheckStatus, Decision, DocumentType } from "./types";

// --- Name normalisation ---

function normalizeName(name: string): string[] {
  return name
    .toLowerCase()
    // v1.1: expanded title list — adds Hajiya, Mallam, Engineer, Barrister, and other
    // common Nigerian professional and honorific titles absent from v1.0
    .replace(
      /\b(mr|mrs|ms|dr|prof|chief|alhaji|alhaja|hajiya|mallam|engineer|engr|barrister|barr|arch|architect|pastor|rev|reverend|deacon|deaconess|bishop|sir|dame|prince|princess|otunba|erelu|igwe|obi)\.?\b/g,
      ""
    )
    // v1.1: split hyphens into spaces BEFORE stripping non-alpha characters.
    // Without this, "Obi-Nwosu" → "obinwosu" (1 token), which breaks prefix matching
    // against "Obi" and "Nwosu" as separate tokens. With this fix,
    // "Obi-Nwosu" → "Obi Nwosu" → ["obi", "nwosu"] — both tokens matchable.
    .replace(/-/g, " ")
    .replace(/[^a-z\s]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

// --- Name match ---

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

  // Count how many ID tokens appear anywhere in the PoA tokens (prefix-aware)
  const matches = idTokens.filter((t) => poaTokens.some((p) => p.startsWith(t) || t.startsWith(p)));
  const overlap = matches.length / Math.max(idTokens.length, 1);

  const detail = `ID: '${idName}' vs Bill: '${poaName}'`;

  let status: CheckStatus;
  if (overlap === 1) {
    status = "PASS";
  } else if (overlap >= 0.6) {
    // v1.1: threshold lowered from 0.7 → 0.6.
    // Rationale: a 3-token ID name (e.g. "Tunde Afolabi Balogun") where only the first
    // and last tokens appear on the PoA ("Tunde Balogun") yields 2/3 = 0.667 overlap —
    // a very common Nigerian pattern where the middle name is omitted on utility bills.
    // 0.667 ≥ 0.6 → WARN (review) rather than FAIL (reject). A 2-token name still needs
    // both tokens to match for WARN (1/2 = 0.5 < 0.6 → FAIL), preserving rejection for
    // different-person scenarios like TC-014 (shared surname, different given name).
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

// --- Address legibility ---

export function checkAddressLegibility(address: string | null): Check {
  if (!address) {
    return {
      name: "Address legible",
      status: "FAIL",
      detail: "No address found on proof-of-address document",
    };
  }

  // A complete Nigerian address typically has street, area, and state separated by commas
  const commaCount = (address.match(/,/g) || []).length;
  const wordCount = address.split(/\s+/).length;

  if (commaCount >= 2 || wordCount >= 6) {
    return { name: "Address legible", status: "PASS", detail: `Address has sufficient components: "${address}"` };
  }

  return {
    name: "Address legible",
    status: "WARN",
    detail: `Address present but may be incomplete: "${address}"`,
  };
}

// --- Document recency ---

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

  if (daysDiff <= 90) {
    return {
      name: "Document recency",
      status: "PASS",
      detail: `Document dated ${issueDate} — ${Math.round(daysDiff)} days old (within 90-day window)`,
    };
  }

  if (daysDiff <= 180) {
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

// --- Authenticity signals ---

export function checkAuthenticity(id: IDExtraction, poa: PoAExtraction): Check {
  const bothHigh = id.extraction_confidence === "HIGH" && poa.extraction_confidence === "HIGH";
  const totalAnomalies = id.anomalies.length + poa.anomalies.length;

  if (bothHigh && totalAnomalies === 0) {
    return {
      name: "Document authenticity signals",
      status: "PASS",
      detail: "Both documents returned HIGH extraction confidence with no anomalies flagged",
    };
  }

  if (id.extraction_confidence === "LOW" || poa.extraction_confidence === "LOW" || totalAnomalies >= 2) {
    const details = [
      id.extraction_confidence === "LOW" ? "ID confidence: LOW" : null,
      poa.extraction_confidence === "LOW" ? "PoA confidence: LOW" : null,
      ...id.anomalies.map((a) => `ID anomaly: ${a}`),
      ...poa.anomalies.map((a) => `PoA anomaly: ${a}`),
    ].filter(Boolean);

    return {
      name: "Document authenticity signals",
      status: "FAIL",
      detail: details.join("; "),
    };
  }

  const warnDetails = [
    id.extraction_confidence !== "HIGH" ? `ID confidence: ${id.extraction_confidence}` : null,
    poa.extraction_confidence !== "HIGH" ? `PoA confidence: ${poa.extraction_confidence}` : null,
    ...id.anomalies.map((a) => `ID: ${a}`),
    ...poa.anomalies.map((a) => `PoA: ${a}`),
  ].filter(Boolean);

  return {
    name: "Document authenticity signals",
    status: "WARN",
    detail: warnDetails.join("; "),
  };
}

// --- ID document expiry (v1.1 — new check) ---
//
// Validates the expiry_date field extracted from the ID document.
// NIN slips do not expire, so null is treated as PASS.
// A future-but-close expiry (≤30 days) returns WARN so the officer can flag renewal.

export function checkIDExpiry(expiryDate: string | null): Check {
  if (!expiryDate) {
    return {
      name: "ID document expiry",
      status: "PASS",
      detail: "No expiry date on document — NIN slips do not expire",
    };
  }

  const expiry = new Date(expiryDate);
  const now = new Date();

  if (expiry < now) {
    const daysExpired = Math.round((now.getTime() - expiry.getTime()) / (1000 * 60 * 60 * 24));
    return {
      name: "ID document expiry",
      status: "FAIL",
      detail: `ID expired ${daysExpired} days ago (${expiryDate}) — document is no longer valid for KYC`,
    };
  }

  const daysUntil = Math.round((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysUntil <= 30) {
    return {
      name: "ID document expiry",
      status: "WARN",
      detail: `ID expires in ${daysUntil} days (${expiryDate}) — renewal recommended before account upgrade`,
    };
  }

  return {
    name: "ID document expiry",
    status: "PASS",
    detail: `ID valid until ${expiryDate} — ${daysUntil} days remaining`,
  };
}

// --- ID number format (v1.1 — new check) ---
//
// Validates that the extracted id_number matches the expected format for the document type.
// NIN: exactly 11 digits.
// Driver's licence: 2-3 letters + 5-7 digits + 2 letters (e.g. AAD23456FG).
// UNKNOWN/other types: PASS by default (benefit of the doubt).

export function checkIDNumberFormat(idNumber: string | null, docType: DocumentType): Check {
  if (!idNumber) {
    return {
      name: "ID number format",
      status: "WARN",
      detail: "ID number not extracted — cannot validate format",
    };
  }

  if (docType === "NIN") {
    const valid = /^\d{11}$/.test(idNumber);
    return {
      name: "ID number format",
      status: valid ? "PASS" : "FAIL",
      detail: valid
        ? `NIN format valid — 11-digit number confirmed`
        : `NIN format invalid — expected 11 digits, got '${idNumber}'`,
    };
  }

  if (docType === "DRIVERS_LICENSE") {
    // Nigerian DL format: 2-3 uppercase letters + 5-7 digits + 2 uppercase letters
    const valid = /^[A-Z]{2,3}\d{5,7}[A-Z]{2}$/i.test(idNumber);
    return {
      name: "ID number format",
      status: valid ? "PASS" : "FAIL",
      detail: valid
        ? `Driver's licence number format valid`
        : `Driver's licence number format unexpected — got '${idNumber}'`,
    };
  }

  // Passport and other document types — format not validated
  return {
    name: "ID number format",
    status: "PASS",
    detail: `ID number present: '${idNumber}' — format check not applicable for ${docType}`,
  };
}

// --- Decision aggregation ---

export function aggregateDecision(
  checks: Check[],
  idConfidence: "HIGH" | "MEDIUM" | "LOW",
  poaConfidence: "HIGH" | "MEDIUM" | "LOW"
): { decision: Decision; confidence: number } {
  const hasFail = checks.some((c) => c.status === "FAIL");
  const hasWarn = checks.some((c) => c.status === "WARN");

  const confidenceMap = { HIGH: 1, MEDIUM: 0.75, LOW: 0.5 };
  const baseConfidence = (confidenceMap[idConfidence] + confidenceMap[poaConfidence]) / 2;

  if (hasFail) {
    return { decision: "REJECTED", confidence: Math.round(baseConfidence * 0.6 * 100) / 100 };
  }

  if (hasWarn) {
    return { decision: "REVIEW_REQUIRED", confidence: Math.round(baseConfidence * 0.8 * 100) / 100 };
  }

  return { decision: "VERIFIED", confidence: Math.round(baseConfidence * 0.95 * 100) / 100 };
}

// --- Main orchestrator ---

export function runChecks(id: IDExtraction, poa: PoAExtraction): Check[] {
  return [
    checkNameMatch(id.name, poa.name_on_document),
    checkAddressLegibility(poa.address),
    checkDocumentRecency(poa.issue_date),
    checkAuthenticity(id, poa),
    checkIDExpiry(id.expiry_date),           // v1.1: new
    checkIDNumberFormat(id.id_number, id.type), // v1.1: new
  ];
}
