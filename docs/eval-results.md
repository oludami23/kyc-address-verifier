# KYC Verifier — Eval Results

**Eval harness:** `tests/eval-runner.mjs` | **RAG eval:** `tests/rag-eval.mjs`  
**Test cases:** `tests/eval-cases.json`  
**Latest run:** 2026-06-08 (Phase D)

---

## Phase D — Architectural Restructuring

**Run date:** 2026-06-08

### Verdict accuracy after Phase D

| Metric | Phase C | Phase D | Δ |
|---|---|---|---|
| **Verdict accuracy** | 21/22 (95.5%) | **22/22 (100.0%)** | **+4.5pp** |
| Address cross-match accuracy | n/a | 22/22 (100.0%) | new |

### TC-020 fix — `checkAddressCrossMatch()`

The one remaining gap from all previous phases is now closed.

**Root cause:** `runChecks()` checked the PoA address for legibility but never compared it to the address field on the identity document. When both documents belong to the same person but show Lagos (ID) and Port Harcourt (PoA), the system returned VERIFIED.

**Fix:** New `checkAddressCrossMatch(idAddress, poaAddress)` in `lib/comparison/comparator.ts`:
- Returns PASS if `idAddress` is null (NIN slips omit address field — benefit of the doubt)
- Extracts Nigerian state/city tokens from both addresses using `NIGERIAN_STATES` + `NIGERIAN_CITIES` from `lib/config/nigeria.ts`
- Returns PASS if shared location tokens are found (same city/state)
- Returns WARN (not FAIL) if no shared tokens — triggers REVIEW_REQUIRED; human judgment needed because the person may have moved

TC-020: "Lagos/Ikoyi" vs "Rivers/Port Harcourt/New GRA" → 0 shared tokens → WARN → REVIEW_REQUIRED ✓

### Architectural changes (D1–D3)

**New sub-module structure:**

| Module | Responsibility |
|---|---|
| `lib/config/nigeria.ts` (new) | Single source of truth for all Nigeria-specific constants: titles, providers, CBN recency windows, NIN/DL format regexes, ID expiry threshold, 37 states, 40+ cities |
| `lib/comparison/similarity.ts` (new) | `normalizeName`, `tokenOverlap`, `extractLocationTokens` — pure functions, no side effects |
| `lib/comparison/comparator.ts` (new) | `checkNameMatch`, `checkAddressLegibility`, `checkDocumentRecency`, `checkAddressCrossMatch` |
| `lib/compliance/rules.ts` (new) | `checkAuthenticity`, `checkIDExpiry`, `checkIDNumberFormat` |
| `lib/compliance/rag.ts` (new) | Re-export facade for `lib/rag.ts` under the compliance/ namespace |
| `lib/verification.ts` (updated) | Now a thin orchestrator (30 lines): imports from comparison/ + compliance/, exports `runChecks` + `aggregateDecision` |

**Public API unchanged.** `app/api/verify/route.ts` imports only from `lib/verification.ts` — zero changes to the route required.

**Extensibility achieved:** Swapping `lib/config/nigeria.ts` for another country's config is the only change needed to adapt to a new jurisdiction. See `docs/architecture.md` for the full extension guide.

---

---

## Phase C — RAG Compliance Layer

**Run date:** 2026-06-08

### RAG Retrieval Accuracy

| Metric | Score |
|---|---|
| **Retrieval accuracy** | **15/15 (100%)** |
| Required chunks in top-4 | 15/15 |
| Required chunk ranked #1 | 14/15 |

All 15 eval cases retrieved their required compliance chunk(s) within the top-4 results. The TF-IDF scorer correctly prioritises:
- `poa-recency` for document recency failures
- `id-drivers-licence` for DL expiry and format scenarios
- `name-matching` + `name-nigerian-patterns` for name mismatch/partial cases
- `aml-enhanced-cdd` for multi-failure REJECTED cases
- `authenticity-standards` for LOW confidence / anomaly cases

### What Phase C adds

