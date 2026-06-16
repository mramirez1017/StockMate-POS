export interface DateRange {
  /** YYYY-MM-DD, "" means open-ended */
  from: string;
  to: string;
}

export const EMPTY_RANGE: DateRange = { from: "", to: "" };

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const PRESETS: { key: string; label: string; build: () => DateRange }[] = [
  {
    key: "today",
    label: "Today",
    build: () => {
      const t = ymd(new Date());
      return { from: t, to: t };
    },
  },
  {
    key: "7d",
    label: "7 days",
    build: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 6);
      return { from: ymd(start), to: ymd(end) };
    },
  },
  {
    key: "30d",
    label: "30 days",
    build: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 29);
      return { from: ymd(start), to: ymd(end) };
    },
  },
  {
    key: "month",
    label: "This month",
    build: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: ymd(start), to: ymd(now) };
    },
  },
  { key: "all", label: "All time", build: () => ({ from: "", to: "" }) },
];

function activePreset(value: DateRange): string {
  for (const p of PRESETS) {
    const r = p.build();
    if (r.from === value.from && r.to === value.to) return p.key;
  }
  return "custom";
}

/** Convert a range to inclusive epoch millisecond bounds (null = unbounded). */
export function rangeToBounds(r: DateRange): { start: number | null; end: number | null } {
  return {
    start: r.from ? new Date(r.from).setHours(0, 0, 0, 0) : null,
    end: r.to ? new Date(r.to).setHours(23, 59, 59, 999) : null,
  };
}

export function isWithinRange(ts: number, r: DateRange): boolean {
  const { start, end } = rangeToBounds(r);
  if (start != null && ts < start) return false;
  if (end != null && ts > end) return false;
  return true;
}

export function rangeLabel(r: DateRange): string {
  const key = activePreset(r);
  const preset = PRESETS.find((p) => p.key === key);
  if (preset && key !== "custom") return preset.label;
  if (r.from && r.to) return `${r.from} → ${r.to}`;
  if (r.from) return `From ${r.from}`;
  if (r.to) return `Until ${r.to}`;
  return "All time";
}

interface DateRangeBarProps {
  value: DateRange;
  onChange: (next: DateRange) => void;
  className?: string;
}

export default function DateRangeBar({ value, onChange, className = "" }: DateRangeBarProps) {
  const active = activePreset(value);
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <div className="filter-bar-scroll">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onChange(p.build())}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              active === p.key
                ? "bg-brand-600 text-white shadow-glow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <input
          type="date"
          className="input-field min-w-0 flex-1 sm:w-auto sm:flex-none"
          value={value.from}
          max={value.to || undefined}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
          aria-label="From date"
        />
        <span className="shrink-0 text-sm text-slate-400">to</span>
        <input
          type="date"
          className="input-field min-w-0 flex-1 sm:w-auto sm:flex-none"
          value={value.to}
          min={value.from || undefined}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
          aria-label="To date"
        />
      </div>
    </div>
  );
}
