'use client';

/**
 * Medicine Reminder Alarm System
 *
 * Responsibilities:
 *  1. Every 30 seconds, check all active reminders stored in IndexedDB.
 *  2. If a reminder time matches the current time (within the current minute),
 *     fire an alarm: play a looping alarm sound + show a browser Notification.
 *  3. Track "already fired" alarms per day so they don't repeat within the same minute.
 *  4. Respect repeatType (daily / weekly / custom_days / every_x_hours).
 *  5. Alarm sound plays ONLY for medicine reminders (doctor or patient).
 *     All other notification types use the system default.
 */

import type { LocalReminder, RepeatType } from '@/lib/db';

// ─── Alarm Settings (persisted in localStorage) ─────────────────────────────

const SETTINGS_KEY = 'medikwik_alarm_settings';

export type AlarmSettings = {
  snoozeDurationMinutes: 5 | 10 | 15;
  vibrationEnabled: boolean;
  autoStopSeconds: number; // 0 = no auto-stop
};

const DEFAULT_SETTINGS: AlarmSettings = {
  snoozeDurationMinutes: 5,
  vibrationEnabled: true,
  autoStopSeconds: 60,
};

export function getAlarmSettings(): AlarmSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveAlarmSettings(settings: Partial<AlarmSettings>): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getAlarmSettings();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, ...settings }));
  } catch { /* non-fatal */ }
}

// ─── State ─────────────────────────────────────────────────────────────────
let alarmIntervalId: ReturnType<typeof setInterval> | null = null;

/** key = `${reminderId}:${YYYY-MM-DD}:${HH:MM}` — tracks alarms already fired today */
const firedAlarms = new Set<string>();

// Persist firedAlarms to localStorage so page refreshes don't re-fire
// alarms that already triggered in this calendar minute.
const FIRED_KEY = 'medikwik_fired_alarms';
function loadFiredAlarms() {
  try {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem(FIRED_KEY);
    if (!raw) return;
    const data: { key: string; day: string }[] = JSON.parse(raw);
    const today = new Date().toISOString().split('T')[0];
    // Only load today's fired alarms to avoid stale entries
    data.forEach((entry) => {
      if (entry.day === today) firedAlarms.add(entry.key);
    });
  } catch { /* non-fatal */ }
}
function saveFiredAlarm(key: string) {
  try {
    if (typeof window === 'undefined') return;
    const today = new Date().toISOString().split('T')[0];
    const raw = localStorage.getItem(FIRED_KEY);
    const data: { key: string; day: string }[] = raw ? JSON.parse(raw) : [];
    // Keep only today's entries (prune old days)
    const todayOnly = data.filter((e) => e.day === today);
    todayOnly.push({ key, day: today });
    localStorage.setItem(FIRED_KEY, JSON.stringify(todayOnly));
  } catch { /* non-fatal */ }
}

/** Subscribers to alarm events (for showing the in-app modal) */
type AlarmPayload = {
  reminder: LocalReminder;
  time: string;
};
const alarmListeners = new Set<(payload: AlarmPayload) => void>();

export function subscribeToAlarms(cb: (payload: AlarmPayload) => void) {
  alarmListeners.add(cb);
  return () => alarmListeners.delete(cb);
}

function notifyAlarmListeners(payload: AlarmPayload) {
  alarmListeners.forEach((cb) => cb(payload));
}

// ─── Audio ─────────────────────────────────────────────────────────────────

/**
 * Path to the alarm MP3 in /public/Alram/
 * Next.js serves /public at the root, so this resolves to:
 *   https://yoursite.com/Alram/jeremayjimenez...mp3
 */
const ALARM_SOUND_URL = '/Alram/jeremayjimenez-thailand-eas-alarm-2006-266492 (1).mp3';

/**
 * HOW BROWSER AUDIO AUTOPLAY WORKS
 * ---------------------------------
 * Browsers block audio.play() unless a user has interacted with the page
 * (tapped, clicked, etc.) in the SAME session. Alarm schedulers fire on
 * timers — no user gesture — so play() is silently rejected.
 *
 * FIX: Call unlockAudio() on any user gesture (page mount counts because
 * the user navigated there by tapping). This plays the MP3 at volume 0
 * for 0 ms, permanently unlocking audio for the rest of the session.
 * After that, playAlarmSound() can call play() freely at any time.
 */
let unlockedAudio: HTMLAudioElement | null = null;
let audioUnlocked = false;
let activeAudio: HTMLAudioElement | null = null;
let alarmStopping = false;

/**
 * Call this on any user interaction (page load, button tap, etc.).
 * It silently "warms up" the audio element so later alarm plays are allowed.
 */
