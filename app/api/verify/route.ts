import { NextRequest, NextResponse } from "next/server";
import type { VerificationResult } from "@/lib/types";

// Day 1: hardcoded mock verdict so the full UI flow works before Day 2 AI integration.
// On Day 2, replace this with: parse formData → extractIDDocument() + extractProofOfAddress()
// → runChecks() → aggregateDecision() → generateReasoning() → return real result.
const MOCK_VERDICT: VerificationResult = {
  decision: "VERIFIED",
  confidence: 0.92,
  id_document: {
    type: "NIN",
    name: "OLUMIDE ADENIYI ADEYEMI",
    id_number: "12345678901",
    date_of_birth: "1990-03-15",
    address_on_id: "14 Adeola Odeku Street, Victoria Island, Lagos",
  },
  proof_of_address: {
    type: "UTILITY_BILL",
    issuer: "IKEDC",
    name_on_document: "O. A. ADEYEMI",
    address: "14 Adeola Odeku Street, Victoria Island, Lagos",
    issue_date: "2026-02-14",
  },
  checks: [
    {
      name: "Name match",
      status: "PASS",
      detail:
        "ID: 'OLUMIDE ADENIYI ADEYEMI' vs Bill: 'O. A. ADEYEMI' — key tokens match (abbreviated first and middle names are common on Nigerian utility bills)",
    },
    {
      name: "Address legible",
      status: "PASS",
      detail:
        "Address contains street number, street name, area, and state — sufficient for CBN compliance purposes",
    },
    {
      name: "Document recency",
      status: "PASS",
      detail: "Utility bill dated 2026-02-14 — 77 days old, within the 90-day CBN window",
    },
    {
      name: "Document authenticity signals",
      status: "PASS",
      detail:
        "Both documents returned HIGH extraction confidence with no anomalies flagged",
    },
  ],
  reasoning:
    "The NIN slip and IKEDC utility bill belong to the same individual. The abbreviated name on the bill (O. A. ADEYEMI) is consistent with the full name on the ID (OLUMIDE ADENIYI ADEYEMI) — a common pattern on Nigerian utility accounts. The address matches across both documents and the bill is within the required 90-day window.",
  recommended_action:
    "Approve KYC tier upgrade. No manual review required. Archive documents per CBN data retention policy.",
};

export async function POST(request: NextRequest) {
  // Simulate processing time so the loading state is visible in the UI
  await new Promise((resolve) => setTimeout(resolve, 1800));

  return NextResponse.json(MOCK_VERDICT);
}
