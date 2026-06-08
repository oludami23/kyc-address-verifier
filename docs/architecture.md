# KYC Address Verifier — System Architecture

**Version:** Phase D (v1.2)  
**Last updated:** 2026-06-08

---

## Overview

The KYC Address Verifier is a Next.js application that cross-checks Nigerian identity documents against proof-of-address documents using Claude vision AI for extraction, deterministic TypeScript rules for compliance checking, and a TF-IDF RAG layer for grounding verdicts in specific CBN/NIMC regulations.

The codebase is structured so that **Nigeria-specific knowledge is isolated in a single config module**. The extraction, comparison, and compliance logic is jurisdiction-agnostic — a different country's document types, naming conventions, and regulatory rules can be supported by replacing `lib/config/nigeria.ts`.

---

## Pipeline

```
Upload (ID + PoA)
        │
        ▼
┌──────────────────┐
│  Stage 1         │  lib/anthropic.ts → extractIDDocument()
│  AI Extraction   │                   → extractProofOfAddress()
│  (Claude Vision) │  lib/prompts.ts   → ID_EXTRACTION_PROMPT
└──────────────────┘                   → POA_EXTRACTION_PROMPT
        │
        ▼  IDExtraction + PoAExtraction
┌──────────────────┐
│  Stage 2         │  lib/verification.ts → runChecks()
│  Deterministic   │    ├── comparison/comparator.ts
│  Checks          │    │     checkNameMatch
│                  │    │     checkAddressLegibility
│                  │    │     checkDocumentRecency
│                  │    │     checkAddressCrossMatch (Phase D)
│                  │    └── compliance/rules.ts
│                  │          checkAuthenticity
│                  │          checkIDExpiry
│                  │          checkIDNumberFormat
└──────────────────┘
        │
        ▼  Check[] + Decision
┌──────────────────┐
│  Stage 2.5       │  lib/rag.ts → buildRetrievalQuery()
│  RAG Compliance  │            → retrieveCompliance()
│  Retrieval       │  15-chunk CBN/NIMC knowledge base
│  (Phase C)       │  TF-IDF scored, top-4 returned
└──────────────────┘
        │
        ▼  RetrievalResult[]
┌──────────────────┐
│  Stage 3         │  lib/anthropic.ts → generateReasoning()
│  AI Verdict      │  lib/prompts.ts   → buildReasoningPrompt()
│  Reasoning       │  (RAG context injected into prompt)
└──────────────────┘
        │
        ▼  VerificationResult (SSE stream → client)
```

---

## Directory Structure

```
kyc-address-verifier/
├── app/
│   ├── api/verify/route.ts      # POST endpoint — SSE pipeline orchestrator
│   ├── page.tsx                 # Main UI page
│   └── layout.tsx
│
├── components/
│   ├── VerificationResult.tsx   # Result display (verdict, checks, RAG citations)
│   ├── CheckBadge.tsx           # Individual check pass/warn/fail badge
│   ├── DocumentUploader.tsx     # File upload + demo scenario selector
│   └── LoadingStages.tsx        # SSE progress indicator
│
├── lib/
│   ├── config/
│   │   └── nigeria.ts           # ★ All Nigeria-specific knowledge (D2)
│   │                            #   Document types, title list, providers,
│   │                            #   CBN recency rules, state/city geography,
│   │                            #   NIN/DL format regexes, expiry thresholds
│   │
│   ├── comparison/              # ★ Generic field comparison (D1)
│   │   ├── similarity.ts        #   normalizeName, tokenOverlap,
│   │   │                        #   extractLocationTokens
│   │   └── comparator.ts        #   checkNameMatch, checkAddressLegibility,
│   │                            #   checkDocumentRecency, checkAddressCrossMatch
│   │
│   ├── compliance/              # ★ Document-level compliance rules (D1)
│   │   ├── rules.ts             #   checkAuthenticity, checkIDExpiry,
│   │   │                        #   checkIDNumberFormat
│   │   └── rag.ts               #   Re-export facade for lib/rag.ts
│   │
│   ├── verification.ts          # Public facade: runChecks, aggregateDecision
│   │                            # Imports from comparison/ + compliance/
│   ├── anthropic.ts             # Claude API calls with retry + cost logging
│   ├── prompts.ts               # All prompt templates (v1.2)
│   ├── rag.ts                   # TF-IDF KB + retriever (15 compliance chunks)
│   └── types.ts                 # Shared TypeScript types
│
├── tests/
│   ├── eval-cases.json          # 22 test cases (TC-001 – TC-022)
│   ├── eval-runner.mjs          # npm run eval — verdict + check accuracy
│   └── rag-eval.mjs             # npm run eval:rag — RAG retrieval accuracy
│
├── prompts/
│   ├── v1.0-extraction.md       # Baseline extraction prompt
│   ├── v1.0-verdict.md          # Baseline verdict prompt
│   ├── v1.1-extraction.md       # Improved (Phase B)
│   ├── v1.1-verdict.md          # Improved (Phase B)
│   └── CHANGELOG.md             # Prompt version history with rationale
│
└── docs/
    ├── architecture.md          # This file
    ├── eval-results.md          # Eval history across all phases
    └── failure-modes.md         # (Phase E)
```

---

## Module Responsibilities

### `lib/config/nigeria.ts`

The **single source of truth** for all Nigeria-specific knowledge. Nothing country-specific appears anywhere else in the codebase.

