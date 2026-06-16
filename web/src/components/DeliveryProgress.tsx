import { Check, ClipboardList, ShoppingCart, Truck, PackageCheck, BadgeCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { POStatus } from "@stockmate/types";

interface DeliveryProgressProps {
  status: POStatus;
  /** Show the leading "Requested" milestone for request-originated orders. */
  fromRequest?: boolean;
}

const MILESTONES: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "ordered", label: "Ordered", icon: ShoppingCart },
  { key: "transit", label: "In Transit", icon: Truck },
  { key: "received", label: "Delivered", icon: PackageCheck },
  { key: "completed", label: "Completed", icon: BadgeCheck },
];

function currentIndex(status: POStatus): number {
  if (status === "COMPLETED") return 3;
  if (status === "RECEIVED" || status === "PARTIALLY_RECEIVED") return 2;
  if (status === "IN_TRANSIT") return 1;
  return 0; // DRAFT / ORDERED
}

export default function DeliveryProgress({ status, fromRequest }: DeliveryProgressProps) {
  if (status === "CANCELLED") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
        This purchase order was cancelled.
      </div>
    );
  }

  const milestones = fromRequest
    ? [{ key: "requested", label: "Requested", icon: ClipboardList }, ...MILESTONES]
    : MILESTONES;
  // When a request milestone is prepended, every PO milestone shifts one step right.
  const active = currentIndex(status) + (fromRequest ? 1 : 0);

  return (
    <div className="flex items-center">
      {milestones.map((m, idx) => {
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
            {idx < milestones.length - 1 && (
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
