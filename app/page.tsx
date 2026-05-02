"use client";

import { useState } from "react";
import { DocumentUploader, type DemoScenario } from "@/components/DocumentUploader";
import { VerificationResult } from "@/components/VerificationResult";
import { LoadingStages, type LoadingStage } from "@/components/LoadingStages";
import { ProductExplainer } from "@/components/ProductExplainer";
import type { VerificationResult as VResult } from "@/lib/types";

type AppState = "idle" | "verifying" | "done";

// SSE event shapes sent by /api/verify
type VerifyEvent =
  | { stage: LoadingStage }
  | { done: true; result: VResult }
  | { error: string };

export default function Home() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [loadingStage, setLoadingStage] = useState<LoadingStage>("extracting");
  const [result, setResult] = useState<VResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleVerify(
    idFile: File | null,
    poaFile: File | null,
    scenario?: DemoScenario
  ) {
    setAppState("verifying");
    setLoadingStage("extracting");
    setError(null);

    try {
      const formData = new FormData();
      if (idFile) formData.append("id_document", idFile);
      if (poaFile) formData.append("proof_of_address", poaFile);

      const url = scenario ? `/api/verify?scenario=${scenario}` : "/api/verify";
      const response = await fetch(url, { method: "POST", body: formData });

      // Pre-flight errors (400s) come back as plain JSON before the stream opens
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Verification failed — please try again");
      }

      // Read the SSE stream line-by-line
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Split on newlines, keep any incomplete trailing line in the buffer
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (!json) continue;

          const event = JSON.parse(json) as VerifyEvent;

          if ("stage" in event) {
            setLoadingStage(event.stage);
          } else if ("error" in event) {
            throw new Error(event.error);
          } else if ("done" in event && event.done) {
            setResult(event.result);
            setAppState("done");
          }
        }
      }
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

  function handleDemoScenario(scenario: DemoScenario) {
    handleVerify(null, null, scenario);
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div>
            <span className="text-base font-semibold text-gray-900">KYC Address Verifier</span>
            <span className="ml-3 text-xs text-gray-400 hidden sm:inline">
              AI-powered document cross-check
            </span>
          </div>
          <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded font-medium">
            DEMO
          </span>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 leading-tight">
            AI-powered KYC address verification
            <br className="hidden sm:block" />
            {" "}for Nigerian fintechs
          </h1>
          <p className="text-gray-500 text-base sm:text-lg max-w-2xl leading-relaxed">
            Compliance officers manually match identity documents against utility bills across
            thousands of onboardings. This tool does the cross-check in seconds and returns a
            structured verdict with auditable reasoning.
          </p>
        </div>
      </section>

      {/* Main content */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm leading-relaxed">
            {error}
          </div>
        )}

        {appState === "done" && result ? (
          <VerificationResult result={result} onReset={handleReset} />
        ) : appState === "verifying" ? (
          <LoadingStages current={loadingStage} />
        ) : (
          <DocumentUploader
            onVerify={handleVerify}
            onDemoScenario={handleDemoScenario}
            isVerifying={false}
          />
        )}
      </section>

      {/* Below-fold explainer — hidden when showing a result or loading */}
      {appState === "idle" && <ProductExplainer />}

      <footer className="border-t border-gray-200 mt-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 text-center text-sm text-gray-400">
          Built by Olumide Adeniyi as a portfolio demonstration. Not affiliated with OkHi.
        </div>
      </footer>
    </main>
  );
}
