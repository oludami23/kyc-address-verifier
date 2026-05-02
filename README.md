# KYC Address Verifier

AI-powered KYC address verification for Nigerian fintechs. Upload an identity document (NIN slip or driver's license) and a proof of address (utility bill or bank statement) — the system extracts structured data from both using Claude vision, runs four deterministic compliance checks, and returns a structured verdict with auditable AI reasoning.

**Built in 3 days as part of an application for Senior PM, New Product Launch at OkHi.**

---

## Why I built this

Nigerian fintechs are required by the Central Bank of Nigeria to verify customer addresses before granting Tier 2 and Tier 3 account privileges. In practice, this means compliance officers manually comparing identity documents against utility bills — a process that doesn't scale and introduces human error into regulated decisions.

OkHi has built the infrastructure to verify addresses physically. This prototype explores the complementary AI layer: automated document cross-checking that produces a structured, auditable verdict in seconds. Rather than replacing human judgment, it gives compliance teams a first-pass decision they can act on or escalate — with the reasoning already written.

The Nigerian KYC context is specific: NIN slips and driver's licenses as primary ID, PHCN/IKEDC/DSTV bills and bank statements as proof of address, CBN's 90-day recency requirement. These constraints are baked into the verification logic.

---

## Architecture

```
POST /api/verify
     │
     ├─ Parse multipart form (id_document + proof_of_address)
     │
     ├─ Claude vision ──► extract ID fields (type, name, DOB, address, anomalies)
     ├─ Claude vision ──► extract PoA fields (issuer, name, address, date, anomalies)
     │   (two parallel calls)
     │
     ├─ Deterministic checks (lib/verification.ts)
     │   ├─ Name match (token overlap with title stripping)
     │   ├─ Address legibility (component count)
     │   ├─ Document recency (90/180 day thresholds)
     │   └─ Authenticity signals (confidence + anomaly count)
     │
     ├─ Decision aggregation (VERIFIED / REVIEW_REQUIRED / REJECTED)
     │
     └─ Claude reasoning ──► 2-3 sentence verdict + recommended action
```

Three model calls instead of one: extraction is deterministic-leaning and benefits from focused prompts; reasoning is generative and gets the structured check results as context. The separation makes each call cheaper and the system easier to audit.

---

## Sample verdicts

**VERIFIED**
```json
{
  "decision": "VERIFIED",
  "confidence": 0.92,
  "reasoning": "The NIN slip and IKEDC utility bill belong to the same individual. The abbreviated name on the bill is consistent with the full name on the ID — a common pattern on Nigerian utility accounts. The address matches across both documents and the bill is within the required 90-day window.",
  "recommended_action": "Approve KYC tier upgrade. No manual review required."
}
```

**REVIEW_REQUIRED**
```json
{
  "decision": "REVIEW_REQUIRED",
  "confidence": 0.71,
  "reasoning": "The name on the utility bill ('TUNDE BAKARE') partially matches the ID ('BABATUNDE OLUWAFEMI BAKARE') — key surname present, first name abbreviated differently than expected. Compliance officer should confirm identity before approving.",
  "recommended_action": "Escalate to manual review. Request customer to provide a second proof of address with full name."
}
```

**REJECTED**
```json
{
  "decision": "REJECTED",
  "confidence": 0.41,
  "reasoning": "The utility bill is dated 14 months ago, exceeding the CBN 180-day limit. Additionally, the AI flagged a font inconsistency in the customer name field on the bill. Both failures independently warrant rejection.",
  "recommended_action": "Reject KYC submission. Request a utility bill dated within the last 90 days."
}
```

---

## Stack

- **Next.js 14** App Router, TypeScript
- **Tailwind CSS** for styling
- **Anthropic Claude Sonnet** for vision extraction and reasoning
- **Vercel** for hosting

---

## Limitations and v2 roadmap

- **v1 limitation:** No live document scanning — upload only. Mobile camera capture would significantly improve conversion.
- **v1 limitation:** JPG/PNG only — PDF uploads are rejected with a clear error. PDF-to-image conversion is on the v2 roadmap.
- **v2:** PDF document support via server-side conversion before vision extraction
- **v2:** NIMC API integration for NIN verification against the national database
- **v2:** BVN cross-check for bank statement verification
- **v2:** Audit log with tamper-evident verdict storage for regulatory review
- **v2:** Webhook support so this can be embedded in a fintech's existing KYC pipeline
