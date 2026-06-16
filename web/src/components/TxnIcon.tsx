import type { LucideIcon } from "lucide-react";
import { txnVisual, type TxnKind, type Visual } from "@/lib/transactionVisuals";

type Size = "sm" | "md" | "lg";

const BOX: Record<Size, string> = {
  sm: "h-8 w-8 rounded-lg",
  md: "h-10 w-10 rounded-xl",
  lg: "h-12 w-12 rounded-2xl",
};

const GLYPH: Record<Size, number> = { sm: 16, md: 20, lg: 24 };

interface TxnIconProps {
  /** Standard transaction/entity kind from the visual registry. */
  kind?: TxnKind;
  /** Or provide a pre-resolved visual. */
  visual?: Visual;
  size?: Size;
  /** Use the gradient (solid colored) treatment instead of the soft tint. */
  solid?: boolean;
  className?: string;
}

/**
 * Standardized icon tile for a transaction / entity. Use everywhere a concept
 * needs a glyph so the icon language is identical across the whole app.
 */
export default function TxnIcon({ kind, visual, size = "md", solid = false, className = "" }: TxnIconProps) {
  const v = visual ?? txnVisual(kind);
  const Icon: LucideIcon = v.icon;
  const skin = solid ? `${v.gradient} text-white shadow-glow-sm` : v.tint;
  return (
    <span className={`inline-flex shrink-0 items-center justify-center ${BOX[size]} ${skin} ${className}`}>
      <Icon size={GLYPH[size]} strokeWidth={1.85} />
    </span>
  );
}

interface TxnBadgeProps {
  kind?: TxnKind;
  visual?: Visual;
  /** Override the registry label. */
  label?: string;
  className?: string;
}

/** Small pill (icon + label) for tagging a transaction type inline. */
export function TxnBadge({ kind, visual, label, className = "" }: TxnBadgeProps) {
  const v = visual ?? txnVisual(kind);
  const Icon = v.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${v.tint} ${className}`}
    >
      <Icon size={13} strokeWidth={2} />
      {label ?? v.label}
    </span>
  );
}
