# KYC Address Verifier — Failure Modes and Limitations

**Version:** v1.2 (Phase D)  
**Last updated:** 2026-06-08  
**Eval basis:** 22 test cases across 4 categories; 6 baseline failures documented

This document catalogues the known failure modes of the KYC Address Verifier — where it fails, why, what the consequence is, and what would be required to fix it in production. It is organised by the pipeline stage at which the failure originates.

---

## Contents

1. [Extraction failures — AI layer](#1-extraction-failures--ai-layer)
2. [Comparison failures — deterministic layer](#2-comparison-failures--deterministic-layer)
3. [Compliance reasoning failures — RAG + reasoning layer](#3-compliance-reasoning-failures--rag--reasoning-layer)
4. [System-level gaps](#4-system-level-gaps)
5. [What this system cannot do](#5-what-this-system-cannot-do)
6. [Failure impact matrix](#6-failure-impact-matrix)

---

## 1. Extraction failures — AI layer

These failures originate in Stages 1 of the pipeline where Claude vision extracts structured fields from document images. They are the hardest to catch deterministically because the AI's output is not ground-truth verified.

### 1.1 Low-resolution or glared images

**What happens:** When an image is heavily compressed, poorly lit, or has strong glare over a critical field (name, NIN number, date), Claude returns `extraction_confidence: "LOW"` and flags anomalies. The authenticity check then fails or warns, which may reject a legitimate document.

**Real example (TC-010):** Document with `"extraction_confidence": "MEDIUM"` and a single anomaly (`"Slight glare obscuring date of birth field"`) → triggers authenticity WARN → REVIEW_REQUIRED verdict. The document itself may be genuine; the image quality created the flag.

**Impact:** False positives — legitimate customers sent to manual review because of a phone camera angle. Friction at onboarding.

**Mitigation (implemented):** The system returns WARN (REVIEW_REQUIRED), not FAIL (REJECTED), for MEDIUM confidence with a single anomaly. Only LOW confidence or 2+ anomalies → FAIL.

**Mitigation (production):** Reject the image upload client-side with a quality check (minimum resolution, anti-glare guidance) before the document reaches the AI. This prevents wasted API calls and gives the user immediate, actionable feedback.

---

### 1.2 Document-type misclassification

**What happens:** Claude may return `type: "UNKNOWN"` for a document it cannot confidently classify — a bank statement it doesn't recognise, a utility bill with unusual branding, or a poorly photographed document.

**Impact:** UNKNOWN type cascades to weaker checks. `checkIDNumberFormat` returns PASS by default for UNKNOWN document types (benefit of the doubt), potentially letting through malformed IDs.

**Mitigation (implemented):** The route checks for blanket UNKNOWN + LOW confidence on both documents and returns a user-facing error before opening the SSE stream: *"The document doesn't appear to be a valid Nigerian ID or proof-of-address."*

**Mitigation (production):** Fine-tune extraction confidence thresholds per document type. A bank statement returning UNKNOWN should trigger a different message than a NIN slip returning UNKNOWN.

---

### 1.3 Hallucinated field values

**What happens:** Claude may extract a name or address that is slightly different from what appears on the document — a transcription error, a character swap, or a partially illegible field filled in with a plausible guess. The system has no ground truth to compare against.

**Impact:** A hallucinated name could cause a false mismatch (name on ID extracted incorrectly → name match fails → legitimate customer rejected) or a false match (name on PoA extracted incorrectly to match the ID → fraud not caught).

**Mitigation (implemented):** The retry wrapper (`withVisionRetry`) re-runs the extraction call once if the schema validation fails. This catches malformed JSON but not semantically incorrect values.

**Mitigation (production):** NIMC API integration would ground-truth the extracted NIN name against the national identity database. Any divergence between Claude's extraction and the NIMC record would flag for review. This is the single highest-value production upgrade.

---

### 1.4 False anomaly flags on legitimate documents

**What happens:** Claude may flag anomalies on a genuine document — e.g., "font inconsistency" on an older government-printed ID where mixed fonts are normal, or "compression artefacts" on a digital e-bill.

**Impact:** Single anomaly → WARN. Two anomalies → FAIL. A genuine document with two false anomaly flags would be rejected.

**Real example:** Digital e-bills (electronic bank statements) sometimes trigger "screenshot" anomalies even when they are official portal downloads, because they lack the physical document features the model associates with authenticity.

**Mitigation (implemented):** The `POA_EXTRACTION_PROMPT` explicitly names digital/electronic bank statements as acceptable and instructs Claude not to flag them as screenshots unless there is clear evidence of editing.

**Mitigation (production):** Build a feedback loop: when a human reviewer overrides a REJECTED verdict to APPROVED, log the anomalies that caused the rejection. Patterns of false anomaly types can be addressed in extraction prompt v1.3.

---

## 2. Comparison failures — deterministic layer

These failures occurred in the initial evaluation (v1.0) and were resolved by Phase B and Phase D. They are documented here both as resolved findings and as a guide for edge cases the current implementation still approaches with heuristics.

### 2.1 Name matching — middle name omission

**Status:** Resolved in v1.1  
**Baseline failure:** TC-008

**What happened:** ID name `"Tunde Afolabi Balogun"` (3 tokens) vs. bill name `"Tunde Balogun"` (2 tokens). Token overlap = 2/3 = 0.667, which fell below the original 0.7 WARN threshold → FAIL → REJECTED. The customer was legitimate.

**Root cause:** The 0.7 threshold did not account for the very common Nigerian pattern where the middle name (often a traditional or family name) appears on the NIN slip but not on utility bills, which typically use first name + surname only.

**Fix:** Lowered WARN threshold to 0.6 in `lib/config/nigeria.ts`. At 0.6, a 3-token name where first and last match (2/3 = 0.667) → WARN → REVIEW_REQUIRED instead of REJECTED.

**Residual risk:** The 0.6 threshold means a 2-token name where only the surname matches (1/2 = 0.5) still → FAIL. This is correct behaviour — a different given name with a shared surname is a strong mismatch signal (TC-014 confirms this). But if a customer has a very common 1-token surname (e.g., "Bello") and their given name is missing on the bill entirely, the system may reject a legitimate case.

---

### 2.2 Name matching — hyphenated compound surnames

**Status:** Resolved in v1.1  
**Baseline failure:** TC-017

**What happened:** ID name `"Adaeze Obi Nwosu"` → tokens `["adaeze", "obi", "nwosu"]`. Bill name `"Adaeze Obi-Nwosu"` → after stripping non-alpha: `["adaeze", "obinwosu"]`. Token `"nwosu"` couldn't match `"obinwosu"` by prefix → 2/3 overlap → FAIL.

**Fix:** Added `.replace(/-/g, " ")` before stripping non-alpha in `normalizeName()`. "Obi-Nwosu" → "Obi Nwosu" → `["obi", "nwosu"]`.

**Residual risk:** A surname like "Babangida-Aliyu" split into `["babangida", "aliyu"]` could match `"Aliyu"` alone with 1/2 = 0.5 overlap → FAIL even if it should WARN. Multi-part compound surnames with four or more tokens may still have matching edge cases.

---

### 2.3 Name matching — Nigerian honorific titles not stripped

**Status:** Resolved in v1.1  
**Baseline failure:** TC-021

**What happened:** ID name `"Hajiya Zainab Danladi"` → tokens included `"hajiya"` because "Hajiya" was not in the original title regex. Bill name `"Zainab Danladi"` → 2-token set. Overlap = 2/3 = 0.667 → FAIL → REJECTED.

**Fix:** Expanded title regex to 20+ Nigerian honorific and professional titles: Hajiya, Mallam, Engineer, Engr, Barrister, Barr, Arch, Architect, Pastor, Rev, Reverend, Deacon, Deaconess, Bishop, Sir, Dame, Prince, Princess, Otunba, Erelu, Igwe, Obi.

**Residual risk:** Informal or regional titles not in the list (e.g., "Waziri", "Oba", "Emir", "Tor") will not be stripped. The title list in `lib/config/nigeria.ts` is the canonical place to extend this.

---

### 2.4 Name matching — informal shortenings (not prefix-based)

**Status:** Known limitation — not addressed in current version

**What happens:** If a customer's legal name on their NIN slip is "Babatunde" but they use "Tunde" on all their bills, the token `"tunde"` does not satisfy `"babatunde".startsWith("tunde")` → no prefix match → FAIL.

**Impact:** False rejections for customers whose given names have common informal shortenings. This is particularly common with Yoruba names.

**Mitigation (production):** Phonetic similarity layer (e.g., Soundex, Metaphone, or a Yoruba/Igbo/Hausa-aware name dictionary) to handle non-prefix matches. This is on the v2 roadmap.

---

### 2.5 Address cross-match — person has moved

**Status:** WARN behaviour is correct; known inherent limitation  
**Fixed failure:** TC-020

**What happens:** `checkAddressCrossMatch()` returns WARN when the ID's address and the PoA address reference different Nigerian states (e.g., Lagos on the ID, Port Harcourt on the PoA). This triggers REVIEW_REQUIRED.

**Why this is the right behaviour:** The system cannot know whether the customer moved recently. The cross-match WARN surfaces a signal for a human to confirm — it doesn't auto-reject. This is by design.

**Inherent limitation:** If a customer has a NIN slip with a Lagos address but genuinely lives in Abuja now with an Abuja utility bill, they will always get REVIEW_REQUIRED. The resolution is for the compliance officer to accept a sworn address declaration or a second corroborating PoA document, as per CBN guidelines.

---

### 2.6 Address legibility — abbreviated street addresses

**What happens:** A bill showing `"Allen Ave Ikeja"` (2 words, 0 commas) scores below the legibility threshold and returns WARN — even though it is a recognisable and complete address by local conventions.

**Impact:** False legibility warnings for addresses written in abbreviated informal style. The system errs on the side of caution (WARN, not FAIL), but manual review is triggered unnecessarily.

**Mitigation (implemented):** The legibility check passes if ≥2 commas OR ≥6 words. "Allen Ave Ikeja Lagos State" (4 words, 0 commas) → WARN. "Allen Ave, Ikeja, Lagos" (2 commas) → PASS.

**Mitigation (production):** Use the `extractLocationTokens` function to boost legibility for addresses that contain a recognisable Nigerian city or state, even if they are short.

---

## 3. Compliance reasoning failures — RAG + reasoning layer

### 3.1 RAG retrieval misses on paraphrased queries

**Status:** Current TF-IDF approach handles the 15 tested cases (100%). Known limitation for novel language.

**What happens:** TF-IDF scores term overlap. If the verification context uses phrasing that doesn't overlap with the knowledge base chunk's vocabulary, the relevant chunk may not rank in the top-4.

**Example:** A query about "bank verification number cross-check" would not retrieve the NIN verification chunk because "bvn" does not appear in that chunk's text.

**Impact:** The reasoning prompt receives the wrong context → verdict reasoning may cite an inapplicable regulation, or provide generic rather than specific guidance.

**Mitigation (production):** Dense embeddings (Voyage AI `voyage-3` or similar) would handle semantic similarity. A query about "bank identity verification" would retrieve the NIN chunk because the concepts are semantically related even if the words differ.

---

### 3.2 Compliance reasoning hallucination

**What happens:** Claude may generate reasoning that cites a regulation incorrectly — wrong section number, wrong threshold, wrong tier — despite the RAG context providing accurate text.

**Impact:** A compliance officer relying on the cited regulation to explain a rejection to a customer may provide incorrect regulatory justification.

**Mitigation (implemented):** The prompt explicitly instructs Claude to quote from the provided regulatory context rather than generating regulation references from its training. The `regulatory_context` array surfaced in the UI shows the source chunks used, so a reviewer can verify the citation was grounded.

**Mitigation (production):** Ground-truth validation against a canonical CBN regulation database. Citation accuracy could be a separate eval metric.

---

### 3.3 Reasoning inconsistency across identical cases

**What happens:** Because reasoning is generative (Claude Sonnet, temperature > 0), two identical verification cases may produce differently worded verdicts. The check results are deterministic; the natural language explanation is not.

**Impact:** Compliance audit trails may show different explanations for the same decision, which can complicate regulatory examination.

**Mitigation (production):** Set `temperature: 0` for reasoning calls in production. Trade slightly less natural prose for deterministic output across duplicate submissions.

---

## 4. System-level gaps

### 4.1 No document liveness check

The system accepts images as presented. It cannot detect whether a document was photographed from a screen rather than held in hand. A fraudster with a high-resolution photo of another person's NIN slip can pass extraction and comparison checks if the document itself is genuine and the other details match.

**Production requirement:** Liveness and presentation attack detection (PAD) — either a camera-capture flow with randomised challenge (tilt the document, hold it against a plain background) or integration with an ID verification provider that performs PAD.

---

### 4.2 No NIN database lookup

`checkIDNumberFormat` validates that the extracted NIN is 11 digits. It does not verify that the NIN actually exists in the NIMC registry or that the name and date of birth match the NIMC record. An invented but correctly formatted NIN (`"12345678901"`) passes the format check.

**Production requirement:** NIMC API integration. All verification vendors operating in Nigeria (Smile Identity, Dojah, Prembly) provide this as an API call.

---

### 4.3 No BVN cross-check for bank statements

When the proof-of-address is a bank statement, the system checks the name and date — but not whether the bank account belongs to the person submitting the KYC. A bank statement in a different person's name would be caught by `checkNameMatch`, but a stolen bank statement in the same name would not.

**Production requirement:** BVN lookup via a licensed identity verification API.

---

### 4.4 No fraud pattern detection across submissions

The system evaluates each submission independently. It cannot detect:
- The same NIN appearing across multiple different onboarding applications
- The same utility bill used across multiple submissions
- An address that has been used by many different people in quick succession

**Production requirement:** A submission history database with fingerprinting on document identifiers (NIN number, account last-4, bill reference number).

---

### 4.5 Single document per submission

The system takes one ID and one PoA. It cannot reconcile multiple documents, triangulate confidence across three or more inputs, or handle the case where the customer provides two PoA documents because the first one fails.

**Production requirement:** Multi-document pipeline with individual document confidence scores feeding a combined verdict.

---

## 5. What this system cannot do

This is a direct statement — not hedged — of what the prototype does not do and should not be relied upon for:

- **It cannot verify that a document is genuine.** It can flag anomalies, but a high-quality forgery with no anomalies will pass. Liveness detection and government database lookups are required for production anti-fraud.
- **It cannot verify that the NIN number belongs to a real person.** Only NIMC API can do this.
- **It cannot detect all informal name variants.** "Tunde" will not match "Babatunde". Yoruba, Igbo, and Hausa informal variants require a phonetic or dictionary layer.
- **It cannot process PDFs.** JPG and PNG only.
- **It cannot batch-process submissions.** One pair of documents per API call.
- **It cannot maintain an audit log.** Each verification is stateless; results are not stored. An audit-grade deployment requires persistent storage.
- **It cannot replace a compliance officer's judgment.** REVIEW_REQUIRED verdicts require a human decision. The system is a first-pass filter, not a final authority.

---

## 6. Failure impact matrix

| Failure | Type | Baseline rate | Current rate | Consequence | Severity |
|---|---|---|---|---|---|
| Middle name omission → false rejection | False positive | 1/22 (TC-008) | 0/22 | Legitimate customer rejected | High |
| Expired ID accepted | False negative | 1/22 (TC-012) | 0/22 | Compliance violation | Critical |
| Invalid NIN format accepted | False negative | 1/22 (TC-015) | 0/22 | Fraud surface | Critical |
| Hyphenated surname → false rejection | False positive | 1/22 (TC-017) | 0/22 | Legitimate customer rejected | High |
| Different-city addresses undetected | False negative | 1/22 (TC-020) | 0/22 | Address fraud signal missed | High |
| Unlisted title → false rejection | False positive | 1/22 (TC-021) | 0/22 | Legitimate customer rejected | High |
| Informal name shortening | False positive | Not in eval set | Not measured | Customer rejected, must escalate | Medium |
| Liveness attack | False negative | Not testable | Not testable | Fraudster passes with stolen genuine doc | Critical |
| No NIN database verification | False negative | All NIN cases | All NIN cases | Invented NIN passes format check | Critical |
| Glared/low-res image | False positive | Not in eval set | Not measured | Legitimate doc triggers review | Low |
| Hallucinated extracted fields | False positive/negative | Not measurable | Not measurable | Mis-extracted name causes wrong verdict | High |

**Severity definitions:**
- **Critical** — production deployment blocker; requires architectural change or third-party integration
- **High** — significant compliance or user experience impact; addressable in a production sprint
- **Medium** — edge case; worth tracking but not a blocker
- **Low** — minor friction; addressed with UX guidance (e.g., "ensure good lighting")
