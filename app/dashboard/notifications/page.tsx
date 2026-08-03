'use client';

import { useCallback, useEffect, useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Calendar, FileText, Pill, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  type PatientNotification,
  type NotificationCategory,
  fetchNotifications,
  markAsRead,
  markAllAsRead,
} from '@/lib/patient-notifications';
import { getPatientDB } from '@/lib/db';
import { getActiveAccountId } from '@/lib/session';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSessionGuard } from '@/hooks/use-session-guard';
import { syncAllPatientData } from '@/lib/db/sync-engine';

// ─── Helpers ──────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<NotificationCategory, { icon: typeof Bell; color: string }> = {
  medicine_reminder: { icon: Pill, color: 'bg-emerald-50 text-emerald-600' },
  prescription: { icon: FileText, color: 'bg-sky-50 text-sky-600' },
  appointment: { icon: Calendar, color: 'bg-amber-50 text-amber-600' },
  system: { icon: Bell, color: 'bg-slate-100 text-slate-500' },
};

/** Simple relative-time formatter. */
const formatRelativeTime = (dateStr: string): string => {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  if (Number.isNaN(date)) return '';

  const diffSec = Math.floor((now - date) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;

  const diffDays = Math.floor(diffSec / 86400);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(dateStr));
};

// ─── Skeleton ─────────────────────────────────────────────────────────

function NotificationsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          className="flex items-start gap-3 rounded-2xl bg-white p-4 animate-pulse"
          key={`notif-skel-${i}`}
        >
          <div className="h-10 w-10 shrink-0 rounded-full bg-slate-100" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-3/5 rounded bg-slate-100" />
            <div className="h-3 w-4/5 rounded bg-slate-50" />
          </div>
          <div className="h-3 w-12 rounded bg-slate-50" />
        </div>
      ))}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-[2rem] bg-white px-6 py-16 text-center shadow-[0_18px_50px_-36px_rgba(15,23,42,0.15)] ring-1 ring-slate-100">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Bell className="h-7 w-7" />
      </div>
      <h3 className="mt-5 text-xl font-bold text-slate-950">No notifications</h3>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-slate-500">
        You&apos;re all caught up! New reminders and updates will appear here.
      </p>
    </div>
  );
}

// ─── Notification Card ────────────────────────────────────────────────

function NotificationCard({
  notification,
  onTap,
}: {
  notification: PatientNotification;
  onTap: (n: PatientNotification) => void;
}) {
  const config = CATEGORY_CONFIG[notification.category] || CATEGORY_CONFIG.system;
  const Icon = config.icon;

  return (
    <button
      type="button"
      onClick={() => onTap(notification)}
      className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition hover:shadow-md ${
        notification.isRead
          ? 'border-slate-100 bg-white'
          : 'border-teal-100 bg-teal-50/40'
      }`}
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${config.color}`}>
        <Icon className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${notification.isRead ? 'font-medium text-slate-700' : 'font-semibold text-slate-950'}`}>
          {notification.title}
        </p>
        <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-slate-500">
          {notification.body}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
        <span className="text-[11px] text-slate-400">{formatRelativeTime(notification.createdAt)}</span>
        {!notification.isRead ? (
          <span className="h-2.5 w-2.5 rounded-full bg-teal-500" />
        ) : null}
      </div>
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  useSessionGuard();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [markingAll, setMarkingAll] = useState(false);

  const activeAccountId = getActiveAccountId();
  const db = activeAccountId ? getPatientDB(activeAccountId) : null;

  // Query Dexie reactively
  const dbNotifications = useLiveQuery(
    () => {
      if (!db) return [];
      return db.notifications.toArray();
    },
    [db]
  );

  const notifications = useMemo(() => {
    if (!dbNotifications) return [];
    // Sort newest-first
    return [...dbNotifications].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [dbNotifications]);

  const loading = dbNotifications === undefined;

  const load = useCallback(async () => {
    if (!activeAccountId) return;
    await syncAllPatientData(activeAccountId, true);
  }, [activeAccountId]);

  useEffect(() => {
    if (activeAccountId) {
      void load();
    }
  }, [load, activeAccountId]);

  const handleTap = async (notification: PatientNotification) => {
    if (!notification.isRead) {
      try {
        if (db) {
          await db.notifications.update(notification.id, { isRead: true, readAt: new Date().toISOString() });
        }
        await markAsRead(notification.id);
      } catch {
        /* proceed even if marking fails */
      }
    }

    if (notification.actionUrl) {
      router.push(notification.actionUrl);
    }
  };

  const handleMarkAll = async () => {
    try {
      setMarkingAll(true);
      if (db) {
        await db.notifications.clear();
      }
      await markAllAsRead();
      toast.success('All notifications deleted.');
    } catch {
      toast.error('Could not clear notifications.');
      void load();
    } finally {
      setMarkingAll(false);
    }
  };

  const hasNotifications = notifications.length > 0;

  return (
    <div className="min-h-screen bg-[#eef6fa]">
      <div className="mx-auto max-w-2xl px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 xl:pb-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-950 sm:text-2xl">Notifications</h1>
            <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">Stay up to date with your care</p>
          </div>

          {hasNotifications && !loading ? (
            <button
              type="button"
              onClick={() => { void handleMarkAll(); }}
              disabled={markingAll}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-950 disabled:opacity-50"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {markingAll ? 'Clearing...' : 'Mark all read'}
            </button>
          ) : null}
        </div>

        {/* Body */}
        <div className="mt-5 space-y-2.5">
          {loading ? (
            <NotificationsSkeleton />
          ) : notifications.length === 0 ? (
            <EmptyState />
          ) : (
            notifications.map((n) => (
              <NotificationCard
                key={n.id}
                notification={n}
                onTap={(notif) => { void handleTap(notif); }}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
