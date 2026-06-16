import { Flame } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { RankedItem } from "@/lib/salesAnalytics";

export function StatTile({
  icon: Icon,
  tint,
  label,
  value,
  sub,
  onClick,
}: {
  icon: LucideIcon;
  tint: string;
  label: string;
  value: string;
  sub?: string;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`flex items-start gap-2.5 rounded-xl border border-slate-200/80 bg-white p-3 text-left shadow-panel ${
        onClick ? "transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card" : ""
      }`}
    >
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tint}`}>
        <Icon size={18} strokeWidth={1.75} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="truncate text-lg font-bold text-slate-900">{value}</p>
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
      </div>
    </Tag>
  );
}

export function TopRankedTile({
  label,
  items,
  limit = 3,
}: {
  label: string;
  items: RankedItem[];
  limit?: number;
}) {
  const top = items.slice(0, limit);
  return (
    <div className="rounded-xl border border-amber-200/70 bg-amber-50/50 p-3">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <Flame size={16} />
        </div>
        <p className="text-xs font-medium text-amber-700">{label}</p>
      </div>
      {top.length === 0 ? (
        <p className="text-sm text-slate-400">No sales in range</p>
      ) : (
        <ol className="space-y-1.5">
          {top.map((it, i) => (
            <li key={it.id} className="flex items-center gap-2">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  i === 0 ? "bg-amber-500 text-white" : "bg-amber-100 text-amber-700"
                }`}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{it.name}</span>
              <span className="shrink-0 text-xs text-slate-500">{it.quantity} sold</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function InDemandTile({ label, item }: { label: string; item: RankedItem | null }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-200/70 bg-amber-50/50 p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
        <Flame size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-amber-700">{label}</p>
        {item ? (
          <>
            <p className="truncate font-semibold text-slate-900">{item.name}</p>
            <p className="text-xs text-slate-500">
              {item.quantity} sold · {formatCurrency(item.revenue)}
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-400">No sales in range</p>
        )}
      </div>
    </div>
  );
}
