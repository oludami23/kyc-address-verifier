import { NextRequest, NextResponse } from "next/server";
import { runChecks, aggregateDecision } from "@/lib/verification";
import { extractIDDocument, extractProofOfAddress, generateReasoning } from "@/lib/anthropic";
import type { CallCost } from "@/lib/anthropic";
import type { IDExtraction, PoAExtraction, VerificationResult } from "@/lib/types";

// ---------------------------------------------------------------------------
// POST /api/verify
//
// Two modes, selected by the presence of ?scenario=:
//
//   ?scenario=verified|review|reject
//     → mock extraction fixtures + REAL Claude reasoning
//     → 1 Claude call per request (~$0.005)
//     → use these to validate reasoning quality cheaply
//
//   (no scenario param, real files uploaded)
//     → REAL Claude vision extraction + REAL reasoning
//     → 3 Claude calls per request (~$0.015–0.025 depending on image size)
//
// Cost tracking: each Claude call logs tokens + cost to server console.
// Check Vercel function logs to see the per-call breakdown.
// ---------------------------------------------------------------------------

// --- Mock extraction fixtures (kept permanently as cheap test paths) --------

const MOCK_EXTRACTIONS: Record<string, { id: IDExtraction; poa: PoAExtraction }> = {
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
      issue_date: "2026-02-14", // 77 days ago → PASS
      account_number_last4: "4821",
      extraction_confidence: "HIGH",
      anomalies: [],
    },
  },

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
      issue_date: "2026-01-11", // 111 days ago → WARN (90–180 day range)
      account_number_last4: null,
      extraction_confidence: "HIGH",
      anomalies: [],
    },
  },

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
      address: "Block 5 Flat 2",
      issue_date: "2025-06-15", // 321 days ago → FAIL (>180 days)
      account_number_last4: "0017",
      extraction_confidence: "HIGH",
      anomalies: [],
    },
  },
};

// ---------------------------------------------------------------------------

type ExtractionOutcome =
  | { ok: true; id: IDExtraction; poa: PoAExtraction; costs: CallCost[] }
  | { ok: false; status: number; error: string };

async function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  if (file.type === "application/pdf") {
    throw new Error("PDF uploads are not yet supported. Please upload a JPG or PNG image.");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  return { base64: buffer.toString("base64"), mimeType: file.type || "image/jpeg" };
}

async function getExtractions(
  scenario: string | null,
  idFile: File | null,
  poaFile: File | null
): Promise<ExtractionOutcome> {
  // Scenario path: return mock extractions, no Claude vision calls
  if (scenario) {
    const fixture = MOCK_EXTRACTIONS[scenario] ?? MOCK_EXTRACTIONS.verified;
    console.log(`[KYC] Scenario "${scenario}" — using mock extractions, real reasoning`);
    return { ok: true, id: fixture.id, poa: fixture.poa, costs: [] };
  }

  // Real upload path
  if (!idFile || !poaFile) {
    return {
      ok: false,
      status: 400,
      error: "Upload both an identity document and a proof of address, or use a demo scenario.",
    };
  }

  let idData: { base64: string; mimeType: string };
  let poaData: { base64: string; mimeType: string };

  try {
    [idData, poaData] = await Promise.all([fileToBase64(idFile), fileToBase64(poaFile)]);
  } catch (err) {
    return {
      ok: false,
      status: 400,
      error: err instanceof Error ? err.message : "Could not read uploaded files.",
    };
  }

  console.log(`[KYC] Real upload — ID: ${idFile.name} (${idFile.type}), PoA: ${poaFile.name} (${poaFile.type})`);

  try {
    // Run both extractions in parallel — saves ~1s on round trips
    const [idOut, poaOut] = await Promise.all([
      extractIDDocument(idData.base64, idData.mimeType),
      extractProofOfAddress(poaData.base64, poaData.mimeType),
    ]);
    return { ok: true, id: idOut.result, poa: poaOut.result, costs: [idOut.cost, poaOut.cost] };
  } catch (err) {
    console.error("[KYC] Extraction error:", err);
    return {
      ok: false,
      status: 422,
      error:
        "Could not extract data from one or both documents. " +
        "Ensure images are clear, well-lit, and show the full document.",
    };
  }
}

function stripInternalFields(id: IDExtraction, poa: PoAExtraction): {
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
  const scenario = searchParams.get("scenario");

  const formData = await request.formData();
  const idFile = formData.get("id_document") as File | null;
  const poaFile = formData.get("proof_of_address") as File | null;

  // --- Step 1: extraction ---------------------------------------------------
  const extraction = await getExtractions(scenario, idFile, poaFile);
  if (!extraction.ok) {
    return NextResponse.json({ error: extraction.error }, { status: extraction.status });
  }
  const { id: idExtraction, poa: poaExtraction, costs } = extraction;

  // --- Step 2: deterministic checks + decision ------------------------------
  const checks = runChecks(idExtraction, poaExtraction);
  const { decision, confidence } = aggregateDecision(
    checks,
    idExtraction.extraction_confidence,
    poaExtraction.extraction_confidence
  );

  // --- Step 3: AI reasoning (non-fatal — fallback if Claude fails) ----------
  let reasoning = "Automated checks completed. See individual check results for details.";
  let recommended_action = "Review check results above and apply your organisation's escalation policy.";

  try {
    const { result: reasonOut, cost: reasonCost } = await generateReasoning(
      idExtraction,
      poaExtraction,
      checks,
      decision
    );
    reasoning = reasonOut.reasoning;
    recommended_action = reasonOut.recommended_action;
    costs.push(reasonCost);
  } catch (err) {
    console.error("[KYC] Reasoning error (non-fatal, using fallback):", err);
  }

  // --- Cost summary ---------------------------------------------------------
  if (costs.length > 0) {
    const totalCost = costs.reduce((sum, c) => sum + c.cost_usd, 0);
    const totalIn = costs.reduce((sum, c) => sum + c.input_tokens, 0);
    const totalOut = costs.reduce((sum, c) => sum + c.output_tokens, 0);
    console.log(
      `[KYC] ── Total: ${costs.length} call(s)` +
      `  in: ${totalIn} tok  out: ${totalOut} tok  cost: $${totalCost.toFixed(5)}`
    );
  }

  // --- Build and return result ----------------------------------------------
  const { id_document, proof_of_address } = stripInternalFields(idExtraction, poaExtraction);

  const result: VerificationResult = {
    decision,
    confidence,
    id_document,
    proof_of_address,
    checks,
    reasoning,
    recommended_action,
  };

  return NextResponse.json(result);
}
