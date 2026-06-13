import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Bell, Truck } from "lucide-react";
import type { AppNotification } from "@/hooks/useNotifications";

interface NotificationBellProps {
  notifications: AppNotification[];
  count: number;
}

function NotificationIcon({ kind }: { kind: AppNotification["kind"] }) {
  if (kind === "critical_stock") {
    return <AlertTriangle size={16} className="shrink-0 text-red-500" strokeWidth={1.75} />;
  }
  return <Truck size={16} className="shrink-0 text-sky-500" strokeWidth={1.75} />;
}

export default function NotificationBell({ notifications, count }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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
        {count > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(calc(100vw-2rem),20rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            <p className="text-xs text-slate-500">
              {count === 0 ? "You're all caught up" : `${count} alert${count === 1 ? "" : "s"} need attention`}
            </p>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell size={28} className="mx-auto mb-2 text-slate-300" strokeWidth={1.5} />
                <p className="text-sm text-slate-500">No notifications right now</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {notifications.map((item) => (
                  <li key={item.id}>
                    <Link
                      to={item.to}
                      onClick={() => setOpen(false)}
                      className="flex gap-3 px-4 py-3 transition hover:bg-slate-50"
                    >
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100">
                        <NotificationIcon kind={item.kind} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{item.detail}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {notifications.length > 0 && (
            <div className="border-t border-slate-100 px-4 py-2">
              <Link
                to="/dashboard"
                onClick={() => setOpen(false)}
                className="block text-center text-xs font-semibold text-brand-600 hover:text-brand-700"
              >
                View dashboard
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