| Component | Change |
|---|---|
| `lib/rag.ts` (new) | 15-chunk compliance KB + TF-IDF indexer + `buildRetrievalQuery()` + `retrieveCompliance()` |
| `lib/types.ts` | `RegulationRef` interface; `regulatory_context?: RegulationRef[]` on `VerificationResult` |
| `lib/anthropic.ts` | `regulatoryContext?` param on `generateReasoning()` |
| `lib/prompts.ts` | v1.2: regulatory context section injected before extracted data; CBN-citation instruction added |
| `app/api/verify/route.ts` | Stage 2.5: RAG retrieval between deterministic checks and reasoning; `regulatory_context` in final payload |
| `components/VerificationResult.tsx` | Collapsible "Regulatory basis" panel (indigo, with BookOpen icon) below AI reasoning |
| `tests/rag-eval.mjs` (new) | 15 retrieval test cases; `npm run eval:rag` |

### Architecture rationale

Python/Chroma was ruled out (incompatible with Vercel serverless). The TF-IDF approach:
- **Zero external dependencies** — pure TypeScript, no npm installs
- **~1ms init time** — IDF computed once at module load, reused across requests
- **Deterministic** — same query always returns the same chunks (important for audit)
- **Portable** — trivially swappable for dense embeddings (Voyage AI / all-MiniLM-L6-v2) with a Chroma/Qdrant backend when the product scales

---

---

## v1.0 → v1.1 Comparison

| Metric | v1.0 | v1.1 | Δ |
|---|---|---|---|
| **Verdict accuracy** | 16/22 (72.7%) | **21/22 (95.5%)** | **+22.8pp** |
| Name match accuracy | 19/22 (86.4%) | 22/22 (100.0%) | +13.6pp |
| Address check accuracy | 22/22 (100.0%) | 22/22 (100.0%) | — |
| Recency check accuracy | 22/22 (100.0%) | 22/22 (100.0%) | — |
| Authenticity accuracy | 22/22 (100.0%) | 22/22 (100.0%) | — |
| ID expiry accuracy | n/a | 22/22 (100.0%) | new |
| ID number format accuracy | n/a | 22/22 (100.0%) | new |

**5 of 6 v1.0 failures resolved.** 1 remaining gap (TC-020: address cross-check) deferred to Phase D architectural restructuring.

### Fixes applied in v1.1

| Case | Root cause | Fix |
|---|---|---|
| TC-008 | WARN threshold (0.7) too aggressive for 3-token names missing middle name | Lowered threshold to 0.6 in `checkNameMatch` |
| TC-012 | No ID expiry validation | Added `checkIDExpiry()` to `runChecks()` |
| TC-015 | No ID number format validation | Added `checkIDNumberFormat()` to `runChecks()` |
| TC-017 | Hyphen removal merged "Obi-Nwosu" → "obinwosu", breaking prefix match | `.replace(/-/g, " ")` before stripping non-alpha in `normalizeName` |
| TC-021 | "Hajiya" not in title normalization list | Expanded title regex to 20+ Nigerian titles |

---

## v1.0 Results (baseline)

**Run date:** 2026-06-08

---

## Summary Metrics

| Metric | Score |
|---|---|
| **Verdict accuracy** | **16 / 22 (72.7%)** |
| Name match accuracy | 19 / 22 (86.4%) |
| Address check accuracy | 22 / 22 (100.0%) |
| Recency check accuracy | 22 / 22 (100.0%) |
| Authenticity accuracy | 22 / 22 (100.0%) |

**Note on accuracy definition:** "Accuracy" here means the system's check or verdict matches the *human-expected* outcome for that case — not whether the system produces internally consistent results. Some cases are intentionally designed to expose gaps where the system's logic diverges from what a compliance officer would decide.

---

## Category Breakdown

| Category | Cases | Verdicts Correct | Pass Rate |
|---|---|---|---|
| Clean matches | 5 | 5 / 5 | 100% |
| Partial matches / review | 5 | 4 / 5 | 80% |
| Mismatches / rejection | 5 | 3 / 5 | 60% |
| Edge cases | 7 | 4 / 7 | 57% |

The edge case and mismatch categories reveal the most meaningful gaps. The clean match category confirming 100% is expected — these are the happy path.

---

## Failed Cases

### TC-008 — Missing middle name triggers over-rejection

**Category:** Partial match  
**Expected:** `REVIEW_REQUIRED` | **Got:** `REJECTED`  
**Failing check:** `name_match` — expected `WARN`, got `FAIL`

**What happened:**  
ID name `"Tunde Afolabi Balogun"` (3 tokens) vs. bill name `"Tunde Balogun"` (2 tokens). First name and surname match, but the middle name `"Afolabi"` has no corresponding token in the bill. Token overlap = 2/3 = 0.667, which falls below the 0.7 threshold for `WARN`, landing in `FAIL`.

