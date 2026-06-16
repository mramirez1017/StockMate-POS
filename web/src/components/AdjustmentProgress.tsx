import { Check, ClipboardList, UserCheck, PackageCheck, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AdjustmentStatus } from "@stockmate/types";

interface AdjustmentProgressProps {
  status: AdjustmentStatus;
}

const MILESTONES: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "requested", label: "Requested", icon: ClipboardList },
  { key: "reviewed", label: "Reviewed", icon: UserCheck },
  { key: "applied", label: "Applied", icon: PackageCheck },
];

function currentIndex(status: AdjustmentStatus): number {
  if (status === "APPROVED") return 2;
  return 0; // PENDING
}

export default function AdjustmentProgress({ status }: AdjustmentProgressProps) {
  if (status === "REJECTED") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
        <XCircle size={16} />
        Request reviewed and rejected — no stock change applied.
      </div>
    );
  }

  const active = currentIndex(status);

  return (
    <div className="flex items-center">
      {MILESTONES.map((m, idx) => {
        const done = idx < active;
        const isCurrent = idx === active;
        const Icon = m.icon;
        return (
          <div key={m.key} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all duration-500 ${
                  done
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : isCurrent
                      ? "scale-110 border-brand-600 bg-brand-gradient text-white shadow-[0_0_0_5px_rgba(16,185,129,0.18)]"
                      : "border-slate-300 bg-white text-slate-400"
                }`}
              >
                {done ? <Check size={17} /> : <Icon size={16} className={isCurrent ? "animate-pulse" : ""} />}
              </div>
              <span
                className={`mt-1.5 text-[11px] font-semibold ${
                  done ? "text-emerald-700" : isCurrent ? "text-brand-700" : "text-slate-400"
                }`}
              >
                {m.label}
              </span>
            </div>
            {idx < MILESTONES.length - 1 && (
              <div className="mx-1 mb-5 h-1 flex-1 overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full rounded-full bg-gradient-to-r from-emerald-500 to-accent-500 transition-all duration-700 ${
                    done ? "w-full" : "w-0"
                  }`}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
