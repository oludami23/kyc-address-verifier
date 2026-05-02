import { CheckCircle2, Loader2 } from "lucide-react";

export type LoadingStage = "extracting" | "checking" | "reasoning";

const STAGES: { key: LoadingStage; label: string; sublabel: string }[] = [
  {
    key: "extracting",
    label: "Extracting documents",
    sublabel: "Reading identity and address document fields with Claude vision",
  },
  {
    key: "checking",
    label: "Running verification checks",
    sublabel: "Name match · address legibility · document recency · authenticity signals",
  },
  {
    key: "reasoning",
    label: "Generating compliance reasoning",
    sublabel: "Writing an auditable verdict and recommended action",
  },
];

export function LoadingStages({ current }: { current: LoadingStage }) {
  const currentIndex = STAGES.findIndex((s) => s.key === current);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-7">
        Verification in progress
      </p>

      <div className="space-y-6">
        {STAGES.map((stage, i) => {
          const isDone = i < currentIndex;
          const isActive = i === currentIndex;

          return (
            <div key={stage.key} className="flex items-start gap-4">
              {/* Status icon */}
              <div
                className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors duration-300 ${
                  isDone ? "bg-green-100" : isActive ? "bg-blue-100" : "bg-gray-100"
                }`}
              >
                {isDone ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                ) : isActive ? (
                  <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                ) : (
                  <div className="w-2 h-2 rounded-full bg-gray-300" />
                )}
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-medium leading-snug transition-colors duration-300 ${
                    isDone ? "text-gray-400" : isActive ? "text-gray-900" : "text-gray-300"
                  }`}
                >
                  {stage.label}
                </p>
                <p
                  className={`text-xs mt-0.5 leading-relaxed transition-colors duration-300 ${
                    isDone ? "text-gray-300" : isActive ? "text-gray-400" : "text-gray-200"
                  }`}
                >
                  {stage.sublabel}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
