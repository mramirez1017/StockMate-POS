import { LucideIcon } from "lucide-react";

interface DashboardStatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  iconBg: string;
  trend?: string;
  onClick?: () => void;
}

export default function DashboardStatCard({
  label,
  value,
  icon: Icon,
  iconBg,
  trend,
  onClick,
}: DashboardStatCardProps) {
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`dashboard-stat-card text-left ${onClick ? "cursor-pointer" : ""}`}
    >
      <div className={`dashboard-stat-icon ${iconBg}`}>
        <Icon size={20} strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="mt-0.5 truncate text-lg font-bold text-slate-900 sm:mt-1 sm:text-xl">{value}</p>
        {trend && <p className="mt-1 text-xs font-medium text-brand-600">{trend}</p>}
      </div>
    </Tag>
  );
}
