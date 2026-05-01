import { NextRequest, NextResponse } from "next/server";
import { runChecks, aggregateDecision } from "@/lib/verification";
import type { IDExtraction, PoAExtraction, VerificationResult } from "@/lib/types";

// ---------------------------------------------------------------------------
// Day 2 Step 1-2: Real verification pipeline with mock Claude extractions.
//
// What's real:    formData parsing, runChecks(), aggregateDecision()
// What's mocked:  extractIDDocument() / extractProofOfAddress() (Day 2 Step 2)
// What's pending: generateReasoning() (Day 2 Step 3)
//
// To test all three decision paths without uploading files:
//   POST /api/verify                  → VERIFIED (default)
//   POST /api/verify?scenario=review  → REVIEW_REQUIRED
//   POST /api/verify?scenario=reject  → REJECTED
// ---------------------------------------------------------------------------

// --- Mock extraction fixtures -----------------------------------------------
// Each fixture represents what Claude vision would return for a given document.
// Replaced by real extractIDDocument() / extractProofOfAddress() calls in Step 2.

const MOCK_EXTRACTIONS: Record<
  string,
  { id: IDExtraction; poa: PoAExtraction }
> = {
  // Clean match — both HIGH confidence, recent bill, names match via initials
  verified: {
    id: {
      type: "NIN",
      name: "OLUMIDE ADENIYI ADEYEMI",
      id_number: "12345678901",
      date_of_birth: "1990-03-15",
      address_on_id: "14 Adeola Odeku Street, Victoria Island, Lagos",
      expiry_date: null,
      extraction_confidence: "HIGH",
      anomalies: [],
    },
    poa: {
      type: "UTILITY_BILL",
      issuer: "IKEDC",
      name_on_document: "O. A. ADEYEMI",
      address: "14 Adeola Odeku Street, Victoria Island, Lagos",
      // 76 days ago → PASS (within 90-day window)
      issue_date: "2026-02-14",
      account_number_last4: "4821",
      extraction_confidence: "HIGH",
      anomalies: [],
    },
  },

  // Partial name match (4-token ID, 3 match → 75% WARN) + slightly old bill +
  // MEDIUM confidence with one anomaly → all WARNs, no FAILs → REVIEW_REQUIRED
  review: {
    id: {
      type: "DRIVERS_LICENSE",
      name: "OLUMIDE ADENIYI JAMES ADEYEMI",
      id_number: "AAD23456FG",
      date_of_birth: "1988-07-22",
      address_on_id: "7 Bode Thomas Street, Surulere, Lagos",
      expiry_date: "2028-07-21",
      extraction_confidence: "MEDIUM",
      anomalies: ["Slight glare obscuring date of birth field"],
    },
    poa: {
      type: "UTILITY_BILL",
      issuer: "PHCN",
      name_on_document: "O. A. ADEYEMI",
      address: "7 Bode Thomas Street, Surulere, Lagos State",
      // 110 days ago → WARN (90–180 day range)
      issue_date: "2026-01-11",
      account_number_last4: null,
      extraction_confidence: "HIGH",
      anomalies: [],
    },
  },

  // Name mismatch (0% overlap) + 320-day-old bill + LOW confidence + 2 anomalies
  // → multiple FAILs → REJECTED
  reject: {
    id: {
      type: "NIN",
      name: "CHIDINMA UCHENNA OKONKWO",
      id_number: "98765432100",
      date_of_birth: "1995-11-03",
      address_on_id: "22 Awolowo Road, Ikoyi, Lagos",
      expiry_date: null,
      extraction_confidence: "LOW",
      anomalies: [
        "Blurry NIN number field — digits not fully legible",
        "Photo area shows compression artefacts inconsistent with official NIN print quality",
      ],
    },
    poa: {
      type: "UTILITY_BILL",
      issuer: "DSTV",
      name_on_document: "JOHN ADEBAYO SMITH",
      // Short address — WARN for legibility
      address: "Block 5 Flat 2",
      // 320 days ago → FAIL (>180 days)
      issue_date: "2025-06-15",
      account_number_last4: "0017",
      extraction_confidence: "HIGH",
      anomalies: [],
    },
  },
};

// ---------------------------------------------------------------------------

function stripExtractionFields(id: IDExtraction, poa: PoAExtraction): {
  id_document: VerificationResult["id_document"];
  proof_of_address: VerificationResult["proof_of_address"];
} {
  return {
    id_document: {
      type: id.type,
      name: id.name,
      id_number: id.id_number,
      date_of_birth: id.date_of_birth,
      address_on_id: id.address_on_id,
    },
    proof_of_address: {
      type: poa.type,
      issuer: poa.issuer,
      name_on_document: poa.name_on_document,
      address: poa.address,
      issue_date: poa.issue_date,
    },
  };
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const scenario = searchParams.get("scenario") ?? "verified";

  // Parse uploaded files (not used yet — real extraction wired in Step 2)
  const formData = await request.formData();
  const idFile = formData.get("id_document") as File | null;
  const poaFile = formData.get("proof_of_address") as File | null;

  // Step 2 will replace these two lines:
  //   const idExtraction = await extractIDDocument(base64, mimeType);
  //   const poaExtraction = await extractProofOfAddress(base64, mimeType);
  const { id: idExtraction, poa: poaExtraction } =
    MOCK_EXTRACTIONS[scenario] ?? MOCK_EXTRACTIONS.verified;

  // Real verification logic — untouched by mock vs real extraction
  const checks = runChecks(idExtraction, poaExtraction);
  const { decision, confidence } = aggregateDecision(
    checks,
    idExtraction.extraction_confidence,
    poaExtraction.extraction_confidence
  );

  const { id_document, proof_of_address } = stripExtractionFields(idExtraction, poaExtraction);

  // Step 3 will replace these two placeholders with generateReasoning() output
  const result: VerificationResult = {
    decision,
    confidence,
    id_document,
    proof_of_address,
    checks,
    reasoning: `[Step 3 pending] Decision: ${decision}. ${checks.filter(c => c.status !== "PASS").map(c => `${c.name}: ${c.status}`).join(", ") || "All checks passed."}`,
    recommended_action: "[Step 3 pending] Reasoning prompt not yet implemented.",
  };

  // Log to server console so we can see the pipeline output during review
  console.log("Verification result:", JSON.stringify({ decision, confidence, checks }, null, 2));

  return NextResponse.json(result);
}
