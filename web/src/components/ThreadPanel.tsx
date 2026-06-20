import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { MessageSquare, Send, Trash2 } from "lucide-react";
import { db } from "@/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { callableErrorMessage } from "@/lib/callableError";
import type { Thread, ThreadContextType, ThreadMessage } from "@stockmate/types";

interface ThreadPanelProps {
  contextType: ThreadContextType;
  contextId: string;
  title: string;
  branchId: string;
  /** Optional heading shown above the conversation. */
  heading?: string;
  className?: string;
}

function roleLabel(role?: string): string {
  if (!role) return "";
  return role.replace(/_/g, " ").toLowerCase();
}

function initials(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #10b981, #0d9488)",
  "linear-gradient(135deg, #6366f1, #8b5cf6)",
  "linear-gradient(135deg, #f59e0b, #f97316)",
  "linear-gradient(135deg, #0ea5e9, #2563eb)",
  "linear-gradient(135deg, #ec4899, #d946ef)",
  "linear-gradient(135deg, #14b8a6, #0891b2)",
];

function avatarGradient(seed?: string): string {
  const key = seed ?? "";
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function ThreadPanel({
  contextType,
  contextId,
  title,
  branchId,
  heading = "Conversation",
  className = "",
}: ThreadPanelProps) {
  const { user } = useAuth();
  const uid = user?.id ?? "";
  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastReadAtRef = useRef<number>(0);

  const { storeId } = useAuth();

  // Find the thread anchored to this record (created lazily on first message).
  // The branchId filter is required: Firestore security rules only allow branch
  // staff to read threads scoped to their branch, and a list query is rejected
  // unless it is constrained so every matching doc is guaranteed readable.
  useEffect(() => {
    if (!storeId || !contextId || !branchId) return;
    const q = query(
      collection(db, "stores", storeId, "threads"),
      where("contextType", "==", contextType),
      where("contextId", "==", contextId),
      where("branchId", "==", branchId),
      limit(1),
    );
    return onSnapshot(q, (snap) => {
      if (snap.empty) {
        setThread(null);
        return;
      }
      const doc = snap.docs[0];
      setThread({ id: doc.id, ...doc.data() } as Thread);
    });
  }, [storeId, contextType, contextId, branchId]);

  // Live messages for the resolved thread.
  useEffect(() => {
    if (!storeId || !thread) {
      setMessages([]);
      return;
    }
    const q = query(
      collection(db, "stores", storeId, "threads", thread.id, "messages"),
      orderBy("createdAt", "asc"),
    );
    return onSnapshot(q, (snap) => {
      setMessages(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as ThreadMessage)
          .filter((m) => !m.deleted),
      );
    });
  }, [storeId, thread]);

  // Auto-scroll + mark read when new messages arrive.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    const latest = messages[messages.length - 1];
    if (thread && latest && latest.createdAt > lastReadAtRef.current) {
      lastReadAtRef.current = latest.createdAt;
      api.markThreadRead({ threadId: thread.id }).catch(() => undefined);
    }
  }, [messages, thread]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    try {
      await api.sendMessage({
        threadId: thread?.id,
        contextType,
        contextId,
        title,
        branchId,
        text: trimmed,
      });
      setText("");
    } catch (err) {
      setError(callableErrorMessage(err, "Failed to send message"));
    } finally {
      setSending(false);
    }
  };

  const handleUnsend = async (messageId: string) => {
    if (!thread) return;
    try {
      await api.unsendMessage({ threadId: thread.id, messageId });
    } catch (err) {
      setError(callableErrorMessage(err, "Failed to unsend message"));
    }
  };

  const emptyState = useMemo(() => messages.length === 0, [messages]);

  return (
    <div className={`card flex flex-col ${className}`}>
      <div className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-3">
        <MessageSquare size={18} className="text-brand-600" />
        <h3 className="font-semibold text-slate-900">{heading}</h3>
        {messages.length > 0 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
            {messages.length}
          </span>
        )}
      </div>

      <div
        ref={scrollRef}
        className="scroll-area mb-3 max-h-80 min-h-[8rem] flex-1 space-y-3 pr-1"
      >
        {emptyState ? (
          <div className="flex h-32 flex-col items-center justify-center text-center text-sm text-slate-400">
            <div className="relative mb-3 flex h-12 w-12 items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-brand-100 animate-pulse-ring" />
              <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-500">
                <MessageSquare size={22} />
              </span>
            </div>
            <p className="font-medium text-slate-500">No messages yet</p>
            <p className="text-xs text-slate-400">Start the conversation with your team.</p>
          </div>
        ) : (
          messages.map((m, idx) => {
            const mine = m.senderId === uid;
            const prev = messages[idx - 1];
            const showDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt);
            const sameSenderAsPrev = !showDay && prev && prev.senderId === m.senderId;
            return (
              <div key={m.id}>
                {showDay && (
                  <div className="my-3 flex items-center justify-center">
                    <span className="rounded-full bg-slate-100 px-3 py-0.5 text-[11px] font-medium text-slate-500">
                      {dayLabel(m.createdAt)}
                    </span>
                  </div>
                )}
                <div className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                  {!mine && (
                    <div className="w-7 shrink-0">
                      {!sameSenderAsPrev && (
                        <div
                          className="avatar-chip h-7 w-7"
                          style={{ backgroundImage: avatarGradient(m.senderId) }}
                          title={m.senderName}
                        >
                          {initials(m.senderName)}
                        </div>
                      )}
                    </div>
                  )}
                  <div className={`group chat-bubble-in max-w-[78%] ${mine ? "items-end" : "items-start"}`}>
                    <div
                      className={`rounded-2xl px-3 py-2 text-sm shadow-sm ${
                        mine
                          ? "rounded-br-sm bg-brand-gradient text-white"
                          : "rounded-bl-sm border border-slate-100 bg-slate-50 text-slate-800"
                      }`}
                    >
                      {!mine && !sameSenderAsPrev && (
                        <p className="mb-0.5 text-xs font-semibold text-slate-600">
                          {m.senderName}{" "}
                          <span className="font-normal capitalize text-slate-400">
                            · {roleLabel(m.senderRole)}
                          </span>
                        </p>
                      )}
                      <p className="whitespace-pre-wrap break-words">{m.text}</p>
                    </div>
                    <div
                      className={`mt-0.5 flex items-center gap-2 px-1 text-[10px] text-slate-400 ${
                        mine ? "justify-end" : "justify-start"
                      }`}
                    >
                      <span>{timeLabel(m.createdAt)}</span>
                      {mine && (
                        <button
                          type="button"
                          onClick={() => handleUnsend(m.id)}
                          className="-m-1 rounded p-1 text-slate-400 transition hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100"
                          aria-label="Unsend message"
                          title="Unsend"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {error && (
        <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSend} className="flex items-end gap-2">
        <textarea
          className="input-field max-h-32 min-h-[42px] flex-1 resize-none py-2"
          placeholder="Write a message…"
          value={text}
          rows={1}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend(e);
            }
          }}
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="btn-primary shrink-0 px-3"
          aria-label="Send message"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
