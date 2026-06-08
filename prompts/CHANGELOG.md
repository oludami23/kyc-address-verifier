# Prompt Changelog

---

## v1.1 — 2026-06-08

**Triggered by:** Phase A eval results (16/22 verdict accuracy, 6 failures identified)

### Extraction prompt changes

| Change | Motivation | Cases addressed |
|---|---|---|
| Added title-stripping instruction with 20+ Nigerian titles | "Hajiya" not in v1.0 list caused false rejection | TC-021 |
| Added expiry-date anomaly instruction | Expired IDs passed silently — no anomaly flagged | TC-012 |
| Added ID number format anomaly instruction | Invalid NINs passed without warning | TC-015 |
| Explicit hyphenated surname preservation | Ensures downstream normalizeName() can split correctly | TC-017 |
| Extended utility provider list (BEDC, AEDC, PHEDC, etc.) | Reduces hallucination risk on lesser-known DISCOs | TC-018 |
| Added address completeness anomaly instructions | Surfaces partial/missing addresses as traceable anomalies | TC-019 |

### Verdict prompt changes

| Change | Motivation |
|---|---|
| Added CBN citation requirement | Verdicts mentioned 90 days but didn't name the regulation |
| Added Nigerian naming guidance for WARN cases | Reviewers uncertain about why partial name matches passed |
| Added multi-failure triage ordering | Critical failures were sometimes buried in the reasoning |
| Standardised recommended action format | Made verdicts more actionable for compliance teams |

---

## v1.0 — 2026-05-01

**Initial release.** Three prompts:
- ID document extraction (NIN / driver's licence)
- Proof-of-address extraction (utility bill / bank statement)
- Verdict / reasoning (2-3 sentence compliance verdict + recommended action)

**Known limitations at time of release:**
- Title normalisation limited to mr/mrs/ms/dr/prof/chief/alhaji/alhaja
- No instruction to flag expired IDs or invalid ID numbers as anomalies
- Verdict prompt does not cite CBN regulations by name
- No guidance for multi-failure triage ordering
