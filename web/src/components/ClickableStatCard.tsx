import { LucideIcon, ChevronRight } from "lucide-react";

interface ClickableStatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  subtitle?: string;
  variant?: "gold" | "green" | "red" | "amber" | "navy";
  onClick: () => void;
}

const variants = {
  gold: { icon: "bg-brand-50 text-brand-600", value: "text-slate-900" },
  green: { icon: "bg-emerald-50 text-emerald-600", value: "text-emerald-700" },
  red: { icon: "bg-red-50 text-red-600", value: "text-red-600" },
  amber: { icon: "bg-amber-50 text-amber-600", value: "text-amber-700" },
  navy: { icon: "bg-slate-100 text-slate-600", value: "text-slate-900" },
};

export default function ClickableStatCard({
  title,
  value,
  icon: Icon,
  subtitle,
  variant = "navy",
  onClick,
}: ClickableStatCardProps) {
  const v = variants[variant];

  return (
    <button type="button" onClick={onClick} className="kpi-card group w-full cursor-pointer text-left">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className={`mt-2 text-2xl font-bold tracking-tight sm:text-3xl ${v.value}`}>{value}</p>
          {subtitle && <p className="mt-1 text-xs text-slate-400">{subtitle}</p>}
        </div>
        <div className={`rounded-xl p-3 ${v.icon}`}>
          <Icon size={22} strokeWidth={1.75} />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-1 text-xs font-medium text-slate-400 transition group-hover:text-brand-600">
        <span>View details</span>
        <ChevronRight size={14} className="transition group-hover:translate-x-0.5" />
      </div>
    </button>
  );
}
