import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { runChecks, aggregateDecision } from "@/lib/verification";
import { extractIDDocument, extractProofOfAddress, generateReasoning } from "@/lib/anthropic";
import type { CallCost } from "@/lib/anthropic";
import type { IDExtraction, PoAExtraction, VerificationResult } from "@/lib/types";

// ---------------------------------------------------------------------------
// POST /api/verify — Server-Sent Events stream
//
// The client reads stage events as each pipeline step completes so the UI
// can advance the progress indicator in real time rather than showing a
// static spinner for the full duration.
//
// Event shapes:
//   { stage: "extracting" | "checking" | "reasoning" }   — progress update
//   { done: true, result: VerificationResult }            — final payload
//   { error: string; retryable: boolean }                 — pipeline failure
//
// Two modes:
//   ?scenario=verified|review|reject  → mock extractions + real reasoning (1 Claude call)
//   (real upload, no scenario)        → vision extraction + reasoning (3 Claude calls)
// ---------------------------------------------------------------------------

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
      issue_date: "2026-02-14",
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
      issue_date: "2026-01-11",
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
      issue_date: "2025-06-15",
      account_number_last4: "0017",
      extraction_confidence: "HIGH",
      anomalies: [],
    },
  },
};

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

async function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return { base64: buffer.toString("base64"), mimeType: file.type || "image/jpeg" };
}

const PDF_ERROR =
  "Please upload a JPG or PNG image. PDF support is planned for v2 — see roadmap in README.";

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const scenario = searchParams.get("scenario");

  const formData = await request.formData();
  const idFile = formData.get("id_document") as File | null;
  const poaFile = formData.get("proof_of_address") as File | null;

  // --- Pre-flight validation (returns a plain HTTP error before opening stream) ---
  if (!scenario) {
    if (!idFile || !poaFile) {
      return NextResponse.json(
        { error: "Upload both an identity document and a proof of address, or use a demo scenario." },
        { status: 400 }
      );
    }
    if (idFile.type === "application/pdf" || poaFile.type === "application/pdf") {
      return NextResponse.json({ error: PDF_ERROR }, { status: 400 });
    }
  }

  // --- Open SSE stream -------------------------------------------------------
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      const costs: CallCost[] = [];

      try {
        // Stage 1: Extraction
        send({ stage: "extracting" });

        let idExtraction: IDExtraction;
        let poaExtraction: PoAExtraction;

        if (scenario) {
          const fixture = MOCK_EXTRACTIONS[scenario] ?? MOCK_EXTRACTIONS.verified;
          idExtraction = fixture.id;
          poaExtraction = fixture.poa;
          console.log(`[KYC] Scenario "${scenario}" — mock extractions, real reasoning`);
        } else {
          const [idData, poaData] = await Promise.all([
            fileToBase64(idFile!),
            fileToBase64(poaFile!),
          ]);

          console.log(
            `[KYC] Real upload — ID: ${idFile!.name} (${idFile!.type}), PoA: ${poaFile!.name} (${poaFile!.type})`
          );

          const [idOut, poaOut] = await Promise.all([
            extractIDDocument(idData.base64, idData.mimeType),
            extractProofOfAddress(poaData.base64, poaData.mimeType),
          ]);

          idExtraction = idOut.result;
          poaExtraction = poaOut.result;
          costs.push(idOut.cost, poaOut.cost);

          // Non-document detection: if both extractions look like non-documents, bail early
          const idIsBlank =
            idExtraction.type === "UNKNOWN" &&
            idExtraction.extraction_confidence === "LOW" &&
            !idExtraction.name &&
            !idExtraction.id_number;
          const poaIsBlank =
            poaExtraction.type === "UNKNOWN" &&
            poaExtraction.extraction_confidence === "LOW" &&
            !poaExtraction.name_on_document &&
            !poaExtraction.address;

          if (idIsBlank || poaIsBlank) {
            const which = idIsBlank ? "identity document" : "proof of address";
            send({
              error: `The ${which} doesn't appear to be a valid Nigerian ID or proof-of-address document. Please upload a clear photo of a NIN slip, driver's license, utility bill, or bank statement.`,
              retryable: false,
            });
            return;
          }
        }

        // Stage 2: Deterministic checks (synchronous — advances immediately)
        send({ stage: "checking" });
        const checks = runChecks(idExtraction, poaExtraction);
        const { decision, confidence } = aggregateDecision(
          checks,
          idExtraction.extraction_confidence,
          poaExtraction.extraction_confidence
        );

        // Stage 3: Reasoning
        send({ stage: "reasoning" });
        let reasoning = "Automated checks completed. See individual check results for details.";
        let recommended_action =
          "Review check results and apply your organisation's escalation policy.";

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
          // Non-fatal — return the structured checks with fallback strings
          console.error("[KYC] Reasoning error (non-fatal, using fallback):", err);
        }

        // Cost summary
        if (costs.length > 0) {
          const totalCost = costs.reduce((s, c) => s + c.cost_usd, 0);
          const totalIn = costs.reduce((s, c) => s + c.input_tokens, 0);
          const totalOut = costs.reduce((s, c) => s + c.output_tokens, 0);
          console.log(
            `[KYC] ── Total: ${costs.length} call(s)` +
              `  in: ${totalIn} tok  out: ${totalOut} tok  cost: $${totalCost.toFixed(5)}`
          );
        }

        const { id_document, proof_of_address } = stripInternalFields(
          idExtraction,
          poaExtraction
        );

        send({
          done: true,
          result: { decision, confidence, id_document, proof_of_address, checks, reasoning, recommended_action } satisfies VerificationResult,
        });
      } catch (err) {
        console.error("[KYC] Pipeline error:", err);

        if (err instanceof Anthropic.RateLimitError) {
          send({
            error: "The AI service is temporarily busy. Please wait a moment and try again.",
            retryable: true,
          });
        } else if (err instanceof Anthropic.APIError) {
          send({
            error: "The AI service returned an unexpected error. Please try again in a moment.",
            retryable: true,
          });
        } else {
          send({
            error:
              err instanceof Error
                ? err.message
                : "Document extraction failed. Ensure images are clear and try again.",
            retryable: false,
          });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}
