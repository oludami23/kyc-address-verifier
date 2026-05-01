export function ProductExplainer() {
  const steps = [
    {
      num: "01",
      title: "Upload documents",
      desc: "Upload a Nigerian identity document (NIN slip or driver's license) and a proof of address (utility bill or bank statement).",
    },
    {
      num: "02",
      title: "AI extracts data",
      desc: "Claude vision reads both documents and extracts structured fields — name, address, date, and issuer — without storing any data.",
    },
    {
      num: "03",
      title: "Cross-check & verdict",
      desc: "Four deterministic checks run against the extracted data. The AI then writes a compliance verdict with explicit, auditable reasoning.",
    },
  ];

  const checks = [
    {
      name: "Name match",
      desc: "Compares the full name on the ID against the name on the proof of address. Handles abbreviated first names, token reordering, and common Nigerian naming patterns.",
    },
    {
      name: "Address legibility",
      desc: "Verifies the proof-of-address document contains a complete, parseable address with enough components (street, area, state) to be actionable for compliance.",
    },
    {
      name: "Document recency",
      desc: "Confirms the proof of address was issued within the last 90 days, matching CBN requirements for KYC tier verification.",
    },
    {
      name: "Authenticity signals",
      desc: "Flags AI-detected anomalies — blurry critical fields, font inconsistencies, unusual document layouts, or signs of digital tampering.",
    },
  ];

  return (
    <div className="bg-gray-50 border-t border-gray-200 mt-4">
      <div className="max-w-5xl mx-auto px-6 py-16 space-y-16">
        {/* How it works */}
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-6">How it works</h2>
          <div className="grid grid-cols-3 gap-5">
            {steps.map((step) => (
              <div key={step.num} className="bg-white rounded-xl border border-gray-200 p-6">
                <span className="text-3xl font-bold text-gray-100">{step.num}</span>
                <h3 className="text-sm font-semibold text-gray-900 mt-2 mb-2">{step.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* What gets checked */}
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-6">What gets checked</h2>
          <div className="grid grid-cols-2 gap-4">
            {checks.map((check) => (
              <div key={check.name} className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-1.5">{check.name}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{check.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Why this matters */}
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-4">Why this matters</h2>
          <div className="max-w-3xl space-y-4 text-gray-500 leading-relaxed text-sm">
            <p>
              The Central Bank of Nigeria's KYC framework requires fintechs to verify customer
              addresses before granting Tier 2 and Tier 3 account privileges — higher transaction
              limits, lending products, and cross-border transfers. At scale, this means compliance
              teams manually comparing thousands of identity documents against utility bills daily: a
              process that is slow, expensive, and introduces human error into regulated decisions.
            </p>
            <p>
              This tool demonstrates how AI vision can automate the extraction and cross-check step,
              producing a structured verdict with explicit reasoning in under 10 seconds. The
              deterministic check layer — name match, address legibility, document recency,
              authenticity signals — ensures every decision is auditable and explainable, a critical
              requirement for any compliance workflow operating under CBN oversight.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
