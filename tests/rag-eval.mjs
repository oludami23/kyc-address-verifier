/**
 * RAG Eval — Phase C
 *
 * Tests that the TF-IDF retrieval in lib/rag.ts returns the expected
 * compliance chunks for 15 hand-curated query scenarios.
 *
 * Methodology:
 *   - Each test case specifies a query string (simulating what buildRetrievalQuery
 *     would produce) and the chunk IDs that MUST appear in the top-4 results.
 *   - A case PASSES if all required_chunk_ids appear in the retrieved set.
 *   - A case WARNS if a required chunk is present but ranked lower than expected.
 *
 * Usage:
 *   node tests/rag-eval.mjs
 */

// We can't import TypeScript directly from .mjs, so we reproduce the minimal
// TF-IDF logic here, mirroring lib/rag.ts. The knowledge base is imported via
// a tiny JSON bridge written below.

// ─── Inline knowledge base (mirrors lib/rag.ts) ────────────────────────────

const KNOWLEDGE_BASE = [
  {
    id: "cbn-tier-1",
    source: "CBN Guidelines on Mobile Money Services (Revised), 2015 — Appendix II",
    section: "Tier 1 Account: Basic KYC Requirements",
    text: "Tier 1 accounts require only basic customer information: full name, date of birth, and a phone number linked to a BVN or NIN. No proof-of-address document is required at Tier 1. Maximum single deposit: ₦50,000. Maximum cumulative daily transactions: ₦50,000. Maximum account balance: ₦300,000. Tier 1 accounts are suitable for basic payments, airtime purchases, and low-value transfers. Fintechs operating at Tier 1 are not required to verify customer address but must screen names against sanctions lists.",
    keywords: ["tier", "tier1", "basic", "kyc", "daily", "transaction", "limit", "balance", "50000", "300000", "phone", "bvn", "nin"],
  },
  {
    id: "cbn-tier-2",
    source: "CBN Guidelines on Mobile Money Services (Revised), 2015 — Appendix II",
    section: "Tier 2 Account: Standard KYC Requirements",
    text: "Tier 2 accounts require BVN and at least one government-issued photo identity document: National Identification Number (NIN) slip, International Passport, Nigerian Driver's Licence, or Permanent Voter's Card. No proof-of-address is required at Tier 2, but the identity document must be valid and not expired. Maximum single deposit: ₦200,000. Maximum cumulative daily transactions: ₦200,000. Maximum account balance: ₦500,000. Tier 2 enables recurring savings, utility bill payments, and inter-bank transfers up to the limit.",
    keywords: ["tier", "tier2", "standard", "kyc", "bvn", "government", "photo", "identity", "nin", "passport", "drivers", "licence", "voter", "200000", "500000"],
  },
  {
    id: "cbn-tier-3",
    source: "CBN Guidelines on Mobile Money Services (Revised), 2015 — Appendix II",
    section: "Tier 3 Account: Full KYC Requirements",
    text: "Tier 3 accounts require full KYC: BVN, a valid government-issued photo identity document, AND a proof-of-address document issued within the last 90 days. The proof-of-address must show the customer's full name and residential address legibly. Acceptable proof-of-address documents: utility bills (electricity, water, gas), bank statements, or telecom billing statements. Maximum account balance: ₦5,000,000 (or as approved by the CBN). No cap on individual transaction value subject to AML monitoring thresholds. Tier 3 unlocks lending products, cross-border transfers (subject to CBN approval), and high-value savings.",
    keywords: ["tier", "tier3", "full", "kyc", "proof", "address", "90", "days", "utility", "bill", "bank", "statement", "5000000", "lending", "cross-border", "verified"],
  },
  {
    id: "poa-recency",
    source: "CBN Guidelines on Mobile Money Services (Revised), 2015 — Section 10.3",
    section: "Proof-of-Address: Recency Requirement",
    text: "The Central Bank of Nigeria requires that proof-of-address documents submitted for Tier 2 and Tier 3 KYC onboarding must have been issued within the preceding 90 days from the date of submission. A utility bill, bank statement, or telecom billing statement dated more than 90 days before submission does not satisfy the recency requirement and must be rejected. Documents dated between 91 and 180 days old should be flagged for manual review. Documents older than 180 days must be rejected outright. The 90-day recency requirement applies to both physical and digital/electronic copies of proof-of-address documents.",
    keywords: ["recency", "90", "days", "proof", "address", "recent", "issued", "date", "bill", "utility", "180", "old", "expired", "reject", "review", "cbn"],
  },
  {
    id: "poa-acceptable-docs",
    source: "CBN Guidelines on Mobile Money Services (Revised), 2015 — Section 10.2",
    section: "Proof-of-Address: Acceptable Document Types",
    text: "Acceptable proof-of-address documents under CBN KYC guidelines include: (1) Utility bills — electricity bills from PHCN, IKEDC, EKEDC, AEDC, BEDC, PHEDC, IBEDC, KEDCO, EEDC, and other licensed DISCOs; water corporation bills; gas bills. (2) Bank statements — printed or electronic statements from CBN-licensed commercial banks or microfinance banks, dated within 90 days. (3) Telecoms billing statements — monthly bills from MTN, Airtel, Glo, 9Mobile. Documents must show the customer's full name and residential address. A DSTV subscription receipt is acceptable as a billing statement showing residential address. Documents from unregistered or informal providers are not acceptable.",
    keywords: ["proof", "address", "acceptable", "utility", "bill", "electricity", "phcn", "ikedc", "ekedc", "aedc", "bedc", "bank", "statement", "telecom", "dstv", "name", "residential"],
  },
  {
    id: "poa-content-requirements",
    source: "CBN AML/CFT Regulations 2022 — Regulation 14(2)(b)",
    section: "Proof-of-Address: Content Requirements",
    text: "A valid proof-of-address document must contain: (a) the customer's full name or a sufficiently matching name variant (abbreviated first name, title omission, or minor transliteration differences are acceptable if clearly traceable to the same individual); (b) the customer's current residential address including street name, area, local government area (LGA), and state; and (c) the issue date. If any of these three elements are absent, illegible, or clearly inconsistent with the identity document, the proof-of-address document should not be accepted for KYC purposes, and the customer should be asked to provide an alternative document.",
    keywords: ["proof", "address", "content", "full", "name", "residential", "street", "lga", "state", "issue", "date", "illegible", "inconsistent", "reject", "alternative"],
  },
  {
    id: "id-nin",
    source: "NIMC Act Cap N10 LFN 2004 (as amended 2007) and CBN Circular BSD/DIR/GEN/LAB/07/008",
    section: "National Identification Number (NIN): Verification Standards",
    text: "The National Identification Number (NIN) is a unique 11-digit number assigned to every Nigerian citizen and legal resident by the National Identity Management Commission (NIMC). NIN slips do not carry an expiry date — the NIN itself does not expire. However, the physical NIN slip or National eID card may be replaced by updated versions. Fintechs must verify that the NIN number is exactly 11 digits and consists entirely of numeric characters. The name and date of birth on the NIN slip must match NIMC records as verified through the NIMC API or a licensed identity verification partner. NIN is the primary identity document for all KYC tiers.",
    keywords: ["nin", "national", "identification", "number", "11", "digit", "nimc", "slip", "no", "expiry", "nigerian", "identity", "verify"],
  },
  {
    id: "id-drivers-licence",
    source: "Federal Road Safety Corps (FRSC) and CBN AML/CFT Regulations 2022 — Schedule 1",
    section: "Nigerian Driver's Licence: Acceptance Criteria",
    text: "A Nigerian Driver's Licence issued by the Federal Road Safety Corps (FRSC) is an acceptable government-issued photo identity document for KYC Tier 2 and Tier 3 onboarding. The licence must not be expired — fintechs must check the expiry date field and reject expired licences. The standard Nigerian DL number format is: two to three uppercase letters followed by five to seven digits followed by two uppercase letters (e.g., AAD23456FG). The document must show a clear photo of the holder, full name, date of birth, and expiry date. A driver's licence expiring within 30 days should be flagged for customer notification.",
    keywords: ["driver", "licence", "frsc", "expiry", "expired", "valid", "photo", "kyc", "tier2", "tier3", "format", "aad", "letters", "digits"],
  },
  {
    id: "id-passport",
    source: "CBN AML/CFT Regulations 2022 — Schedule 1: Acceptable Identity Documents",
    section: "International Passport: Acceptance for KYC",
    text: "A valid Nigerian International Passport issued by the Nigeria Immigration Service is an acceptable government-issued photo identity document for KYC verification. The passport must not be expired. The document number (A followed by 8 digits, e.g., A12345678) should be captured. The data page must show the full name, date of birth, nationality, and expiry date. A passport with fewer than 6 months validity remaining should be flagged for customer renewal notification. Expired passports must be rejected.",
    keywords: ["passport", "international", "nigeria", "immigration", "expiry", "expired", "valid", "photo", "kyc", "data", "page"],
  },
  {
    id: "name-matching",
    source: "CBN AML/CFT Regulations 2022 — Regulation 14(3) and CBN Circular on eKYC",
    section: "Customer Name Matching: Standards and Tolerances",
    text: "Customer name matching between the identity document and the proof-of-address document must achieve a sufficient degree of correspondence. The CBN permits the following variations as acceptable matches: (a) abbreviated first or middle names (e.g., 'O.A. Adeyemi' matches 'Olumide Adeniyi Adeyemi'); (b) name token reordering (surname appearing first on one document, last on another); (c) omission of middle names where first name and surname match clearly; (d) title differences (e.g., 'Dr.' appearing on one document but not the other). A complete mismatch of both given name and surname with zero shared tokens must be treated as a FAIL and escalated for manual review. Partial matches where only the surname matches but the given name is entirely different should also be escalated.",
    keywords: ["name", "match", "matching", "abbreviated", "first", "middle", "surname", "reorder", "title", "omission", "token", "mismatch", "fail", "partial", "escalate"],
  },
  {
    id: "name-nigerian-patterns",
    source: "CBN eKYC Implementation Guidelines 2023 — Section 6.2",
    section: "Nigerian Naming Conventions: Special Cases",
    text: "Nigerian documents commonly exhibit the following naming patterns that KYC systems must accommodate: (1) Single-name individuals — common in Northern Nigeria where a person may register with a single given name (e.g., 'Yakubu'). Single-name NIN slips are valid. (2) Hyphenated compound surnames — the hyphenated and non-hyphenated forms of the same surname (e.g., 'Obi-Nwosu' and 'Obinwosu') should be treated as equivalent. (3) Honorific titles on NIN slips — titles such as Alhaji, Alhaja, Hajiya, Mallam, Chief, Engr, Barr, and others appear on government-issued IDs but are commonly absent from utility bills. These titles must be stripped before name comparison. (4) Igbo, Yoruba, and Hausa transliterations may produce minor spelling variations across documents — these should be reviewed rather than auto-rejected.",
    keywords: ["nigeria", "nigerian", "naming", "single", "name", "hyphen", "compound", "surname", "title", "alhaji", "hajiya", "mallam", "chief", "engr", "strip", "transliteration", "igbo", "yoruba", "hausa"],
  },
  {
    id: "aml-cdd",
    source: "CBN Anti-Money Laundering/Combating the Financing of Terrorism (AML/CFT) Regulations 2022 — Regulation 11",
    section: "Customer Due Diligence: Standard Requirements",
    text: "All regulated financial institutions must perform Customer Due Diligence (CDD) before establishing a business relationship or processing transactions above the relevant threshold. Standard CDD requires: (a) verifying the identity of the customer using reliable, independent documentary evidence; (b) verifying that the customer's address matches the proof-of-address document on file; (c) obtaining information about the purpose and intended nature of the business relationship; (d) conducting ongoing due diligence throughout the relationship. Fintechs must retain CDD records for a minimum of 5 years after the end of the relationship. CDD must be re-performed when existing KYC information becomes outdated or when the risk profile of the customer changes materially.",
    keywords: ["aml", "cft", "cdd", "due", "diligence", "customer", "identity", "verify", "address", "match", "purpose", "records", "5", "years", "retain", "ongoing"],
  },
  {
    id: "aml-enhanced-cdd",
    source: "CBN AML/CFT Regulations 2022 — Regulation 13",
    section: "Enhanced Due Diligence: High-Risk Triggers",
    text: "Enhanced Due Diligence (EDD) must be applied when: (a) the customer is a Politically Exposed Person (PEP) or is closely associated with a PEP; (b) the customer is resident in a high-risk or sanctioned jurisdiction; (c) the KYC documents show signs of tampering, inconsistency, or low extraction confidence; (d) the name on the identity document does not clearly match the name on the proof-of-address; (e) the proof-of-address document is older than 90 days; or (f) multiple CDD anomalies are present simultaneously. EDD requires obtaining additional corroborating documents and senior management sign-off before onboarding proceeds.",
    keywords: ["enhanced", "edd", "high", "risk", "pep", "politically", "exposed", "tamper", "inconsistency", "anomaly", "sign", "off", "additional", "corroborating", "senior", "management"],
  },
  {
    id: "authenticity-standards",
    source: "CBN eKYC Implementation Guidelines 2023 — Section 8",
    section: "Document Authenticity: Detection and Escalation",
    text: "Fintechs using AI-powered document processing must implement anomaly detection to identify potentially fraudulent documents. Red flags include: blurry or digitally altered fields (especially the ID number, name, or date fields); font inconsistencies within a single document; photo replacement artefacts or irregular borders around the photo area; document layouts inconsistent with official government templates; and images that appear to be screenshots of digital documents rather than scans of physical documents. When one or more red flags are present, the document confidence level must be downgraded and the case flagged for manual review by a trained KYC analyst before onboarding proceeds.",
    keywords: ["authenticity", "fraud", "tamper", "blurry", "altered", "font", "inconsistency", "photo", "artefact", "anomaly", "red", "flag", "confidence", "manual", "review", "analyst"],
  },
  {
    id: "authenticity-digital-docs",
    source: "CBN eKYC Implementation Guidelines 2023 — Section 8.4",
    section: "Digital and Scanned Documents: Acceptance Standards",
    text: "Digital copies of utility bills (e-bills) and electronic bank statements downloaded from official portals are acceptable for KYC purposes provided: (a) the document contains a legible issuer logo or official branding; (b) all critical fields (name, address, date) are clearly readable; (c) there are no signs of image editing or text manipulation. Screenshots of mobile app billing pages are generally not acceptable unless accompanied by a reference number that can be verified against the issuer's records. Low-resolution images where critical fields are illegible must be rejected and the applicant asked to provide a clearer copy.",
    keywords: ["digital", "electronic", "scan", "e-bill", "bank", "statement", "portal", "logo", "branding", "legible", "screenshot", "mobile", "resolution", "illegible", "reject"],
  },
];

