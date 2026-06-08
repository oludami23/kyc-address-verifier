/**
 * KYC Eval Runner — Phase 2 Hardening
 * v1.2 — mirrors lib/verification.ts v1.2 + Phase D sub-module refactor:
 *   - checkNameMatch / checkAddressLegibility / checkDocumentRecency moved to
 *     lib/comparison/comparator.ts; logic unchanged
 *   - checkAuthenticity / checkIDExpiry / checkIDNumberFormat moved to
 *     lib/compliance/rules.ts; logic unchanged
 *   - Nigeria-specific constants extracted to lib/config/nigeria.ts
 *   - New checkAddressCrossMatch() — fixes TC-020 (Lagos vs Port Harcourt)
 *   - runChecks() now returns 7 checks
 *
 * Usage:  node tests/eval-runner.mjs
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Verification logic (mirrored from lib/verification.ts v1.1) ─────────────

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(
      /\b(mr|mrs|ms|dr|prof|chief|alhaji|alhaja|hajiya|mallam|engineer|engr|barrister|barr|arch|architect|pastor|rev|reverend|deacon|deaconess|bishop|sir|dame|prince|princess|otunba|erelu|igwe|obi)\.?\b/g,
      ""
    )
    .replace(/-/g, " ")
    .replace(/[^a-z\s]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function checkNameMatch(idName, poaName) {
  if (!idName || !poaName) {
    return {
      name: "Name match",
      status: "FAIL",
      detail: `Cannot compare names — ${!idName ? "ID name" : "bill name"} is missing`,
    };
  }
  const idTokens = normalizeName(idName);
  const poaTokens = normalizeName(poaName);
  const matches = idTokens.filter((t) =>
    poaTokens.some((p) => p.startsWith(t) || t.startsWith(p))
  );
  const overlap = matches.length / Math.max(idTokens.length, 1);
  const detail = `ID: '${idName}' vs Bill: '${poaName}'`;
  let status;
  if (overlap === 1) status = "PASS";
  else if (overlap >= 0.6) status = "WARN";  // v1.1: was 0.7
  else status = "FAIL";
  return { name: "Name match", status, detail: `${detail} — ${Math.round(overlap * 100)}% token match` };
}

function checkAddressLegibility(address) {
  if (!address) return { name: "Address legible", status: "FAIL", detail: "No address found on proof-of-address document" };
  const commaCount = (address.match(/,/g) || []).length;
  const wordCount = address.split(/\s+/).length;
  if (commaCount >= 2 || wordCount >= 6) return { name: "Address legible", status: "PASS", detail: `Address has sufficient components: "${address}"` };
  return { name: "Address legible", status: "WARN", detail: `Address present but may be incomplete: "${address}"` };
}

function checkDocumentRecency(issueDate) {
  if (!issueDate) return { name: "Document recency", status: "FAIL", detail: "Issue date is missing — cannot verify document recency" };
  const issued = new Date(issueDate);
  const now = new Date();
  const daysDiff = (now.getTime() - issued.getTime()) / (1000 * 60 * 60 * 24);
  if (daysDiff <= 90) return { name: "Document recency", status: "PASS", detail: `Document dated ${issueDate} — ${Math.round(daysDiff)} days old (within 90-day window)` };
  if (daysDiff <= 180) return { name: "Document recency", status: "WARN", detail: `Document dated ${issueDate} — ${Math.round(daysDiff)} days old (CBN recommends under 90 days)` };
  return { name: "Document recency", status: "FAIL", detail: `Document dated ${issueDate} — ${Math.round(daysDiff)} days old (exceeds 180-day limit)` };
}

function checkAuthenticity(id, poa) {
  const bothHigh = id.extraction_confidence === "HIGH" && poa.extraction_confidence === "HIGH";
  const totalAnomalies = id.anomalies.length + poa.anomalies.length;
  if (bothHigh && totalAnomalies === 0) return { name: "Document authenticity signals", status: "PASS", detail: "Both documents returned HIGH extraction confidence with no anomalies flagged" };
  if (id.extraction_confidence === "LOW" || poa.extraction_confidence === "LOW" || totalAnomalies >= 2) {
    const details = [
      id.extraction_confidence === "LOW" ? "ID confidence: LOW" : null,
      poa.extraction_confidence === "LOW" ? "PoA confidence: LOW" : null,
      ...id.anomalies.map((a) => `ID anomaly: ${a}`),
      ...poa.anomalies.map((a) => `PoA anomaly: ${a}`),
    ].filter(Boolean);
    return { name: "Document authenticity signals", status: "FAIL", detail: details.join("; ") };
  }
  const warnDetails = [
    id.extraction_confidence !== "HIGH" ? `ID confidence: ${id.extraction_confidence}` : null,
    poa.extraction_confidence !== "HIGH" ? `PoA confidence: ${poa.extraction_confidence}` : null,
    ...id.anomalies.map((a) => `ID: ${a}`),
    ...poa.anomalies.map((a) => `PoA: ${a}`),
  ].filter(Boolean);
  return { name: "Document authenticity signals", status: "WARN", detail: warnDetails.join("; ") };
}

// v1.1: new check
function checkIDExpiry(expiryDate) {
  if (!expiryDate) return { name: "ID document expiry", status: "PASS", detail: "No expiry date on document — NIN slips do not expire" };
  const expiry = new Date(expiryDate);
  const now = new Date();
  if (expiry < now) {
    const daysExpired = Math.round((now.getTime() - expiry.getTime()) / (1000 * 60 * 60 * 24));
    return { name: "ID document expiry", status: "FAIL", detail: `ID expired ${daysExpired} days ago (${expiryDate}) — document is no longer valid for KYC` };
  }
  const daysUntil = Math.round((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysUntil <= 30) return { name: "ID document expiry", status: "WARN", detail: `ID expires in ${daysUntil} days (${expiryDate}) — renewal recommended` };
  return { name: "ID document expiry", status: "PASS", detail: `ID valid until ${expiryDate} — ${daysUntil} days remaining` };
}

// v1.1: new check
function checkIDNumberFormat(idNumber, docType) {
  if (!idNumber) return { name: "ID number format", status: "WARN", detail: "ID number not extracted — cannot validate format" };
  if (docType === "NIN") {
    const valid = /^\d{11}$/.test(idNumber);
    return { name: "ID number format", status: valid ? "PASS" : "FAIL", detail: valid ? "NIN format valid — 11-digit number confirmed" : `NIN format invalid — expected 11 digits, got '${idNumber}'` };
  }
  if (docType === "DRIVERS_LICENSE") {
    const valid = /^[A-Z]{2,3}\d{5,7}[A-Z]{2}$/i.test(idNumber);
    return { name: "ID number format", status: valid ? "PASS" : "FAIL", detail: valid ? "Driver's licence number format valid" : `Driver's licence number format unexpected — got '${idNumber}'` };
  }
  return { name: "ID number format", status: "PASS", detail: `ID number present: '${idNumber}' — format check not applicable for ${docType}` };
}

// v1.2: new — mirrors lib/config/nigeria.ts location lists
const NIGERIAN_STATES = [
  "abia", "adamawa", "akwa ibom", "anambra", "bauchi", "bayelsa", "benue",
  "borno", "cross river", "delta", "ebonyi", "edo", "ekiti", "enugu",
  "fct", "abuja", "gombe", "imo", "jigawa", "kaduna", "kano", "katsina",
  "kebbi", "kogi", "kwara", "lagos", "nasarawa", "niger", "ogun", "ondo",
  "osun", "oyo", "plateau", "rivers", "sokoto", "taraba", "yobe", "zamfara",
];
const NIGERIAN_CITIES = [
  "lagos", "abuja", "kano", "ibadan", "port harcourt", "benin city",
  "maiduguri", "zaria", "aba", "jos", "ilorin", "oyo", "enugu",
  "abeokuta", "onitsha", "warri", "sokoto", "calabar", "uyo", "kaduna",
  "owerri", "asaba", "ikeja", "surulere", "victoria island", "lekki",
  "ikoyi", "yaba", "apapa", "agege", "maitama", "garki", "wuse",
  "gwarinpa", "asokoro", "new gra", "old gra", "trans amadi",
  "benin", "sapele", "effurun",
];

function extractLocationTokens(address) {
  const lower = address.toLowerCase();
  const found = new Set();
  for (const s of NIGERIAN_STATES) if (lower.includes(s)) found.add(s);
  for (const c of NIGERIAN_CITIES) if (lower.includes(c)) found.add(c);
  return [...found];
}

// v1.2: new check — fixes TC-020
function checkAddressCrossMatch(idAddress, poaAddress) {
  if (!idAddress) {
    return { name: "Address cross-match", status: "PASS", detail: "No address on identity document — cross-check not applicable" };
  }
  if (!poaAddress) {
    return { name: "Address cross-match", status: "PASS", detail: "No address on proof-of-address — already flagged by legibility check" };
  }
  const idTokens = extractLocationTokens(idAddress);
  const poaTokens = extractLocationTokens(poaAddress);
  if (idTokens.length === 0 || poaTokens.length === 0) {
    return { name: "Address cross-match", status: "PASS", detail: "Address cross-check inconclusive — no recognisable location tokens found" };
  }
  const shared = idTokens.filter(t => poaTokens.includes(t));
  if (shared.length > 0) {
    return { name: "Address cross-match", status: "PASS", detail: `Addresses share location token(s) [${shared.join(", ")}] — cross-check passed` };
  }
  return {
    name: "Address cross-match", status: "WARN",
    detail: `Address locations inconsistent — ID suggests [${idTokens.join(", ")}], PoA suggests [${poaTokens.join(", ")}]. Manual review recommended.`
  };
}

function aggregateDecision(checks, idConfidence, poaConfidence) {
  const hasFail = checks.some((c) => c.status === "FAIL");
  const hasWarn = checks.some((c) => c.status === "WARN");
  const confidenceMap = { HIGH: 1, MEDIUM: 0.75, LOW: 0.5 };
  const baseConfidence = (confidenceMap[idConfidence] + confidenceMap[poaConfidence]) / 2;
  if (hasFail) return { decision: "REJECTED", confidence: Math.round(baseConfidence * 0.6 * 100) / 100 };
  if (hasWarn) return { decision: "REVIEW_REQUIRED", confidence: Math.round(baseConfidence * 0.8 * 100) / 100 };
  return { decision: "VERIFIED", confidence: Math.round(baseConfidence * 0.95 * 100) / 100 };
}

function runChecks(id, poa) {
  return [
    checkNameMatch(id.name, poa.name_on_document),
    checkAddressLegibility(poa.address),
    checkDocumentRecency(poa.issue_date),
    checkAuthenticity(id, poa),
    checkIDExpiry(id.expiry_date),
    checkIDNumberFormat(id.id_number, id.type),
    checkAddressCrossMatch(id.address_on_id, poa.address), // v1.2: new
  ];
}

// ─── Check name → JSON key mapping ───────────────────────────────────────────

const CHECK_KEYS = {
  "Name match": "name_match",
  "Address legible": "address_legibility",
  "Document recency": "document_recency",
  "Document authenticity signals": "authenticity",
  "ID document expiry": "id_expiry",
  "ID number format": "id_number_format",
  "Address cross-match": "address_cross_match",  // v1.2: new
};

// ─── Runner ───────────────────────────────────────────────────────────────────

const casesPath = join(__dirname, "eval-cases.json");
const cases = JSON.parse(readFileSync(casesPath, "utf-8"));

const results = [];

for (const tc of cases) {
  const checks = runChecks(tc.id_extraction, tc.poa_extraction);
  const { decision, confidence } = aggregateDecision(
    checks,
    tc.id_extraction.extraction_confidence,
    tc.poa_extraction.extraction_confidence
  );

  const systemChecks = {};
  for (const check of checks) {
    const key = CHECK_KEYS[check.name];
    if (key) systemChecks[key] = check.status;
  }

  const verdictMatch = decision === tc.expected_verdict;

  const checkMismatches = [];
  for (const [key, expectedStatus] of Object.entries(tc.expected_checks)) {
    const systemStatus = systemChecks[key];
    if (systemStatus !== expectedStatus) {
      checkMismatches.push({ check: key, expected: expectedStatus, got: systemStatus });
    }
  }

  results.push({
    id: tc.id,
    description: tc.description,
    category: tc.category,
    expected_verdict: tc.expected_verdict,
    system_verdict: decision,
    system_confidence: confidence,
    verdict_match: verdictMatch,
    check_mismatches: checkMismatches,
    system_checks: systemChecks,
    notes: tc.notes,
    checks_detail: checks,
  });
}

// ─── Report ───────────────────────────────────────────────────────────────────

const totalCases = results.length;
const verdictMatches = results.filter((r) => r.verdict_match).length;
const verdictAccuracy = ((verdictMatches / totalCases) * 100).toFixed(1);

const checkNames = ["name_match", "address_legibility", "document_recency", "authenticity", "id_expiry", "id_number_format", "address_cross_match"];
const checkAccuracy = {};
for (const key of checkNames) {
  const matching = results.filter((r) => {
    const tc = cases.find((c) => c.id === r.id);
    // Skip check if not in expected_checks (backwards compat)
    if (!(key in tc.expected_checks)) return true;
    return r.system_checks[key] === tc.expected_checks[key];
  }).length;
  checkAccuracy[key] = { matching, total: totalCases, pct: ((matching / totalCases) * 100).toFixed(1) };
}

console.log("\n=== KYC Eval Report (v1.2) ===");
console.log(`Run date: ${new Date().toISOString().split("T")[0]}`);
console.log(`Total cases: ${totalCases}`);
console.log(`\nVerdict accuracy:          ${verdictMatches}/${totalCases} (${verdictAccuracy}%)`);
console.log(`Name match accuracy:       ${checkAccuracy.name_match.matching}/${totalCases} (${checkAccuracy.name_match.pct}%)`);
console.log(`Address check accuracy:    ${checkAccuracy.address_legibility.matching}/${totalCases} (${checkAccuracy.address_legibility.pct}%)`);
console.log(`Recency check accuracy:    ${checkAccuracy.document_recency.matching}/${totalCases} (${checkAccuracy.document_recency.pct}%)`);
console.log(`Authenticity accuracy:     ${checkAccuracy.authenticity.matching}/${totalCases} (${checkAccuracy.authenticity.pct}%)`);
console.log(`ID expiry accuracy:        ${checkAccuracy.id_expiry.matching}/${totalCases} (${checkAccuracy.id_expiry.pct}%)`);
console.log(`ID number format accuracy: ${checkAccuracy.id_number_format.matching}/${totalCases} (${checkAccuracy.id_number_format.pct}%)`);
console.log(`Address cross-match acc:   ${checkAccuracy.address_cross_match.matching}/${totalCases} (${checkAccuracy.address_cross_match.pct}%)`);

const failures = results.filter((r) => !r.verdict_match || r.check_mismatches.length > 0);

if (failures.length === 0) {
  console.log("\nAll cases passed.\n");
} else {
  console.log(`\nFailed / divergent cases (${failures.length}):`);
  for (const r of failures) {
    console.log(`\n  ${r.id}: ${r.description}`);
    if (!r.verdict_match) {
      console.log(`    Verdict  — expected: ${r.expected_verdict}, got: ${r.system_verdict}`);
    }
    for (const m of r.check_mismatches) {
      console.log(`    Check [${m.check}] — expected: ${m.expected}, got: ${m.got}`);
    }
    if (r.notes) console.log(`    Note: ${r.notes}`);
  }
}

const categories = [...new Set(results.map((r) => r.category))];
console.log("\nCategory breakdown:");
for (const cat of categories) {
  const catCases = results.filter((r) => r.category === cat);
  const catPassing = catCases.filter((r) => r.verdict_match).length;
  console.log(`  ${cat.padEnd(16)} ${catPassing}/${catCases.length} verdicts correct`);
}

console.log("\n=== End of Report ===\n");

export { results, checkAccuracy, verdictMatches, totalCases, checkAddressCrossMatch };