export function unlockAudio(): void {
  if (audioUnlocked || typeof window === 'undefined') return;

  try {
    // Strategy 1: play the actual MP3 silently — warms up the audio engine.
    const audio = new Audio(ALARM_SOUND_URL);
    audio.volume = 0;
    audio.currentTime = 0;
    // Store immediately so playAlarmSound() has a reference even before play() resolves
    unlockedAudio = audio;

    const p = audio.play();
    if (p !== undefined) {
      p.then(() => {
        audio.pause();
        audio.volume = 1.0;
        audioUnlocked = true;
        console.log('[Alarm] Audio unlocked via MP3 play.');
      }).catch(() => {
        // Strategy 2: create AudioContext — this also unlocks the audio subsystem
        // on some browsers (Chrome Android) even without a click gesture.
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          if (ctx.state === 'suspended') {
            ctx.resume().then(() => {
              audioUnlocked = true;
              console.log('[Alarm] Audio unlocked via AudioContext.resume().');
              void ctx.close();
            }).catch(() => { /* Will unlock on first real tap */ });
          } else {
            audioUnlocked = true;
            void ctx.close();
          }
        } catch { /* Non-fatal */ }
      });
    }
  } catch {
    // Non-fatal
  }
}

/**
 * Plays the alarm MP3 on loop at full volume.
 * Must have called unlockAudio() at least once before this fires.
 * Falls back to Web Audio oscillator beeps if the MP3 is still blocked.
 */
export function playAlarmSound(): void {
  stopAlarm();
  alarmStopping = false;

  // Use the pre-unlocked audio element if available
  const audio = unlockedAudio ?? new Audio(ALARM_SOUND_URL);
  audio.currentTime = 0;
  audio.loop = true;
  audio.volume = 1.0;
  activeAudio = audio;

  const p = audio.play();
  if (p !== undefined) {
    p.catch((err) => {
      console.warn('[Alarm] Audio still blocked, falling back to beep:', err);
      activeAudio = null;
      playWebAudioBeep();
    });
  }
}

export function stopAlarm(): void {
  if (alarmStopping) return;
  alarmStopping = true;

  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    // Don't clear unlockedAudio — keep it for reuse
    if (activeAudio !== unlockedAudio) {
      activeAudio.src = '';
    }
    activeAudio = null;
  }

  stopWebAudioBeep();
}

// ─── Web Audio fallback (oscillator beep) ──────────────────────────────────

let audioContext: AudioContext | null = null;
let alarmGain: GainNode | null = null;
let alarmOscillators: OscillatorNode[] = [];

function playWebAudioBeep() {
  stopWebAudioBeep();
  try {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    alarmGain = audioContext.createGain();
    alarmGain.gain.value = 0.7;
    alarmGain.connect(audioContext.destination);

    let time = audioContext.currentTime;
    alarmOscillators = [];

    for (let i = 0; i < 30; i++) {
      const osc1 = audioContext.createOscillator();
      osc1.type = 'square';
      osc1.frequency.value = 880;
      osc1.connect(alarmGain!);
      osc1.start(time);
      osc1.stop(time + 0.18);
      alarmOscillators.push(osc1);

      const osc2 = audioContext.createOscillator();
      osc2.type = 'square';
      osc2.frequency.value = 660;
      osc2.connect(alarmGain!);
      osc2.start(time + 0.22);
      osc2.stop(time + 0.40);
      alarmOscillators.push(osc2);

      time += 1.0;
    }
  } catch (e) {
    console.warn('[Alarm] Web Audio API not available:', e);
  }
}

function stopWebAudioBeep() {
  alarmOscillators.forEach((osc) => {
    try { osc.stop(); } catch { /* already stopped */ }
  });
  alarmOscillators = [];

  if (alarmGain) {
    try { alarmGain.disconnect(); } catch { /* ignore */ }
    alarmGain = null;
  }
  if (audioContext) {
    try { void audioContext.close(); } catch { /* ignore */ }
    audioContext = null;
  }
}

// ─── Notification ───────────────────────────────────────────────────────────

