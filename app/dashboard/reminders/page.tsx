'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlarmClock,
  Bell,
  Calendar,
  ChevronLeft,
  Clock,
  Hospital,
  Moon,
  Pause,
  Pill,
  Play,
  Plus,
  RefreshCw,
  Stethoscope,
  Sun,
  Sunrise,
  Trash2,
  Volume2,
  VolumeX,
  X,
  AlertTriangle,
  BellRing,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchReminders,
  createReminder,
  updateReminder,
  pauseReminder,
  resumeReminder,
  deleteReminder,
  type MedicineReminder,
  type CreateReminderPayload,
  type UpdateReminderPayload,
} from '@/lib/patient-reminders';
import { PATIENT_DASHBOARD } from '@/lib/routes';
import { getPatientDB, type LocalReminder, type RepeatType } from '@/lib/db';
import { getActiveAccountId } from '@/lib/session';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSessionGuard } from '@/hooks/use-session-guard';
import { syncAllPatientData } from '@/lib/db/sync-engine';
import {
  startAlarmScheduler,
  stopAlarm,
  updateAlarmReminders,
  subscribeToAlarms,
  unlockAudio,
  playAlarmSound,
  getAlarmSettings,
  formatTime12h,
} from '@/lib/reminder-alarm';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Types                                                               */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

type StatusTab = 'active' | 'paused' | 'completed';
type SourceFilter = 'all' | 'doctor_prescription' | 'patient_custom';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Helpers                                                             */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'paused', label: 'Paused' },
  { key: 'completed', label: 'History' },
];

const REPEAT_TYPE_LABELS: Record<RepeatType, string> = {
  daily: 'Every Day',
  weekly: 'Weekly',
  custom_days: 'Custom Days',
  every_x_hours: 'Every X Hours',
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const SOURCE_FILTERS: { key: SourceFilter; label: string; icon: React.ReactNode }[] = [
  { key: 'all', label: 'All', icon: <Pill className="h-3.5 w-3.5" /> },
  { key: 'doctor_prescription', label: 'Doctor', icon: <Stethoscope className="h-3.5 w-3.5" /> },
  { key: 'patient_custom', label: 'My Alarms', icon: <AlarmClock className="h-3.5 w-3.5" /> },
];


function getTimeIcon(time: string) {
  const hour = parseInt(time.split(':')[0], 10);
  if (hour >= 5 && hour < 12) return <Sunrise className="h-3 w-3 text-amber-500" />;
  if (hour >= 12 && hour < 17) return <Sun className="h-3 w-3 text-orange-500" />;
  if (hour >= 17 && hour < 21) return <Moon className="h-3 w-3 text-indigo-400" />;
  return <Moon className="h-3 w-3 text-slate-400" />;
}

function getRemainingDays(endDate: string): number {
  const end = new Date(endDate);
  const now = new Date();
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000));
}

