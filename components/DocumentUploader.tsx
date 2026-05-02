"use client";

import { useState, useRef, DragEvent, ChangeEvent } from "react";
import { Upload, FileText, X, AlertCircle } from "lucide-react";

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
  validationError: string | null;
  onFile: (file: File) => void;
  onClear: () => void;
}

// ---------------------------------------------------------------------------
// File validation — runs client-side on selection, before any upload.
// Returns a human-readable error string, or null if the file is acceptable.
// ---------------------------------------------------------------------------

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const SUPPORTED_MIME_TYPES = new Set(["image/jpeg", "image/png"]);

function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `This file is ${mb} MB. Please upload an image under 10 MB.`;
  }

  if (!SUPPORTED_MIME_TYPES.has(file.type)) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

    if (file.type === "image/heic" || ext === "heic" || ext === "heif") {
      return "HEIC photos can't be read directly. On iPhone, go to Settings → Camera → Formats → Most Compatible, then retake the photo as a JPG.";
    }
    if (file.type === "image/webp" || ext === "webp") {
      return "WebP files are not supported. Please save the image as a JPG or PNG and try again.";
    }
    if (file.type === "application/pdf" || ext === "pdf") {
      return "PDF uploads are not yet supported. Please upload a JPG or PNG photo of the document instead.";
    }

    const format = file.type || `.${ext}`;
    return `${format} files are not supported. Please upload a JPG or PNG image.`;
  }

  return null;
}

// ---------------------------------------------------------------------------

function UploadSlot({ label, sublabel, file, validationError, onFile, onClear }: SlotProps) {
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
    // Reset the input so the same file can be re-selected after clearing
    e.target.value = "";
  }

  const hasError = validationError !== null;

  return (
    <div className="flex-1 min-w-0">
      <p className="text-sm font-semibold text-gray-700 mb-0.5">{label}</p>
      <p className="text-xs text-gray-400 mb-3">{sublabel}</p>

      {file && !hasError ? (
        <div className="border border-green-200 bg-green-50 rounded-xl p-4 flex items-center gap-3">
          <FileText className="w-8 h-8 text-green-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
            <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(0)} KB</p>
          </div>
          <button
            onClick={onClear}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded flex-shrink-0"
            aria-label="Remove file"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          <div
            onClick={() => inputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            className={`border-2 border-dashed rounded-xl p-8 sm:p-10 text-center cursor-pointer transition-colors select-none ${
              hasError
                ? "border-red-200 bg-red-50"
                : isDragging
                ? "border-blue-400 bg-blue-50"
                : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            {hasError ? (
              <AlertCircle className="w-7 h-7 text-red-400 mx-auto mb-2" />
            ) : (
              <Upload className="w-7 h-7 text-gray-300 mx-auto mb-2" />
            )}
            <p className="text-sm text-gray-500">Drop file here or click to upload</p>
            <p className="text-xs text-gray-400 mt-1">JPG or PNG, max 10 MB</p>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png"
              onChange={handleChange}
              className="hidden"
            />
          </div>

          {hasError && (
            <div className="mt-2 flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-600 leading-snug">{validationError}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

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
    buttonClass: "border border-green-200 bg-green-50 hover:bg-green-100 text-green-800",
  },
  {
    scenario: "review",
    label: "Try: Review required",
    description: "Partial name match, 110-day-old bill",
    buttonClass: "border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800",
  },
  {
    scenario: "reject",
    label: "Try: Rejected",
    description: "Name mismatch, expired document",
    buttonClass: "border border-red-200 bg-red-50 hover:bg-red-100 text-red-800",
  },
];

export function DocumentUploader({ onVerify, onDemoScenario, isVerifying }: UploaderProps) {
  const [idFile, setIdFile] = useState<File | null>(null);
  const [poaFile, setPoaFile] = useState<File | null>(null);
  const [idError, setIdError] = useState<string | null>(null);
  const [poaError, setPoaError] = useState<string | null>(null);

  function handleIdFile(file: File) {
    const err = validateFile(file);
    setIdError(err);
    setIdFile(err ? null : file);
  }

  function handlePoaFile(file: File) {
    const err = validateFile(file);
    setPoaError(err);
    setPoaFile(err ? null : file);
  }

  const hasValidationErrors = idError !== null || poaError !== null;
  const canVerify = idFile !== null && poaFile !== null && !hasValidationErrors;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-sm">
      {/* Upload slots */}
      <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 mb-8">
        <UploadSlot
          label="Identity Document"
          sublabel="Nigerian NIN slip or driver's license"
          file={idFile}
          validationError={idError}
          onFile={handleIdFile}
          onClear={() => { setIdFile(null); setIdError(null); }}
        />
        <div className="hidden sm:block w-px bg-gray-100 self-stretch" />
        <div className="block sm:hidden h-px w-full bg-gray-100" />
        <UploadSlot
          label="Proof of Address"
          sublabel="Utility bill (PHCN, IKEDC, DSTV) or bank statement"
          file={poaFile}
          validationError={poaError}
          onFile={handlePoaFile}
          onClear={() => { setPoaFile(null); setPoaError(null); }}
        />
      </div>

      {/* Primary action */}
      <button
        onClick={() => onVerify(idFile, poaFile)}
        disabled={!canVerify || isVerifying}
        className="w-full flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold py-3 px-6 rounded-xl transition-colors disabled:cursor-not-allowed mb-6"
      >
        Run verification
      </button>

      {/* Demo scenario buttons */}
      <div className="border-t border-gray-100 pt-5">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-3">
          Or try a demo scenario
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
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
