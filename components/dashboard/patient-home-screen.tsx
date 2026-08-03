'use client';

import {
  Activity,
  Building2,
  CalendarDays,
  CalendarPlus,
  Clock3,
  FileText,
  FlaskConical,
  HeartPulse,
  LayoutGrid,
  LogOut,
  MapPin,
  Pill,
  RefreshCw,
  ShieldCheck,
  Bell,
  BellRing,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts';
import { toast } from 'sonner';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { logoutPatient } from '@/lib/api';
import PatientHeaderMenu from '@/components/dashboard/patient-header-menu';
import PatientAvatar from '@/components/dashboard/patient-avatar';
import { isPatientProfileComplete } from '@/lib/patient-profile';
import {
  type DashboardAppointment,
  type DashboardPrescription,
  type DashboardPrescriptionMedicine,
  type PatientDashboardData,
  fetchPatientDashboard,
} from '@/lib/patient-dashboard';
import { getPatientDesktopNavItems } from '@/lib/patient-nav';
import PlatformAdBanner from '@/components/dashboard/platform-ad-banner';
import { PATIENT_APPOINTMENTS, PATIENT_DASHBOARD, PATIENT_HOSPITAL, PATIENT_LOGIN_PATH, PATIENT_PRESCRIPTIONS, PATIENT_PROFILE } from '@/lib/routes';
import { useSessionGuard } from '@/hooks/use-session-guard';
import { getPatientDB, type LocalReminder } from '@/lib/db';
import { getActiveAccountId, screenNeedsFreshLoad, markScreenLoaded, clearForceFreshLoad } from '@/lib/session';
import { startAlarmScheduler, updateAlarmReminders, unlockAudio } from '@/lib/reminder-alarm';

const desktopNavItems = getPatientDesktopNavItems('dashboard');

const summaryCardThemes = [
  {
    badge: 'text-emerald-600',
    icon: 'bg-rose-100 text-rose-500',
    panel: 'from-rose-50 via-white to-rose-100/80',
    ring: 'ring-rose-100',
  },
  {
    badge: 'text-emerald-600',
    icon: 'bg-sky-100 text-sky-500',
    panel: 'from-sky-50 via-white to-cyan-100/80',
    ring: 'ring-sky-100',
  },
  {
    badge: 'text-blue-600',
    icon: 'bg-amber-100 text-amber-500',
    panel: 'from-amber-50 via-white to-orange-100/80',
    ring: 'ring-amber-100',
  },
  {
    badge: 'text-blue-600',
    icon: 'bg-teal-100 text-teal-600',
    panel: 'from-teal-50 via-white to-cyan-100/80',
    ring: 'ring-teal-100',
  },
];

const longDateFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
});

const weekdayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
});

const numberFormatter = new Intl.NumberFormat();

const visitsChartConfig = {
  visits: {
    color: '#0d9488',
    label: 'Visits',
  },
} satisfies ChartConfig;

const formatShortDate = (value: string | null | undefined) => {
  if (!value) return 'Not available';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';

  return shortDateFormatter.format(date);
};

const formatRelativeDay = (value: string | null | undefined) => {
  if (!value) return 'Upcoming';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Upcoming';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays > 1 && diffDays < 7) return weekdayFormatter.format(target);

  return longDateFormatter.format(target);
};

const sanitizePhone = (value: string | null | undefined) =>
  String(value || '').replace(/[^\d+]/g, '');

const buildPatientCode = (value: string) => {
  const clean = String(value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `MW-${(clean.slice(-6) || '000000').padStart(6, '0')}`;
};

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = error as { response?: { data?: { message?: string } } };
    return response.response?.data?.message || 'Unable to load your patient dashboard right now.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unable to load your patient dashboard right now.';
};

type SummaryMetric = {
  badge: string;
  hint: string;
  icon: LucideIcon;
  label: string;
  unit?: string;
  value: string;
};



