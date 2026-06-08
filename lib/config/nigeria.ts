/**
 * lib/config/nigeria.ts — Nigeria-specific KYC configuration
 *
 * All knowledge about Nigerian document conventions, regulatory rules,
 * naming patterns, and address geography lives here. The comparison and
 * compliance modules import from this file; swapping this config with a
 * different country's equivalent is the only change needed to adapt the
 * verification pipeline to a new jurisdiction.
 *
 * "Quiet extensibility" — no Corridor features, just clean separation
 * of country-specific knowledge from generic processing logic.
 */

// ---------------------------------------------------------------------------
// Document types
// ---------------------------------------------------------------------------

/** Accepted government-issued photo identity documents for CBN KYC. */
export const ID_DOCUMENT_TYPES = ["NIN", "DRIVERS_LICENSE", "PASSPORT", "VOTERS_CARD"] as const;

/** Accepted proof-of-address document categories. */
export const POA_DOCUMENT_TYPES = ["UTILITY_BILL", "BANK_STATEMENT", "OTHER"] as const;

// ---------------------------------------------------------------------------
// Name normalisation — titles
// ---------------------------------------------------------------------------

/**
 * Honorific and professional titles that appear on Nigerian government-issued
 * identity documents (NIN slips, driver's licences) but are typically absent
 * from utility bills and bank statements.
 *
 * Must be stripped before name token comparison to prevent false mismatches.
 * Source: CBN eKYC Implementation Guidelines 2023, Section 6.2.
 */
export const NIGERIAN_TITLE_REGEX =
  /\b(mr|mrs|ms|dr|prof|chief|alhaji|alhaja|hajiya|mallam|engineer|engr|barrister|barr|arch|architect|pastor|rev|reverend|deacon|deaconess|bishop|sir|dame|prince|princess|otunba|erelu|igwe|obi)\.?\b/gi;

// ---------------------------------------------------------------------------
// Name matching thresholds
// ---------------------------------------------------------------------------

/**
 * Minimum token overlap ratio that triggers WARN (rather than FAIL) in name matching.
 *
 * Rationale: a 3-token ID name (e.g. "Tunde Afolabi Balogun") where only the
 * first and last tokens appear on the bill ("Tunde Balogun") yields 2/3 ≈ 0.667 —
 * a very common Nigerian pattern where the middle name is omitted on utility bills.
 * 0.6 captures this case; a 2-token name still needs both tokens to match for WARN
 * (1/2 = 0.5 < 0.6 → FAIL), preserving rejection for different-person scenarios.
 */
export const NAME_WARN_THRESHOLD = 0.6;

// ---------------------------------------------------------------------------
// Recognised proof-of-address providers
// ---------------------------------------------------------------------------

/**
 * CBN-licensed electricity DISCOs, telecoms providers, and major commercial banks
 * whose documents are acceptable proof-of-address under CBN KYC guidelines.
 * Source: CBN Guidelines on Mobile Money Services (Revised), 2015 — Section 10.2.
 */
export const RECOGNISED_POA_PROVIDERS = [
  // Electricity DISCOs
  "IKEDC", "EKEDC", "PHCN", "AEDC", "BEDC", "PHEDC", "IBEDC", "KEDCO", "EEDC",
  // Pay-TV / cable
  "DSTV", "GOTV",
  // Telecoms
  "MTN", "AIRTEL", "GLO", "9MOBILE",
  // Commercial banks (selected)
  "ACCESS BANK", "GTB", "ZENITH", "UBA", "FIRST BANK", "OPAY", "KUDA", "MONIEPOINT",
] as const;

// ---------------------------------------------------------------------------
// CBN recency rules
// ---------------------------------------------------------------------------

/**
 * Proof-of-address recency windows required for Tier 2/3 KYC onboarding.
 * Source: CBN Guidelines on Mobile Money Services (Revised) 2015, Section 10.3.
 */
export const RECENCY_RULES = {
  /** Documents issued within this many days: PASS */
  PASS_DAYS: 90,
  /** Documents between PASS_DAYS and this many days old: WARN */
  WARN_DAYS: 180,
  // Documents older than WARN_DAYS: FAIL
} as const;

// ---------------------------------------------------------------------------
// Identity document validation
// ---------------------------------------------------------------------------

/**
 * NIN format: exactly 11 numeric digits.
 * Source: NIMC Act Cap N10 LFN 2004 (as amended 2007).
 */
export const NIN_FORMAT = /^\d{11}$/;

/**
 * Nigerian Driver's Licence number format:
 * 2–3 uppercase letters + 5–7 digits + 2 uppercase letters (e.g. AAD23456FG).
 * Source: FRSC and CBN AML/CFT Regulations 2022, Schedule 1.
 */
export const DRIVERS_LICENCE_FORMAT = /^[A-Z]{2,3}\d{5,7}[A-Z]{2}$/i;

/**
 * Number of days before expiry at which to emit a WARN rather than PASS.
 * Allows onboarding officers to prompt customers to renew before the account
 * upgrade fails at the next KYC refresh.
 */
export const ID_EXPIRY_WARN_DAYS = 30;

// ---------------------------------------------------------------------------
// Address geography — used by checkAddressCrossMatch
// ---------------------------------------------------------------------------

/**
 * All 36 Nigerian states plus FCT/Abuja, lower-cased for substring matching.
 * Used to detect whether an ID address and a PoA address reference different states.
 */
export const NIGERIAN_STATES = [
  "abia", "adamawa", "akwa ibom", "anambra", "bauchi", "bayelsa", "benue",
  "borno", "cross river", "delta", "ebonyi", "edo", "ekiti", "enugu",
  "fct", "abuja", "gombe", "imo", "jigawa", "kaduna", "kano", "katsina",
  "kebbi", "kogi", "kwara", "lagos", "nasarawa", "niger", "ogun", "ondo",
  "osun", "oyo", "plateau", "rivers", "sokoto", "taraba", "yobe", "zamfara",
] as const;

/**
 * Major Nigerian cities, LGAs, and well-known areas, lower-cased for substring matching.
 * Used alongside NIGERIAN_STATES for address cross-match comparison.
 */
export const NIGERIAN_CITIES = [
  "lagos", "abuja", "kano", "ibadan", "port harcourt", "benin city",
  "maiduguri", "zaria", "aba", "jos", "ilorin", "oyo", "enugu",
  "abeokuta", "onitsha", "warri", "sokoto", "calabar", "uyo", "kaduna",
  "owerri", "asaba", "ikeja", "surulere", "victoria island", "lekki",
  "ikoyi", "yaba", "apapa", "agege", "maitama", "garki", "wuse",
  "gwarinpa", "asokoro", "new gra", "old gra", "trans amadi",
  "benin", "sapele", "effurun",
] as const;
