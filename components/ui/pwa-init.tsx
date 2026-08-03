// =====================================================================
// medikwik Patient — PWA Init + Global Medicine Alarm Engine
//
// This component is rendered on EVERY page inside the dashboard layout.
// It is responsible for:
//   1. Registering the Service Worker and setting up FCM push notifications.
//   2. Starting the medicine alarm scheduler (once per browser session).
//   3. Keeping the alarm scheduler's reminder list in sync with IndexedDB.
//   4. Subscribing to alarm events and showing the AlarmModal overlay
//      on any page — not just the reminders page.
//   5. Unlocking browser audio on the first real user gesture so the
//      MP3 alarm sound can play freely when a timer fires.
// =====================================================================
'use client';

import { useEffect, useRef, useState } from 'react';
import {
  registerServiceWorker,
  requestNotificationPermission,
  setupForegroundNotifications,
} from '@/lib/firebase-messaging';
import { suppressInstallPromptInTWA } from '@/lib/twa-detection';
import { usePathname } from 'next/navigation';
import {
  ensureAlarmSchedulerRunning,
  unlockAudio,
  subscribeToAlarms,
  updateAlarmReminders,
  stopAlarm,
  playAlarmSound,
  getAlarmSettings,
  formatTime12h,
  type AlarmSettings,
} from '@/lib/reminder-alarm';
import { getPatientDB, type LocalReminder } from '@/lib/db';
import { getActiveAccountId } from '@/lib/session';
import {
  AlarmClock,
  Clock,
  Hospital,
  Stethoscope,
  Volume2,
  VolumeX,
} from 'lucide-react';

// ─── Global Alarm Modal ────────────────────────────────────────────────────
// Renders the full-screen alarm overlay on top of any page.

