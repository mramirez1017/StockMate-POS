import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  compact?: boolean;
}

/** Page chrome — title lives in the app top bar; this block is description + actions only. */
export default function PageHeader({ title, description, actions, compact }: PageHeaderProps) {
  const hasBody = description || actions;

  if (!hasBody) {
    return <span className="sr-only">{title}</span>;
  }

  return (
    <div
      className={`page-header flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 ${
        compact ? "mb-3 sm:mb-4" : "mb-4 sm:mb-6"
      }`}
    >
      <span className="sr-only">{title}</span>
      {description ? (
        <p className="min-w-0 flex-1 text-sm leading-relaxed text-slate-600 sm:max-w-3xl sm:text-base">
          {description}
        </p>
      ) : (
        <div className="flex-1" />
      )}
      {actions && (
        <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto sm:justify-end [&_.btn-primary]:min-w-0 [&_.btn-primary]:flex-1 [&_.btn-primary]:sm:flex-none [&_.btn-secondary]:min-w-0 [&_.btn-secondary]:flex-1 [&_.btn-secondary]:sm:flex-none">
          {actions}
        </div>
      )}
    </div>
  );
}
