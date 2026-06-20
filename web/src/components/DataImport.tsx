import { useEffect, useMemo, useRef, useState } from "react";
import { addDoc, collection, getDocs } from "firebase/firestore";
import { Download, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2, X } from "lucide-react";
import { db } from "@/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import {
  ImportType,
  IMPORT_LABELS,
  IMPORT_TEMPLATES,
  ImportRefData,
  ParseResult,
  downloadTemplate,
  parseImportFile,
} from "@/lib/dataImport";

const TYPES: ImportType[] = ["category", "supplier", "product"];

interface ImportSummary {
  created: number;
  failed: { rowNumber: number; message: string }[];
}

export default function DataImport() {
  const { storeId } = useAuth();
  const [type, setType] = useState<ImportType>("category");
  const [ref, setRef] = useState<ImportRefData | null>(null);
  const [loadingRef, setLoadingRef] = useState(true);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadRef = useMemo(
    () => async () => {
      if (!storeId) return;
      setLoadingRef(true);
      const [cats, sups, branches, products] = await Promise.all([
        getDocs(collection(db, "stores", storeId, "categories")),
        getDocs(collection(db, "stores", storeId, "suppliers")),
        getDocs(collection(db, "stores", storeId, "branches")),
        getDocs(collection(db, "stores", storeId, "products")),
      ]);
      const categories = cats.docs
        .filter((d) => d.data().status !== "ARCHIVED")
        .map((d) => ({ id: d.id, name: String(d.data().name ?? "") }));
      const suppliers = sups.docs
        .filter((d) => d.data().status !== "ARCHIVED")
        .map((d) => ({ id: d.id, name: String(d.data().name ?? "") }));
      const branchList = branches.docs
        .filter((d) => d.data().status === "ACTIVE")
        .map((d) => ({ id: d.id, name: String(d.data().name ?? "") }));
      const existingBarcodes = new Set<string>();
      const brandSet = new Set<string>();
      products.docs.forEach((d) => {
        const data = d.data();
        if (data.barcode) existingBarcodes.add(String(data.barcode));
        if (data.brand) brandSet.add(String(data.brand));
      });
      setRef({
        categories,
        suppliers,
        branches: branchList,
        brands: [...brandSet].sort((a, b) => a.localeCompare(b)),
        existingCategoryNames: new Set(categories.map((c) => c.name.toLowerCase())),
        existingSupplierNames: new Set(suppliers.map((s) => s.name.toLowerCase())),
        existingBarcodes,
      });
      setLoadingRef(false);
    },
    [storeId]
  );

  useEffect(() => {
    loadRef();
  }, [loadRef]);

  const reset = () => {
    setFileName(null);
    setResult(null);
    setParseError(null);
    setSummary(null);
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleTypeChange = (t: ImportType) => {
    setType(t);
    reset();
  };

  const handleDownload = async () => {
    if (!ref || generating) return;
    setGenerating(true);
    try {
      await downloadTemplate(type, ref);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Could not generate the template.");
    } finally {
      setGenerating(false);
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !ref) return;
    setParseError(null);
    setSummary(null);
    setFileName(file.name);
    try {
      const parsed = await parseImportFile(type, file, ref);
      if (parsed.rows.length === 0) {
        setParseError("No data rows found. Make sure you filled in the template below the header row.");
        setResult(null);
        return;
      }
      setResult(parsed);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Could not read this file. Use the downloaded .xlsx template.");
      setResult(null);
    }
  };

  const clean = (obj: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

  const handleImport = async () => {
    if (!result || !storeId || result.errorCount > 0) return;
    setImporting(true);
    setProgress(0);
    const failed: ImportSummary["failed"] = [];
    let created = 0;

    for (const row of result.rows) {
      if (!row.payload) continue;
      try {
        if (type === "category") {
          await addDoc(collection(db, "stores", storeId, "categories"), {
            ...clean(row.payload),
            storeId,
            status: "ACTIVE",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        } else if (type === "supplier") {
          await addDoc(collection(db, "stores", storeId, "suppliers"), {
            ...clean(row.payload),
            storeId,
            status: "ACTIVE",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        } else {
          await api.createProduct(clean(row.payload));
        }
        created++;
      } catch (err) {
        failed.push({ rowNumber: row.rowNumber, message: err instanceof Error ? err.message : "Failed to save" });
      }
      setProgress((p) => p + 1);
    }

    setImporting(false);
    setSummary({ created, failed });
    setResult(null);
    setFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    await loadRef();
  };

  const cols = IMPORT_TEMPLATES[type];
  const label = IMPORT_LABELS[type];
  const canImport = !!result && result.errorCount === 0 && !importing;

  return (
    <section>
      <h2 className="mb-1 font-semibold">Bulk import / migration</h2>
      <p className="mb-4 text-sm text-slate-600">
        Already running a business? Move your existing data in with a spreadsheet. Import{" "}
        <span className="font-medium">categories</span> and <span className="font-medium">suppliers</span> first, then{" "}
        <span className="font-medium">products</span> (so they can reference them).
      </p>

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[200px_1fr] sm:items-end">
          <div>
            <label className="mb-1 block text-sm font-medium">Data type</label>
            <select className="input-field" value={type} onChange={(e) => handleTypeChange(e.target.value as ImportType)}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {IMPORT_LABELS[t].plural}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loadingRef || !ref || generating}
              onClick={handleDownload}
              className="btn-secondary inline-flex items-center gap-2 active:scale-95"
            >
              {generating ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              {generating ? "Preparing…" : `Download ${label.singular} template`}
            </button>
            <button
              type="button"
              disabled={loadingRef || !ref}
              onClick={() => fileInputRef.current?.click()}
              className="btn-secondary inline-flex items-center gap-2 active:scale-95"
            >
              <Upload size={16} /> Upload filled template
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFile}
              className="hidden"
            />
          </div>
        </div>

        {/* Column legend */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            {label.singular} template columns
          </p>
          <div className="flex flex-wrap gap-1.5">
            {cols.map((c) => (
              <span
                key={c.key}
                title={c.hint}
                className={`rounded-md border px-2 py-0.5 text-xs ${
                  c.required
                    ? "border-amber-300 bg-amber-50 text-amber-700"
                    : "border-blue-200 bg-blue-50 text-slate-600"
                }`}
              >
                {c.header}
                {c.required && <span className="text-amber-500">*</span>}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            <span className="rounded bg-amber-50 px-1 text-amber-700">Amber</span> = required ·{" "}
            <span className="rounded bg-blue-50 px-1 text-slate-600">Blue</span> = optional. For products,{" "}
            <span className="font-medium">Location</span> and <span className="font-medium">Measure Unit</span> are
            fixed dropdowns, <span className="font-medium">Category</span> lists your existing categories (must exist to
            import), and <span className="font-medium">Brand</span> lets you pick a suggestion or type a new one.
          </p>
        </div>

        {parseError && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{parseError}</span>
          </div>
        )}

        {summary && (
          <div className="flex items-start justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <div className="flex items-start gap-2">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">
                  Imported {summary.created} {summary.created === 1 ? label.singular.toLowerCase() : label.plural.toLowerCase()}.
                </p>
                {summary.failed.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 text-amber-700">
                    {summary.failed.slice(0, 8).map((f) => (
                      <li key={f.rowNumber}>
                        Row {f.rowNumber}: {f.message}
                      </li>
                    ))}
                    {summary.failed.length > 8 && <li>…and {summary.failed.length - 8} more</li>}
                  </ul>
                )}
              </div>
            </div>
            <button type="button" onClick={() => setSummary(null)} className="rounded p-1 hover:bg-emerald-100">
              <X size={16} />
            </button>
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3 text-sm">
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                  <FileSpreadsheet size={15} className="text-slate-400" />
                  {fileName}
                </span>
                <span className="inline-flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 size={14} /> {result.validCount} valid
                </span>
                {result.errorCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-red-600">
                    <AlertTriangle size={14} /> {result.errorCount} need fixing
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={reset} className="btn-secondary active:scale-95">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!canImport}
                  onClick={handleImport}
                  className="btn-primary inline-flex items-center gap-2 active:scale-95"
                >
                  {importing && <Loader2 size={16} className="animate-spin" />}
                  {importing
                    ? `Importing ${progress}/${result.rows.length}…`
                    : `Import ${result.validCount} ${result.validCount === 1 ? label.singular.toLowerCase() : label.plural.toLowerCase()}`}
                </button>
              </div>
            </div>

            {result.errorCount > 0 && (
              <p className="text-xs text-red-600">
                Fix the highlighted rows in your spreadsheet and re-upload — import stays disabled until every row is
                valid.
              </p>
            )}

            <div className="table-scroll max-h-96 rounded-lg border border-slate-200">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Row</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">{type === "product" ? "Product" : "Name"}</th>
                    <th className="px-3 py-2">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.rows.map((row) => {
                    const ok = row.errors.length === 0;
                    return (
                      <tr key={row.rowNumber} className={ok ? "" : "bg-red-50/60"}>
                        <td className="px-3 py-2 text-slate-400">{row.rowNumber}</td>
                        <td className="px-3 py-2">
                          {ok ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600">
                              <CheckCircle2 size={14} /> OK
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-600">
                              <AlertTriangle size={14} /> Error
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-700">{row.raw["name"] || "—"}</td>
                        <td className="px-3 py-2 text-slate-500">
                          {ok ? (
                            type === "product" ? (
                              <span>
                                {row.raw["category"]} · {row.raw["branch"]} · {row.raw["unit"]} · {row.raw["sellingprice"]}
                              </span>
                            ) : (
                              <span>{row.raw["description"] || row.raw["contactperson"] || "—"}</span>
                            )
                          ) : (
                            <span className="text-red-600">{row.errors.join("; ")}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
