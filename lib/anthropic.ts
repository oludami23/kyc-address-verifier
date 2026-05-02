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

function stripFences(text: string): string {
  return text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
}

function logCall(step: string, usage: { input_tokens: number; output_tokens: number }): number {
  const cost =
    usage.input_tokens * PRICE_PER_TOKEN.input +
    usage.output_tokens * PRICE_PER_TOKEN.output;
  console.log(
    `[KYC] ${step.padEnd(20)} in: ${String(usage.input_tokens).padStart(5)} tok` +
      `  out: ${String(usage.output_tokens).padStart(4)} tok  cost: $${cost.toFixed(5)}`
  );
  return cost;
}

// Returned alongside results so the route can sum total request cost.
export interface CallCost {
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

// ---------------------------------------------------------------------------
// Type guards
//
// Verify that Claude's response has the fields verification.ts actually
// accesses. Most fields are allowed to be null (the checks handle that);
// what we can't tolerate is extraction_confidence or anomalies being absent
// entirely, since aggregateDecision and checkAuthenticity dereference them
// without null checks.
// ---------------------------------------------------------------------------

function isValidIDExtraction(obj: unknown): obj is IDExtraction {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return (
    ["NIN", "DRIVERS_LICENSE", "UNKNOWN"].includes(o.type as string) &&
    ["HIGH", "MEDIUM", "LOW"].includes(o.extraction_confidence as string) &&
    Array.isArray(o.anomalies)
  );
}

function isValidPoAExtraction(obj: unknown): obj is PoAExtraction {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return (
    ["UTILITY_BILL", "BANK_STATEMENT", "OTHER", "UNKNOWN"].includes(o.type as string) &&
    ["HIGH", "MEDIUM", "LOW"].includes(o.extraction_confidence as string) &&
    Array.isArray(o.anomalies)
  );
}

// ---------------------------------------------------------------------------
// Retry wrapper
//
// Calls Claude twice at most. On first attempt, parses and validates the JSON.
// If parse or validation fails, logs the raw response (truncated) and retries
// with the same call. Accumulates token costs across both attempts so the
// cost log is accurate even when a retry fires.
// ---------------------------------------------------------------------------

async function withVisionRetry<T>(
  label: string,
  callFn: () => Promise<Anthropic.Message>,
  validate: (parsed: unknown) => parsed is T
): Promise<{ result: T; cost: CallCost }> {
  let accInput = 0;
  let accOutput = 0;
  let accCost = 0;
  let lastError: Error = new Error("Unknown error");

  for (let attempt = 1; attempt <= 2; attempt++) {
    const attemptLabel = attempt === 1 ? label : `${label} (retry)`;
    const response = await callFn();

    const callCost = logCall(attemptLabel, response.usage);
    accInput += response.usage.input_tokens;
    accOutput += response.usage.output_tokens;
    accCost += callCost;

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "";

    try {
      const parsed: unknown = JSON.parse(stripFences(raw));
      if (!validate(parsed)) {
        const keys = parsed && typeof parsed === "object" ? Object.keys(parsed).join(", ") : "none";
        throw new Error(`Schema validation failed. Got keys: ${keys}`);
      }
      return {
        result: parsed,
        cost: { input_tokens: accInput, output_tokens: accOutput, cost_usd: accCost },
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === 1) {
        console.warn(`[KYC] ${label} attempt 1 failed — retrying. Reason: ${lastError.message}`);
        console.warn(`[KYC] Raw response (first 400 chars): ${raw.slice(0, 400)}`);
      }
    }
  }

  throw new Error(`${label} failed after 2 attempts: ${lastError.message}`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function extractIDDocument(
  base64Image: string,
  mimeType: string
): Promise<{ result: IDExtraction; cost: CallCost }> {
  return withVisionRetry(
    "ID extraction",
    () =>
      client.messages.create({
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
      }) as Promise<Anthropic.Message>,
    isValidIDExtraction
  );
}

export async function extractProofOfAddress(
  base64Image: string,
  mimeType: string
): Promise<{ result: PoAExtraction; cost: CallCost }> {
  return withVisionRetry(
    "PoA extraction",
    () =>
      client.messages.create({
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
      }) as Promise<Anthropic.Message>,
    isValidPoAExtraction
  );
}

export async function generateReasoning(
  idExtraction: IDExtraction,
  poaExtraction: PoAExtraction,
  checks: Check[],
  decision: Decision
): Promise<{ result: { reasoning: string; recommended_action: string }; cost: CallCost }> {
  const prompt = buildReasoningPrompt(
    { id_document: idExtraction, proof_of_address: poaExtraction },
    checks,
    decision
  );

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const cost_usd = logCall("Reasoning", response.usage);
  const raw = response.content[0]?.type === "text" ? response.content[0].text : "";
  return {
    result: JSON.parse(stripFences(raw)) as { reasoning: string; recommended_action: string },
    cost: { ...response.usage, cost_usd },
  };
}
