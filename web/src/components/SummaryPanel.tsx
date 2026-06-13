interface SummaryItem {
  label: string;
  value: string;
  onClick?: () => void;
}

interface SummaryPanelProps {
  title: string;
  items: [SummaryItem, SummaryItem];
}

export default function SummaryPanel({ title, items }: SummaryPanelProps) {
  return (
    <div className="summary-panel">
      <h3 className="panel-title">{title}</h3>
      <div className="grid grid-cols-2 gap-4">
        {items.map((item) => {
          const inner = (
            <>
              <p className="mini-stat-label">{item.label}</p>
              <p className="mini-stat-value">{item.value}</p>
            </>
          );
          if (item.onClick) {
            return (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                className="mini-stat-btn text-left"
              >
                {inner}
              </button>
            );
          }
          return (
            <div key={item.label} className="mini-stat-btn">
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
