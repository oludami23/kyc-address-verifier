"use client";

import { useState, useRef, DragEvent, ChangeEvent } from "react";
import { Upload, FileText, X, Loader2 } from "lucide-react";

interface UploaderProps {
  onVerify: (idFile: File | null, poaFile: File | null) => void;
  onSample: () => void;
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

export function DocumentUploader({ onVerify, onSample, isVerifying }: UploaderProps) {
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

      <div className="flex items-center gap-4">
        <button
          onClick={() => onVerify(idFile, poaFile)}
          disabled={!canVerify || isVerifying}
          className="flex-1 flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold py-3 px-6 rounded-xl transition-colors disabled:cursor-not-allowed"
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

        <span className="text-gray-300 text-sm font-medium">or</span>

        <button
          onClick={onSample}
          disabled={isVerifying}
          className="border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-600 font-medium py-3 px-5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          Try with sample documents
        </button>
      </div>

      {!canVerify && !isVerifying && (
        <p className="text-xs text-gray-400 mt-3 text-center">
          Upload both documents to run a real verification, or try the sample to see how it works.
        </p>
      )}
    </div>
  );
}
