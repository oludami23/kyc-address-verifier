"use client";

import { useState, useRef } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
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
  | { error: string; retryable: boolean };

export default function Home() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [loadingStage, setLoadingStage] = useState<LoadingStage>("extracting");
  const [result, setResult] = useState<VResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRetryable, setIsRetryable] = useState(false);
  const lastVerifyParams = useRef<{ idFile: File | null; poaFile: File | null; scenario?: DemoScenario } | null>(null);

  async function handleVerify(
    idFile: File | null,
    poaFile: File | null,
    scenario?: DemoScenario
  ) {
    lastVerifyParams.current = { idFile, poaFile, scenario };
    setAppState("verifying");
    setLoadingStage("extracting");
    setError(null);
    setIsRetryable(false);

    let pipelineCompleted = false;

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
            pipelineCompleted = true;
            setError(event.error);
            setIsRetryable(event.retryable);
            setAppState("idle");
          } else if ("done" in event && event.done) {
            pipelineCompleted = true;
            setResult(event.result);
            setAppState("done");
          }
        }
      }

      // Stream ended without a done or error event — network failure mid-stream
      if (!pipelineCompleted) {
        setError("The connection was interrupted. Please check your network and try again.");
        setIsRetryable(true);
        setAppState("idle");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong — please try again");
      setIsRetryable(false);
      setAppState("idle");
    }
  }

  function handleReset() {
    setAppState("idle");
    setResult(null);
    setError(null);
    setIsRetryable(false);
    lastVerifyParams.current = null;
  }

  function handleRetry() {
    const params = lastVerifyParams.current;
    if (params) handleVerify(params.idFile, params.poaFile, params.scenario);
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
        {appState === "done" && result ? (
          <VerificationResult result={result} onReset={handleReset} />
        ) : appState === "verifying" ? (
          <LoadingStages current={loadingStage} />
        ) : error ? (
          <div className="bg-white rounded-2xl border border-red-200 p-6 sm:p-8 shadow-sm">
            <div className="flex items-start gap-3 mb-6">
              <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 mb-1">Verification failed</p>
                <p className="text-sm text-gray-600 leading-relaxed">{error}</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              {isRetryable && (
                <button
                  onClick={handleRetry}
                  className="flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold py-2.5 px-5 rounded-xl transition-colors text-sm"
                >
                  <RotateCcw className="w-4 h-4" />
                  Try again
                </button>
              )}
              <button
                onClick={handleReset}
                className="flex items-center justify-center gap-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-semibold py-2.5 px-5 rounded-xl transition-colors text-sm"
              >
                Start over
              </button>
            </div>
          </div>
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
