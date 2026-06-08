/**
 * lib/compliance/rules.ts — Document-level compliance checks
 *
 * Validates authenticity signals, identity document expiry, and ID number
 * format. These checks apply to the identity document itself (not the
 * comparison between two documents — that lives in comparison/comparator.ts).
 *
 * All format constants and expiry thresholds are imported from
 * lib/config/nigeria.ts so they can be updated without touching logic.
 *
 * Exports:
 *   checkAuthenticity    — Extraction confidence + anomaly signal aggregation
 *   checkIDExpiry        — Validates ID expiry date against today
 *   checkIDNumberFormat  — Regex validation for NIN / driver's licence number
 */

import type { IDExtraction, PoAExtraction, Check, CheckStatus, DocumentType } from "@/lib/types";
import { NIN_FORMAT, DRIVERS_LICENCE_FORMAT, ID_EXPIRY_WARN_DAYS } from "@/lib/config/nigeria";

// ---------------------------------------------------------------------------
// Authenticity signals
// ---------------------------------------------------------------------------

/**
 * Aggregate extraction confidence levels and anomaly counts from both documents
 * into a single authenticity check result.
 *
 * Logic:
 *   Both HIGH + 0 anomalies               → PASS
 *   Either LOW or ≥2 total anomalies       → FAIL
 *   Otherwise (MEDIUM or 1 anomaly)        → WARN
 *
 * Source: CBN eKYC Implementation Guidelines 2023, Section 8.
 */
export function checkAuthenticity(id: IDExtraction, poa: PoAExtraction): Check {
  const bothHigh =
    id.extraction_confidence === "HIGH" && poa.extraction_confidence === "HIGH";
  const totalAnomalies = id.anomalies.length + poa.anomalies.length;

  if (bothHigh && totalAnomalies === 0) {
    return {
      name: "Document authenticity signals",
      status: "PASS",
      detail:
        "Both documents returned HIGH extraction confidence with no anomalies flagged",
    };
  }

  if (
    id.extraction_confidence === "LOW" ||
    poa.extraction_confidence === "LOW" ||
    totalAnomalies >= 2
  ) {
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
    id.extraction_confidence !== "HIGH"
      ? `ID confidence: ${id.extraction_confidence}`
      : null,
    poa.extraction_confidence !== "HIGH"
      ? `PoA confidence: ${poa.extraction_confidence}`
      : null,
    ...id.anomalies.map((a) => `ID: ${a}`),
    ...poa.anomalies.map((a) => `PoA: ${a}`),
  ].filter(Boolean);

  return {
    name: "Document authenticity signals",
    status: "WARN",
    detail: warnDetails.join("; "),
  };
}

// ---------------------------------------------------------------------------
// ID document expiry
// ---------------------------------------------------------------------------

/**
 * Validate the expiry_date field extracted from the identity document.
 *
 * NIN slips do not expire, so a null expiry_date returns PASS immediately.
 * A future expiry within ID_EXPIRY_WARN_DAYS (30) triggers WARN so onboarding
 * officers can prompt customers to renew before the next KYC refresh.
 *
 * Source: FRSC and CBN AML/CFT Regulations 2022, Schedule 1.
 */
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
    const daysExpired = Math.round(
      (now.getTime() - expiry.getTime()) / (1000 * 60 * 60 * 24)
    );
    return {
      name: "ID document expiry",
      status: "FAIL",
      detail: `ID expired ${daysExpired} days ago (${expiryDate}) — document is no longer valid for KYC`,
    };
  }

  const daysUntil = Math.round(
    (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysUntil <= ID_EXPIRY_WARN_DAYS) {
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

// ---------------------------------------------------------------------------
// ID number format
// ---------------------------------------------------------------------------

/**
 * Validate that the extracted id_number matches the expected format for the
 * document type, using regex patterns from the Nigeria config.
 *
 * NIN: exactly 11 digits.
 * Driver's licence: 2–3 letters + 5–7 digits + 2 letters (e.g. AAD23456FG).
 * Passport and UNKNOWN types: pass by default (format not standardised enough
 * to reject deterministically at this stage).
 *
 * Source: NIMC Act 2007 (NIN); FRSC / CBN AML/CFT Regulations 2022 (DL).
 */
export function checkIDNumberFormat(
  idNumber: string | null,
  docType: DocumentType
): Check {
  if (!idNumber) {
    return {
      name: "ID number format",
      status: "WARN",
      detail: "ID number not extracted — cannot validate format",
    };
  }

  if (docType === "NIN") {
    const valid = NIN_FORMAT.test(idNumber);
    return {
      name: "ID number format",
      status: valid ? "PASS" : "FAIL",
      detail: valid
        ? "NIN format valid — 11-digit number confirmed"
        : `NIN format invalid — expected 11 digits, got '${idNumber}'`,
    };
  }

  if (docType === "DRIVERS_LICENSE") {
    const valid = DRIVERS_LICENCE_FORMAT.test(idNumber);
    return {
      name: "ID number format",
      status: valid ? "PASS" : "FAIL",
      detail: valid
        ? "Driver's licence number format valid"
        : `Driver's licence number format unexpected — got '${idNumber}'`,
    };
  }

  // Passport and other types — no deterministic format rule applied
  return {
    name: "ID number format",
    status: "PASS",
    detail: `ID number present: '${idNumber}' — format check not applicable for ${docType}`,
  };
}
