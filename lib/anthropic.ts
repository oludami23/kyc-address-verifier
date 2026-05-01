// Day 2: Claude vision extraction + reasoning calls.
// Day 1 uses the mock in /api/verify/route.ts instead.

import Anthropic from "@anthropic-ai/sdk";
import { ID_EXTRACTION_PROMPT, POA_EXTRACTION_PROMPT, buildReasoningPrompt } from "./prompts";
import type { IDExtraction, PoAExtraction, Check, Decision } from "./types";

const client = new Anthropic();

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

function toMediaType(mimeType: string): ImageMediaType {
  if (mimeType === "image/png") return "image/png";
  if (mimeType === "image/gif") return "image/gif";
  if (mimeType === "image/webp") return "image/webp";
  return "image/jpeg";
}

function parseJsonResponse<T>(text: string): T {
  // Strip markdown code fences if Claude wraps the JSON
  const cleaned = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  return JSON.parse(cleaned) as T;
}

export async function extractIDDocument(
  base64Image: string,
  mimeType: string
): Promise<IDExtraction> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: toMediaType(mimeType),
              data: base64Image,
            },
          },
          { type: "text", text: ID_EXTRACTION_PROMPT },
        ],
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return parseJsonResponse<IDExtraction>(text);
}

export async function extractProofOfAddress(
  base64Image: string,
  mimeType: string
): Promise<PoAExtraction> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: toMediaType(mimeType),
              data: base64Image,
            },
          },
          { type: "text", text: POA_EXTRACTION_PROMPT },
        ],
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return parseJsonResponse<PoAExtraction>(text);
}

export async function generateReasoning(
  idExtraction: IDExtraction,
  poaExtraction: PoAExtraction,
  checks: Check[],
  decision: Decision
): Promise<{ reasoning: string; recommended_action: string }> {
  const extractedData = { id_document: idExtraction, proof_of_address: poaExtraction };
  const prompt = buildReasoningPrompt(extractedData, checks, decision);

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return parseJsonResponse<{ reasoning: string; recommended_action: string }>(text);
}