function GlobalAlarmModal({
  reminder,
  time,
  onDismiss,
  onSnooze,
}: {
  reminder: LocalReminder;
  time: string;
  onDismiss: () => void;
  onSnooze: (minutes: number) => void;
}) {
  const isDoctor = reminder.type === 'doctor_prescription';
  const settings = getAlarmSettings();
  const [selectedSnooze, setSelectedSnooze] = useState<5 | 10 | 15>(
    settings.snoozeDurationMinutes
  );

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      {/* Pulsing rings */}
      <div className="relative flex flex-col items-center">
        <div className="absolute h-44 w-44 animate-ping rounded-full bg-teal-500/20" />
        <div
          className="absolute h-36 w-36 animate-ping rounded-full bg-teal-500/30"
          style={{ animationDelay: '0.3s' }}
        />

        {/* Card */}
        <div className="relative mx-4 w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl">
          {/* Colored top bar */}
          <div
            className={`h-2 w-full ${
              isDoctor
                ? 'bg-gradient-to-r from-teal-500 to-cyan-500'
                : 'bg-gradient-to-r from-violet-500 to-fuchsia-500'
            }`}
          />

          <div className="px-6 py-6 text-center">
            {/* Bouncing icon */}
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-teal-50">
              <Volume2 className="h-10 w-10 animate-bounce text-teal-600" />
            </div>

            {/* Source badge */}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                isDoctor ? 'bg-teal-50 text-teal-700' : 'bg-violet-50 text-violet-700'
              }`}
            >
              {isDoctor ? (
                <>
                  <Stethoscope className="h-3 w-3" /> Doctor Created
                </>
              ) : (
                <>
                  <AlarmClock className="h-3 w-3" /> Your Alarm
                </>
              )}
            </span>

            {/* Medicine name */}
            <h2 className="mt-3 text-2xl font-extrabold text-slate-900">
              {reminder.medicineName}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {reminder.dosage}
              {reminder.frequency ? ` · ${reminder.frequency}` : ''}
            </p>

            {/* Doctor name */}
            {isDoctor && reminder.doctorName ? (
              <p className="mt-2 text-xs font-medium text-teal-600">
                <Hospital className="mr-1 inline h-3 w-3" />
                Prescribed by Dr. {reminder.doctorName}
              </p>
            ) : null}

            {/* Scheduled time */}
            <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-2">
              <Clock className="h-4 w-4 text-slate-400" />
              <span className="text-sm font-bold text-slate-700">{formatTime12h(time)}</span>
            </div>

            {/* Snooze duration picker */}
            <div className="mt-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Snooze for
              </p>
              <div className="flex justify-center gap-2">
                {([5, 10, 15] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setSelectedSnooze(m)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                      selectedSnooze === m
                        ? 'bg-teal-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {m} min
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-3 border-t border-slate-100 px-6 py-4">
            <button
              onClick={() => onSnooze(selectedSnooze)}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Clock className="h-4 w-4" />
              Snooze {selectedSnooze}m
            </button>
            <button
              onClick={onDismiss}
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 py-3 text-sm font-bold text-white shadow-lg shadow-teal-500/20 transition hover:from-teal-700 hover:to-cyan-700"
            >
              <VolumeX className="h-4 w-4" />
              Taken ✓
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main PWAInit Component ────────────────────────────────────────────────

export default function PWAInit() {
  const pathname = usePathname();

  // ── Global alarm modal state ────────────────────────────────────────
  const [activeAlarm, setActiveAlarm] = useState<{
    reminder: LocalReminder;
    time: string;
  } | null>(null);
  const snoozeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── One-time setup: service worker + push notifications ─────────────
  useEffect(() => {
    // Suppress Firebase Installations unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message = reason?.message || '';
      const code = reason?.code || '';
      const isFirebaseInstallationsError =
        code === 'installations/request-failed' ||
        message.includes('installations/request-failed') ||
        message.includes('PERMISSION_DENIED') ||
        message.includes('permission');
      if (isFirebaseInstallationsError) {
        event.preventDefault();
        console.warn(
          '[FCM] Suppressed Firebase Installations rejection. ' +
            'Check API Key restrictions in Google Cloud Console.',
          reason
        );
      }
    };
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    suppressInstallPromptInTWA();

    const handleOnline = () => {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'REPLAY_MUTATIONS' });
      }
    };
    window.addEventListener('online', handleOnline);

    // Listen for MEDICINE_ALARM_ACTIONED from the Service Worker
    // (user tapped Take/Dismiss on the lock-screen notification while app is open)
    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === 'MEDICINE_ALARM_ACTIONED') {
        stopAlarm();
        setActiveAlarm(null);
        if (snoozeTimerRef.current) clearTimeout(snoozeTimerRef.current);
      }
    };
    navigator.serviceWorker?.addEventListener?.('message', handleSWMessage);

    // ── Audio unlock on first real user gesture ──────────────────────
    // unlockAudio() at page load is often blocked because the browser
    // hasn't seen a user gesture yet. We hook onto the FIRST click/touch
    // which is a real gesture, then try immediately AND on that gesture.
    const tryUnlock = () => {
      unlockAudio();
    };
    // Try immediately in case this mount was triggered by navigation (counts as gesture)
    unlockAudio();
    // Also hook onto first explicit tap/click in this session
    document.addEventListener('click', tryUnlock, { once: true, passive: true });
    document.addEventListener('touchstart', tryUnlock, { once: true, passive: true });
    document.addEventListener('keydown', tryUnlock, { once: true, passive: true });

    // ── Start global alarm scheduler (idempotent) ────────────────────
    // IMPORTANT: Load reminders from IndexedDB BEFORE starting the
    // scheduler so the very first check has data to work with.
    const activeAccountId = getActiveAccountId();
    const startScheduler = async () => {
      if (activeAccountId) {
        try {
          const db = getPatientDB(activeAccountId);
          const reminders = await db.reminders.toArray();
          console.log(`[PWAInit] Loaded ${reminders.length} reminders into alarm scheduler.`);
          updateAlarmReminders(reminders);
        } catch (err) {
          console.warn('[PWAInit] Could not pre-load reminders:', err);
        }
      }
      // Start AFTER reminders are loaded
      ensureAlarmSchedulerRunning();
    };
    void startScheduler();

    // ── Subscribe to alarm events to show the modal globally ─────────
    const unsubscribeAlarm = subscribeToAlarms(({ reminder, time }) => {
      setActiveAlarm({ reminder, time });
    });

    // ── Keep reminders in sync — refresh every 30 s ───────────────────
    // Runs in parallel with the scheduler so newly added/synced reminders
    // are picked up quickly without waiting for a full page navigation.
    const syncInterval = setInterval(async () => {
      if (!activeAccountId) return;
      try {
        const db = getPatientDB(activeAccountId);
        const reminders = await db.reminders.toArray();
        updateAlarmReminders(reminders);
      } catch { /* non-fatal */ }
    }, 30_000);

    // ── Register Service Worker + FCM ────────────────────────────────
    const init = async () => {
      try {
        await registerServiceWorker();
        if (pathname.startsWith('/dashboard')) {
          if (
            typeof window !== 'undefined' &&
            'Notification' in window &&
            Notification.permission === 'granted'
          ) {
            await requestNotificationPermission();
          }
        }
      } catch (err) {
        console.warn('[PWAInit] Error during PWA initialization:', err);
      }
    };
    init();

    const unsubscribeFCM = setupForegroundNotifications();

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('online', handleOnline);
      navigator.serviceWorker?.removeEventListener?.('message', handleSWMessage);
      document.removeEventListener('click', tryUnlock);
      document.removeEventListener('touchstart', tryUnlock);
      document.removeEventListener('keydown', tryUnlock);
      clearInterval(syncInterval);
      unsubscribeAlarm();
      if (unsubscribeFCM) unsubscribeFCM();
      // NOTE: Do NOT stop the alarm scheduler — it runs for the whole session.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount only

  // ── Alarm action handlers ─────────────────────────────────────────────
  const handleAlarmDismiss = () => {
    stopAlarm();
    setActiveAlarm(null);
    if (snoozeTimerRef.current) clearTimeout(snoozeTimerRef.current);
  };

  const handleAlarmSnooze = (minutes: number) => {
    stopAlarm();
    setActiveAlarm(null);
    if (snoozeTimerRef.current) clearTimeout(snoozeTimerRef.current);

    if (activeAlarm) {
      const { reminder, time } = activeAlarm;
      snoozeTimerRef.current = setTimeout(() => {
        setActiveAlarm({ reminder, time });
        if ('vibrate' in navigator) navigator.vibrate([400, 200, 400, 200, 400]);
        playAlarmSound();
      }, minutes * 60 * 1000);
    }
  };

  return (
    <>
      {/* Global alarm modal — renders on top of any page */}
      {activeAlarm ? (
        <GlobalAlarmModal
          reminder={activeAlarm.reminder}
          time={activeAlarm.time}
          onDismiss={handleAlarmDismiss}
          onSnooze={handleAlarmSnooze}
        />
      ) : null}
    </>
  );
}
