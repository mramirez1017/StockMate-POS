import { ReactNode, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import TableScroll from "@/components/TableScroll";
import Pagination from "@/components/Pagination";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  hideOnMobile?: boolean;
  sortable?: boolean;
  sortValue?: (row: T) => string | number | null | undefined;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyField: keyof T;
  emptyMessage?: string;
  maxHeight?: string;
  defaultSortKey?: string;
  defaultSortDir?: "asc" | "desc";
  /** Rows per page. Set to 0 to disable pagination (show all rows). Default 25. */
  pageSize?: number;
}

function resolveSortValue<T>(row: T, col: Column<T>): string | number {
  if (col.sortValue) {
    const v = col.sortValue(row);
    if (typeof v === "number") return v;
    return (v ?? "").toString().toLowerCase();
  }
  const raw = (row as Record<string, unknown>)[col.key];
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") return raw.toLowerCase();
  return "";
}

function compareSortValues(a: string | number, b: string | number, dir: "asc" | "desc"): number {
  const mult = dir === "asc" ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * mult;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" }) * mult;
}

export default function DataTable<T>({
  columns,
  data,
  keyField,
  emptyMessage = "No data",
  maxHeight,
  defaultSortKey,
  defaultSortDir = "asc",
  pageSize = 25,
}: DataTableProps<T>) {
  const firstSortable = columns.find((c) => c.sortable !== false && c.header);
  const [sortKey, setSortKey] = useState(defaultSortKey ?? firstSortable?.key ?? "");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultSortDir);
  const [page, setPage] = useState(1);

  const sortedData = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col || col.sortable === false) return data;
    return [...data].sort((a, b) =>
      compareSortValues(resolveSortValue(a, col), resolveSortValue(b, col), sortDir),
    );
  }, [columns, data, sortDir, sortKey]);

  const paginate = pageSize > 0;
  const pageCount = paginate ? Math.max(1, Math.ceil(sortedData.length / pageSize)) : 1;

  // Keep the current page valid as data/filters/sorting change.
  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);
  useEffect(() => {
    setPage(1);
  }, [sortKey, sortDir]);

  const pageData = useMemo(() => {
    if (!paginate) return sortedData;
    const start = (page - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, paginate, page, pageSize]);

  const toggleSort = (col: Column<T>) => {
    if (col.sortable === false || !col.header) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col.key);
      setSortDir("asc");
    }
  };

  if (data.length === 0) {
    return <div className="card py-12 text-center text-slate-500">{emptyMessage}</div>;
  }

  const mobileColumns = columns.filter((col) => !col.hideOnMobile);
  const primaryColumn = mobileColumns[0];
  const detailColumns = mobileColumns.slice(1);

  const SortIcon = ({ col }: { col: Column<T> }) => {
    if (col.sortable === false || !col.header) return null;
    if (sortKey !== col.key) {
      return <ArrowUpDown size={14} className="shrink-0 text-slate-300" aria-hidden />;
    }
    return sortDir === "asc" ? (
      <ArrowUp size={14} className="shrink-0 text-brand-600" aria-hidden />
    ) : (
      <ArrowDown size={14} className="shrink-0 text-brand-600" aria-hidden />
    );
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="divide-y divide-slate-100 md:hidden">
        {pageData.map((row) => (
          <div key={String(row[keyField])} className="px-4 py-3.5 active:bg-slate-50/80">
            {primaryColumn && (
              <div className="mb-2 font-medium text-slate-900">{primaryColumn.render(row)}</div>
            )}
            {detailColumns.length > 0 && (
              <dl className="space-y-1.5">
                {detailColumns.map((col) => (
                  <div key={col.key} className="flex items-start justify-between gap-3 text-sm">
                    {col.header ? <dt className="shrink-0 text-slate-500">{col.header}</dt> : null}
                    <dd className={`text-right text-slate-700 ${col.header ? "min-w-0" : "w-full"}`}>
                      {col.render(row)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        ))}
      </div>

      <div className="hidden md:block">
        <TableScroll maxHeight={maxHeight}>
          <table className="w-full min-w-[640px] text-sm">
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
              <tr>
                {columns.map((col) => {
                  const sortable = col.sortable !== false && !!col.header;
                  return (
                    <th
                      key={col.key}
                      className={`whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 ${col.className ?? ""}`}
                    >
                      {sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(col)}
                          className="inline-flex items-center gap-1.5 hover:text-slate-800"
                        >
                          {col.header}
                          <SortIcon col={col} />
                        </button>
                      ) : (
                        col.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {pageData.map((row) => (
                <tr key={String(row[keyField])} className="transition-colors hover:bg-slate-50/80">
                  {columns.map((col) => (
                    <td key={col.key} className={`px-4 py-3.5 text-slate-700 ${col.className ?? ""}`}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </div>

      {paginate && (
        <Pagination
          page={page}
          pageCount={pageCount}
          total={sortedData.length}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
