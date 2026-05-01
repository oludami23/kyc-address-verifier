"use client";

import { useState } from "react";
import { DocumentUploader } from "@/components/DocumentUploader";
import { VerificationResult } from "@/components/VerificationResult";
import { ProductExplainer } from "@/components/ProductExplainer";
import type { VerificationResult as VResult } from "@/lib/types";

type AppState = "idle" | "verifying" | "done";

export default function Home() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [result, setResult] = useState<VResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleVerify(idFile: File | null, poaFile: File | null) {
    setAppState("verifying");
    setError(null);

    try {
      const formData = new FormData();
      if (idFile) formData.append("id_document", idFile);
      if (poaFile) formData.append("proof_of_address", poaFile);

      const response = await fetch("/api/verify", { method: "POST", body: formData });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Verification failed — please try again");
      }

      const data: VResult = await response.json();
      setResult(data);
      setAppState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong — please try again");
      setAppState("idle");
    }
  }

  function handleReset() {
    setAppState("idle");
    setResult(null);
    setError(null);
  }

  // For Day 1 mock: call with null files — the API returns mock data regardless
  function handleSample() {
    handleVerify(null, null);
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <span className="text-base font-semibold text-gray-900">KYC Address Verifier</span>
            <span className="ml-3 text-xs text-gray-400">AI-powered document cross-check</span>
          </div>
          <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded font-medium">
            DEMO
          </span>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-12">
          <h1 className="text-3xl font-bold text-gray-900 mb-3 leading-tight">
            AI-powered KYC address verification
            <br />
            for Nigerian fintechs
          </h1>
          <p className="text-gray-500 text-lg max-w-2xl leading-relaxed">
            Compliance officers manually match identity documents against utility bills across
            thousands of onboardings. This tool does the cross-check in seconds and returns a
            structured verdict with auditable reasoning.
          </p>
        </div>
      </section>

      {/* Main content */}
      <section className="max-w-5xl mx-auto px-6 py-10">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {appState === "done" && result ? (
          <VerificationResult result={result} onReset={handleReset} />
        ) : (
          <DocumentUploader
            onVerify={handleVerify}
            onSample={handleSample}
            isVerifying={appState === "verifying"}
          />
        )}
      </section>

      {/* Below-fold explainer — hidden when showing a result */}
      {appState !== "done" && <ProductExplainer />}

      <footer className="border-t border-gray-200 mt-16">
        <div className="max-w-5xl mx-auto px-6 py-6 text-center text-sm text-gray-400">
          Built by Dami Adeolu as a portfolio demonstration. Not affiliated with OkHi.
        </div>
      </footer>
    </main>
  );
}
