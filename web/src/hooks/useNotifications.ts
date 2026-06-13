import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, where } from "firebase/firestore";
import { db } from "@/firebase";
import { branchScopedQuery } from "@/lib/branchScope";
import type { CriticalStock, PurchaseOrder, User } from "@stockmate/types";

export type NotificationKind = "critical_stock" | "pending_delivery";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  detail: string;
  to: string;
}

export function useNotifications(storeId: string | null, user: User | null) {
  const [criticalStocks, setCriticalStocks] = useState<CriticalStock[]>([]);
  const [pendingPOs, setPendingPOs] = useState<PurchaseOrder[]>([]);

  useEffect(() => {
    if (!storeId || !user) {
      setCriticalStocks([]);
      setPendingPOs([]);
      return;
    }

    const unsubs = [
      onSnapshot(branchScopedQuery(collection(db, "stores", storeId, "criticalStocks"), user), (snap) => {
        setCriticalStocks(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CriticalStock));
      }),
      onSnapshot(
        branchScopedQuery(
          collection(db, "stores", storeId, "purchaseOrders"),
          user,
          where("status", "in", ["ORDERED", "IN_TRANSIT", "PARTIALLY_RECEIVED"]),
        ),
        (snap) => setPendingPOs(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PurchaseOrder)),
      ),
    ];

    return () => unsubs.forEach((u) => u());
  }, [storeId, user]);

  const notifications = useMemo((): AppNotification[] => {
    const items: AppNotification[] = [];

    criticalStocks.forEach((item) => {
      items.push({
        id: `critical-${item.id}`,
        kind: "critical_stock",
        title: item.productName,
        detail: `Critical: ${item.currentStock} left (reorder at ${item.reorderLevel})`,
        to: "/inventory",
      });
    });

    pendingPOs
      .slice()
      .sort((a, b) => a.expectedDeliveryDate.localeCompare(b.expectedDeliveryDate))
      .forEach((po) => {
        items.push({
          id: `delivery-${po.id}`,
          kind: "pending_delivery",
          title: po.poNumber,
          detail: `Expected delivery ${po.expectedDeliveryDate}`,
          to: `/deliveries/${po.id}`,
        });
      });

    return items;
  }, [criticalStocks, pendingPOs]);

  return {
    notifications,
    count: notifications.length,
    deliveryCount: pendingPOs.length,
  };
}
