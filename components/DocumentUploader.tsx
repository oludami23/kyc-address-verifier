"use client";

import { useState, useRef, DragEvent, ChangeEvent } from "react";
import { Upload, FileText, X, Loader2 } from "lucide-react";

export type DemoScenario = "verified" | "review" | "reject";

interface UploaderProps {
  onVerify: (idFile: File | null, poaFile: File | null) => void;
  onDemoScenario: (scenario: DemoScenario) => void;
  isVerifying: boolean;
}

interface SlotProps {
  label: string;
  sublabel: string;
  file: File | null;
  onFile: (file: File) => void;
  onClear: () => void;
}

function UploadSlot({ label, sublabel, file, onFile, onClear }: SlotProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) onFile(dropped);
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) onFile(selected);
  }

  return (
    <div className="flex-1">
      <p className="text-sm font-semibold text-gray-700 mb-0.5">{label}</p>
      <p className="text-xs text-gray-400 mb-3">{sublabel}</p>

      {file ? (
        <div className="border border-green-200 bg-green-50 rounded-xl p-4 flex items-center gap-3">
          <FileText className="w-8 h-8 text-green-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
            <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(0)} KB</p>
          </div>
          <button
            onClick={onClear}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded"
            aria-label="Remove file"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors select-none ${
            isDragging
              ? "border-blue-400 bg-blue-50"
              : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
          }`}
        >
          <Upload className="w-7 h-7 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Drop file here or click to upload</p>
          <p className="text-xs text-gray-400 mt-1">JPG, PNG, or PDF</p>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,.pdf"
            onChange={handleChange}
            className="hidden"
          />
        </div>
      )}
    </div>
  );
}

const DEMO_SCENARIOS: {
  scenario: DemoScenario;
  label: string;
  description: string;
  buttonClass: string;
}[] = [
  {
    scenario: "verified",
    label: "Try: Verified",
    description: "Clean match, recent bill, high confidence",
    buttonClass:
      "border border-green-200 bg-green-50 hover:bg-green-100 text-green-800",
  },
  {
    scenario: "review",
    label: "Try: Review required",
    description: "Partial name match, 110-day-old bill",
    buttonClass:
      "border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800",
  },
  {
    scenario: "reject",
    label: "Try: Rejected",
    description: "Name mismatch, expired document",
    buttonClass:
      "border border-red-200 bg-red-50 hover:bg-red-100 text-red-800",
  },
];

export function DocumentUploader({ onVerify, onDemoScenario, isVerifying }: UploaderProps) {
  const [idFile, setIdFile] = useState<File | null>(null);
  const [poaFile, setPoaFile] = useState<File | null>(null);

  const canVerify = idFile !== null && poaFile !== null;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
      <div className="flex gap-8 mb-8">
        <UploadSlot
          label="Identity Document"
          sublabel="Nigerian NIN slip or driver's license"
          file={idFile}
          onFile={setIdFile}
          onClear={() => setIdFile(null)}
        />
        <div className="w-px bg-gray-100 self-stretch" />
        <UploadSlot
          label="Proof of Address"
          sublabel="Utility bill (PHCN, IKEDC, DSTV) or bank statement"
          file={poaFile}
          onFile={setPoaFile}
          onClear={() => setPoaFile(null)}
        />
      </div>

      {/* Primary action */}
      <button
        onClick={() => onVerify(idFile, poaFile)}
        disabled={!canVerify || isVerifying}
        className="w-full flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold py-3 px-6 rounded-xl transition-colors disabled:cursor-not-allowed mb-6"
      >
        {isVerifying ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Verifying…
          </>
        ) : (
          "Run verification"
        )}
      </button>

      {/* Demo scenario buttons */}
      <div className="border-t border-gray-100 pt-5">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-3">
          Or try a demo scenario
        </p>
        <div className="grid grid-cols-3 gap-3">
          {DEMO_SCENARIOS.map(({ scenario, label, description, buttonClass }) => (
            <button
              key={scenario}
              onClick={() => onDemoScenario(scenario)}
              disabled={isVerifying}
              className={`text-left p-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${buttonClass}`}
            >
              <p className="text-xs font-semibold leading-snug">{label}</p>
              <p className="text-xs opacity-70 mt-0.5 leading-snug">{description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
