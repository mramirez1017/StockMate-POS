import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { History } from "lucide-react";
import { db } from "@/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { formatDate } from "@/lib/format";
import { procurementEventVisual } from "@/lib/transactionVisuals";
import type { ProcurementEvent } from "@stockmate/types";

interface ProcurementTimelineProps {
  poId?: string;
  requestId?: string;
  className?: string;
}

export default function ProcurementTimeline({ poId, requestId, className }: ProcurementTimelineProps) {
  const { storeId } = useAuth();
  const [byPo, setByPo] = useState<ProcurementEvent[]>([]);
  const [byRequest, setByRequest] = useState<ProcurementEvent[]>([]);

  useEffect(() => {
    if (!storeId || !poId) {
      setByPo([]);
      return;
    }
    const q = query(
      collection(db, "stores", storeId, "procurementEvents"),
      where("poId", "==", poId),
      orderBy("createdAt", "asc"),
    );
    return onSnapshot(
      q,
      (snap) => setByPo(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ProcurementEvent)),
      () => setByPo([]),
    );
  }, [storeId, poId]);

  useEffect(() => {
    if (!storeId || !requestId) {
      setByRequest([]);
      return;
    }
    const q = query(
      collection(db, "stores", storeId, "procurementEvents"),
      where("requestId", "==", requestId),
      orderBy("createdAt", "asc"),
    );
    return onSnapshot(
      q,
      (snap) => setByRequest(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ProcurementEvent)),
      () => setByRequest([]),
    );
  }, [storeId, requestId]);

  const events = useMemo(() => {
    const map = new Map<string, ProcurementEvent>();
    [...byRequest, ...byPo].forEach((e) => map.set(e.id, e));
    return Array.from(map.values()).sort((a, b) => a.createdAt - b.createdAt);
  }, [byPo, byRequest]);

  return (
    <div className={`card ${className ?? ""}`}>
      <div className="mb-4 flex items-center gap-2">
        <History size={18} className="text-brand-600" />
        <h3 className="section-heading">Transaction history</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
          {events.length}
        </span>
      </div>

      {events.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">No activity logged yet.</p>
      ) : (
        <ol className="relative space-y-4">
          {events.map((e, idx) => {
            const v = procurementEventVisual(e.type);
            const Icon = v.icon;
            const last = idx === events.length - 1;
            return (
              <li key={e.id} className="relative flex animate-slide-up gap-3" style={{ animationDelay: `${idx * 40}ms` }}>
                {!last && <span className="absolute left-[15px] top-9 h-[calc(100%-12px)] w-0.5 bg-slate-200" />}
                <div
                  className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${v.tint}`}
                >
                  <Icon size={15} />
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <p className="text-sm text-slate-800">{e.message}</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {e.actorName ? `${e.actorName} · ` : ""}
                    {formatDate(e.createdAt)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