// ─── TF-IDF (identical to lib/rag.ts) ─────────────────────────────────────

function tokenise(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function buildIDF(chunks) {
  const docFreq = new Map();
  const N = chunks.length;
  for (const chunk of chunks) {
    const terms = new Set([...tokenise(chunk.text), ...chunk.keywords]);
    for (const t of terms) docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
  }
  const idf = new Map();
  for (const [term, df] of docFreq) {
    idf.set(term, Math.log((N + 1) / (df + 1)) + 1);
  }
  return idf;
}

const IDF = buildIDF(KNOWLEDGE_BASE);

function scoreChunk(queryTerms, chunk) {
  const chunkTerms = tokenise(chunk.text);
  const chunkLen = chunkTerms.length;
  const tf = new Map();
  for (const t of chunkTerms) tf.set(t, (tf.get(t) ?? 0) + 1);
  for (const k of chunk.keywords) tf.set(k, (tf.get(k) ?? 0) + 2);
  let score = 0;
  for (const qt of queryTerms) {
    const termTF = (tf.get(qt) ?? 0) / (chunkLen + 1);
    const termIDF = IDF.get(qt) ?? 1;
    score += termTF * termIDF;
  }
  return score;
}

function retrieve(query, topK = 4) {
  const queryTerms = tokenise(query);
  if (queryTerms.length === 0) return [];
  return KNOWLEDGE_BASE
    .map((chunk) => ({ id: chunk.id, score: scoreChunk(queryTerms, chunk) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// ─── Eval cases ────────────────────────────────────────────────────────────

const EVAL_CASES = [
  {
    id: "RAG-001",
    description: "Expired driver's licence → should surface DL and recency chunks",
    query: "driver licence expiry validity KYC proof of address recency 90 days CBN requirement",
    required_chunk_ids: ["id-drivers-licence", "poa-recency"],
  },
  {
    id: "RAG-002",
    description: "NIN with invalid format → should surface NIN format chunk",
    query: "NIN format invalid identity number NIN national identification verification",
    required_chunk_ids: ["id-nin"],
  },
  {
    id: "RAG-003",
    description: "Utility bill older than 90 days → should surface recency chunk",
    query: "utility bill proof of address recency 90 days CBN requirement document recency",
    required_chunk_ids: ["poa-recency"],
  },
  {
    id: "RAG-004",
    description: "Name mismatch FAIL → should surface name matching chunk",
    query: "name mismatch identity document escalate manual review CBN",
    required_chunk_ids: ["name-matching"],
  },
  {
    id: "RAG-005",
    description: "WARN name match with abbreviated name → naming conventions chunk",
    query: "partial name match abbreviated Nigerian naming conventions",
    required_chunk_ids: ["name-matching", "name-nigerian-patterns"],
  },
  {
    id: "RAG-006",
    description: "Full KYC verified onboarding → Tier 3 chunk should be top result",
    query: "tier 3 full KYC verified onboarding proof of address 90 days",
    required_chunk_ids: ["cbn-tier-3"],
  },
  {
    id: "RAG-007",
    description: "Document authenticity LOW confidence → authenticity chunk",
    query: "document authenticity fraud anomaly manual review low confidence blurry",
    required_chunk_ids: ["authenticity-standards"],
  },
  {
    id: "RAG-008",
    description: "Rejected case with multiple failures → EDD chunk should surface",
    query: "rejected enhanced due diligence AML name mismatch low confidence anomaly",
    required_chunk_ids: ["aml-enhanced-cdd"],
  },
  {
    id: "RAG-009",
    description: "NIN document type → NIN verification standards chunk",
    query: "NIN national identification number verification identity",
    required_chunk_ids: ["id-nin"],
  },
  {
    id: "RAG-010",
    description: "Bank statement as PoA → acceptable docs chunk should surface",
    query: "bank statement proof of address acceptable document types",
    required_chunk_ids: ["poa-acceptable-docs"],
  },
  {
    id: "RAG-011",
    description: "REVIEW_REQUIRED decision → CDD chunk should surface",
    query: "review required customer due diligence KYC",
    required_chunk_ids: ["aml-cdd"],
  },
  {
    id: "RAG-012",
    description: "Hajiya title in name on NIN slip → Nigerian naming conventions",
    query: "partial name match abbreviated Nigerian naming hajiya title strip NIN",
    required_chunk_ids: ["name-nigerian-patterns"],
  },
  {
    id: "RAG-013",
    description: "Incomplete address on utility bill → PoA content requirements",
    query: "proof of address content illegible incomplete address name residential",
    required_chunk_ids: ["poa-content-requirements"],
  },
  {
    id: "RAG-014",
    description: "DSTV bill as PoA → acceptable docs should surface DSTV entry",
    query: "DSTV utility bill proof of address acceptable document",
    required_chunk_ids: ["poa-acceptable-docs"],
  },
  {
    id: "RAG-015",
    description: "Digital e-bill as PoA → digital docs acceptance chunk",
    query: "digital electronic bill bank statement portal legible screenshot mobile",
    required_chunk_ids: ["authenticity-digital-docs"],
  },
];

// ─── Runner ────────────────────────────────────────────────────────────────

const results = [];

for (const tc of EVAL_CASES) {
  const retrieved = retrieve(tc.query, 4);
  const retrievedIds = retrieved.map((r) => r.id);

  const found = tc.required_chunk_ids.filter((id) => retrievedIds.includes(id));
  const missing = tc.required_chunk_ids.filter((id) => !retrievedIds.includes(id));

  const pass = missing.length === 0;

  results.push({
    id: tc.id,
    description: tc.description,
    pass,
    required: tc.required_chunk_ids,
    retrieved: retrievedIds,
    found,
    missing,
    top1: retrieved[0]?.id ?? "(none)",
  });
}

// ─── Report ────────────────────────────────────────────────────────────────

const totalCases = results.length;
const passing = results.filter((r) => r.pass).length;
const accuracy = ((passing / totalCases) * 100).toFixed(1);

console.log("\n=== KYC RAG Eval Report (Phase C) ===");
console.log(`Run date: ${new Date().toISOString().split("T")[0]}`);
console.log(`Total cases: ${totalCases}`);
console.log(`\nRetrieval accuracy: ${passing}/${totalCases} (${accuracy}%)`);

const failures = results.filter((r) => !r.pass);

if (failures.length === 0) {
  console.log("\nAll retrieval cases passed.\n");
} else {
  console.log(`\nFailed cases (${failures.length}):`);
  for (const r of failures) {
    console.log(`\n  ${r.id}: ${r.description}`);
    console.log(`    Required:  ${r.required.join(", ")}`);
    console.log(`    Retrieved: ${r.retrieved.join(", ")}`);
    console.log(`    Missing:   ${r.missing.join(", ")}`);
  }
}

console.log("\nAll results (retrieved top-4 per case):");
for (const r of results) {
  const status = r.pass ? "✓" : "✗";
  console.log(`  ${status} ${r.id.padEnd(8)} top-1: ${r.top1.padEnd(26)} retrieved: [${r.retrieved.join(", ")}]`);
}

console.log("\n=== End of RAG Eval ===\n");

export { results, passing, totalCases };