| Constant | Content |
|---|---|
| `NIGERIAN_TITLE_REGEX` | 20+ honorific/professional titles stripped before name comparison |
| `NAME_WARN_THRESHOLD` | 0.6 — token overlap below this triggers WARN; tuned for Nigerian 3-token names |
| `RECOGNISED_POA_PROVIDERS` | DISCOs, telecoms, banks whose documents CBN recognises for KYC |
| `RECENCY_RULES` | `PASS_DAYS: 90`, `WARN_DAYS: 180` — CBN Tier 2/3 requirement |
| `NIN_FORMAT` | `/^\d{11}$/` — NIMC specification |
| `DRIVERS_LICENCE_FORMAT` | `/^[A-Z]{2,3}\d{5,7}[A-Z]{2}$/i` — FRSC specification |
| `ID_EXPIRY_WARN_DAYS` | 30 — warn customers before renewal deadline |
| `NIGERIAN_STATES` | 37 entries (36 states + FCT) for address cross-match |
| `NIGERIAN_CITIES` | 40+ major cities and areas for address cross-match |

### `lib/comparison/similarity.ts`

Pure text-processing utilities with no I/O, no side effects, no country-specific logic.

- `normalizeName(name)` — strips titles (via config regex), splits hyphens, strips non-alpha, tokenises
- `tokenOverlap(a, b)` — prefix-aware overlap ratio: "O." matches "Olumide"
- `extractLocationTokens(address)` — extracts state/city identifiers for geographic comparison

### `lib/comparison/comparator.ts`

Field-level checks comparing the two documents to each other. All thresholds come from `lib/config/nigeria.ts`.

| Check | Logic |
|---|---|
| `checkNameMatch` | Token overlap with prefix matching; WARN at ≥0.6, FAIL below |
| `checkAddressLegibility` | Structural heuristic: ≥2 commas or ≥6 words → PASS |
| `checkDocumentRecency` | Age vs CBN 90/180-day windows |
| `checkAddressCrossMatch` | Location token intersection; gated on ID having an address field |

### `lib/compliance/rules.ts`

Document-level checks on the identity document itself.

| Check | Logic |
|---|---|
| `checkAuthenticity` | Confidence levels + anomaly count aggregation |
| `checkIDExpiry` | Expiry date vs today; WARN within 30 days |
| `checkIDNumberFormat` | Regex validation: NIN = 11 digits, DL = letters/digits/letters |

### `lib/verification.ts`

Thin orchestration facade. The only file `app/api/verify/route.ts` imports from. Provides:
- `runChecks(id, poa)` → 7 `Check[]` objects in display order
- `aggregateDecision(checks, idConf, poaConf)` → `Decision` + confidence score

### `lib/rag.ts`

Compliance RAG module:
- 15-chunk knowledge base covering CBN KYC tiers, PoA requirements, identity document standards, name matching rules, AML/CFT, document authenticity
- TF-IDF indexer computed once at module load (~1ms)
- `buildRetrievalQuery()` — maps verification context (doc types, check results, verdict) to a query string
- `retrieveCompliance(query, topK)` — returns top-K scored chunks

### `app/api/verify/route.ts`

SSE endpoint. Orchestrates the 3-stage pipeline:
1. **Extraction** — parallel Claude vision calls for ID + PoA
2. **Checks** — synchronous `runChecks()` + `aggregateDecision()`
3. **RAG** — `buildRetrievalQuery()` + `retrieveCompliance()` (~0ms)
4. **Reasoning** — `generateReasoning()` with RAG context injected into prompt
5. **Emit** — `VerificationResult` (decision, checks, reasoning, regulatory_context) as SSE `done` event

---

## Extensibility

### Adding a new country

1. Create `lib/config/<country>.ts` with the same exported constants
2. Update imports in `lib/comparison/similarity.ts` and `lib/compliance/rules.ts` (or make config injectable)
3. Update the knowledge base in `lib/rag.ts` with country-specific compliance chunks
4. Update extraction prompts in `lib/prompts.ts` with new document type vocabulary

The pipeline logic, check functions, and UI components require **no changes**.

### Adding a new check

1. Add the function to `lib/comparison/comparator.ts` (cross-document) or `lib/compliance/rules.ts` (single-document)
2. Add it to `runChecks()` in `lib/verification.ts`
3. Add the check name → JSON key mapping in `tests/eval-runner.mjs`
4. Add expected values to relevant `tests/eval-cases.json` entries

### Upgrading RAG to dense embeddings

Replace `scoreChunk()` (TF-IDF) in `lib/rag.ts` with an embedding model call (e.g. Voyage AI `voyage-3`) and a vector DB query (Chroma/Qdrant). The `retrieveCompliance()` signature and all consumers stay unchanged.

---

## Evaluation

| Eval | Script | Accuracy |
|---|---|---|
| Verification pipeline | `npm run eval` | **22/22 (100%)** — Phase D |
| RAG retrieval | `npm run eval:rag` | **15/15 (100%)** — Phase C |

---

## Technical Decisions

| Decision | Rationale |
|---|---|
| **Claude vision for extraction** | Nigerian documents have inconsistent templates; vision handles degraded scans better than regex/OCR |
| **Deterministic checks over AI** | Compliance rules (90-day recency, NIN format) are binary and auditable — AI would introduce hallucination risk |
| **TF-IDF over Chroma/vector DB** | Zero external deps; Vercel-compatible; deterministic; ~1ms init; trivially upgradeable |
| **SSE over JSON response** | Three sequential AI calls; SSE lets the UI advance the progress indicator in real time |
| **`lib/config/nigeria.ts`** | Country-specific knowledge in one place; swap the file to extend to any jurisdiction |
| **WARN not FAIL for cross-match** | Address divergence requires human judgment (person may have moved); auto-rejection would cause false rejections |
