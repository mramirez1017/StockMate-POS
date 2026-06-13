import { ReactNode } from "react";

interface TableScrollProps {
  children: ReactNode;
  className?: string;
  /** Tailwind max-height utility, e.g. max-h-[50vh] for modals */
  maxHeight?: string;
}

export default function TableScroll({
  children,
  className = "",
  maxHeight = "max-h-[min(70vh,560px)]",
}: TableScrollProps) {
  return (
    <div className={`table-scroll ${maxHeight} ${className}`.trim()}>
      {children}
    </div>
  );
}
