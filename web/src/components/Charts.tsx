import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

/**
 * Standardized data-visualization kit. Every progress bar / bar graph / pie
 * graph in the app should come from here so they share one visual language
 * (matching the brand infographic style).
 */

export type Tone = "brand" | "ok" | "warn" | "danger" | "info" | "neutral";

const TONE_BAR: Record<Tone, string> = {
  brand: "bg-gradient-to-r from-emerald-500 to-accent-500",
  ok: "bg-gradient-to-r from-emerald-500 to-emerald-400",
  warn: "bg-gradient-to-r from-amber-500 to-amber-400",
  danger: "bg-gradient-to-r from-rose-500 to-red-500",
  info: "bg-gradient-to-r from-sky-500 to-indigo-500",
  neutral: "bg-gradient-to-r from-slate-400 to-slate-500",
};

const TONE_DOT: Record<Tone, string> = {
  brand: "bg-emerald-500",
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  danger: "bg-rose-500",
  info: "bg-sky-500",
  neutral: "bg-slate-400",
};

const TONE_TEXT: Record<Tone, string> = {
  brand: "text-emerald-600",
  ok: "text-emerald-600",
  warn: "text-amber-600",
  danger: "text-rose-600",
  info: "text-sky-600",
  neutral: "text-slate-500",
};

interface ProgressBarProps {
  value: number;
  max?: number;
  tone?: Tone;
  /** Bar thickness. */
  size?: "sm" | "md" | "lg";
  className?: string;
}

/** Slim animated progress bar. */
export function ProgressBar({ value, max = 100, tone = "brand", size = "md", className = "" }: ProgressBarProps) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const h = size === "sm" ? "h-1.5" : size === "lg" ? "h-3" : "h-2";
  return (
    <div className={`w-full overflow-hidden rounded-full bg-slate-100 ${h} ${className}`}>
      <div
        className={`${h} rounded-full transition-all duration-700 ease-out ${TONE_BAR[tone]}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

interface StockLevelBarProps {
  label: string;
  value: number | string;
  /** 0..1 fill ratio (defaults full when omitted). */
  ratio?: number;
  tone?: Tone;
}

/**
 * Labelled level row with a colored count + progress bar — mirrors the
 * "In Stock / Low Stock / Out of Stock" rows in the brand infographic.
 */
export function StockLevelBar({ label, value, ratio = 1, tone = "ok" }: StockLevelBarProps) {
  return (
    <div className="flex items-center gap-3">
      <span className={`h-2 w-2 shrink-0 rounded-full ${TONE_DOT[tone]}`} />
      <span className="w-24 shrink-0 text-sm text-slate-600">{label}</span>
      <ProgressBar value={ratio * 100} tone={tone} className="flex-1" />
      <span className={`w-12 shrink-0 text-right text-sm font-bold ${TONE_TEXT[tone]}`}>{value}</span>
    </div>
  );
}

export interface DonutSlice {
  name: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  data: DonutSlice[];
  /** Big number shown in the middle. */
  centerLabel?: string | number;
  centerCaption?: string;
  height?: number;
  showLegend?: boolean;
}

/** Standardized donut/pie chart. */
export function DonutChart({ data, centerLabel, centerCaption, height = 200, showLegend = true }: DonutChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-slate-400" style={{ height }}>
        No data to display
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius="58%" outerRadius="82%" paddingAngle={2} dataKey="value">
          {data.map((d, i) => (
            <Cell key={i} fill={d.color} stroke="#fff" strokeWidth={2} />
          ))}
        </Pie>
        {centerLabel != null && (
          <text x="50%" y={showLegend ? "42%" : "47%"} textAnchor="middle" dominantBaseline="middle" className="fill-slate-900 text-xl font-extrabold">
            {centerLabel}
          </text>
        )}
        {centerCaption && (
          <text x="50%" y={showLegend ? "53%" : "58%"} textAnchor="middle" dominantBaseline="middle" className="fill-slate-400 text-[10px]">
            {centerCaption}
          </text>
        )}
        {showLegend && <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />}
        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

interface MiniBarChartProps {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
  /** Formatter for the Y axis + tooltip. */
  format?: (v: number) => string;
}

/** Standardized bar chart. */
export function MiniBarChart({ data, color = "#059669", height = 200, format }: MiniBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.95} />
            <stop offset="100%" stopColor={color} stopOpacity={0.55} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={format ? (v) => format(Number(v)) : undefined}
          width={format ? 56 : 32}
        />
        <Tooltip
          cursor={{ fill: "rgba(16,185,129,0.06)" }}
          formatter={(v: number) => [format ? format(v) : v, "Value"]}
          contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
        />
        <Bar dataKey="value" fill="url(#barFill)" radius={[6, 6, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}
