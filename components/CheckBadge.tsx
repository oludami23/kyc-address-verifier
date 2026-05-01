import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import type { CheckStatus } from "@/lib/types";

interface Props {
  name: string;
  status: CheckStatus;
  detail: string;
}

const CONFIG = {
  PASS: {
    Icon: CheckCircle2,
    iconColor: "text-green-600",
    bg: "bg-green-50",
    border: "border-green-200",
    badgeColor: "text-green-700 bg-green-100",
    label: "PASS",
  },
  WARN: {
    Icon: AlertCircle,
    iconColor: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
    badgeColor: "text-amber-700 bg-amber-100",
    label: "WARN",
  },
  FAIL: {
    Icon: XCircle,
    iconColor: "text-red-600",
    bg: "bg-red-50",
    border: "border-red-200",
    badgeColor: "text-red-700 bg-red-100",
    label: "FAIL",
  },
} as const;

export function CheckBadge({ name, status, detail }: Props) {
  const { Icon, iconColor, bg, border, badgeColor, label } = CONFIG[status];

  return (
    <div className={`flex items-start gap-3 p-4 rounded-lg border ${bg} ${border}`}>
      <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${iconColor}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium text-gray-900">{name}</span>
          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${badgeColor}`}>
            {label}
          </span>
        </div>
        <p className="text-sm text-gray-600 leading-snug">{detail}</p>
      </div>
    </div>
  );
}
