import { Branch } from "@stockmate/types";
import { branchLabel, isStoreWideAccess } from "@/lib/branchScope";
import { User } from "@stockmate/types";

interface BranchFilterProps {
  branches: Branch[];
  user: User;
  value: string;
  onChange: (branchId: string) => void;
  showAllOption?: boolean;
  className?: string;
}

export default function BranchFilter({
  branches,
  user,
  value,
  onChange,
  showAllOption = true,
  className = "input-field w-full sm:w-48",
}: BranchFilterProps) {
  if (!isStoreWideAccess(user)) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        Branch: <span className="font-medium text-slate-900">{branchLabel(user, branches)}</span>
      </div>
    );
  }

  return (
    <select className={`select-field ${className}`.trim()} value={value} onChange={(e) => onChange(e.target.value)}>
      {showAllOption && <option value="">All branches</option>}
      {branches.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  );
}
