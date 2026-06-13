import { Link } from "react-router-dom";
import { LucideIcon } from "lucide-react";

interface QuickActionTileProps {
  to: string;
  icon: LucideIcon;
  title: string;
  description: string;
  iconClass: string;
}

export default function QuickActionTile({
  to,
  icon: Icon,
  title,
  description,
  iconClass,
}: QuickActionTileProps) {
  return (
    <Link
      to={to}
      className="quick-action-tile group"
    >
      <div className={`quick-action-icon ${iconClass}`}>
        <Icon size={22} strokeWidth={1.75} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-snug text-slate-900 group-hover:text-brand-700 sm:text-base">{title}</p>
        <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500 sm:text-xs">{description}</p>
      </div>
    </Link>
  );
}
