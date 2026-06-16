import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/firebase";
import { api } from "@/lib/api";
import type { StoreNotification, User } from "@stockmate/types";

/**
 * Real-time, per-recipient in-app notifications (delivery events, approvals,
 * chat replies). Backed by stores/{storeId}/notifications written by Cloud Functions.
 */
export function useStoreNotifications(storeId: string | null, user: User | null) {
  const [notifications, setNotifications] = useState<StoreNotification[]>([]);
  const uid = user?.id ?? null;

  useEffect(() => {
    if (!storeId || !uid) {
      setNotifications([]);
      return;
    }
    const q = query(
      collection(db, "stores", storeId, "notifications"),
      where("recipientUid", "==", uid),
      orderBy("createdAt", "desc"),
      limit(50),
    );
    return onSnapshot(
      q,
      (snap) => setNotifications(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as StoreNotification)),
      () => setNotifications([]),
    );
  }, [storeId, uid]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  const markRead = useCallback((notificationId: string) => {
    return api.markNotificationRead({ notificationId }).catch(() => undefined);
  }, []);

  const markAllRead = useCallback(() => {
    return api.markAllNotificationsRead({}).catch(() => undefined);
  }, []);

  return { notifications, unreadCount, markRead, markAllRead };
}
