import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  color?: "blue" | "green" | "yellow" | "red";
}

const colors = {
  blue: "bg-sky-50 text-sky-600",
  green: "bg-emerald-50 text-emerald-600",
  yellow: "bg-amber-50 text-amber-600",
  red: "bg-red-50 text-red-600",
};

export default function StatCard({ title, value, icon: Icon, trend, color = "blue" }: StatCardProps) {
  return (
    <div className="kpi-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
          {trend && <p className="mt-1 text-xs text-slate-400">{trend}</p>}
        </div>
        <div className={`rounded-xl p-3 ${colors[color]}`}>
          <Icon size={22} strokeWidth={1.75} />
        </div>
      </div>
    </div>
  );
}
