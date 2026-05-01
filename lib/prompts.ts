// All Claude prompts live here so they're easy to tune without touching API logic.

export const ID_EXTRACTION_PROMPT = `You are a KYC document extraction system. The image is a Nigerian identity document — either a National Identification Number (NIN) slip or a Nigerian driver's license.

Extract the following fields. If a field is illegible or absent, return null for that field. Do not guess.

Return a JSON object exactly matching this schema:
{
  "type": "NIN" | "DRIVERS_LICENSE" | "UNKNOWN",
  "name": string | null,
  "id_number": string | null,
  "date_of_birth": "YYYY-MM-DD" | null,
  "address_on_id": string | null,
  "expiry_date": "YYYY-MM-DD" | null,
  "extraction_confidence": "HIGH" | "MEDIUM" | "LOW",
  "anomalies": [string]
}

Anomalies to flag (non-exhaustive): blurry critical fields, signs of digital tampering, mismatched fonts, unusual document layout, photo replacement artifacts.

Return ONLY the JSON object, no preamble.`;

export const POA_EXTRACTION_PROMPT = `You are a KYC document extraction system. The image is a proof-of-address document — typically a Nigerian utility bill (PHCN, IKEDC, EKEDC, DSTV) or a bank statement.

Extract the following fields. If a field is illegible or absent, return null. Do not guess.

Return a JSON object exactly matching this schema:
{
  "type": "UTILITY_BILL" | "BANK_STATEMENT" | "OTHER" | "UNKNOWN",
  "issuer": string | null,
  "name_on_document": string | null,
  "address": string | null,
  "issue_date": "YYYY-MM-DD" | null,
  "account_number_last4": string | null,
  "extraction_confidence": "HIGH" | "MEDIUM" | "LOW",
  "anomalies": [string]
}

Anomalies to flag: edited fields, font inconsistencies, missing issuer branding, dates that appear modified.

Return ONLY the JSON object, no preamble.`;

// Template — call buildReasoningPrompt() to get the final prompt string.
export function buildReasoningPrompt(
  extractedData: object,
  checks: object,
  decision: string
): string {
  return `You are a senior KYC compliance analyst writing a brief verdict for a fintech onboarding officer.

Given the extracted document data and the results of automated checks below, write:
1. A 2-3 sentence reasoning paragraph explaining the verdict
2. A one-sentence recommended action

Be precise and operational. Do not speculate beyond the evidence. If something failed, say what and why.

Extracted data:
${JSON.stringify(extractedData, null, 2)}

Check results:
${JSON.stringify(checks, null, 2)}

Final decision: ${decision}

Return JSON:
{
  "reasoning": string,
  "recommended_action": string
}

Return ONLY the JSON object, no preamble.`;
}
