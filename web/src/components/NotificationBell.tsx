import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BadgeCheck,
  Bell,
  CheckCheck,
  ClipboardCheck,
  KeyRound,
  MessageSquare,
  PackageCheck,
  Truck,
} from "lucide-react";
import type { NotificationKind, StoreNotification } from "@stockmate/types";
import { formatDate } from "@/lib/format";

interface NotificationBellProps {
  notifications: StoreNotification[];
  unreadCount: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}

function NotificationIcon({ kind }: { kind: NotificationKind }) {
  switch (kind) {
    case "NEW_MESSAGE":
      return <MessageSquare size={16} className="shrink-0 text-brand-600" strokeWidth={1.75} />;
    case "PO_CREATED":
      return <Truck size={16} className="shrink-0 text-sky-500" strokeWidth={1.75} />;
    case "DELIVERY_RECEIVED":
      return <PackageCheck size={16} className="shrink-0 text-emerald-500" strokeWidth={1.75} />;
    case "DELIVERY_DISCREPANCY":
      return <AlertTriangle size={16} className="shrink-0 text-amber-500" strokeWidth={1.75} />;
    case "PO_COMPLETED":
      return <BadgeCheck size={16} className="shrink-0 text-emerald-600" strokeWidth={1.75} />;
    case "PURCHASE_REQUEST":
    case "PURCHASE_REQUEST_RESOLVED":
    case "STOCK_ADJUSTMENT_REQUEST":
    case "SALE_VOID_REQUEST":
      return <ClipboardCheck size={16} className="shrink-0 text-violet-500" strokeWidth={1.75} />;
    case "PERMISSION_REQUEST":
    case "PERMISSION_REQUEST_RESOLVED":
      return <KeyRound size={16} className="shrink-0 text-indigo-500" strokeWidth={1.75} />;
    default:
      return <CheckCheck size={16} className="shrink-0 text-emerald-500" strokeWidth={1.75} />;
  }
}

export default function NotificationBell({
  notifications,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
}: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  const handleOpenNotification = (item: StoreNotification) => {
    if (!item.read) onMarkRead(item.id);
    setOpen(false);
    if (item.link) navigate(item.link);
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="true"
        className="relative rounded-lg p-2.5 text-slate-500 transition hover:bg-slate-100"
      >
        <Bell size={20} strokeWidth={1.75} />
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(calc(100vw-2rem),22rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Notifications</p>
              <p className="text-xs text-slate-500">
                {unreadCount === 0
                  ? "You're all caught up"
                  : `${unreadCount} unread`}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="text-xs font-semibold text-brand-600 hover:text-brand-700"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell size={28} className="mx-auto mb-2 text-slate-300" strokeWidth={1.5} />
                <p className="text-sm text-slate-500">No notifications yet</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {notifications.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleOpenNotification(item)}
                      className={`flex w-full gap-3 px-4 py-3 text-left transition hover:bg-slate-50 ${
                        item.read ? "" : "bg-brand-50/40"
                      }`}
                    >
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100">
                        <NotificationIcon kind={item.kind} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{item.body}</p>
                        <p className="mt-1 text-[10px] text-slate-400">{formatDate(item.createdAt)}</p>
                      </div>
                      {!item.read && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