**Root cause:** The 0.7 WARN threshold does not account for the common Nigerian pattern where a 3-token ID name has the middle token omitted on utility bills. 2/3 of a 3-token name is a strong signal for a match, but the current cutoff treats it identically to a 1-token name with no match.

**Fix direction:** Raise the WARN floor to ≥ 0.6 for names with 3+ tokens, or add a special case: if first AND last name tokens both match, output WARN regardless of total overlap.

---

### TC-012 — Expired ID document passes verification

**Category:** Mismatch (system gap)  
**Expected:** `REJECTED` | **Got:** `VERIFIED`

**What happened:**  
Driver's licence with `expiry_date: "2024-01-15"` (18 months expired at time of test). All four checks pass because no check evaluates `expiry_date`. The system extracts the field but silently ignores it.

**Root cause:** The verification pipeline (`lib/verification.ts`) runs `checkNameMatch`, `checkAddressLegibility`, `checkDocumentRecency`, and `checkAuthenticity`. There is no `checkIDExpiry()` function. Document recency only checks the *proof-of-address* issue date, not the ID's expiry.

**Fix direction:** Add a `checkIDExpiry(expiry_date: string | null): Check` function in `verification.ts`. Logic: FAIL if expired, WARN if expiring within 30 days, PASS otherwise. Include in `runChecks()`.

---

### TC-015 — Invalid ID number passes verification

**Category:** Mismatch (system gap)  
**Expected:** `REJECTED` | **Got:** `VERIFIED`

**What happened:**  
NIN field contains `"ABC-INVALID-999"` — clearly not a valid 11-digit NIN. The system stores the `id_number` field but performs no format check.

**Root cause:** No ID number validation exists in the codebase. NIN format is 11 digits (`^\d{11}$`); driver's licence format is 2 letters + 5–7 digits + 2 letters (e.g. `AAD23456FG`). Neither pattern is enforced.

**Fix direction:** Add `checkIDNumberFormat(id_number: string | null, doc_type: DocumentType): Check` to `verification.ts`. Implement regex patterns per document type. Mark as FAIL for known-invalid format, WARN if null, PASS if format matches.

---

### TC-017 — Hyphenated surname causes false rejection

**Category:** Edge case  
**Expected:** `REVIEW_REQUIRED` | **Got:** `REJECTED`  
**Failing check:** `name_match` — expected `WARN`, got `FAIL`

**What happened:**  
ID name `"Adaeze Obi Nwosu"` normalises to tokens `["adaeze", "obi", "nwosu"]`. Bill name `"Adaeze Obi-Nwosu"` normalises to `["adaeze", "obinwosu"]` (hyphen removed, parts merged). The token `"nwosu"` from the ID cannot match `"obinwosu"` in the PoA because `"obinwosu".startsWith("nwosu")` is false and `"nwosu".startsWith("obinwosu")` is also false. Token overlap = 2/3 = 0.667 → FAIL.

**Root cause:** The normalisation step (`replace(/[^a-z\s]/g, "")`) removes hyphens without adding a space, merging compound surnames into single tokens. Prefix matching then fails in one direction.

**Fix direction:** In `normalizeName()`, replace hyphens with spaces before stripping non-alpha characters: `.replace(/-/g, " ")`. This splits `"Obi-Nwosu"` into `["obi", "nwosu"]`, making the token sets comparable.

---

### TC-020 — Different-city addresses pass undetected

**Category:** Edge case (system gap)  
**Expected:** `REVIEW_REQUIRED` | **Got:** `VERIFIED`

**What happened:**  
ID address: `"5 Awolowo Road, Ikoyi, Lagos"`. PoA address: `"12 New GRA, Port Harcourt, Rivers State"`. Completely different states. The system verifies the PoA address is *legible* (it is — 2 commas) but does not compare it against the address on the ID document.

**Root cause:** `checkAddressLegibility()` only checks structural completeness of the PoA address. There is no function that compares the ID's `address_on_id` field against `poa.address`. Note: many NIN slips do not include an address at all, which is why this check was originally optional — but when the ID *does* have an address and it diverges significantly, that is a fraud signal.

