"use client";

import { useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
  RotateCcw,
} from "lucide-react";
import { CheckBadge } from "@/components/CheckBadge";
import type { VerificationResult as VResult } from "@/lib/types";

interface Props {
  result: VResult;
  onReset: () => void;
}

const DECISION_CONFIG = {
  VERIFIED: {
    Icon: CheckCircle2,
    textColor: "text-green-700",
    bg: "bg-green-50",
    border: "border-green-200",
    label: "VERIFIED",
  },
  REVIEW_REQUIRED: {
    Icon: AlertTriangle,
    textColor: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    label: "REVIEW REQUIRED",
  },
  REJECTED: {
    Icon: XCircle,
    textColor: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
    label: "REJECTED",
  },
} as const;

export function VerificationResult({ result, onReset }: Props) {
  const [showExtracted, setShowExtracted] = useState(false);
  const { Icon, textColor, bg, border, label } = DECISION_CONFIG[result.decision];

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm space-y-7">
      {/* Decision badge */}
      <div className={`flex items-center gap-4 p-5 rounded-xl border ${bg} ${border}`}>
        <Icon className={`w-9 h-9 flex-shrink-0 ${textColor}`} />
        <div>
          <p className={`text-2xl font-bold tracking-wide ${textColor}`}>{label}</p>
          <p className="text-sm text-gray-500 mt-0.5">
            Confidence: {Math.round(result.confidence * 100)}%
          </p>
        </div>
      </div>

      {/* AI reasoning */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
          AI Reasoning
        </p>
        <p className="text-gray-700 leading-relaxed">{result.reasoning}</p>
      </div>

      {/* Recommended action callout */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-blue-500 uppercase tracking-widest mb-1">
          Recommended action
        </p>
        <p className="text-blue-900 font-medium">{result.recommended_action}</p>
      </div>

      {/* Checks */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
          Verification checks
        </p>
        <div className="space-y-2">
          {result.checks.map((check) => (
            <CheckBadge
              key={check.name}
              name={check.name}
              status={check.status}
              detail={check.detail}
            />
          ))}
        </div>
      </div>

      {/* Extracted data (collapsible) */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowExtracted((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-600 transition-colors"
        >
          <span>Extracted document data</span>
          {showExtracted ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </button>

        {showExtracted && (
          <div className="p-5 grid grid-cols-2 gap-5 bg-white">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
                Identity Document
              </p>
              <pre className="text-xs bg-gray-50 rounded-lg p-3 overflow-auto text-gray-700 leading-relaxed">
                {JSON.stringify(result.id_document, null, 2)}
              </pre>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
                Proof of Address
              </p>
              <pre className="text-xs bg-gray-50 rounded-lg p-3 overflow-auto text-gray-700 leading-relaxed">
                {JSON.stringify(result.proof_of_address, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* Reset */}
      <button
        onClick={onReset}
        className="flex items-center gap-2 text-gray-400 hover:text-gray-700 text-sm font-medium transition-colors"
      >
        <RotateCcw className="w-4 h-4" />
        Run another verification
      </button>
    </div>
  );
}