function DesktopSidebar({
  completion,
  onSelect,
  onSignOut,
  signingOut,
  onProfileClick,
}: {
  completion: PatientDashboardData['profileCompletion'] | null;
  onSelect: (item: { href?: string; label: string }) => void;
  onSignOut: () => void;
  signingOut: boolean;
  onProfileClick?: () => void;
}) {
  return (
    <aside className="hidden w-[320px] border-r border-slate-200 bg-white xl:flex xl:flex-col">
      <div className="border-b border-slate-200 px-7 py-6">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-teal-700 to-sky-700 text-white">
            <HeartPulse className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[1.9rem] font-bold leading-none text-slate-950">healthcare</p>
            <p className="mt-1 text-sm text-slate-500">Patient app</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-2 px-5 py-6">
        {desktopNavItems.map((item) => {
          const Icon = item.icon;
          const active = Boolean(item.active);

          return (
            <button
              className={`flex w-full items-center gap-4 rounded-[1.35rem] px-4 py-3.5 text-left text-[1.05rem] font-semibold transition-colors ${
                active
                  ? 'bg-gradient-to-r from-teal-700 to-sky-700 text-white'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
              key={item.id}
              onClick={() => {
                if (!active) onSelect(item);
              }}
              type="button"
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto space-y-4 border-t border-slate-200 px-5 py-6">
        <div
          onClick={onProfileClick}
          className="cursor-pointer transition-all hover:scale-[1.02] active:scale-98 hover:shadow-md rounded-[1.8rem] bg-[linear-gradient(180deg,#ecf9ff_0%,#dff3fb_100%)] px-5 py-5 ring-1 ring-cyan-100"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-700">Profile score</p>
              <p className="mt-3 text-5xl font-bold text-slate-950">
                {completion?.percentage ?? 0}
              </p>
            </div>
            <ShieldCheck className="mt-1 h-5 w-5 text-teal-600" />
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
            <div
              className="h-full rounded-full bg-gradient-to-r from-teal-700 to-sky-700"
              style={{ width: `${completion?.percentage ?? 0}%` }}
            />
          </div>
          <p
            className={`mt-3 text-sm ${
              completion && isPatientProfileComplete(completion) ? 'text-emerald-600' : 'text-amber-700'
            }`}
          >
            {completion
              ? isPatientProfileComplete(completion)
                ? 'Profile complete — you can book appointments'
                : `${completion.completedFields} of ${completion.totalFields} fields complete`
              : 'Complete your patient profile'}
          </p>
        </div>

        <button
          className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-950"
          disabled={signingOut}
          onClick={onSignOut}
          type="button"
        >
          <LogOut className="h-5 w-5" />
          <span className="font-medium">{signingOut ? 'Signing out...' : 'Sign out'}</span>
        </button>
      </div>
    </aside>
  );
}

function HeroBanner({
  appointment,
  completion,
  onPrimaryAction,
  onSecondaryAction,
  onProfileClick,
  onCallAction,
}: {
  appointment: DashboardAppointment | null;
  completion: PatientDashboardData['profileCompletion'];
  onPrimaryAction: () => void;
  onSecondaryAction: () => void;
  onProfileClick?: () => void;
  onCallAction?: (phone: string) => void;
}) {
  const title = appointment
    ? `${appointment.doctorName}${appointment.department ? ` - ${appointment.department}` : ''}`
    : 'No upcoming appointment';

  const subtitle = appointment
    ? `${formatRelativeDay(appointment.appointmentDate)}${
        appointment.appointmentTime ? ` at ${appointment.appointmentTime}` : ''
      } / ${appointment.hospital?.name || 'Assigned care facility'}`
    : 'Your next scheduled hospital visit will appear here as soon as it is confirmed.';

  return (
    <section className="overflow-hidden rounded-[1.5rem] sm:rounded-[2rem] bg-gradient-to-r from-teal-700 via-cyan-700 to-sky-700 p-4 sm:p-6 lg:p-8 text-white shadow-[0_28px_70px_-48px_rgba(8,145,178,0.7)]">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_200px] lg:items-start">
        <div className="min-w-0">
          <p className="text-sm sm:text-lg text-cyan-50/90">
            {appointment ? 'Next appointment' : 'Care overview'}
          </p>
          <h2 className="mt-2 sm:mt-3 max-w-4xl text-xl sm:text-3xl md:text-[2.55rem] font-bold leading-tight">
            {title}
          </h2>
          <p className="mt-2 sm:mt-3 text-sm sm:text-base leading-6 sm:leading-7 text-cyan-50 sm:text-[1.05rem]">{subtitle}</p>
          <div className="mt-4 sm:mt-6 flex flex-wrap gap-2.5 sm:gap-3">
            <button
              className="rounded-full bg-white px-4 py-2 sm:px-5 sm:py-3 text-xs sm:text-sm font-semibold text-teal-700 animate-button-glow shadow-md transition-transform hover:-translate-y-0.5"
              onClick={onPrimaryAction}
              type="button"
            >
              {appointment ? 'Book another' : 'Book visit'}
            </button>
            {appointment?.hospital?.phone && onCallAction && (
              <button
                className="rounded-full bg-white/15 px-4 py-2 sm:px-5 sm:py-3 text-xs sm:text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20"
                onClick={() => {
                  const phone = appointment?.hospital?.phone;
                  if (phone) onCallAction(phone);
                }}
                type="button"
              >
                Call hospital
              </button>
            )}
            <button
              className="rounded-full bg-white/15 px-4 py-2 sm:px-5 sm:py-3 text-xs sm:text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20"
              onClick={onSecondaryAction}
              type="button"
            >
              View medicines
            </button>
          </div>
        </div>

        <div
          onClick={onProfileClick}
          className="cursor-pointer transition-all hover:bg-white/20 active:scale-98 hidden rounded-[1.8rem] bg-white/14 p-5 backdrop-blur-sm lg:block"
        >
          <p className="text-base text-cyan-50/90">Profile score</p>
          <p className="mt-2 text-6xl font-bold leading-none">{completion.percentage}</p>
          <p className="mt-3 text-base text-cyan-50/85">
            {completion.completedFields} of {completion.totalFields} fields complete
          </p>
        </div>
      </div>
    </section>
  );
}

function SummaryCard({
  index,
  metric,
}: {
  index: number;
  metric: SummaryMetric;
}) {
  const Icon = metric.icon;
  const theme = summaryCardThemes[index % summaryCardThemes.length];

  return (
    <section
      className={`rounded-[1.5rem] sm:rounded-[2rem] bg-gradient-to-br ${theme.panel} p-4 sm:p-6 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.28)] ring-1 ${theme.ring}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={`flex h-10 w-10 sm:h-12 sm:w-12 lg:h-14 lg:w-14 shrink-0 items-center justify-center rounded-full ${theme.icon}`}>
          <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
        </div>
        <p className={`text-xs sm:text-sm font-semibold truncate ${theme.badge}`}>{metric.badge}</p>
      </div>

      <p className="mt-6 sm:mt-8 lg:mt-10 text-[0.7rem] sm:text-[0.78rem] font-medium uppercase tracking-[0.2em] sm:tracking-[0.24em] text-slate-500">
        {metric.label}
      </p>

      <div className="mt-2 sm:mt-3 flex items-end gap-1 sm:gap-2">
        <p className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-none text-slate-950">{metric.value}</p>
        {metric.unit ? (
          <span className="pb-0.5 sm:pb-1 text-sm sm:text-lg font-medium text-slate-500">{metric.unit}</span>
        ) : null}
      </div>

      <p className="mt-3 sm:mt-4 text-xs sm:text-sm leading-5 sm:leading-6 text-slate-500">{metric.hint}</p>
    </section>
  );
}

function VisitTrendCard({
  visits,
}: {
  visits: PatientDashboardData['monthlyVisits'];
}) {
  const totalVisits = visits.reduce((sum, item) => sum + item.visits, 0);
  const averageVisits = visits.length ? totalVisits / visits.length : 0;
  const formattedAverage = averageVisits % 1 === 0 ? String(averageVisits) : averageVisits.toFixed(1);

  return (
    <section className="rounded-[1.5rem] sm:rounded-[2rem] bg-white p-4 sm:p-6 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.28)] ring-1 ring-slate-100">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
        <div>
          <h3 className="text-lg sm:text-xl md:text-[1.65rem] font-bold leading-tight text-slate-950">
            Visit activity - last 6 months
          </h3>
          <p className="mt-2 text-xs sm:text-sm leading-5 sm:leading-6 text-slate-500">
            Built from your real appointment history. Hover the graph to inspect each month.
          </p>
        </div>
        <p className="pt-0.5 sm:pt-1 text-xs sm:text-sm font-medium text-slate-500 whitespace-nowrap">avg {formattedAverage} visits</p>
      </div>

      <div className="mt-6 h-[290px] w-full">
        <ChartContainer className="h-full w-full" config={visitsChartConfig}>
          <AreaChart
            data={visits}
            margin={{
              bottom: 6,
              left: 0,
              right: 6,
              top: 8,
            }}
          >
            <defs>
              <linearGradient id="visits-area-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#e2e8f0" stopOpacity="0.06" />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 8" vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="month"
              minTickGap={18}
              tick={{ fill: '#64748b', fontSize: 12 }}
              tickLine={false}
              tickMargin={10}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  valueFormatter={(value) => `${value} visit${value === 1 ? '' : 's'}`}
                />
              }
              cursor={{ stroke: '#0d9488', strokeOpacity: 0.18 }}
            />
            <Area
              activeDot={{ fill: '#0d9488', r: 5, stroke: '#ffffff', strokeWidth: 2 }}
              dataKey="visits"
              fill="url(#visits-area-fill)"
              fillOpacity={1}
              stroke="var(--color-visits)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={3}
              type="monotone"
            />
          </AreaChart>
        </ChartContainer>
      </div>
    </section>
  );
}

function MedicationRow({
  medicine,
}: {
  medicine: DashboardPrescriptionMedicine;
}) {
  return (
    <div className="flex items-start gap-3 rounded-[1.5rem] py-3">
      <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
        <Pill className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-3">
          <div className="min-w-0">
            <p className="truncate text-base sm:text-lg font-semibold text-slate-950">{medicine.name}</p>
            <p className="mt-1 text-xs sm:text-sm text-slate-500">{medicine.dosage}</p>
          </div>
          <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">
            {medicine.frequency}
          </span>
        </div>
        <p className="mt-2 text-xs sm:text-sm text-slate-500">Duration: {medicine.duration}</p>
      </div>
    </div>
  );
}

function MedicationCard({
  prescription,
}: {
  prescription: DashboardPrescription | null;
}) {
  if (!prescription) {
    return (
      <section className="rounded-[1.5rem] sm:rounded-[2rem] bg-white p-4 sm:p-6 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.28)] ring-1 ring-slate-100">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="flex h-10 w-10 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <Pill className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div>
            <h3 className="text-lg sm:text-xl md:text-[1.65rem] font-bold leading-tight text-slate-950">
              Current medication
            </h3>
            <p className="mt-2 text-xs sm:text-sm leading-5 sm:leading-6 text-slate-500">
              When a prescription is added to this patient account, the medicines will appear here.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className="rounded-[1.5rem] sm:rounded-[2rem] bg-white p-4 sm:p-6 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.28)] ring-1 ring-slate-100"
      id="current-medication"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg sm:text-xl md:text-[1.65rem] font-bold leading-tight text-slate-950">
            Current medication
          </h3>
          <p className="mt-2 text-xs sm:text-sm leading-5 sm:leading-6 text-slate-500">
            {prescription.doctorName ? `Dr. ${prescription.doctorName}` : 'Doctor prescription'}
            {prescription.hospital?.name ? ` / ${prescription.hospital.name}` : ''}
          </p>
        </div>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-semibold text-emerald-700 whitespace-nowrap">
          {prescription.medicines.length} meds
        </span>
      </div>

      <div className="mt-4 rounded-[1.25rem] sm:rounded-[1.5rem] bg-slate-50 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-500">
          <span className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-sky-600" />
            {formatShortDate(prescription.prescriptionDate)}
          </span>
          {prescription.followUpDate ? (
            <span className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-amber-500" />
              Follow-up {formatShortDate(prescription.followUpDate)}
            </span>
          ) : null}
          {prescription.hospital?.city ? (
            <span className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-slate-400" />
              {prescription.hospital.city}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-5 divide-y divide-slate-100">
        {prescription.medicines.slice(0, 4).map((medicine, index) => (
          <MedicationRow key={`${medicine.name}-${medicine.dosage}-${index}`} medicine={medicine} />
        ))}
      </div>

      {prescription.instruction ? (
        <div className="mt-4 rounded-[1.5rem] border border-dashed border-teal-200 bg-teal-50 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
            Doctor note
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-700">{prescription.instruction}</p>
        </div>
      ) : null}
    </section>
  );
}

function DashboardSkeletonState() {
  return (
    <div className="space-y-6">
      <div className="h-[240px] animate-pulse rounded-[2rem] bg-white/80" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            className="h-[220px] animate-pulse rounded-[2rem] bg-white/80"
            key={`summary-skeleton-${index}`}
          />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.7fr)]">
        <div className="h-[390px] animate-pulse rounded-[2rem] bg-white/80" />
        <div className="h-[390px] animate-pulse rounded-[2rem] bg-white/80" />
      </div>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <section className="rounded-[2rem] border border-red-100 bg-white px-6 py-8 text-center shadow-[0_18px_50px_-36px_rgba(15,23,42,0.2)]">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-500">
        <Activity className="h-6 w-6" />
      </div>
      <h2 className="mt-4 text-2xl font-bold text-slate-950">Unable to load dashboard</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">{message}</p>
      <button
        className="mt-6 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
        onClick={onRetry}
        type="button"
      >
        Try again
      </button>
    </section>
  );
}

export default function PatientHomeScreen() {
  useSessionGuard();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dashboard, setDashboard] = useState<PatientDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const activeAppointment = useMemo(() => {
    if (!dashboard) return null;
    const all = [
      dashboard.nextAppointment,
      ...dashboard.upcomingAppointments,
    ].filter(Boolean) as DashboardAppointment[];
    return all.find((app) => app.status === 'Scheduled' || app.status === 'Confirmed') || null;
  }, [dashboard]);

  // Auto-sync FCM token in background if permission is already granted
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        import('@/lib/firebase-messaging').then(async ({ requestNotificationPermission }) => {
          await requestNotificationPermission();
        }).catch(err => console.warn('[FCM] Auto-sync failed:', err));
      }
    }
  }, []);

  // Start the medicine reminder alarm scheduler so alarms fire even when
  // the user is browsing the dashboard (not just the reminders page).
  useEffect(() => {
    // Unlock audio on mount — the user tapped to get here, so we can unlock.
    unlockAudio();
    // Also unlock on any subsequent tap in case the first attempt failed.
    const tryUnlock = () => unlockAudio();
    document.addEventListener('click', tryUnlock, { once: true, passive: true });
    document.addEventListener('touchstart', tryUnlock, { once: true, passive: true });

    startAlarmScheduler();

    // Pre-load reminders into the scheduler from IndexedDB
    const activeAccountId = getActiveAccountId();
    if (activeAccountId) {
      import('@/lib/db').then(({ getPatientDB }) => {
        getPatientDB(activeAccountId).reminders.toArray().then((reminders) => {
          updateAlarmReminders(reminders as LocalReminder[]);
        }).catch(() => { /* ignore */ });
      });
    }

    return () => {
      document.removeEventListener('click', tryUnlock);
      document.removeEventListener('touchstart', tryUnlock);
      // Note: do NOT stop the scheduler on unmount — it's a global singleton.
    };
  }, []);

  const loadDashboard = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;

      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
        setError(null);
      }

      try {
        const nextDashboard = await fetchPatientDashboard();

        // Cache snapshot to IndexedDB
        const activeAccountId = getActiveAccountId();
        if (activeAccountId) {
          try {
            const db = getPatientDB(activeAccountId);
            await db.syncMeta.put({
              key: 'dashboard_snapshot',
              value: JSON.stringify(nextDashboard),
            });
          } catch (dbErr) {
            console.error('[Dashboard] Error caching snapshot:', dbErr);
          }
        }

        startTransition(() => {
          setDashboard(nextDashboard);
          setError(null);
        });
      } catch (nextError: any) {
        const is429 = nextError?.response?.status === 429;

        if (is429 || silent) {
          // For silent/background refreshes OR rate-limited: never show error or toast.
          // The user already has cached data on screen — no disruption.
          console.warn('[Dashboard] Background fetch skipped (rate-limited or silent):', is429 ? '429' : nextError?.message);
        } else {
          // First load with no cache — show the error state
          setError(getErrorMessage(nextError));
          setDashboard(null);
        }
      } finally {
        if (silent) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [startTransition]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const token = localStorage.getItem('patient_access_token');
    if (!token) {
      router.replace(PATIENT_LOGIN_PATH);
      return;
    }

    const activeAccountId = getActiveAccountId();

    // After an account switch: clear this account's IndexedDB first (properly
    // awaited), then load fresh data from the API. Old accounts keep their own
    // IndexedDB intact so switching back restores their data.
    if (screenNeedsFreshLoad('home')) {
      clearForceFreshLoad(); // consume the global flag if set
      void (async () => {
        if (activeAccountId) {
          try {
            const { clearPatientDB } = await import('@/lib/db');
            await clearPatientDB(activeAccountId);
          } catch {
            // best-effort — not fatal, proceed with API load regardless
          }
        }
        await loadDashboard();
        markScreenLoaded('home');
      })();
      return;
    }

    if (activeAccountId) {
      const db = getPatientDB(activeAccountId);
      db.syncMeta.get('dashboard_snapshot').then((cached) => {
        if (cached) {
          // Verify the snapshot belongs to the current account before using it
          try {
            const parsed = JSON.parse(cached.value);
            if (parsed?.profile?.id && parsed.profile.id !== activeAccountId) {
              // Snapshot is from a different account — discard and reload
              void db.syncMeta.delete('dashboard_snapshot').catch(() => {});
              void loadDashboard();
              return;
            }
          } catch {
            // Corrupted snapshot — discard
            void db.syncMeta.delete('dashboard_snapshot').catch(() => {});
            void loadDashboard();
            return;
          }
          setDashboard(JSON.parse(cached.value));
          setLoading(false);
          // Fetch silently in the background
          void loadDashboard({ silent: true });
        } else {
          void loadDashboard();
        }
      }).catch(() => {
        void loadDashboard();
      });
    } else {
      void loadDashboard();
    }
  }, [loadDashboard, router]);


  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleProfileUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      console.log('[Dashboard] Received profile:updated event, refreshing...', detail);

      // Immediately apply credit changes from the socket payload for instant UI feedback
      if (detail && (detail.prescriptionCredits !== undefined || detail.reportCredits !== undefined)) {
        startTransition(() => {
          setDashboard((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              profile: {
                ...prev.profile,
                ...(detail.prescriptionCredits !== undefined && { prescriptionCredits: detail.prescriptionCredits }),
                ...(detail.reportCredits !== undefined && { reportCredits: detail.reportCredits }),
              },
            };
          });
        });
      }

      // Confirm with a background API refresh
      void loadDashboard({ silent: true });
    };

    window.addEventListener('patient-profile-updated', handleProfileUpdate);
    return () => {
      window.removeEventListener('patient-profile-updated', handleProfileUpdate);
    };
  }, [loadDashboard, startTransition]);


  const handleUnavailableSection = (label: string) => {
    toast.info(`${label} is coming soon.`);
  };

  const handleNavAction = useCallback(
    (item: { href?: string; label: string }) => {
      if (item.href) {
        router.push(item.href);
        return;
      }

      handleUnavailableSection(item.label);
    },
    [router]
  );

  const handleCall = (phone: string | null) => {
    const sanitized = sanitizePhone(phone);
    if (!sanitized) {
      toast.info('Phone number has not been added yet.');
      return;
    }

    window.location.href = `tel:${sanitized}`;
  };

  const handleScrollToMedication = () => {
    document.getElementById('current-medication')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const handleSignOut = async () => {
    try {
      setSigningOut(true);
      await logoutPatient();
      router.replace(PATIENT_LOGIN_PATH);
    } catch {
      toast.error('Unable to sign out cleanly right now.');
      router.replace(PATIENT_LOGIN_PATH);
    } finally {
      setSigningOut(false);
    }
  };

  const summaryMetrics = useMemo<SummaryMetric[]>(() => {
    if (!dashboard) return [];

    return [
      {
        badge: `+${dashboard.stats.upcomingVisits} upcoming`,
        hint: `${dashboard.stats.completedVisits} completed appointments on record`,
        icon: HeartPulse,
        label: 'Total visits',
        value: numberFormatter.format(dashboard.stats.totalVisits),
      },
      {
        badge: activeAppointment?.status || 'Open',
        hint: activeAppointment
          ? `${formatRelativeDay(activeAppointment.appointmentDate)}${
              activeAppointment.appointmentTime
                ? ` at ${activeAppointment.appointmentTime}`
                : ''
            }`
          : 'No upcoming appointment has been scheduled yet',
        icon: Activity,
        label: 'Upcoming',
        value: numberFormatter.format(dashboard.stats.upcomingVisits),
      },
      {
        badge: dashboard.latestPrescription
          ? formatShortDate(dashboard.latestPrescription.prescriptionDate)
          : 'No Rx',
        hint: dashboard.latestPrescription?.diagnosis || 'No active prescription available',
        icon: Pill,
        label: 'Medicines',
        value: numberFormatter.format(dashboard.stats.activeMedicineCount),
      },
      {
        badge: `${dashboard.stats.careTeamCount} care team`,
        hint:
          dashboard.patientRecord.primaryHospitalName ||
          dashboard.hospitals[0]?.name ||
          'No hospital linked yet',
        icon: Building2,
        label: 'Hospitals',
        value: numberFormatter.format(dashboard.stats.hospitalCount),
      },
    ];
  }, [dashboard]);

  return (
    <div className="min-h-screen bg-[#eef6fa] text-slate-950">
      <div className="mx-auto flex min-h-screen max-w-[1920px]">
        <DesktopSidebar
          completion={dashboard?.profileCompletion ?? null}
          onSelect={handleNavAction}
          onSignOut={() => {
            void handleSignOut();
          }}
          signingOut={signingOut}
          onProfileClick={() => router.push(PATIENT_PROFILE)}
        />

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="border-b border-slate-200 bg-white">
            <div className="flex items-center gap-4 px-4 py-4 sm:px-7 lg:px-8">
              <div className="min-w-0 flex-1">
                <h1 className="text-xl sm:text-3xl lg:text-[2.25rem] font-bold leading-tight text-slate-950">
                  Welcome back, {dashboard?.profile.firstName || 'there'}
                </h1>
                <p className="mt-1 text-xs sm:text-sm text-slate-500">
                  Here&apos;s your health snapshot for today
                </p>
              </div>

              <button
                className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-950 lg:inline-flex"
                onClick={() => {
                  void loadDashboard({ silent: true });
                }}
                type="button"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>

              {dashboard ? (
                <PatientHeaderMenu
                  avatar={dashboard.profile.avatar}
                  firstName={dashboard.profile.firstName}
                  id={dashboard.profile.id}
                  initials={dashboard.profile.initials}
                  name={dashboard.profile.name}
                />
              ) : (
                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-teal-700 to-sky-700" />
              )}
            </div>
          </header>

          <main className="flex-1 px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-7 lg:px-8 xl:pb-8">
            {loading ? (
              <DashboardSkeletonState />
            ) : error && !dashboard ? (
              <ErrorState
                message={error}
                onRetry={() => {
                  void loadDashboard();
                }}
              />
            ) : dashboard ? (
              <div className="space-y-8">
                <HeroBanner
                  appointment={activeAppointment}
                  completion={dashboard.profileCompletion}
                  onPrimaryAction={() => {
                    router.push(PATIENT_APPOINTMENTS);
                  }}
                  onCallAction={(phone) => {
                    handleCall(phone);
                  }}
                  onSecondaryAction={handleScrollToMedication}
                  onProfileClick={() => router.push(PATIENT_PROFILE)}
                />



                {/* My Credits Dashboard section */}
                <section className="bg-white rounded-[1.5rem] sm:rounded-[2rem] p-5 sm:p-6 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.28)] ring-1 ring-slate-100">
                  <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">My Credits Balance</h3>
                      <p className="text-xs text-slate-500">Welcome credits granted automatically for uploading files</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
                        Active Account
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
                    <div className="rounded-[1.2rem] bg-gradient-to-br from-indigo-50 to-purple-50/50 p-4 ring-1 ring-indigo-100/50">
                      <p className="text-xs font-semibold text-indigo-700">Report Credits</p>
                      <p className="mt-2 text-3xl font-extrabold text-slate-900">{dashboard.profile.reportCredits}</p>
                      <p className="mt-1 text-[10px] text-slate-500 font-medium">Used for uploading reports</p>
                    </div>
                    <div className="rounded-[1.2rem] bg-gradient-to-br from-teal-50 to-emerald-50/50 p-4 ring-1 ring-teal-100/50">
                      <p className="text-xs font-semibold text-teal-700">Prescription Credits</p>
                      <p className="mt-2 text-3xl font-extrabold text-slate-900">{dashboard.profile.prescriptionCredits}</p>
                      <p className="mt-1 text-[10px] text-slate-500 font-medium">Used for prescriptions</p>
                    </div>
                    <div className="rounded-[1.2rem] bg-gradient-to-br from-rose-50 to-orange-50/50 p-4 ring-1 ring-rose-100/50">
                      <p className="text-xs font-semibold text-rose-700">Total Used</p>
                      <p className="mt-2 text-3xl font-extrabold text-slate-900">{dashboard.profile.totalCreditsUsed || 0}</p>
                      <p className="mt-1 text-[10px] text-slate-500 font-medium">Successful transactions</p>
                    </div>
                    <div className="rounded-[1.2rem] bg-gradient-to-br from-slate-50 to-slate-100/50 p-4 ring-1 ring-slate-200/50">
                      <p className="text-xs font-semibold text-slate-600">Last Credit Activity</p>
                      <p className="mt-2 text-sm font-bold text-slate-800 truncate">
                        {dashboard.profile.lastCreditUsage
                          ? new Date(dashboard.profile.lastCreditUsage).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          : 'No history yet'}
                      </p>
                      <p className="mt-1.5 text-[10px] text-slate-500 font-medium font-sans">Upload or manual action</p>
                    </div>
                  </div>
                </section>

                <section>
                  <h2 className="text-base sm:text-lg md:text-[1.45rem] font-semibold text-slate-700">Today&apos;s care summary</h2>
                  <div className="mt-3 sm:mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                    {summaryMetrics.map((metric, index) => (
                      <SummaryCard index={index} key={metric.label} metric={metric} />
                    ))}
                  </div>
                </section>

                <section className="grid gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1.42fr)_minmax(360px,0.72fr)]">
                  <VisitTrendCard visits={dashboard.monthlyVisits} />
                  <MedicationCard prescription={dashboard.latestPrescription} />
                </section>
              </div>
            ) : (
              <ErrorState
                message="We could not find your dashboard details yet."
                onRetry={() => {
                  void loadDashboard();
                }}
              />
            )}
          </main>
        </div>
      </div>


      <PlatformAdBanner />
    </div>
  );
}