function formatDateShort(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(
      new Date(dateStr)
    );
  } catch {
    return dateStr;
  }
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Alarm firing modal                                                  */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function AlarmModal({
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
  const [selectedSnooze, setSelectedSnooze] = useState<5 | 10 | 15>(settings.snoozeDurationMinutes);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      {/* Animated pulsing ring */}
      <div className="relative flex flex-col items-center">
        {/* Outer ring pulses */}
        <div className="absolute h-44 w-44 animate-ping rounded-full bg-teal-500/20" />
        <div className="absolute h-36 w-36 animate-ping rounded-full bg-teal-500/30" style={{ animationDelay: '0.3s' }} />

        {/* Card */}
        <div className="relative mx-4 w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl">
          {/* Colored top bar */}
          <div className={`h-2 w-full ${isDoctor ? 'bg-gradient-to-r from-teal-500 to-cyan-500' : 'bg-gradient-to-r from-violet-500 to-fuchsia-500'}`} />

          <div className="px-6 py-6 text-center">
            {/* Icon + alarm animation */}
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-teal-50">
              <Volume2 className="h-10 w-10 animate-bounce text-teal-600" />
            </div>

            {/* Source badge */}
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
              isDoctor ? 'bg-teal-50 text-teal-700' : 'bg-violet-50 text-violet-700'
            }`}>
              {isDoctor ? (
                <><Stethoscope className="h-3 w-3" /> Doctor Created</>
              ) : (
                <><AlarmClock className="h-3 w-3" /> Your Alarm</>
              )}
            </span>

            {/* Medicine name */}
            <h2 className="mt-3 text-2xl font-extrabold text-slate-900">
              {reminder.medicineName}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {reminder.dosage}{reminder.frequency ? ` · ${reminder.frequency}` : ''}
            </p>

            {/* Doctor name if applicable */}
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
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Snooze for</p>
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

          {/* Actions */}
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

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Skeleton                                                            */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function ReminderSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-slate-100" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-36 rounded-md bg-slate-100" />
              <div className="h-3 w-20 rounded-md bg-slate-100" />
            </div>
            <div className="h-6 w-16 rounded-full bg-slate-100" />
          </div>
          <div className="flex gap-2">
            <div className="h-7 w-20 rounded-full bg-slate-50" />
            <div className="h-7 w-20 rounded-full bg-slate-50" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Empty state                                                         */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function EmptyState({
  statusTab,
  sourceFilter,
}: {
  statusTab: StatusTab;
  sourceFilter: SourceFilter;
}) {
  const messages: Record<StatusTab, { icon: React.ReactNode; title: string; subtitle: string }> = {
    active: {
      icon: <AlarmClock className="h-14 w-14 text-slate-200" />,
      title: 'No active reminders',
      subtitle:
        sourceFilter === 'doctor_prescription'
          ? 'When your doctor creates a prescription, reminders appear here automatically.'
          : sourceFilter === 'patient_custom'
            ? 'Tap the + button below to set your first medicine alarm.'
            : 'No active reminders yet. Doctor prescriptions or your custom alarms will show here.',
    },
    paused: {
      icon: <Pause className="h-14 w-14 text-slate-200" />,
      title: 'No paused reminders',
      subtitle: 'Reminders you pause will appear here so you can resume them later.',
    },
    completed: {
      icon: <Clock className="h-14 w-14 text-slate-200" />,
      title: 'No completed reminders',
      subtitle: 'Your finished medicine courses will be listed here for reference.',
    },
  };

  const { icon, title, subtitle } = messages[statusTab];

  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-slate-50">
        {icon}
      </div>
      <h3 className="text-base font-bold text-slate-800">{title}</h3>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-400">{subtitle}</p>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Reminder card                                                       */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function ReminderCard({
  reminder,
  onPause,
  onResume,
  onDelete,
  onEdit,
}: {
  reminder: MedicineReminder;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (reminder: MedicineReminder) => void;
}) {
  const isDoctor = reminder.type === 'doctor_prescription';
  const remaining = getRemainingDays(reminder.endDate);
  const isExpired = remaining === 0 && reminder.status === 'active';
  const [confirmDelete, setConfirmDelete] = useState(false);

  const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
    active: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Active' },
    paused: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Paused' },
    completed: { bg: 'bg-slate-100', text: 'text-slate-500', label: 'Completed' },
    cancelled: { bg: 'bg-red-50', text: 'text-red-500', label: 'Cancelled' },
  };
  const status = statusConfig[reminder.status] ?? statusConfig.completed;

  const repeatLabel = reminder.repeatType && reminder.repeatType !== 'daily'
    ? REPEAT_TYPE_LABELS[reminder.repeatType as RepeatType]
    : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      {/* ── Card header ─────────────────────────────────────────── */}
      <div className="flex items-start gap-3 p-4 pb-3">
        {/* Icon */}
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
            isDoctor
              ? 'bg-gradient-to-br from-teal-50 to-cyan-50'
              : 'bg-gradient-to-br from-violet-50 to-fuchsia-50'
          }`}
        >
          {isDoctor ? (
            <Stethoscope className="h-5 w-5 text-teal-600" />
          ) : (
            <AlarmClock className="h-5 w-5 text-violet-600" />
          )}
        </div>

        {/* Title / Dosage */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[0.9rem] font-bold text-slate-900">
              {reminder.medicineName}
            </h3>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${status.bg} ${status.text}`}
            >
              {status.label}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {reminder.dosage}
            {reminder.frequency ? ` · ${reminder.frequency}` : ''}
            {repeatLabel ? (
              <span className="ml-1 rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600">{repeatLabel}</span>
            ) : null}
          </p>
        </div>
      </div>

      {/* ── Time pills ──────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5 px-4 pb-3">
        {reminder.times.map((time) => (
          <span
            key={time}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-100"
          >
            {getTimeIcon(time)}
            {formatTime12h(time)}
          </span>
        ))}
      </div>

      {/* ── Meta row ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-50 bg-slate-50/60 px-4 py-2.5 text-[11px] text-slate-500">
        {/* Source badge */}
        <span className="inline-flex items-center gap-1 font-medium">
          {isDoctor ? (
            <>
              <Hospital className="h-3 w-3 text-teal-500" />
              {reminder.doctorName ? `Dr. ${reminder.doctorName}` : 'Doctor prescribed'}
            </>
          ) : (
            <>
              <AlarmClock className="h-3 w-3 text-violet-500" />
              Custom alarm
            </>
          )}
        </span>

        {/* Date range */}
        <span className="inline-flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {formatDateShort(reminder.startDate)} – {formatDateShort(reminder.endDate)}
        </span>

        {/* Remaining days */}
        {reminder.status === 'active' && remaining > 0 ? (
          <span className="inline-flex items-center gap-1 font-semibold text-teal-600">
            <Clock className="h-3 w-3" />
            {remaining} day{remaining !== 1 ? 's' : ''} left
          </span>
        ) : null}

        {isExpired ? (
          <span className="font-semibold text-amber-600">Course ended</span>
        ) : null}
      </div>

      {/* ── Actions ─────────────────────────────────────────────── */}
      {reminder.status === 'active' || reminder.status === 'paused' ? (
        <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-2.5">
          {reminder.status === 'active' ? (
            <button
              onClick={() => onPause(reminder.id)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-100 transition hover:bg-amber-100"
            >
              <Pause className="h-3.5 w-3.5" />
              Pause
            </button>
          ) : null}

          {reminder.status === 'paused' ? (
            <button
              onClick={() => onResume(reminder.id)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100 transition hover:bg-emerald-100"
            >
              <Play className="h-3.5 w-3.5" />
              Resume
            </button>
          ) : null}

          {/* Edit button — only for patient_custom reminders */}
          {!isDoctor ? (
            <button
              onClick={() => onEdit(reminder)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-100"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              Edit
            </button>
          ) : null}

          {/* Delete — only patient-custom reminders */}
          {!isDoctor ? (
            confirmDelete ? (
              <div className="ml-auto flex items-center gap-2">
                <span className="text-[11px] font-semibold text-red-500">Delete?</span>
                <button
                  onClick={() => { setConfirmDelete(false); onDelete(reminder.id); }}
                  className="rounded-lg bg-red-500 px-2.5 py-1 text-xs font-bold text-white transition hover:bg-red-600"
                >
                  Yes
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-red-500 transition hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}


/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Reminder Form (shared by Create and Edit modals)                    */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

type ReminderFormData = {
  medicineName: string;
  dosage: string;
  frequency: string;
  startDate: string;
  endDate: string;
  times: string[];
  repeatType: RepeatType;
  repeatDays: number[];
  repeatIntervalHours: number;
  notes: string;
};

const EMPTY_FORM: ReminderFormData = {
  medicineName: '',
  dosage: '',
  frequency: '',
  startDate: new Date().toISOString().split('T')[0],
  endDate: '',
  times: ['08:00'],
  repeatType: 'daily',
  repeatDays: [],
  repeatIntervalHours: 4,
  notes: '',
};

function ReminderFormModal({
  mode,
  initialData,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  initialData?: Partial<ReminderFormData> & { id?: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const [form, setForm] = useState<ReminderFormData>({
    ...EMPTY_FORM,
    ...(initialData ? {
      medicineName: initialData.medicineName || '',
      dosage: initialData.dosage || '',
      frequency: initialData.frequency || '',
      startDate: initialData.startDate || EMPTY_FORM.startDate,
      endDate: initialData.endDate || '',
      times: initialData.times && initialData.times.length > 0 ? initialData.times : ['08:00'],
      repeatType: initialData.repeatType || 'daily',
      repeatDays: initialData.repeatDays || [],
      repeatIntervalHours: initialData.repeatIntervalHours || 4,
      notes: initialData.notes || '',
    } : {}),
  });
  const [saving, setSaving] = useState(false);

  const addTime = () => {
    if (form.times.length >= 8) return;
    setForm((f) => ({ ...f, times: [...f.times, '12:00'] }));
  };

  const removeTime = (idx: number) => {
    setForm((f) => ({ ...f, times: f.times.filter((_, i) => i !== idx) }));
  };

  const updateTime = (idx: number, value: string) => {
    setForm((f) => {
      const times = [...f.times];
      times[idx] = value;
      return { ...f, times };
    });
  };

  const toggleRepeatDay = (day: number) => {
    setForm((f) => ({
      ...f,
      repeatDays: f.repeatDays.includes(day)
        ? f.repeatDays.filter((d) => d !== day)
        : [...f.repeatDays, day],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.medicineName.trim()) { toast.error('Medicine name is required.'); return; }
    if (!form.dosage.trim()) { toast.error('Dosage is required.'); return; }
    if (form.times.length === 0) { toast.error('Add at least one reminder time.'); return; }
    if (['weekly', 'custom_days'].includes(form.repeatType) && form.repeatDays.length === 0) {
      toast.error('Select at least one day for the repeat schedule.'); return;
    }
    if (form.endDate && new Date(form.endDate) < new Date(form.startDate)) {
      toast.error('End date must be on or after start date.'); return;
    }

    setSaving(true);
    try {
      const payload: CreateReminderPayload = {
        medicineName: form.medicineName.trim(),
        dosage: form.dosage.trim(),
        frequency: form.frequency.trim() || undefined,
        startDate: form.startDate,
        endDate: form.endDate || undefined,
        times: form.times,
        repeatType: form.repeatType,
        repeatDays: ['weekly', 'custom_days'].includes(form.repeatType) ? form.repeatDays : [],
        repeatIntervalHours: form.repeatType === 'every_x_hours' ? form.repeatIntervalHours : undefined,
        notes: form.notes.trim() || undefined,
      };

      const activeAccountId = getActiveAccountId();

      if (mode === 'create') {
        const newReminder = await createReminder(payload);
        if (newReminder && activeAccountId) {
          try {
            const db = getPatientDB(activeAccountId);
            await db.reminders.put({
              id: newReminder.id,
              patientUserId: activeAccountId,
              type: newReminder.type,
              medicineName: newReminder.medicineName,
              dosage: newReminder.dosage,
              frequency: newReminder.frequency,
              startDate: newReminder.startDate,
              endDate: newReminder.endDate,
              times: newReminder.times,
              status: newReminder.status,
              doctorName: newReminder.doctorName,
              hospitalName: newReminder.hospitalName,
              createdAt: newReminder.createdAt || new Date().toISOString(),
              notes: newReminder.notes || '',
              repeatType: newReminder.repeatType || 'daily',
              repeatDays: newReminder.repeatDays || [],
              repeatIntervalHours: newReminder.repeatIntervalHours ?? null,
            });
          } catch (dbErr) {
            console.error('[Reminders] Error saving reminder to Dexie:', dbErr);
          }
        }
        toast.success('Reminder created successfully!');
      } else {
        if (!initialData?.id) { toast.error('Cannot find reminder to edit.'); return; }
        const updated = await updateReminder(initialData.id, payload as UpdateReminderPayload);
        if (updated && activeAccountId) {
          try {
            const db = getPatientDB(activeAccountId);
            await db.reminders.update(initialData.id, {
              medicineName: updated.medicineName,
              dosage: updated.dosage,
              frequency: updated.frequency,
              startDate: updated.startDate,
              endDate: updated.endDate,
              times: updated.times,
              notes: updated.notes || '',
              repeatType: updated.repeatType || 'daily',
              repeatDays: updated.repeatDays || [],
              repeatIntervalHours: updated.repeatIntervalHours ?? null,
            });
          } catch (dbErr) {
            console.error('[Reminders] Error updating reminder in Dexie:', dbErr);
          }
        }
        toast.success('Reminder updated successfully!');
      }

      onSaved();
      onClose();
    } catch (err: any) {
      const is429 = err?.response?.status === 429;
      if (is429) {
        const waitSecs = err?.response?.data?.retryAfterSeconds;
        if (waitSecs && waitSecs > 60) {
          toast.error(`Too many requests. Wait ${Math.ceil(waitSecs / 60)} min.`);
        } else {
          toast.error('Too many requests. Please wait a moment.');
        }
      } else {
        toast.error(err?.response?.data?.message || err?.message || 'Failed to save reminder.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  };

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
    >
      <div className="w-full max-w-md rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {mode === 'create' ? 'New Medicine Alarm' : 'Edit Reminder'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {mode === 'create' ? 'Set a custom reminder for your medicine' : 'Update your alarm settings'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="max-h-[75vh] overflow-y-auto px-6 py-5">
          <div className="space-y-4">
            {/* Medicine name */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                Medicine Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.medicineName}
                onChange={(e) => setForm((f) => ({ ...f, medicineName: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                placeholder="e.g. Paracetamol 500mg"
                maxLength={200}
                autoFocus
              />
            </div>

            {/* Dosage + Frequency */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Dosage <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.dosage}
                  onChange={(e) => setForm((f) => ({ ...f, dosage: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                  placeholder="e.g. 1 tablet"
                  maxLength={100}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Frequency</label>
                <input
                  type="text"
                  value={form.frequency}
                  onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                  placeholder="e.g. After meals"
                />
              </div>
            </div>

            {/* Repeat Type */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Repeat</label>
              <div className="grid grid-cols-2 gap-2">
                {(['daily', 'weekly', 'custom_days', 'every_x_hours'] as RepeatType[]).map((rt) => (
                  <button
                    key={rt}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, repeatType: rt, repeatDays: [] }))}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                      form.repeatType === rt
                        ? 'border-teal-400 bg-teal-50 text-teal-700'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {REPEAT_TYPE_LABELS[rt]}
                  </button>
                ))}
              </div>
            </div>

            {/* Day picker for weekly/custom_days */}
            {['weekly', 'custom_days'].includes(form.repeatType) ? (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Days</label>
                <div className="flex gap-1.5 flex-wrap">
                  {WEEKDAY_LABELS.map((label, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleRepeatDay(i)}
                      className={`h-9 w-9 rounded-full text-xs font-bold transition ${
                        form.repeatDays.includes(i)
                          ? 'bg-teal-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {label.slice(0, 2)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Interval hours for every_x_hours */}
            {form.repeatType === 'every_x_hours' ? (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Every how many hours?
                </label>
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={form.repeatIntervalHours}
                  onChange={(e) => setForm((f) => ({ ...f, repeatIntervalHours: Number(e.target.value) }))}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                />
                <p className="mt-1 text-[10px] text-slate-400">Tip: Add multiple times below matching the interval (e.g. 08:00, 12:00, 16:00 for every 4 hrs).</p>
              </div>
            ) : null}

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Start Date <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  End Date
                  <span className="ml-1 text-[10px] font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  type="date"
                  value={form.endDate}
                  min={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                />
                {!form.endDate && (
                  <p className="mt-0.5 text-[10px] text-slate-400">Defaults to 1 year from start</p>
                )}
              </div>
            </div>

            {/* Reminder times */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-600">
                  Alarm Times <span className="text-red-400">*</span>
                </label>
                {form.times.length < 8 ? (
                  <button
                    type="button"
                    onClick={addTime}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-teal-600 transition hover:text-teal-700"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add time
                  </button>
                ) : null}
              </div>
              <div className="space-y-2">
                {form.times.map((time, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <AlarmClock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="time"
                        value={time}
                        onChange={(e) => updateTime(idx, e.target.value)}
                        className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                      />
                    </div>
                    {form.times.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeTime(idx)}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-300 transition hover:bg-red-50 hover:text-red-500"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                Notes
                <span className="ml-1 text-[10px] font-normal text-slate-400">(optional)</span>
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                maxLength={500}
                placeholder="e.g. Take after food, avoid alcohol..."
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-teal-400 focus:ring-2 focus:ring-teal-100 resize-none"
              />
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={saving}
            className="mt-6 w-full rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 py-3 text-sm font-bold text-white shadow-lg shadow-teal-500/20 transition hover:from-teal-700 hover:to-cyan-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : mode === 'create' ? 'Create Reminder' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Main page                                                           */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export default function RemindersPage() {
  useSessionGuard();
  const router = useRouter();
  const [statusTab, setStatusTab] = useState<StatusTab>('active');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingReminder, setEditingReminder] = useState<MedicineReminder | null>(null);

  const [notificationPermission, setNotificationPermission] = useState<string | null>(null);
  const [dismissedNotificationBanner, setDismissedNotificationBanner] = useState<boolean>(false);

  // Check notification permission state on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if ('Notification' in window) {
        const currentPermission = Notification.permission;
        setNotificationPermission(currentPermission);
        if (currentPermission === 'granted') {
          // Immediately generate/sync FCM token in background
          import('@/lib/firebase-messaging').then(async ({ requestNotificationPermission }) => {
            await requestNotificationPermission();
          }).catch(err => console.warn('[FCM] Auto-sync failed:', err));
        }
      } else {
        setNotificationPermission('unsupported');
      }
      
      const dismissed = sessionStorage.getItem('dismissed_notif_banner') === '1';
      setDismissedNotificationBanner(dismissed);
    }
  }, []);

  const handleEnableNotifications = async () => {
    try {
      const { requestNotificationPermission } = await import('@/lib/firebase-messaging');
      const token = await requestNotificationPermission();
      if (token) {
        toast.success('Push notifications enabled successfully!');
      } else if (Notification.permission === 'denied') {
        toast.error('Notification permission was denied. Please enable it in browser settings.');
      } else {
        toast.error('Notification permission request was cancelled or denied.');
      }
      setNotificationPermission(Notification.permission);
    } catch (err: any) {
      console.warn('[FCM] Error requesting notification permission:', err);
      const errMsg = typeof err?.message === 'string' ? err.message : '';
      if (errMsg.includes('push service error') || errMsg.includes('Registration failed')) {
        toast.error('Google push services are unavailable. Please ensure Chrome notifications are allowed in Android system settings.');
      } else {
        toast.error('Failed to request notification permission.');
      }
    }
  };

  const handleDismissBanner = () => {
    setDismissedNotificationBanner(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('dismissed_notif_banner', '1');
    }
  };

  // Active alarm state
  const [activeAlarm, setActiveAlarm] = useState<{ reminder: LocalReminder; time: string } | null>(null);
  const snoozeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeAccountId = getActiveAccountId();
  const db = activeAccountId ? getPatientDB(activeAccountId) : null;

  // Query Dexie reactively
  const dbReminders = useLiveQuery(
    () => {
      if (!db) return [];
      return db.reminders.toArray();
    },
    [db]
  );

  const allReminders = useMemo(() => {
    if (!dbReminders) return [];
    return dbReminders.filter((r) => {
      if (statusTab === 'active') return r.status === 'active';
      if (statusTab === 'paused') return r.status === 'paused';
      return r.status === 'completed' || r.status === 'cancelled';
    });
  }, [dbReminders, statusTab]);

  const loading = dbReminders === undefined;

  /* ── Background Data loading ───────────────────────────────────── */
  const loadReminders = useCallback(
    async (options?: { silent?: boolean; force?: boolean }) => {
      if (!activeAccountId) return;
      const silent = options?.silent ?? false;
      const force = options?.force ?? false;
      if (silent) setRefreshing(true);
      await syncAllPatientData(activeAccountId, force);
      setRefreshing(false);
    },
    [activeAccountId]
  );

  useEffect(() => {
    if (activeAccountId) {
      void loadReminders({ silent: true, force: true });
    }
  }, [loadReminders, activeAccountId]);

  /* ── Alarm scheduler ─────────────────────────────────────────── */
  useEffect(() => {
    // Unlock audio immediately — navigating to this page IS a user gesture.
    // This allows the MP3 alarm to play freely when the timer fires later.
    unlockAudio();

    // Keep trying to unlock on every tap/click in case the first attempt
    // was blocked (e.g. browser first-load policy on some mobile browsers).
    const tryUnlock = () => unlockAudio();
    document.addEventListener('click', tryUnlock, { once: true, passive: true });
    document.addEventListener('touchstart', tryUnlock, { once: true, passive: true });

    startAlarmScheduler();

    // Subscribe to alarm events to show the in-app modal
    const unsubscribe = subscribeToAlarms(({ reminder, time }) => {
      setActiveAlarm({ reminder, time });
    });

    return () => {
      unsubscribe();
      document.removeEventListener('click', tryUnlock);
      document.removeEventListener('touchstart', tryUnlock);
      // Do NOT call stopAlarmScheduler here — it runs globally.
      // Only stop the alarm SOUND if the component unmounts while ringing.
      stopAlarm();
    };
  }, []);

  // Keep the scheduler's reminder list in sync with IndexedDB
  useEffect(() => {
    if (dbReminders) {
      updateAlarmReminders(dbReminders as LocalReminder[]);
    }
  }, [dbReminders]);

  /* ── Alarm handlers ─────────────────────────────────────────── */
  const handleAlarmDismiss = () => {
    stopAlarm();
    setActiveAlarm(null);
    if (snoozeTimerRef.current) clearTimeout(snoozeTimerRef.current);
  };

  const handleAlarmSnooze = (minutes: number) => {
    stopAlarm();
    setActiveAlarm(null);
    if (snoozeTimerRef.current) clearTimeout(snoozeTimerRef.current);

    // Re-fire the same alarm in the selected number of minutes
    if (activeAlarm) {
      const { reminder, time } = activeAlarm;
      snoozeTimerRef.current = setTimeout(() => {
        setActiveAlarm({ reminder, time });
        if ('vibrate' in navigator) navigator.vibrate([400, 200, 400, 200, 400]);
        playAlarmSound();
      }, minutes * 60 * 1000);

      toast.info(`Snoozed! Alarm will repeat in ${minutes} minutes.`, { duration: 4000 });
    }
  };

  const handleEdit = (reminder: MedicineReminder) => {
    setEditingReminder(reminder);
  };

  /* ── Filtered list ─────────────────────────────────────────────── */
  const filteredReminders = useMemo(() => {
    if (sourceFilter === 'all') return allReminders;
    return allReminders.filter((r) => r.type === sourceFilter);
  }, [allReminders, sourceFilter]);

  /* ── Counts for source chips ───────────────────────────────────── */
  const doctorCount = useMemo(
    () => allReminders.filter((r) => r.type === 'doctor_prescription').length,
    [allReminders]
  );
  const customCount = useMemo(
    () => allReminders.filter((r) => r.type === 'patient_custom').length,
    [allReminders]
  );

  /* ── Actions ───────────────────────────────────────────────────── */
  const handlePause = async (id: string) => {
    try {
      if (db) {
        await db.reminders.update(id, { status: 'paused' });
      }
      await pauseReminder(id);
      toast.success('Reminder paused.');
    } catch {
      toast.error('Failed to pause reminder.');
      void loadReminders({ silent: true, force: true });
    }
  };

  const handleResume = async (id: string) => {
    try {
      if (db) {
        await db.reminders.update(id, { status: 'active' });
      }
      await resumeReminder(id);
      toast.success('Reminder resumed.');
    } catch {
      toast.error('Failed to resume reminder.');
      void loadReminders({ silent: true, force: true });
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this reminder?')) return;
    try {
      if (db) {
        await db.reminders.delete(id);
      }
      await deleteReminder(id);
      toast.success('Reminder deleted.');
    } catch {
      toast.error('Failed to delete reminder.');
      void loadReminders({ silent: true, force: true });
    }
  };

  /* ── Render ────────────────────────────────────────────────────── */
  return (
    <div className="mx-auto min-h-screen max-w-lg bg-slate-50 pb-28">
      {/* ─── Header ───────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-white shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => router.push(PATIENT_DASHBOARD)}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100"
            aria-label="Back to dashboard"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex flex-1 items-center gap-2">
            <Pill className="h-5 w-5 text-teal-600" />
            <h1 className="text-lg font-bold text-slate-900">Medicine Reminders</h1>
          </div>
          <button
            onClick={() => loadReminders({ silent: true, force: true })}
            disabled={refreshing}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* ─── Status tabs ──────────────────────────────────────────── */}
        <div className="flex border-b border-slate-200 px-4">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setStatusTab(t.key);
                setSourceFilter('all');
              }}
              className={`flex-1 border-b-2 py-2.5 text-center text-sm font-semibold transition ${
                statusTab === t.key
                  ? 'border-teal-600 text-teal-600'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Source filter chips ─────────────────────────────────────── */}
      {!loading ? (
        <div className="flex gap-2 px-4 py-3">
          {SOURCE_FILTERS.map((sf) => {
            const isActive = sourceFilter === sf.key;
            const count =
              sf.key === 'all'
                ? allReminders.length
                : sf.key === 'doctor_prescription'
                  ? doctorCount
                  : customCount;

            return (
              <button
                key={sf.key}
                onClick={() => setSourceFilter(sf.key)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  isActive
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300'
                }`}
              >
                {sf.icon}
                {sf.label}
                <span
                  className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {/* ─── Content ────────────────────────────────────────────────── */}
      <div className="space-y-3 px-4">
        {loading ? (
          <ReminderSkeleton />
        ) : filteredReminders.length === 0 ? (
          <EmptyState statusTab={statusTab} sourceFilter={sourceFilter} />
        ) : (
          filteredReminders.map((r) => (
            <ReminderCard
              key={r.id}
              reminder={r as any}
              onPause={handlePause}
              onResume={handleResume}
              onDelete={handleDelete}
              onEdit={handleEdit}
            />
          ))
        )}
      </div>

      {/* ─── FAB — Create new alarm ─────────────────────────────────── */}
      {statusTab === 'active' ? (
        <button
          onClick={() => setShowCreate(true)}
          className="fixed bottom-20 right-4 z-30 flex h-14 items-center gap-2 rounded-full bg-gradient-to-r from-teal-600 to-cyan-600 pl-5 pr-5 text-white shadow-lg shadow-teal-500/25 transition hover:from-teal-700 hover:to-cyan-700 active:scale-95 sm:pr-6"
          aria-label="Add medicine alarm"
        >
          <Plus className="h-5 w-5" />
          <span className="hidden text-sm font-bold sm:inline">Add Alarm</span>
        </button>
      ) : null}

      {/* ─── Create modal ───────────────────────────────────────────── */}
      {showCreate ? (
        <ReminderFormModal
          mode="create"
          onClose={() => setShowCreate(false)}
          onSaved={() => loadReminders({ silent: true, force: true })}
        />
      ) : null}

      {/* ─── Edit modal ────────────────────────────────────────────── */}
      {editingReminder ? (
        <ReminderFormModal
          mode="edit"
          initialData={{
            id: editingReminder.id,
            medicineName: editingReminder.medicineName,
            dosage: editingReminder.dosage,
            frequency: editingReminder.frequency,
            startDate: editingReminder.startDate,
            endDate: editingReminder.endDate,
            times: editingReminder.times,
            repeatType: (editingReminder as any).repeatType || 'daily',
            repeatDays: (editingReminder as any).repeatDays || [],
            repeatIntervalHours: (editingReminder as any).repeatIntervalHours || 4,
            notes: (editingReminder as any).notes || '',
          }}
          onClose={() => setEditingReminder(null)}
          onSaved={() => loadReminders({ silent: true, force: true })}
        />
      ) : null}

      {/* ─── Alarm firing modal ─────────────────────────────────────── */}
      {/* Shows when a medicine reminder time fires — full-screen overlay with alarm sound */}
      {activeAlarm ? (
        <AlarmModal
          reminder={activeAlarm.reminder}
          time={activeAlarm.time}
          onDismiss={handleAlarmDismiss}
          onSnooze={handleAlarmSnooze}
        />
      ) : null}

      {/* Premium Notification Permission Popup (Modal) */}
      {notificationPermission !== null &&
        notificationPermission !== 'granted' &&
        notificationPermission !== 'unsupported' &&
        !dismissedNotificationBanner && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            {/* Modal Container */}
            <div className="bg-white rounded-[2rem] max-w-md w-full p-6 sm:p-8 shadow-[0_24px_60px_-15px_rgba(15,23,42,0.3)] ring-1 ring-slate-100/50 relative overflow-hidden flex flex-col items-center text-center fade-up">
              {/* Top decorative gradient bar */}
              <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-teal-500 via-cyan-500 to-indigo-500" />
              
              {/* Close button in top-right */}
              <button
                onClick={handleDismissBanner}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-full hover:bg-slate-100 cursor-pointer"
                type="button"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Icon and Header */}
              {notificationPermission === 'denied' ? (
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-500 ring-1 ring-rose-100/50">
                  <AlertTriangle className="h-8 w-8" />
                </div>
              ) : (
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 text-teal-600 ring-1 ring-teal-100/50 relative">
                  {/* Ring indicator decoration */}
                  <span className="absolute -top-1 -right-1 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-teal-500"></span>
                  </span>
                  <BellRing className="h-8 w-8 animate-pulse" />
                </div>
              )}

              <h3 className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight">
                {notificationPermission === 'denied' ? 'Notifications are disabled on this device.' : 'Enable Notifications'}
              </h3>

              <div className="mt-4 text-left w-full max-w-sm mx-auto">
                {notificationPermission === 'denied' ? (
                  <div className="text-sm text-slate-655 font-medium space-y-3 leading-relaxed">
                    <p className="font-bold text-slate-700 text-center">Please enable notifications in both settings:</p>
                    <div className="space-y-2.5 text-slate-600">
                      <div className="flex items-start gap-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[10px] font-bold text-teal-600 ring-1 ring-teal-100/50 mt-0.5">1</span>
                        <span><strong>Chrome:</strong> Click the settings/lock icon in the URL bar → Site Settings → Notifications → Allow</span>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[10px] font-bold text-teal-600 ring-1 ring-teal-100/50 mt-0.5">2</span>
                        <span><strong>Android App:</strong> Click the <strong>Open Notification Settings</strong> button below to enable app-level notifications</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-650 font-medium space-y-1.5">
                    <p className="font-bold text-slate-855 mb-2">Receive:</p>
                    <p className="flex items-center gap-2 text-slate-700">✓ Medicine reminders</p>
                    <p className="flex items-center gap-2 text-slate-700">✓ Appointment updates</p>
                    <p className="flex items-center gap-2 text-slate-700">✓ Admission updates</p>
                    <p className="flex items-center gap-2 text-slate-700">✓ Prescription alerts</p>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="mt-6 flex flex-col sm:flex-row gap-3 w-full sm:justify-center">
                <button
                  className="rounded-full bg-slate-100 hover:bg-slate-200 px-6 py-2.5 text-sm font-semibold text-slate-600 transition-all cursor-pointer w-full sm:w-auto"
                  onClick={handleDismissBanner}
                  type="button"
                >
                  {notificationPermission === 'denied' ? 'Close' : 'Later'}
                </button>
                {notificationPermission === 'default' ? (
                  <button
                    className="rounded-full bg-teal-600 hover:bg-teal-700 active:bg-teal-800 px-8 py-2.5 text-sm font-bold text-white shadow-lg shadow-teal-600/25 transition-all hover:shadow-teal-600/35 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer w-full sm:w-auto"
                    onClick={handleEnableNotifications}
                    type="button"
                  >
                    Enable Notifications
                  </button>
                ) : (
                  <button
                    className="rounded-full bg-teal-600 hover:bg-teal-700 active:bg-teal-800 px-8 py-2.5 text-sm font-bold text-white shadow-lg shadow-teal-600/25 transition-all hover:shadow-teal-600/35 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer w-full sm:w-auto"
                    onClick={() => {
                      window.location.href = 'https://www.medikwikhealthbuddy.in/settings/notifications';
                    }}
                    type="button"
                  >
                    Open Notification Settings
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
