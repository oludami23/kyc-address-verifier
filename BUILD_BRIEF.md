# KYC Address Verification AI — Build Brief for Claude Code

**Project name:** `kyc-address-verifier`
**Build target:** Public demo at `kyc-verifier-[yourname].vercel.app`
**Timeline:** 2–3 focused days to v1, ship-ready
**Purpose:** Portfolio demo for OkHi Senior PM application

---

## Context for Claude Code

You are helping me ship a working AI-powered prototype that I will submit as part of a job application to OkHi, a Nigerian fintech that verifies customer addresses for banks and fintechs as part of KYC. The role is Senior PM, New Product Launch, focused on launching fraud and credit products.

This prototype is intentionally adjacent to OkHi's actual product so that when a recruiter clicks the link, they immediately see a candidate who understands their problem space.

I have ~6 years PM experience, can write SQL/Python, and have used Claude API extensively. Treat me as a technical PM who wants clean code I can read and explain in interviews — not a senior engineer who wants you to be terse.

**Non-negotiables:**
- The link I submit must look like a product, not a notebook
- Real AI doing real work (not a hardcoded demo)
- Clean, readable code I can walk through in a technical interview
- Deployed to a public URL on the first day of building, then iterated

---

## Product summary

A web app that performs AI-powered address verification by cross-checking a user's identity document against their proof-of-address document. This is the exact decision a Nigerian fintech compliance officer makes during KYC onboarding.

**User flow:**