function showAlarmNotification(reminder: LocalReminder, time: string) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const isDoctor = reminder.type === 'doctor_prescription';
  const title = `💊 Medicine Time: ${reminder.medicineName}`;
  const body = [
    `${reminder.dosage}${reminder.frequency ? ` · ${reminder.frequency}` : ''}`,
    isDoctor
      ? `Prescribed by Dr. ${reminder.doctorName || 'your doctor'}`
      : 'Your custom reminder',
    `Scheduled: ${formatTime12h(time)}`,
  ].join(' · ');

  // Prefer service worker showNotification — this is the ONLY way to
  // trigger the OS ringtone on Android TWA where JS audio is blocked.
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready
      .then((reg) =>
        reg.showNotification(title, {
          body,
          icon: '/android/launchericon-192x192.png',
          badge: '/android/launchericon-96x96.png',
          tag: `medicine-alarm-${reminder.id}-${time}`,
          renotify: true,
          requireInteraction: true,
          silent: false, // OS plays the default ringtone – critical for TWA
          data: {
            url: '/dashboard/reminders',
            type: 'medicine_reminder',
            isMedicine: true,
            reminderId: String(reminder.id),
            medicineName: reminder.medicineName,
            dosage: reminder.dosage,
            doctorName: reminder.doctorName || '',
          },
          actions: [
            { action: 'take', title: '✅ Take Medicine' },
            { action: 'snooze', title: '⏰ Snooze 5 min' },
            { action: 'dismiss', title: '❌ Dismiss' },
          ],
        } as NotificationOptions)
      )
      .catch(() => {
        // Fallback: use the Notification constructor (works on desktop)
        try {
          new Notification(title, {
            body,
            icon: '/android/launchericon-192x192.png',
            tag: `medicine-alarm-${reminder.id}-${time}`,
            requireInteraction: true,
            data: { url: '/dashboard/reminders', type: 'medicine_reminder' },
          });
        } catch { /* ignore */ }
      });
    return;
  }

  // Desktop fallback (no service worker available)
  try {
    const n = new Notification(title, {
      body,
      icon: '/android/launchericon-192x192.png',
      badge: '/android/launchericon-96x96.png',
      tag: `medicine-alarm-${reminder.id}-${time}`,
      renotify: true,
      requireInteraction: true,
      data: { url: '/dashboard/reminders', type: 'medicine_reminder' },
    } as NotificationOptions);
    n.onclick = () => {
      window.focus();
      n.close();
      stopAlarm();
    };
  } catch (e) {
    console.warn('[Alarm] Notification failed:', e);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function formatTime12h(time24: string): string {
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${mStr} ${ampm}`;
}

function nowHHMM(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function todayDateStr(): string {
  const d = new Date();
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

function todayDayOfWeek(): number {
  return new Date().getDay(); // 0=Sun … 6=Sat
}

/**
 * Returns true if this reminder should fire on today's day-of-week,
 * based on its repeatType and repeatDays.
 */
function shouldFireToday(reminder: LocalReminder): boolean {
  const repeatType: RepeatType = reminder.repeatType || 'daily';

  switch (repeatType) {
    case 'daily':
      return true;

    case 'weekly':
    case 'custom_days': {
      const days = reminder.repeatDays || [];
      if (days.length === 0) return true; // no restriction = every day
      return days.includes(todayDayOfWeek());
    }

    case 'every_x_hours':
      // every_x_hours uses times[] to represent each window (pre-computed)
      return true;

    default:
      return true;
  }
}

// ─── Core check ────────────────────────────────────────────────────────

async function checkReminders(reminders: LocalReminder[]) {
  const now = nowHHMM();
  const today = todayDateStr();
  const settings = getAlarmSettings();

  const activeReminders = reminders.filter((r) => r.status === 'active');

  console.log(`[Alarm] Scheduler tick — now=${now} today=${today} active=${activeReminders.length}`);

  for (const reminder of activeReminders) {
    // Normalize dates: API returns ISO strings like '2026-06-27T18:30:00.000Z'
    // We must compare only the YYYY-MM-DD portion, not the full ISO string.
    const startDay = (reminder.startDate || '').slice(0, 10); // '2026-06-27'
    const endDay   = (reminder.endDate   || '').slice(0, 10); // '2026-06-27'

    // Skip if today is before the start date
    if (startDay && startDay > today) {
      console.log(`[Alarm] Skipping ${reminder.medicineName}: startDate ${startDay} > today ${today}`);
      continue;
    }
    // Skip if today is past the end date (only if endDate is set)
    if (endDay && endDay < today) {
      console.log(`[Alarm] Skipping ${reminder.medicineName}: endDate ${endDay} < today ${today}`);
      continue;
    }

    // Skip if this day-of-week is not scheduled
    if (!shouldFireToday(reminder)) continue;

    for (const time of reminder.times) {
      if (time !== now) continue;

      const alarmKey = `${reminder.id}:${today}:${time}`;
      if (firedAlarms.has(alarmKey)) continue; // Already fired this minute

      // Mark as fired BEFORE playing (prevents double-trigger)
      firedAlarms.add(alarmKey);
      saveFiredAlarm(alarmKey); // persist across page refreshes

      console.log(`[Alarm] Firing medicine reminder: ${reminder.medicineName} at ${time}`);

      // 1. Play alarm sound
      playAlarmSound();

      // 2. Show browser notification
      showAlarmNotification(reminder, time);

      // 3. Notify in-app modal subscribers
      notifyAlarmListeners({ reminder, time });

      // 4. Vibrate device (mobile browsers)
      if (settings.vibrationEnabled && 'vibrate' in navigator) {
        navigator.vibrate([400, 200, 400, 200, 400]);
      }

      // 5. Auto-stop alarm after configured timeout
      if (settings.autoStopSeconds > 0) {
        setTimeout(() => {
          stopAlarm();
        }, settings.autoStopSeconds * 1000);
      }
    }
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

let currentReminders: LocalReminder[] = [];

/** Update the list of reminders the scheduler watches */
export function updateAlarmReminders(reminders: LocalReminder[]) {
  currentReminders = reminders;
}

/**
 * Handle a medicine alarm triggered by an FCM push (app is in foreground).
 * Finds the matching reminder by ID from currentReminders and fires the alarm.
 * If reminder is not found (e.g. IndexedDB not yet loaded), fires a generic alarm.
 */
function handleFcmMedicineAlarm(event: Event) {
  const detail = (event as CustomEvent).detail as {
    reminderId?: string;
    medicineName?: string;
    dosage?: string;
    doctorName?: string;
    title?: string;
    body?: string;
  };

  // Find the matching reminder so we can show it in the modal
  const reminder = currentReminders.find(
    (r) => r.id === detail?.reminderId || String(r.id) === String(detail?.reminderId)
  );

  const settings = getAlarmSettings();

  // Play alarm sound immediately
  playAlarmSound();

  // Vibrate
  if (settings.vibrationEnabled && 'vibrate' in navigator) {
    navigator.vibrate([400, 200, 400, 200, 400]);
  }

  // Auto-stop after configured timeout
  if (settings.autoStopSeconds > 0) {
    setTimeout(() => stopAlarm(), settings.autoStopSeconds * 1000);
  }

  if (reminder) {
    // Show the full alarm modal via subscribers
    notifyAlarmListeners({ reminder, time: nowHHMM() });
  } else if (detail?.medicineName) {
    // Build a synthetic reminder from FCM data so the modal can still show
    const syntheticReminder: LocalReminder = {
      id: detail.reminderId || 'fcm-alarm',
      patientUserId: '',
      type: detail.doctorName ? 'doctor_prescription' : 'patient_custom',
      medicineName: detail.medicineName,
      dosage: detail.dosage || '',
      startDate: todayDateStr(),
      endDate: todayDateStr(),
      times: [nowHHMM()],
      status: 'active',
      doctorName: detail.doctorName || '',
      createdAt: new Date().toISOString(),
    };
    notifyAlarmListeners({ reminder: syntheticReminder, time: nowHHMM() });
  } else {
    // Reminder not in cache yet — just play sound (modal can't show without reminder data)
    console.warn('[Alarm] FCM reminder not found in local cache, playing sound only.');
  }
}

/** Start the alarm scheduler (idempotent — safe to call multiple times) */
export function startAlarmScheduler() {
  if (alarmIntervalId !== null) return; // Already running

  // Load today's already-fired alarms from localStorage
  // so a page refresh doesn't re-fire alarms that already played.
  loadFiredAlarms();

  // Check immediately on start
  void checkReminders(currentReminders);


  // Then check every 30 seconds
  alarmIntervalId = setInterval(() => {
    void checkReminders(currentReminders);
  }, 30_000);

  // Also listen for FCM-triggered medicine alarms (app is in foreground)
  // This fires when backend sends a push at the exact reminder time.
  window.addEventListener('medikwik:medicine-alarm', handleFcmMedicineAlarm);

  console.log('[Alarm] Medicine reminder scheduler started.');
}

/**
 * Ensures the alarm scheduler is running globally.
 * Safe to call from any page — starts once per session, then no-ops.
 */
export function ensureAlarmSchedulerRunning() {
  if (typeof window === 'undefined') return;
  startAlarmScheduler();
}

/** Stop the alarm scheduler */
export function stopAlarmScheduler() {
  if (alarmIntervalId !== null) {
    clearInterval(alarmIntervalId);
    alarmIntervalId = null;
    console.log('[Alarm] Scheduler stopped.');
  }
  window.removeEventListener('medikwik:medicine-alarm', handleFcmMedicineAlarm);
  stopAlarm();
}
