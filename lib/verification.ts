// Pure verification logic — no AI calls, no side effects.
// Runs after extraction, before the reasoning prompt.

import type { IDExtraction, PoAExtraction, Check, CheckStatus, Decision } from "./types";

// --- Name match ---

function normalizeName(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/\b(mr|mrs|ms|dr|prof|chief|alhaji|alhaja)\.?\b/g, "")
    .replace(/[^a-z\s]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

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

  // Count how many ID tokens appear anywhere in the PoA tokens
  const matches = idTokens.filter((t) => poaTokens.some((p) => p.startsWith(t) || t.startsWith(p)));
  const overlap = matches.length / Math.max(idTokens.length, 1);

  const detail = `ID: '${idName}' vs Bill: '${poaName}'`;

  let status: CheckStatus;
  if (overlap === 1) {
    status = "PASS";
  } else if (overlap >= 0.7) {
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

// --- Main orchestrator (called from Day 2 API route) ---

export function runChecks(id: IDExtraction, poa: PoAExtraction): Check[] {
  return [
    checkNameMatch(id.name, poa.name_on_document),
    checkAddressLegibility(poa.address),
    checkDocumentRecency(poa.issue_date),
    checkAuthenticity(id, poa),
  ];
}