1. Landing page explains the product and its place in a KYC pipeline
2. User uploads two documents:
   - An ID document (Nigerian NIN slip OR Nigerian driver's license)
   - A proof-of-address document (utility bill: PHCN/IKEDC, DSTV, or bank statement)
3. App extracts structured data from both using Claude vision
4. App runs verification logic and returns a verdict
5. Verdict is displayed as a structured KYC decision card with reasoning

**Verdict structure (this is the core deliverable):**

```json
{
  "decision": "VERIFIED" | "REVIEW_REQUIRED" | "REJECTED",
  "confidence": 0.0-1.0,
  "id_document": {
    "type": "NIN" | "DRIVERS_LICENSE",
    "name": "extracted full name",
    "id_number": "extracted ID number",
    "date_of_birth": "extracted DOB",
    "address_on_id": "extracted address if present"
  },
  "proof_of_address": {
    "type": "UTILITY_BILL" | "BANK_STATEMENT",
    "issuer": "extracted issuer (e.g., IKEDC, GTBank)",
    "name_on_document": "extracted name",
    "address": "extracted address",
    "issue_date": "extracted date"
  },
  "checks": [
    {"name": "Name match", "status": "PASS" | "FAIL" | "WARN", "detail": "..."},
    {"name": "Address legible", "status": "PASS" | "FAIL" | "WARN", "detail": "..."},
    {"name": "Document recency", "status": "PASS" | "FAIL" | "WARN", "detail": "..."},
    {"name": "Document authenticity signals", "status": "PASS" | "FAIL" | "WARN", "detail": "..."}
  ],
  "reasoning": "2-3 sentence explanation of the decision",
  "recommended_action": "string explaining what a compliance officer should do next"
}
```

---

## Technical architecture

### Stack

- **Framework:** Next.js 14+ with App Router, TypeScript
- **Styling:** Tailwind CSS + shadcn/ui components
- **AI:** Anthropic Claude Sonnet 4.5 via `@anthropic-ai/sdk` (vision + reasoning, single model)
- **File handling:** Native FormData + base64 encoding for image uploads
- **Hosting:** Vercel (free tier, deploys from GitHub)
- **Env vars:** `ANTHROPIC_API_KEY`

### Folder structure

```
kyc-address-verifier/
├── app/
│   ├── page.tsx                    # Landing + upload UI
│   ├── api/
│   │   └── verify/
│   │       └── route.ts            # POST endpoint, runs verification
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── DocumentUploader.tsx        # Drag-drop or click upload, two slots
│   ├── VerificationResult.tsx      # Renders the verdict card
│   ├── CheckBadge.tsx              # PASS/FAIL/WARN pill
│   └── ProductExplainer.tsx        # "What is this" section on landing
├── lib/
│   ├── anthropic.ts                # Claude client + extraction prompts
│   ├── verification.ts             # Cross-check logic
│   ├── prompts.ts                  # All system prompts in one file
│   └── types.ts                    # TypeScript types for verdict
├── public/
│   └── samples/                    # 2-3 sample documents for "Try with sample" button
├── .env.local
├── README.md
└── package.json
```

### API flow

`POST /api/verify` accepts a multipart form with `id_document` and `proof_of_address` files.

1. Both files converted to base64
2. Two parallel Claude API calls extract structured data from each (vision + JSON mode via prompt)
3. Server-side verification logic runs the four checks against the extracted data
4. A third Claude call produces the natural-language reasoning given the structured checks
5. Final JSON returned to client

Why three calls instead of one: separation of concerns makes the code readable and each call cheaper. Extraction is deterministic-leaning; reasoning is generative. A PM can explain this architecture clearly in an interview.

---

## Prompts (drop these into `lib/prompts.ts`)

### ID extraction prompt

```
You are a KYC document extraction system. The image is a Nigerian identity document — either a National Identification Number (NIN) slip or a Nigerian driver's license.

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

Return ONLY the JSON object, no preamble.
```

### Proof-of-address extraction prompt

```
You are a KYC document extraction system. The image is a proof-of-address document — typically a Nigerian utility bill (PHCN, IKEDC, EKEDC, DSTV) or a bank statement.

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

Return ONLY the JSON object, no preamble.
```

### Reasoning prompt (after deterministic checks run)

```
You are a senior KYC compliance analyst writing a brief verdict for a fintech onboarding officer.

Given the extracted document data and the results of automated checks below, write:
1. A 2-3 sentence reasoning paragraph explaining the verdict
2. A one-sentence recommended action

Be precise and operational. Do not speculate beyond the evidence. If something failed, say what and why.

Extracted data:
{INSERT_EXTRACTED_DATA}

Check results:
{INSERT_CHECKS}

Final decision: {INSERT_DECISION}

Return JSON:
{
  "reasoning": string,
  "recommended_action": string
}
```

---

## Verification logic (drop into `lib/verification.ts`)

Implement these four checks as pure TypeScript functions. They run AFTER extraction, BEFORE the reasoning prompt.

### Check 1: Name match
- Normalize both names (lowercase, strip titles like "Mr/Mrs/Dr", strip extra whitespace)
- Tokenize into parts
- PASS if all tokens from ID name appear in proof-of-address name (or vice versa) regardless of order
- WARN if 70%+ token overlap but not exact (e.g., middle name missing)
- FAIL if <70% overlap
- Output detail must show the comparison: `"ID: 'OLUMIDE ADENIYI ADEYEMI' vs Bill: 'O. ADEYEMI'"`

### Check 2: Address legibility
- PASS if `proof_of_address.address` is non-null and contains at least 3 components (likely street + area + state, judged by length and comma count)
- WARN if address present but very short
- FAIL if null

### Check 3: Document recency
- PASS if `proof_of_address.issue_date` is within last 90 days
- WARN if 90–180 days
- FAIL if older than 180 days, or null

### Check 4: Authenticity signals
- PASS if both extractions returned `extraction_confidence: HIGH` and both `anomalies` arrays are empty
- WARN if any extraction is MEDIUM confidence OR any single anomaly flagged
- FAIL if either extraction is LOW confidence OR multiple anomalies flagged

### Final decision aggregation
- All four PASS → `VERIFIED` (confidence based on extraction confidences, e.g., 0.95 if both HIGH)
- Any FAIL → `REJECTED` (confidence reflects severity)
- Otherwise → `REVIEW_REQUIRED`

---

## UI requirements

### Landing page

Above the fold:
- Headline: "AI-powered KYC address verification for Nigerian fintechs"
- Subhead: One sentence explaining the problem (compliance officers manually checking ID-vs-utility-bill matches across thousands of onboardings) and the solution (AI does the cross-check in seconds with a structured verdict)
- Two-document uploader (clearly labeled: "Identity Document" and "Proof of Address")
- A "Try with sample documents" button that loads pre-uploaded sample files from `/public/samples/`
- "Run verification" CTA button

Below the fold:
- "How it works" — 3-step diagram (Upload → AI Extracts → Verdict)
- "What gets checked" — show the four checks as cards
- "Why this matters" — 2-paragraph explainer on KYC in Nigerian fintech (CBN tier requirements, manual review bottlenecks)

### Result view

When verification completes, replace upload UI with the verdict card:
- Top: Decision badge (green VERIFIED / amber REVIEW_REQUIRED / red REJECTED) with confidence percentage
- Reasoning paragraph (the LLM-generated explanation)
- Recommended action callout
- Four check rows, each showing PASS/FAIL/WARN with the detail string
- Expandable "Extracted data" section showing the raw structured extraction from both documents
- "Run another verification" button to reset

### Visual style

- Clean, professional, fintech-appropriate
- Dark mode optional but not required
- shadcn/ui components for consistency
- Avoid stock illustrations and AI-generated art — keep it text-and-data heavy, like a real B2B product
- Footer: "Built by [your name] as a portfolio demonstration. Not affiliated with OkHi."

---

## Sample documents

Create or source 2–3 sample document pairs and place in `/public/samples/`:
- `sample_nin.jpg` (a fake Nigerian NIN slip — generate one in Figma or use a clearly-marked-fake template)
- `sample_utility_bill.jpg` (a fake IKEDC bill)
- One "edge case" pair where names slightly mismatch, to demo the WARN path

CRITICAL: All sample documents must be clearly fake. Watermark them "SAMPLE - NOT A REAL DOCUMENT" in light grey overlay. Never use real personal data, even your own.

---

## Deployment

1. `npx create-next-app@latest kyc-address-verifier --typescript --tailwind --app`
2. Initialize git, push to GitHub
3. Connect to Vercel, set `ANTHROPIC_API_KEY` in env vars
4. Deploy on day 1 with placeholder UI, then iterate on the live URL
5. Custom domain optional — Vercel default URL is fine

---

## README content

The README is part of the portfolio. Recruiters who click through to GitHub will read it. Include:

- One-paragraph product summary
- Screenshot of the verdict card
- "Why I built this" — 2 paragraphs on KYC in Nigerian fintech and why automated cross-checks matter
- Architecture diagram (text or simple mermaid)
- Sample verdicts (3 examples: a verified, a review-required, a rejected)
- Limitations and what v2 would add (live document scanning, NIMC API integration, BVN cross-check, audit log)
- A line that says: "Built in 3 days as part of an application for Senior PM, New Product Launch at OkHi."

---

## Build order (for Claude Code to follow)

**Day 1: Skeleton + first deployment**
1. Scaffold Next.js project, install deps (`@anthropic-ai/sdk`, shadcn/ui)
2. Build landing page with placeholder uploader
3. Build `/api/verify` route that returns a hardcoded mock verdict
4. Wire up uploader → API → result view with mock data
5. Push to GitHub, deploy to Vercel
6. Confirm public URL works end-to-end with mock data

**Day 2: Real AI integration**
1. Implement extraction prompts and Claude API calls in `lib/anthropic.ts`
2. Implement verification logic in `lib/verification.ts`
3. Implement reasoning prompt
4. Replace mock verdict with real pipeline
5. Add sample documents + "Try with sample" button
6. Test end-to-end with at least 3 real document pairs

**Day 3: Polish + portfolio framing**
1. Refine UI: spacing, typography, badge styling, loading states, error states
2. Write the "How it works" and "Why this matters" sections
3. Write the README with screenshots and reasoning
4. Add basic analytics (Vercel Analytics, free tier) so I can see if recruiters click
5. Final QA: run with deliberately bad inputs (blurry, mismatched names, expired) and confirm graceful handling

---

## What I will do separately (not your job, Claude Code)

- Submit the application with the live URL
- Write the LinkedIn post about the build
- Continue iterating in 1–2 hour blocks after submission

---

## What "done" looks like for v1

A recruiter clicks the link. Within 30 seconds they see:
1. A clean landing page that explains a real Nigerian fintech problem
2. They upload (or click "Try with sample") two documents
3. They watch the AI extract data and run the cross-checks
4. They get a structured KYC verdict with reasoning

Then they think: "this person understands the problem we're solving and can ship."

That's the bar. Don't overbuild. Ship.
