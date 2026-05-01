export type DocumentType = "NIN" | "DRIVERS_LICENSE" | "UNKNOWN";
export type PoAType = "UTILITY_BILL" | "BANK_STATEMENT" | "OTHER" | "UNKNOWN";
export type Decision = "VERIFIED" | "REVIEW_REQUIRED" | "REJECTED";
export type CheckStatus = "PASS" | "FAIL" | "WARN";

export interface IDDocument {
  type: DocumentType;
  name: string | null;
  id_number: string | null;
  date_of_birth: string | null;
  address_on_id: string | null;
}

export interface ProofOfAddress {
  type: PoAType;
  issuer: string | null;
  name_on_document: string | null;
  address: string | null;
  issue_date: string | null;
}

export interface Check {
  name: string;
  status: CheckStatus;
  detail: string;
}

export interface VerificationResult {
  decision: Decision;
  confidence: number;
  id_document: IDDocument;
  proof_of_address: ProofOfAddress;
  checks: Check[];
  reasoning: string;
  recommended_action: string;
}

// Internal extraction types — richer than what we expose to the client
export interface IDExtraction extends IDDocument {
  expiry_date: string | null;
  extraction_confidence: "HIGH" | "MEDIUM" | "LOW";
  anomalies: string[];
}

export interface PoAExtraction extends ProofOfAddress {
  account_number_last4: string | null;
  extraction_confidence: "HIGH" | "MEDIUM" | "LOW";
  anomalies: string[];
}