**Fix direction:** Add an optional `checkAddressCrossMatch(idAddress: string | null, poaAddress: string | null): Check` that: (a) returns PASS/skip if `idAddress` is null (many IDs lack an address field), (b) compares state/city tokens if both addresses exist, returning WARN on significant divergence. This preserves backward compatibility for NIN slips without addresses.

---

### TC-021 — Nigerian title "Hajiya" not stripped during normalisation

**Category:** Edge case  
**Expected:** `REVIEW_REQUIRED` | **Got:** `REJECTED`  
**Failing check:** `name_match` — expected `PASS`, got `FAIL`

**What happened:**  
ID name `"Hajiya Zainab Danladi"` normalises to tokens `["hajiya", "zainab", "danladi"]` (3 tokens). The bill name `"Zainab Danladi"` normalises to `["zainab", "danladi"]` (2 tokens). `"hajiya"` has no match in the PoA → overlap = 2/3 = 0.667 → FAIL → REJECTED.

**Root cause:** The title normalisation regex in `normalizeName()` only covers `mr|mrs|ms|dr|prof|chief|alhaji|alhaja`. Nigerian documents use a wider range of titles including `Hajiya` (female title common in Northern Nigeria), `Mallam`, `Engineer`, `Barrister`, `Architect`, `Pastor`, `Reverend`, and others. These are common on NIN slips and driver's licences but absent from utility bills.

**Fix direction:** Expand the title list in `normalizeName()`:
```
/\b(mr|mrs|ms|dr|prof|chief|alhaji|alhaja|hajiya|mallam|engineer|barrister|arch|pastor|rev|reverend|deacon|deaconess)\.?\b/gi
```

---

## Failure Pattern Analysis

### Pattern 1: Name matching is too aggressive on Nigerian naming conventions (3 cases)
**Cases:** TC-008, TC-017, TC-021  
**Impact:** False rejections — legitimate customers turned away  
**Common thread:** The 0.7 token overlap threshold and prefix-only matching do not account for three common Nigerian patterns: (a) middle name omitted on utility bills, (b) hyphenated surnames split differently across documents, (c) titles that are common on government IDs but absent from billing documents.  
**Risk:** High — these are everyday patterns. False rejections at KYC onboarding damage user trust and require manual escalation.

### Pattern 2: Missing validation checks allow invalid documents through (2 cases)
**Cases:** TC-012, TC-015  
**Impact:** False verifications — expired or dubiously-formatted IDs pass  
**Common thread:** The pipeline extracts `expiry_date` and `id_number` fields but never evaluates them. The checks in `verification.ts` were written for the happy path (does the name match? is the address readable?) but skipped the defensive checks (is the ID itself still valid?).  
**Risk:** High — expired ID acceptance is a direct CBN compliance violation. Invalid ID number acceptance is a fraud surface.

### Pattern 3: No cross-document comparison (1 case)
**Cases:** TC-020  
**Impact:** Potential address fraud goes undetected  
**Common thread:** The system checks the PoA address in isolation (is it legible?) but does not compare it to the address on the ID. When an ID has an address field and it disagrees with the PoA, that warrants a flag.  
**Risk:** Medium — NIN slips often lack an address field, so this gap only applies to driver's licences and passports. But when the field is present and diverges, it is a meaningful signal.

---

## Top 3 Areas for Improvement (Phase B)

| Priority | Area | Cases Affected | Recommended Change |
|---|---|---|---|
| 1 | Name normalisation — title list and hyphen handling | TC-008, TC-017, TC-021 | Expand title regex; replace hyphens with spaces before stripping; revisit WARN threshold for 3-token names |
| 2 | Add missing document validation checks | TC-012, TC-015 | Implement `checkIDExpiry()` and `checkIDNumberFormat()` in `verification.ts` |
| 3 | Cross-document address comparison | TC-020 | Implement optional `checkAddressCrossMatch()` gated on ID having an address field |

---

## Observations on Passing Cases

**Address and recency checks are robust (100% accuracy):** The `checkAddressLegibility` and `checkDocumentRecency` functions produce exactly the expected result on every test case. The comma/word-count heuristic for address legibility correctly handles abbreviated addresses (WARN) and null addresses (FAIL).

**Authenticity signals are well-calibrated (100% accuracy):** The HIGH/MEDIUM/LOW × anomaly-count matrix produces correct results across all 22 cases, including the edge cases with MEDIUM confidence and handwritten anomalies.

