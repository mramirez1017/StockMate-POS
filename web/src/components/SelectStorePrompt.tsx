import { Link } from "react-router-dom";
import { Building2 } from "lucide-react";

export default function SelectStorePrompt({
  title = "Select a store",
  message = "Choose a store from the header dropdown or open Stores to browse all locations.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <Building2 className="mx-auto mb-4 text-slate-300" size={48} />
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 text-sm text-slate-600">{message}</p>
      <Link to="/stores" className="btn-primary mt-6 inline-flex">
        Go to Stores
      </Link>
    </div>
  );
}
