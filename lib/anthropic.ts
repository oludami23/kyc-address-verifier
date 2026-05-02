import Anthropic from "@anthropic-ai/sdk";
import { ID_EXTRACTION_PROMPT, POA_EXTRACTION_PROMPT, buildReasoningPrompt } from "./prompts";
import type { IDExtraction, PoAExtraction, Check, Decision } from "./types";

const client = new Anthropic();

// claude-sonnet-4-5 pricing (USD per token, as of release)
const PRICE_PER_TOKEN = { input: 3.0 / 1_000_000, output: 15.0 / 1_000_000 };

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

function logCall(
  step: string,
  usage: { input_tokens: number; output_tokens: number }
): number {
  const cost =
    usage.input_tokens * PRICE_PER_TOKEN.input +
    usage.output_tokens * PRICE_PER_TOKEN.output;
  console.log(
    `[KYC] ${step.padEnd(16)} in: ${String(usage.input_tokens).padStart(5)} tok` +
    `  out: ${String(usage.output_tokens).padStart(4)} tok` +
    `  cost: $${cost.toFixed(5)}`
  );
  return cost;
}

// Returned alongside extraction results so the route can sum the total cost.
export interface CallCost {
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

export async function extractIDDocument(
  base64Image: string,
  mimeType: string
): Promise<{ result: IDExtraction; cost: CallCost }> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: toMediaType(mimeType), data: base64Image },
          },
          { type: "text", text: ID_EXTRACTION_PROMPT },
        ],
      },
    ],
  });

  const cost_usd = logCall("ID extraction", response.usage);
  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return {
    result: parseJsonResponse<IDExtraction>(text),
    cost: { ...response.usage, cost_usd },
  };
}

export async function extractProofOfAddress(
  base64Image: string,
  mimeType: string
): Promise<{ result: PoAExtraction; cost: CallCost }> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: toMediaType(mimeType), data: base64Image },
          },
          { type: "text", text: POA_EXTRACTION_PROMPT },
        ],
      },
    ],
  });

  const cost_usd = logCall("PoA extraction", response.usage);
  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return {
    result: parseJsonResponse<PoAExtraction>(text),
    cost: { ...response.usage, cost_usd },
  };
}

export async function generateReasoning(
  idExtraction: IDExtraction,
  poaExtraction: PoAExtraction,
  checks: Check[],
  decision: Decision
): Promise<{ result: { reasoning: string; recommended_action: string }; cost: CallCost }> {
  const extractedData = { id_document: idExtraction, proof_of_address: poaExtraction };
  const prompt = buildReasoningPrompt(extractedData, checks, decision);

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const cost_usd = logCall("Reasoning", response.usage);
  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return {
    result: parseJsonResponse<{ reasoning: string; recommended_action: string }>(text),
    cost: { ...response.usage, cost_usd },
  };
}