**Title normalisation works for listed titles (TC-005):** `Alhaji` and common English titles are stripped correctly. The gap is specifically unlisted Nigerian titles (Hajiya, Mallam, etc.).

**Joint account names pass correctly (TC-022):** The `&` character is stripped, and the ID holder's tokens are found within the joint name — 2/2 = 1.0 PASS. This is a correct behaviour worth preserving in any refactor.

**Single-name documents pass correctly (TC-016):** 1-token names produce 1/1 = 1.0 overlap — the math works at the boundary.

---

## Prompt Improvements for Phase B

Based on these findings, the extraction prompt should be updated (v1.1) to:

1. **Instruction for name normalisation:** Tell Claude to strip titles when extracting the `name` field from ID documents. If the document shows `"Hajiya Zainab Danladi"`, the extracted name should be `"Zainab Danladi"`. This moves the title-handling responsibility to the extraction step, making the normalisation in `verification.ts` redundant for that failure mode.

2. **Instruction for expiry date prominence:** Explicitly instruct Claude to extract `expiry_date` and to flag it in `anomalies` if the document appears to be expired (e.g., `"ID expiry date 2024-01-15 — document may be expired"`). This surfaces the expiry signal even before a dedicated `checkIDExpiry()` function is added.

3. **Instruction for ID number format:** Ask Claude to flag unusual or short `id_number` values in `anomalies` (e.g., `"ID number format does not match expected NIN pattern"`). This adds a soft signal even before deterministic format checking is implemented.

---

*v1.0 baseline complete. Phase B implemented all three recommendations above — see v1.1 results at top of this document.*

---

## v1.1 Results (post-Phase B)

**Run date:** 2026-06-08

### Summary Metrics

| Metric | Score |
|---|---|
| **Verdict accuracy** | **21 / 22 (95.5%)** |
| Name match accuracy | 22 / 22 (100.0%) |
| Address check accuracy | 22 / 22 (100.0%) |
| Recency check accuracy | 22 / 22 (100.0%) |
| Authenticity accuracy | 22 / 22 (100.0%) |
| ID expiry accuracy (new) | 22 / 22 (100.0%) |
| ID number format accuracy (new) | 22 / 22 (100.0%) |

### Category Breakdown

| Category | Cases | Verdicts Correct | Pass Rate |
|---|---|---|---|
| Clean matches | 5 | 5 / 5 | 100% |
| Partial matches / review | 5 | 5 / 5 | 100% |
| Mismatches / rejection | 5 | 5 / 5 | 100% |
| Edge cases | 7 | 6 / 7 | 86% |

### Remaining Failure (1)

**TC-020 — Different-city addresses pass undetected**

Still failing after v1.1. The system has no `checkAddressCrossMatch()` function — the PoA address is checked for legibility only, not compared against the ID's `address_on_id` field. When both documents have the same name but different states (Lagos vs Port Harcourt), the system returns VERIFIED.

**Planned fix:** Phase D architectural restructuring will add an optional `checkAddressCrossMatch(idAddress, poaAddress)` function. It will be gated on `idAddress` being non-null (NIN slips often lack an address field) and will use city/state token comparison. Priority: Medium — affects only driver's licences and passports where the address field is populated.

### What Changed (v1.0 → v1.1)

**`lib/verification.ts`**
- `normalizeName`: expanded title regex to 20+ Nigerian titles; `.replace(/-/g, " ")` before stripping to fix hyphen-split names
- `checkNameMatch`: WARN threshold 0.7 → 0.6 (covers 2/3 token overlap for missing-middle-name pattern)
- Added `checkIDExpiry(expiryDate)`: FAIL if expired, WARN if expiring within 30 days, PASS otherwise
- Added `checkIDNumberFormat(idNumber, docType)`: regex validation for NIN (11 digits) and DL (letters+digits+letters)
- `runChecks()`: now returns 6 checks instead of 4

**`lib/prompts.ts`**
- Updated to v1.1 (see `/prompts/CHANGELOG.md` for full diff)
- ID extraction: title-stripping instructions, expiry/format anomaly guidance
- PoA extraction: joint account handling, address completeness instructions
- Verdict: CBN citation requirement, naming guidance, multi-failure triage order

---

*Phase B complete. Verdict accuracy 72.7% → 95.5% (+22.8pp). One known gap (TC-020) deferred to Phase D.*
