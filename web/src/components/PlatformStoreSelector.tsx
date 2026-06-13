import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { Store } from "@stockmate/types";

export default function PlatformStoreSelector() {
  const { analyticsStoreId, setAnalyticsStoreId, store } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);

  useEffect(() => {
    return onSnapshot(collection(db, "stores"), (snap) => {
      setStores(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Store)
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    });
  }, []);

  return (
    <div className="min-w-0 w-full max-w-full sm:max-w-sm">
      <label htmlFor="platform-store-select" className="sr-only">
        View store data
      </label>
      <select
        id="platform-store-select"
        className="input-field w-full text-sm"
        value={analyticsStoreId ?? ""}
        onChange={(e) => void setAnalyticsStoreId(e.target.value || null)}
      >
        <option value="">Select store to view data…</option>
        {stores.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {analyticsStoreId && store && (
        <p className="mt-1 truncate text-xs text-emerald-700">
          Viewing: {store.name}
        </p>
      )}
    </div>
  );
}
