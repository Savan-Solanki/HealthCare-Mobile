'use client';

import {
  Activity,
  ArrowLeft,
  Building2,
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  FlaskConical,
  HeartPulse,
  LayoutGrid,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  MoreVertical,
  Phone,
  Pencil,
  Pill,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
  Ban,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, useTransition, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { logoutPatient } from '@/lib/api';
import {
  cancelPatientAppointment,
  createPatientAppointment,
  fetchPatientBookingAvailability,
  fetchPatientBookingDoctors,
  fetchPatientBookingOptions,
  updatePatientAppointment,
  type PatientBookingDoctor,
  type PatientBookingHospital,
  type PatientBookingOptions,
} from '@/lib/patient-appointments';
import {
  type DashboardAppointment,
  type PatientDashboardData,
  fetchPatientDashboard,
} from '@/lib/patient-dashboard';
import { useSessionGuard } from '@/hooks/use-session-guard';
import { getPatientDB } from '@/lib/db';
import { getActiveAccountId, screenNeedsFreshLoad, markScreenLoaded, clearForceFreshLoad } from '@/lib/session';
import { syncAllPatientData } from '@/lib/db/sync-engine';
import {
  PATIENT_APPOINTMENTS,
  PATIENT_DASHBOARD,
  PATIENT_HOSPITAL,
  PATIENT_LOGIN_PATH,
  PATIENT_PRESCRIPTIONS,
  PATIENT_PROFILE,
} from '@/lib/routes';
import PatientHeaderMenu from '@/components/dashboard/patient-header-menu';
import PatientAvatar from '@/components/dashboard/patient-avatar';
import PlatformAdBanner from '@/components/dashboard/platform-ad-banner';
import { isPatientProfileComplete } from '@/lib/patient-profile';
import { getPatientDesktopNavItems } from '@/lib/patient-nav';

type StepId = 'hospital' | 'doctor' | 'schedule' | 'details';

type PatientDetailsForm = {
  firstName: string;
  lastName: string;
  email: string;
  purpose: string;
  description: string;
};

type EditAppointmentForm = PatientDetailsForm & {
  appointmentDate: string;
  appointmentTime: string;
};

const createEmptyEditAppointmentForm = (): EditAppointmentForm => ({
  appointmentDate: '',
  appointmentTime: '',
  firstName: '',
  lastName: '',
  email: '',
  purpose: '',
  description: '',
});

type ConfirmedAppointment = {
  hospitalName: string;
  doctorName: string;
  date: string;
  time: string;
  patientName: string;
};

type NavItem = {
  id: string;
  href?: string;
  icon: LucideIcon;
  label: string;
  active?: boolean;
};

const desktopNavItems = getPatientDesktopNavItems('book');

const steps: Array<{ id: StepId; label: string }> = [
  { id: 'hospital', label: 'Hospital' },
  { id: 'doctor', label: 'Doctor' },
  { id: 'schedule', label: 'Date & Time' },
  { id: 'details', label: 'Patient Details' },
];

const longDateFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const compactDateFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
});

const weekdayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
});

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  currency: 'INR',
  maximumFractionDigits: 0,
  style: 'currency',
});

const toDateValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateValue = (value: string | null | undefined) => {
  if (!value) return '--';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '--';
  return longDateFormatter.format(date);
};

const formatTimeValue = (value: string | null | undefined) => {
  if (!value) return '--';
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;

  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return timeFormatter.format(date);
};

const buildPatientCode = (value: string) => {
  const clean = String(value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `MW-${(clean.slice(-6) || '000000').padStart(6, '0')}`;
};

const sanitizePhone = (value: string | null | undefined) =>
  String(value || '').replace(/[^\d+]/g, '');

const normalizeDoctorLabel = (value: string | null | undefined) =>
  String(value || '')
    .replace(/^dr\.?\s+/i, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = error as { response?: { data?: { message?: string } } };
    return response.response?.data?.message || fallback;
  }

  if (error instanceof Error) return error.message;
  return fallback;
};



function DesktopSidebar({
  completion,
  onNavigate,
  onSignOut,
  signingOut,
  onProfileClick,
}: {
  completion: PatientDashboardData['profileCompletion'] | null;
  onNavigate: (item: NavItem) => void;
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
                if (!active) onNavigate(item);
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

function Stepper({
  currentStep,
  maxStepIndex,
  onSelectStep,
}: {
  currentStep: StepId;
  maxStepIndex: number;
  onSelectStep: (step: StepId) => void;
}) {
  const currentIndex = steps.findIndex((item) => item.id === currentStep);

  return (
    <ol className="grid gap-2 rounded-[1.5rem] border border-slate-200 bg-white p-3 shadow-[0_18px_50px_-42px_rgba(15,23,42,0.26)] sm:grid-cols-4 sm:p-4">
      {steps.map((item, index) => {
        const isComplete = index < currentIndex;
        const isActive = item.id === currentStep;
        const canOpen = index <= maxStepIndex;

        return (
          <li className="flex items-center gap-2" key={item.id}>
            <button
              className={`flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left text-sm font-semibold transition-colors ${
                isActive
                  ? 'bg-teal-50 text-slate-950'
                  : canOpen
                    ? 'text-slate-700 hover:bg-slate-50'
                    : 'cursor-not-allowed text-slate-400'
              }`}
              disabled={!canOpen}
              onClick={() => onSelectStep(item.id)}
              type="button"
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  isComplete
                    ? 'bg-emerald-500 text-white'
                    : isActive
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-100 text-slate-500'
                }`}
              >
                {isComplete ? <Check className="h-4 w-4" /> : index + 1}
              </span>
              <span>{item.label}</span>
            </button>
            {index < steps.length - 1 ? (
              <span
                className={`hidden h-px min-w-5 flex-1 sm:block ${
                  index < currentIndex ? 'bg-emerald-400' : 'bg-slate-200'
                }`}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function EmptyState({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50/70 px-5 py-10 text-center">
      <Activity className="mx-auto h-9 w-9 text-slate-300" />
      <h3 className="mt-4 text-base font-bold text-slate-950">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="grid gap-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          className="h-[86px] animate-pulse rounded-[1.25rem] bg-slate-100"
          key={`booking-loading-${index}`}
        />
      ))}
    </div>
  );
}

function BookingSummary({
  date,
  doctor,
  hospital,
  time,
}: {
  date: string;
  doctor: PatientBookingDoctor | null;
  hospital: PatientBookingHospital | null;
  time: string;
}) {
  const rows = [
    { label: 'Hospital', value: hospital?.name || '--' },
    { label: 'Doctor', value: doctor?.fullName ? `Dr. ${doctor.fullName}` : '--' },
    { label: 'Date', value: date ? formatDateValue(date) : '--' },
    { label: 'Time', value: time ? formatTimeValue(time) : '--' },
  ];

  return (
    <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_-42px_rgba(15,23,42,0.26)]">
      <h2 className="text-base font-bold text-slate-950">Booking summary</h2>
      <dl className="mt-4 space-y-3">
        {rows.map((row) => (
          <div className="grid grid-cols-[98px_minmax(0,1fr)] gap-3 text-sm" key={row.label}>
            <dt className="text-slate-500">{row.label}</dt>
            <dd className="min-w-0 text-right font-semibold text-slate-950">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function UpcomingVisits({
  actionAppointmentId,
  appointments,
  onCancel,
  onContactHospital,
  onEdit,
}: {
  actionAppointmentId: string | null;
  appointments: DashboardAppointment[];
  onCancel: (appointment: DashboardAppointment) => void;
  onContactHospital: (appointment: DashboardAppointment) => void;
  onEdit: (appointment: DashboardAppointment) => void;
}) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  return (
    <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_-42px_rgba(15,23,42,0.26)]">
      <h2 className="text-base font-bold text-slate-950">Upcoming visits</h2>
      {appointments.length ? (
        <div className="mt-4 space-y-3">
          {appointments.map((appointment) => {
            const canPatientManage = appointment.status === 'Scheduled';
            const menuOpen = openMenuId === appointment.id;
            const busy = actionAppointmentId === appointment.id;

            return (
              <article className="relative rounded-[1.25rem] bg-slate-50 p-4 pr-13" key={appointment.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold text-slate-950">Dr. {appointment.doctorName}</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {appointment.department} {appointment.hospital?.name ? `- ${appointment.hospital.name}` : ''}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      appointment.status === 'Confirmed'
                        ? 'bg-emerald-50 text-emerald-700'
                        : appointment.status === 'Scheduled'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {appointment.status}
                  </span>
                </div>

                <button
                  aria-expanded={menuOpen}
                  aria-label="Appointment actions"
                  className="absolute right-2 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-white hover:text-slate-950"
                  disabled={busy}
                  onClick={() => setOpenMenuId((current) => (current === appointment.id ? null : appointment.id))}
                  type="button"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
                </button>

                {menuOpen ? (
                  <div className="absolute right-2 top-12 z-20 w-44 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 shadow-xl">
                    {canPatientManage ? (
                      <>
                        <button
                          className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                          onClick={() => {
                            setOpenMenuId(null);
                            onEdit(appointment);
                          }}
                          type="button"
                        >
                          <Pencil className="h-4 w-4 text-teal-600" />
                          Edit booking
                        </button>
                        <button
                          className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-semibold text-red-600 transition hover:bg-red-50"
                          onClick={() => {
                            setOpenMenuId(null);
                            onCancel(appointment);
                          }}
                          type="button"
                        >
                          <Trash2 className="h-4 w-4" />
                          Cancel booking
                        </button>
                      </>
                    ) : (
                      <button
                        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                        onClick={() => {
                          setOpenMenuId(null);
                          onContactHospital(appointment);
                        }}
                        type="button"
                      >
                        <Phone className="h-4 w-4 text-teal-600" />
                        Contact hospital
                      </button>
                    )}
                  </div>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-3 text-xs font-medium text-teal-700">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {formatDateValue(appointment.appointmentDate?.slice(0, 10))}
                  </span>
                  {appointment.appointmentTime ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Clock3 className="h-3.5 w-3.5" />
                      {formatTimeValue(appointment.appointmentTime)}
                    </span>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 rounded-[1.25rem] bg-slate-50 px-4 py-5 text-sm leading-6 text-slate-500">
          No appointments yet.
        </p>
      )}
    </section>
  );
}

function ContactHospitalModal({
  appointment,
  onClose,
}: {
  appointment: DashboardAppointment | null;
  onClose: () => void;
}) {
  if (!appointment) return null;

  const hospital = appointment.hospital;
  const phone = sanitizePhone(hospital?.phone);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/45 px-3 py-4 sm:items-center sm:justify-center">
      <section className="w-full rounded-[1.5rem] bg-white p-5 shadow-2xl sm:max-w-md sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Contact hospital</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Confirmed appointments can be changed or cancelled by the hospital team.
            </p>
          </div>
          <button
            aria-label="Close"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 rounded-[1.25rem] bg-slate-50 p-4">
          <p className="text-sm font-bold text-slate-950">{hospital?.name || 'Care facility'}</p>
          {hospital?.phone ? (
            <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-teal-700">
              <Phone className="h-4 w-4" />
              {hospital.phone}
            </p>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Phone number has not been added yet.</p>
          )}
          {hospital?.address || hospital?.city ? (
            <p className="mt-2 flex items-start gap-2 text-sm leading-6 text-slate-600">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <span>{[hospital.address, hospital.city].filter(Boolean).join(', ')}</span>
            </p>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-200 px-5 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-teal-700 px-5 text-sm font-bold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!phone}
            onClick={() => {
              if (phone) window.location.href = `tel:${phone}`;
            }}
            type="button"
          >
            Call hospital
          </button>
        </div>
      </section>
    </div>
  );
}

function CancelAppointmentDialog({
  appointment,
  cancelling,
  onClose,
  onConfirm,
}: {
  appointment: DashboardAppointment | null;
  cancelling: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!appointment) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/45 px-3 py-4 sm:items-center sm:justify-center">
      <section className="w-full rounded-[1.5rem] bg-white p-5 shadow-2xl sm:max-w-md sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Cancel booking</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              This will cancel your scheduled visit with Dr. {appointment.doctorName}.
            </p>
          </div>
          <button
            aria-label="Close"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
            disabled={cancelling}
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 rounded-[1.25rem] bg-red-50 px-4 py-3 text-sm font-medium leading-6 text-red-700">
          {formatDateValue(appointment.appointmentDate?.slice(0, 10))}
          {appointment.appointmentTime ? ` at ${formatTimeValue(appointment.appointmentTime)}` : ''}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-200 px-5 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
            disabled={cancelling}
            onClick={onClose}
            type="button"
          >
            Keep booking
          </button>
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-red-600 px-5 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={cancelling}
            onClick={onConfirm}
            type="button"
          >
            {cancelling ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Cancelling
              </>
            ) : (
              'Cancel booking'
            )}
          </button>
        </div>
      </section>
    </div>
  );
}

function EditAppointmentModal({
  appointment,
  form,
  loadingSlots,
  saving,
  slots,
  onChange,
  onClose,
  onSubmit,
}: {
  appointment: DashboardAppointment | null;
  form: EditAppointmentForm;
  loadingSlots: boolean;
  saving: boolean;
  slots: string[];
  onChange: (next: Partial<EditAppointmentForm>) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (!appointment) return null;

  const todayValue = toDateValue(new Date());
  const canSave =
    form.appointmentDate &&
    form.appointmentTime &&
    form.firstName.trim() &&
    form.lastName.trim() &&
    form.email.trim() &&
    form.purpose.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/45 px-3 py-4 sm:items-center sm:justify-center">
      <section className="max-h-[92vh] w-full overflow-y-auto rounded-[1.5rem] bg-white p-5 shadow-2xl sm:max-w-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Edit booking</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Dr. {appointment.doctorName} {appointment.hospital?.name ? `- ${appointment.hospital.name}` : ''}
            </p>
          </div>
          <button
            aria-label="Close"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
            disabled={saving}
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form className="mt-5 grid gap-4" onSubmit={onSubmit}>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Date</span>
            <input
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-950 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
              min={todayValue}
              onChange={(event) => onChange({ appointmentDate: event.target.value, appointmentTime: '' })}
              required
              type="date"
              value={form.appointmentDate}
            />
          </label>

          <div>
            <p className="text-sm font-semibold text-slate-700">Time slot</p>
            {loadingSlots ? (
              <div className="mt-3 flex min-h-[88px] items-center justify-center rounded-[1.25rem] bg-slate-50 text-sm font-medium text-slate-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading available slots
              </div>
            ) : slots.length ? (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {slots.map((slot) => {
                  const active = form.appointmentTime === slot;

                  return (
                    <button
                      className={`min-h-11 rounded-[1rem] border px-3 text-sm font-bold transition-colors ${
                        active
                          ? 'border-teal-600 bg-teal-50 text-teal-800'
                          : 'border-slate-200 bg-white text-slate-950 hover:border-teal-300'
                      }`}
                      key={slot}
                      onClick={() => onChange({ appointmentTime: slot })}
                      type="button"
                    >
                      {formatTimeValue(slot)}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 rounded-[1.25rem] bg-slate-50 px-4 py-5 text-sm leading-6 text-slate-500">
                No slots are available for this date.
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">First name</span>
              <input
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-950 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
                onChange={(event) => onChange({ firstName: event.target.value })}
                required
                value={form.firstName}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Last name</span>
              <input
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-950 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
                onChange={(event) => onChange({ lastName: event.target.value })}
                required
                value={form.lastName}
              />
            </label>
          </div>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Email address</span>
            <input
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-950 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
              onChange={(event) => onChange({ email: event.target.value })}
              required
              type="email"
              value={form.email}
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Purpose of appointment</span>
            <input
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-950 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
              onChange={(event) => onChange({ purpose: event.target.value })}
              required
              value={form.purpose}
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Description</span>
            <textarea
              className="min-h-[104px] w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium leading-6 text-slate-950 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
              onChange={(event) => onChange({ description: event.target.value })}
              value={form.description}
            />
          </label>

          <div className="grid gap-3 pt-1 sm:grid-cols-2">
            <button
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-200 px-5 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
              disabled={saving}
              onClick={onClose}
              type="button"
            >
              Close
            </button>
            <button
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-teal-700 px-5 text-sm font-bold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canSave || loadingSlots || saving}
              type="submit"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving
                </>
              ) : (
                'Save changes'
              )}
            </button>
          </div>
        </form>
      </section>
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
      <h2 className="mt-4 text-2xl font-bold text-slate-950">Unable to load booking</h2>
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

function AppointmentConfirmedCard({
  appointment,
  onBookAnother,
  onDashboard,
}: {
  appointment: ConfirmedAppointment;
  onBookAnother: () => void;
  onDashboard: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-[2rem] border border-teal-100 bg-white shadow-[0_28px_80px_-55px_rgba(8,145,178,0.55)]">
      <div className="bg-gradient-to-br from-teal-700 via-cyan-700 to-sky-700 px-5 py-8 text-center text-white sm:px-8 sm:py-10">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white/15 ring-8 ring-white/10">
          <CheckCircle2 className="h-11 w-11" />
        </div>
        <h2 className="mt-6 text-2xl font-bold tracking-tight sm:text-3xl">Your appointment is confirmed</h2>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-cyan-50 sm:text-base">
          We sent the booking to the hospital and doctor. You can manage the visit from your dashboard.
        </p>
      </div>

      <div className="p-5 sm:p-7">
        <div className="grid gap-3 rounded-[1.5rem] bg-slate-50 p-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400">Hospital</p>
            <p className="mt-1 text-sm font-bold text-slate-950">{appointment.hospitalName}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400">Doctor</p>
            <p className="mt-1 text-sm font-bold text-slate-950">Dr. {appointment.doctorName}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400">Date</p>
            <p className="mt-1 text-sm font-bold text-slate-950">{formatDateValue(appointment.date)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400">Time</p>
            <p className="mt-1 text-sm font-bold text-slate-950">{formatTimeValue(appointment.time)}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs font-semibold uppercase text-slate-400">Patient</p>
            <p className="mt-1 text-sm font-bold text-slate-950">{appointment.patientName}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            className="flex min-h-12 items-center justify-center rounded-full bg-gradient-to-r from-teal-600 to-sky-600 px-5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5"
            onClick={onDashboard}
            type="button"
          >
            Go to dashboard
          </button>
          <button
            className="flex min-h-12 items-center justify-center rounded-full border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 transition-colors hover:border-slate-300 hover:text-slate-950"
            onClick={onBookAnother}
            type="button"
          >
            Book another visit
          </button>
        </div>
      </div>
    </section>
  );
}

function ProfileIncompleteBanner({
  missingFields,
  onCompleteProfile,
}: {
  missingFields: string[];
  onCompleteProfile: () => void;
}) {
  return (
    <section className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-bold text-amber-900">Complete your health profile to book</p>
          <p className="mt-1 text-sm text-amber-800/90">
            Add your profile photo and medical details before scheduling an appointment.
          </p>
          {missingFields.length > 0 ? (
            <p className="mt-2 text-xs font-medium text-amber-900/80">
              Still needed: {missingFields.join(', ')}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onCompleteProfile}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-amber-900 px-5 text-sm font-bold text-white transition hover:bg-amber-950"
        >
          Complete profile
        </button>
      </div>
    </section>
  );
}

export default function PatientAppointmentScreen() {
  useSessionGuard();
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewParam = searchParams.get('view');
  const [activeTab, setActiveTab] = useState<'book' | 'list'>('book');

  useEffect(() => {
    if (viewParam === 'list') {
      setActiveTab('list');
    } else {
      setActiveTab('book');
    }
  }, [viewParam]);

  const [, startTransition] = useTransition();
  const [bookingOptions, setBookingOptions] = useState<PatientBookingOptions | null>(null);
  const [dashboard, setDashboard] = useState<PatientDashboardData | null>(null);
  const [doctors, setDoctors] = useState<PatientBookingDoctor[]>([]);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [doctorOnLeave, setDoctorOnLeave] = useState(false);
  const [currentStep, setCurrentStep] = useState<StepId>('hospital');
  const [selectedHospitalId, setSelectedHospitalId] = useState('');
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [confirmedAppointment, setConfirmedAppointment] = useState<ConfirmedAppointment | null>(null);
  const [details, setDetails] = useState<PatientDetailsForm>({
    firstName: '',
    lastName: '',
    email: '',
    purpose: '',
    description: '',
  });
  const [loading, setLoading] = useState(true);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingAppointment, setEditingAppointment] = useState<DashboardAppointment | null>(null);
  const [editDoctorId, setEditDoctorId] = useState('');
  const [editForm, setEditForm] = useState<EditAppointmentForm>(() => createEmptyEditAppointmentForm());
  const [editSlots, setEditSlots] = useState<string[]>([]);
  const [loadingEditSlots, setLoadingEditSlots] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [cancelAppointmentTarget, setCancelAppointmentTarget] = useState<DashboardAppointment | null>(null);
  const [cancellingAppointment, setCancellingAppointment] = useState(false);
  const [contactAppointment, setContactAppointment] = useState<DashboardAppointment | null>(null);
  const [appointmentActionId, setAppointmentActionId] = useState<string | null>(null);

  const dateOptions = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return Array.from({ length: 7 }).map((_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() + index);

      return {
        day: String(date.getDate()),
        label: index === 0 ? 'Today' : weekdayFormatter.format(date),
        month: compactDateFormatter.format(date).replace(String(date.getDate()), '').trim(),
        value: toDateValue(date),
      };
    });
  }, []);

  const selectedHospital = useMemo(
    () => bookingOptions?.hospitals.find((hospital) => hospital.id === selectedHospitalId) || null,
    [bookingOptions, selectedHospitalId]
  );

  const selectedDoctor = useMemo(
    () => doctors.find((doctor) => doctor.id === selectedDoctorId) || null,
    [doctors, selectedDoctorId]
  );

  const upcomingAppointments = useMemo(() => {
    if (!dashboard) return [];

    const all = [
      dashboard.nextAppointment,
      ...dashboard.upcomingAppointments,
    ].filter(Boolean) as DashboardAppointment[];

    return all
      .filter((app) => app.status === 'Scheduled' || app.status === 'Confirmed')
      .slice(0, 2);
  }, [dashboard]);

  const maxStepIndex = useMemo(() => {
    if (selectedHospitalId && selectedDoctorId && selectedDate && selectedTime) return 3;
    if (selectedHospitalId && selectedDoctorId) return 2;
    if (selectedHospitalId) return 1;
    return 0;
  }, [selectedDate, selectedDoctorId, selectedHospitalId, selectedTime]);

  const isProfileComplete = isPatientProfileComplete(dashboard?.profileCompletion);

  const requireCompleteProfile = useCallback(() => {
    if (isProfileComplete) return true;

    toast.error('Complete your health profile before booking an appointment.');
    router.push(PATIENT_PROFILE);
    return false;
  }, [isProfileComplete, router]);

  const loadInitialData = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
      setError(null);
    }

    try {
      const [nextBookingOptions, nextDashboard] = await Promise.all([
        fetchPatientBookingOptions(),
        fetchPatientDashboard(),
      ]);

      setBookingOptions(nextBookingOptions);
      setDashboard(nextDashboard);

      // Save snapshot to IndexedDB
      const activeAccountId = getActiveAccountId();
      if (activeAccountId) {
        try {
          const db = getPatientDB(activeAccountId);
          await db.syncMeta.put({
            key: 'dashboard_snapshot',
            value: JSON.stringify(nextDashboard),
          });
          // Perform a background sync as well to keep tables aligned
          await syncAllPatientData(activeAccountId, true);
        } catch (dbErr) {
          console.error('[Appointments] Error caching snapshot/sync:', dbErr);
        }
      }

      startTransition(() => {
        setDetails({
          firstName: nextBookingOptions.profile.firstName,
          lastName: nextBookingOptions.profile.lastName,
          email: nextBookingOptions.profile.email,
          purpose: '',
          description: '',
        });
      });
    } catch (nextError: any) {
      const is429 = nextError?.response?.status === 429;
      if (is429 || options?.silent) {
        // Rate-limited or background refresh — show cached data, no toast, no error
        console.warn('[Appointments] Fetch skipped:', is429 ? '429' : nextError?.message);
      } else {
        setError(getErrorMessage(nextError, 'Unable to load booking details right now.'));
        setBookingOptions(null);
        setDashboard(null);
      }
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [startTransition]);

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
    if (screenNeedsFreshLoad('appointments')) {
      clearForceFreshLoad();
      void (async () => {
        if (activeAccountId) {
          try {
            const { clearPatientDB } = await import('@/lib/db');
            await clearPatientDB(activeAccountId);
          } catch {
            // best-effort — not fatal, proceed with API load regardless
          }
        }
        await loadInitialData();
        markScreenLoaded('appointments');
      })();
      return;
    }

    if (activeAccountId) {
      const db = getPatientDB(activeAccountId);
      db.syncMeta.get('dashboard_snapshot').then((cached) => {
        if (cached) {
          setDashboard(JSON.parse(cached.value));
          setLoading(false);
          // Silent background load
          void loadInitialData({ silent: true });
        } else {
          void loadInitialData();
        }
      }).catch(() => {
        void loadInitialData();
      });
    } else {
      void loadInitialData();
    }
  }, [loadInitialData, router]);

  useEffect(() => {
    if (!selectedDoctorId || !selectedDate) return;

    let isActive = true;
    setLoadingSlots(true);

    fetchPatientBookingAvailability(selectedDoctorId, selectedDate)
      .then((availability) => {
        if (isActive) {
          setAvailableSlots(availability.slots);
          setDoctorOnLeave(!!availability.isOnLeave);
        }
      })
      .catch((nextError) => {
        if (isActive) {
          setAvailableSlots([]);
          setDoctorOnLeave(false);
          toast.error(getErrorMessage(nextError, 'Unable to load available time slots.'));
        }
      })
      .finally(() => {
        if (isActive) setLoadingSlots(false);
      });

    return () => {
      isActive = false;
    };
  }, [selectedDate, selectedDoctorId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleSlotsUpdated = (event: CustomEvent<{ doctorId: string; date: string }>) => {
      const { doctorId, date } = event.detail;
      if (selectedDoctorId === doctorId && selectedDate === date) {
        setLoadingSlots(true);
        fetchPatientBookingAvailability(selectedDoctorId, selectedDate)
          .then((availability) => {
            setAvailableSlots(availability.slots);
            setDoctorOnLeave(!!availability.isOnLeave);
          })
          .catch(() => {})
          .finally(() => setLoadingSlots(false));
      }

      if (editingAppointment && editDoctorId === doctorId && editForm.appointmentDate === date) {
        setLoadingEditSlots(true);
        fetchPatientBookingAvailability(editDoctorId, date, editingAppointment.id)
          .then((availability) => {
            setEditSlots(availability.slots);
          })
          .catch(() => {})
          .finally(() => setLoadingEditSlots(false));
      }
    };

    window.addEventListener('patient-slots-updated' as any, handleSlotsUpdated as any);
    return () => {
      window.removeEventListener('patient-slots-updated' as any, handleSlotsUpdated as any);
    };
  }, [selectedDoctorId, selectedDate, editingAppointment, editDoctorId, editForm.appointmentDate]);

  useEffect(() => {
    if (!editingAppointment || !editDoctorId || !editForm.appointmentDate) return;

    let isActive = true;
    const requestedDate = editForm.appointmentDate;

    setLoadingEditSlots(true);
    fetchPatientBookingAvailability(editDoctorId, requestedDate, editingAppointment.id)
      .then((availability) => {
        if (!isActive) return;

        setEditSlots(availability.slots);
        setEditForm((current) => {
          if (current.appointmentDate !== requestedDate || !current.appointmentTime) return current;
          return availability.slots.includes(current.appointmentTime)
            ? current
            : { ...current, appointmentTime: '' };
        });
      })
      .catch((nextError) => {
        if (isActive) {
          setEditSlots([]);
          toast.error(getErrorMessage(nextError, 'Unable to load available time slots.'));
        }
      })
      .finally(() => {
        if (isActive) setLoadingEditSlots(false);
      });

    return () => {
      isActive = false;
    };
  }, [editDoctorId, editForm.appointmentDate, editingAppointment]);

  const handleUnavailableSection = useCallback((label: string) => {
    toast.info(`${label} is coming soon.`);
  }, []);

  const handleNavAction = useCallback(
    (item: NavItem) => {
      if (item.href) {
        router.push(item.href);
        return;
      }

      handleUnavailableSection(item.label);
    },
    [handleUnavailableSection, router]
  );

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

  const handleHospitalSelect = async (hospital: PatientBookingHospital) => {
    if (!requireCompleteProfile()) return;

    setSelectedHospitalId(hospital.id);
    setSelectedDoctorId('');
    setSelectedDate('');
    setSelectedTime('');
    setAvailableSlots([]);
    setLoadingSlots(false);
    setDoctors([]);
    setCurrentStep('doctor');
    setLoadingDoctors(true);

    try {
      const nextDoctors = await fetchPatientBookingDoctors(hospital.id);
      setDoctors(nextDoctors);
    } catch (nextError) {
      toast.error(getErrorMessage(nextError, 'Unable to load doctors for this hospital.'));
    } finally {
      setLoadingDoctors(false);
    }
  };

  const handleDoctorSelect = (doctor: PatientBookingDoctor) => {
    setSelectedDoctorId(doctor.id);
    setSelectedDate(dateOptions[0]?.value || '');
    setSelectedTime('');
    setAvailableSlots([]);
    setLoadingSlots(true);
    setCurrentStep('schedule');
  };

  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
    setSelectedTime('');
    setAvailableSlots([]);
    setLoadingSlots(true);
  };

  const handleStepSelect = (step: StepId) => {
    const index = steps.findIndex((item) => item.id === step);
    if (index <= maxStepIndex) setCurrentStep(step);
  };

  const handleScheduleContinue = () => {
    if (!selectedDate || !selectedTime) {
      toast.error('Select both appointment date and time.');
      return;
    }

    setCurrentStep('details');
  };

  const canSubmit = Boolean(
    selectedHospitalId &&
      selectedDoctorId &&
      selectedDate &&
      selectedTime &&
      details.firstName.trim() &&
      details.lastName.trim() &&
      details.email.trim() &&
      details.purpose.trim()
  );

  const getContactHospitalFromError = (nextError: unknown) => {
    if (typeof nextError !== 'object' || nextError === null || !('response' in nextError)) return null;

    const response = nextError as {
      response?: {
        data?: {
          code?: string;
          data?: { hospital?: DashboardAppointment['hospital'] };
        };
        status?: number;
      };
    };

    if (
      response.response?.status === 409 &&
      response.response.data?.code === 'CONTACT_HOSPITAL_REQUIRED'
    ) {
      return response.response.data.data?.hospital ?? null;
    }

    return null;
  };

  const saveAppointmentToLocalCache = async (appointment: DashboardAppointment) => {
    const activeAccountId = getActiveAccountId();
    if (!activeAccountId) return;

    try {
      const db = getPatientDB(activeAccountId);
      await db.appointments.put(appointment);
    } catch (dbErr) {
      console.error('[Appointments] Error updating local appointment cache:', dbErr);
    }
  };

  const updateDashboardAppointment = (appointment: DashboardAppointment) => {
    setDashboard((current) => {
      if (!current) return current;

      return {
        ...current,
        nextAppointment:
          current.nextAppointment?.id === appointment.id ? appointment : current.nextAppointment,
        upcomingAppointments: current.upcomingAppointments.map((item) =>
          item.id === appointment.id ? appointment : item
        ),
      };
    });
  };

  const removeDashboardAppointment = (appointmentId: string) => {
    setDashboard((current) => {
      if (!current) return current;

      const remaining = [
        current.nextAppointment,
        ...current.upcomingAppointments,
      ].filter((appointment): appointment is DashboardAppointment =>
        Boolean(appointment && appointment.id !== appointmentId)
      );

      return {
        ...current,
        nextAppointment: remaining[0] ?? null,
        upcomingAppointments: remaining.slice(1),
        stats: {
          ...current.stats,
          upcomingVisits: Math.max(0, current.stats.upcomingVisits - 1),
        },
      };
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!requireCompleteProfile()) return;

    if (!canSubmit) {
      toast.error('Complete all required patient details.');
      return;
    }

    try {
      setSubmitting(true);

      // Save appointment optimistically to local Dexie DB
      const activeAccountId = getActiveAccountId();
      if (activeAccountId) {
        try {
          const db = getPatientDB(activeAccountId);
          const tempId = `temp_${Date.now()}`;
          await db.appointments.put({
            id: tempId,
            doctorId: selectedDoctorId,
            doctorName: selectedDoctor?.fullName || 'Selected doctor',
            department: selectedDoctor?.department || 'General care',
            patientFirstName: details.firstName.trim(),
            patientLastName: details.lastName.trim(),
            patientEmail: details.email.trim(),
            appointmentDate: selectedDate,
            appointmentTime: selectedTime,
            status: 'Scheduled',
            consultationFee: selectedDoctor?.consultationFee || 0,
            paymentStatus: 'Pending',
            appointmentPurpose: details.purpose.trim(),
            description: details.description.trim() || null,
            hospital: selectedHospital ? {
              id: selectedHospital.id,
              name: selectedHospital.name,
              city: selectedHospital.city,
              phone: selectedHospital.phone,
              address: selectedHospital.address,
            } : null,
          });
        } catch (dbErr) {
          console.error('[Appointments] Error during optimistic local save:', dbErr);
        }
      }

      await createPatientAppointment({
        hospitalId: selectedHospitalId,
        doctorId: selectedDoctorId,
        appointmentDate: selectedDate,
        appointmentTime: selectedTime,
        patientFirstName: details.firstName.trim(),
        patientLastName: details.lastName.trim(),
        patientEmail: details.email.trim(),
        purpose: details.purpose.trim(),
        description: details.description.trim() || undefined,
      });

      setConfirmedAppointment({
        hospitalName: selectedHospital?.name || 'Selected hospital',
        doctorName: selectedDoctor?.fullName || 'Selected doctor',
        date: selectedDate,
        time: selectedTime,
        patientName: `${details.firstName.trim()} ${details.lastName.trim()}`.trim(),
      });
      void loadInitialData({ silent: true });
    } catch (nextError) {
      toast.error(getErrorMessage(nextError, 'Unable to book this appointment.'));
    } finally {
      setSubmitting(false);
    }
  };

  const resolveEditableDoctorId = async (appointment: DashboardAppointment) => {
    if (appointment.doctorId) return appointment.doctorId;
    if (!appointment.hospital?.id) return '';

    const hospitalDoctors = await fetchPatientBookingDoctors(appointment.hospital.id);
    const normalizedAppointmentDoctor = normalizeDoctorLabel(appointment.doctorName);
    const matchedDoctor = hospitalDoctors.find(
      (doctor) => normalizeDoctorLabel(doctor.fullName) === normalizedAppointmentDoctor
    );

    return matchedDoctor?.id || '';
  };

  const handleContactHospital = (appointment: DashboardAppointment) => {
    setContactAppointment(appointment);
  };

  const handleEditAppointment = async (appointment: DashboardAppointment) => {
    if (appointment.status !== 'Scheduled') {
      setContactAppointment(appointment);
      toast.info('This appointment is already confirmed. Please contact the hospital.');
      return;
    }

    setAppointmentActionId(appointment.id);

    try {
      const doctorId = await resolveEditableDoctorId(appointment);

      if (!doctorId) {
        setContactAppointment(appointment);
        toast.info('This appointment cannot be edited online. Please contact the hospital.');
        return;
      }

      const profileNameParts = String(dashboard?.profile.name || '').trim().split(/\s+/).filter(Boolean);
      const appointmentDate = appointment.appointmentDate?.slice(0, 10) || dateOptions[0]?.value || '';

      setEditDoctorId(doctorId);
      setEditForm({
        appointmentDate,
        appointmentTime: appointment.appointmentTime || '',
        firstName: appointment.patientFirstName || profileNameParts[0] || dashboard?.profile.firstName || '',
        lastName: appointment.patientLastName || profileNameParts.slice(1).join(' '),
        email: appointment.patientEmail || dashboard?.profile.email || '',
        purpose: appointment.appointmentPurpose || '',
        description: appointment.description || '',
      });
      setEditSlots(appointment.appointmentTime ? [appointment.appointmentTime] : []);
      setEditingAppointment(appointment);
    } catch (nextError) {
      toast.error(getErrorMessage(nextError, 'Unable to prepare this appointment for editing.'));
    } finally {
      setAppointmentActionId(null);
    }
  };

  const handleEditFormChange = (next: Partial<EditAppointmentForm>) => {
    setEditForm((current) => ({ ...current, ...next }));
  };

  const handleCloseEditAppointment = () => {
    if (savingEdit) return;
    setEditingAppointment(null);
    setEditDoctorId('');
    setEditForm(createEmptyEditAppointmentForm());
    setEditSlots([]);
  };

  const handleSaveEditedAppointment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!editingAppointment) return;

    if (
      !editForm.appointmentDate ||
      !editForm.appointmentTime ||
      !editForm.firstName.trim() ||
      !editForm.lastName.trim() ||
      !editForm.email.trim() ||
      !editForm.purpose.trim()
    ) {
      toast.error('Complete all required appointment details.');
      return;
    }

    setSavingEdit(true);
    setAppointmentActionId(editingAppointment.id);

    try {
      const response = await updatePatientAppointment(editingAppointment.id, {
        appointmentDate: editForm.appointmentDate,
        appointmentTime: editForm.appointmentTime,
        patientFirstName: editForm.firstName.trim(),
        patientLastName: editForm.lastName.trim(),
        patientEmail: editForm.email.trim(),
        purpose: editForm.purpose.trim(),
        description: editForm.description.trim() || undefined,
      });
      const updatedAppointment = response.data as DashboardAppointment;

      updateDashboardAppointment(updatedAppointment);
      await saveAppointmentToLocalCache(updatedAppointment);
      handleCloseEditAppointment();
      toast.success('Appointment updated successfully.');
      void loadInitialData({ silent: true });
    } catch (nextError) {
      const hospital = getContactHospitalFromError(nextError);

      if (hospital || (nextError as { response?: { status?: number } })?.response?.status === 409) {
        setContactAppointment({
          ...editingAppointment,
          hospital: hospital || editingAppointment.hospital,
        });
        handleCloseEditAppointment();
        toast.info(getErrorMessage(nextError, 'Please contact the hospital to change this appointment.'));
      } else {
        toast.error(getErrorMessage(nextError, 'Unable to update this appointment.'));
      }
    } finally {
      setSavingEdit(false);
      setAppointmentActionId(null);
    }
  };

  const handleCancelAppointment = (appointment: DashboardAppointment) => {
    if (appointment.status !== 'Scheduled') {
      setContactAppointment(appointment);
      toast.info('This appointment is already confirmed. Please contact the hospital.');
      return;
    }

    setCancelAppointmentTarget(appointment);
  };

  const handleConfirmCancelAppointment = async () => {
    if (!cancelAppointmentTarget) return;

    setCancellingAppointment(true);
    setAppointmentActionId(cancelAppointmentTarget.id);

    try {
      const response = await cancelPatientAppointment(cancelAppointmentTarget.id);
      const cancelledAppointment = response.data as DashboardAppointment | undefined;

      if (cancelledAppointment) {
        await saveAppointmentToLocalCache(cancelledAppointment);
      }

      removeDashboardAppointment(cancelAppointmentTarget.id);
      setCancelAppointmentTarget(null);
      toast.success('Appointment cancelled successfully.');
      void loadInitialData({ silent: true });
    } catch (nextError) {
      const hospital = getContactHospitalFromError(nextError);

      if (hospital || (nextError as { response?: { status?: number } })?.response?.status === 409) {
        setContactAppointment({
          ...cancelAppointmentTarget,
          hospital: hospital || cancelAppointmentTarget.hospital,
        });
        setCancelAppointmentTarget(null);
        toast.info(getErrorMessage(nextError, 'Please contact the hospital to cancel this appointment.'));
      } else {
        toast.error(getErrorMessage(nextError, 'Unable to cancel this appointment.'));
      }
    } finally {
      setCancellingAppointment(false);
      setAppointmentActionId(null);
    }
  };

  const handleBookAnother = () => {
    setConfirmedAppointment(null);
    setSelectedHospitalId('');
    setSelectedDoctorId('');
    setSelectedDate('');
    setSelectedTime('');
    setDoctors([]);
    setAvailableSlots([]);
    setCurrentStep('hospital');
    setDetails((value) => ({
      ...value,
      purpose: '',
      description: '',
    }));
  };

  const renderStepContent = () => {
    if (!bookingOptions) return null;

    if (currentStep === 'hospital') {
      return (
        <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_18px_50px_-42px_rgba(15,23,42,0.26)] sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Select hospital</h2>
              <p className="mt-1 text-sm text-slate-500">Choose from active hospitals connected to appointment booking.</p>
            </div>
            <button
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-950"
              onClick={() => {
                void loadInitialData();
              }}
              type="button"
            >
              <CalendarPlus className="h-4 w-4" />
              Refresh
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {bookingOptions.hospitals.length ? (
              bookingOptions.hospitals.map((hospital) => {
                const active = hospital.id === selectedHospitalId;

                return (
                  <button
                    className={`flex w-full items-center gap-4 rounded-[1.35rem] border p-4 text-left transition-colors ${
                      active
                        ? 'border-teal-600 bg-teal-50/70'
                        : 'border-slate-200 bg-white hover:border-teal-300 hover:bg-slate-50'
                    }`}
                    key={hospital.id}
                    onClick={() => {
                      void handleHospitalSelect(hospital);
                    }}
                    type="button"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-700 text-white">
                      <Building2 className="h-6 w-6" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-bold text-slate-950">{hospital.name}</span>
                      <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-500">
                        {hospital.city || hospital.address ? (
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5" />
                            {hospital.city || hospital.address}
                          </span>
                        ) : null}
                        <span>{hospital.doctorCount} doctor{hospital.doctorCount === 1 ? '' : 's'}</span>
                      </span>
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
                  </button>
                );
              })
            ) : (
              <EmptyState
                description="Hospitals will appear here after they are active and available for patient booking."
                title="No hospitals available"
              />
            )}
          </div>
        </section>
      );
    }

    if (currentStep === 'doctor') {
      return (
        <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_18px_50px_-42px_rgba(15,23,42,0.26)] sm:p-6">
          <div className="flex items-center gap-3">
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-950"
              onClick={() => setCurrentStep('hospital')}
              type="button"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h2 className="text-xl font-bold text-slate-950">Select doctor</h2>
              <p className="mt-1 text-sm text-slate-500">{selectedHospital?.name || 'Choose a hospital first'}</p>
            </div>
          </div>

          <div className="mt-5">
            {loadingDoctors ? (
              <LoadingRows />
            ) : doctors.length ? (
              <div className="grid gap-4 md:grid-cols-2">
                {doctors.map((doctor) => {
                  const active = doctor.id === selectedDoctorId;

                  return (
                    <button
                      className={`rounded-[1.35rem] border p-4 text-left transition-colors ${
                        active
                          ? 'border-teal-600 bg-teal-50/70'
                          : 'border-slate-200 bg-white hover:border-teal-300 hover:bg-slate-50'
                      }`}
                      key={doctor.id}
                      onClick={() => handleDoctorSelect(doctor)}
                      type="button"
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white">
                          {doctor.initials}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-base font-bold text-slate-950">Dr. {doctor.fullName}</span>
                          <span className="mt-1 block text-sm text-slate-500">
                            {doctor.specialization || doctor.department || 'General care'}
                          </span>
                        </span>
                      </div>
                      <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2">
                        <span className="text-slate-500">
                          Consult fee
                          <strong className="ml-2 text-slate-950">
                            {currencyFormatter.format(doctor.consultationFee || 0)}
                          </strong>
                        </span>
                        <span className="text-slate-500 sm:text-right">
                          {doctor.availableTime || 'Availability not configured'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                description="This hospital has not published doctors for patient booking yet."
                title="No doctors available"
              />
            )}
          </div>
        </section>
      );
    }

    if (currentStep === 'schedule') {
      return (
        <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_18px_50px_-42px_rgba(15,23,42,0.26)] sm:p-6">
          <div className="flex items-center gap-3">
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-950"
              onClick={() => setCurrentStep('doctor')}
              type="button"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h2 className="text-xl font-bold text-slate-950">Select date and time</h2>
              <p className="mt-1 text-sm text-slate-500">
                {selectedDoctor ? `Dr. ${selectedDoctor.fullName}` : 'Choose a doctor first'}
              </p>
            </div>
          </div>

          <div className="mt-5">
            <h3 className="text-sm font-semibold text-slate-700">Date</h3>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {dateOptions.map((date) => {
                const active = date.value === selectedDate;

                return (
                  <button
                    className={`min-h-[104px] rounded-[1.25rem] border px-3 py-3 text-center transition-colors ${
                      active
                        ? 'border-teal-600 bg-teal-50/70 text-slate-950'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300'
                    }`}
                    key={date.value}
                    onClick={() => handleDateSelect(date.value)}
                    type="button"
                  >
                    <span className="block text-xs font-semibold uppercase text-slate-500">{date.label}</span>
                    <span className="mt-2 block text-2xl font-bold leading-none text-slate-950">{date.day}</span>
                    <span className="mt-2 block text-xs text-slate-500">{date.month}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-semibold text-slate-700">Time slot</h3>
            {loadingSlots ? (
              <div className="mt-3 flex min-h-[132px] items-center justify-center rounded-[1.25rem] bg-slate-50 text-sm font-medium text-slate-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading available slots
              </div>
            ) : doctorOnLeave ? (
              <div className="mt-3 flex flex-col items-center justify-center text-center p-8 bg-amber-50/70 border border-dashed border-amber-200 rounded-[1.25rem] text-amber-900">
                <Ban className="h-8 w-8 text-amber-600 mb-2" />
                <h4 className="font-bold text-base">Doctor Not Available</h4>
                <p className="text-xs text-amber-700 mt-1 max-w-sm">
                  The selected doctor is currently on leave on this date and is not accepting appointments.
                </p>
              </div>
            ) : availableSlots.length ? (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {availableSlots.map((slot) => {
                  const active = selectedTime === slot;

                  return (
                    <button
                      className={`min-h-12 rounded-[1rem] border px-4 text-sm font-bold transition-colors ${
                        active
                          ? 'border-teal-600 bg-teal-50 text-teal-800'
                          : 'border-slate-200 bg-white text-slate-950 hover:border-teal-300'
                      }`}
                      key={slot}
                      onClick={() => setSelectedTime(slot)}
                      type="button"
                    >
                      {formatTimeValue(slot)}
                    </button>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                description="This doctor has no remaining configured slots for the selected date."
                title="No slots available"
              />
            )}
          </div>

          <button
            className="mt-7 flex min-h-12 w-full items-center justify-center rounded-full bg-gradient-to-r from-teal-600 to-sky-600 px-5 text-sm font-bold text-white shadow-[0_14px_36px_-24px_rgba(8,145,178,0.8)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            disabled={!selectedDate || !selectedTime}
            onClick={handleScheduleContinue}
            type="button"
          >
            Continue to patient details
          </button>
        </section>
      );
    }

    return (
      <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_18px_50px_-42px_rgba(15,23,42,0.26)] sm:p-6">
        <div className="flex items-center gap-3">
          <button
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-950"
            onClick={() => setCurrentStep('schedule')}
            type="button"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-slate-950">Patient details</h2>
            <p className="mt-1 text-sm text-slate-500">Name and email can be changed for this booking.</p>
          </div>
        </div>

        <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">First name</span>
              <span className="relative block">
                <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-3 text-sm font-medium text-slate-950 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
                  onChange={(event) => setDetails((value) => ({ ...value, firstName: event.target.value }))}
                  required
                  value={details.firstName}
                />
              </span>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Last name</span>
              <span className="relative block">
                <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-3 text-sm font-medium text-slate-950 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
                  onChange={(event) => setDetails((value) => ({ ...value, lastName: event.target.value }))}
                  required
                  value={details.lastName}
                />
              </span>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Mobile number</span>
              <span className="relative block">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  aria-readonly="true"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-medium text-slate-500 outline-none"
                  readOnly
                  value={bookingOptions.profile.phone}
                />
              </span>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Email address</span>
              <span className="relative block">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-3 text-sm font-medium text-slate-950 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
                  onChange={(event) => setDetails((value) => ({ ...value, email: event.target.value }))}
                  required
                  type="email"
                  value={details.email}
                />
              </span>
            </label>
          </div>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Purpose of appointment</span>
            <input
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-950 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
              onChange={(event) => setDetails((value) => ({ ...value, purpose: event.target.value }))}
              placeholder="Example: Follow-up consultation"
              required
              value={details.purpose}
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-700">Description</span>
            <textarea
              className="min-h-[128px] w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium leading-6 text-slate-950 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
              onChange={(event) => setDetails((value) => ({ ...value, description: event.target.value }))}
              placeholder="Add symptoms, notes, or anything the hospital should know."
              value={details.description}
            />
          </label>

          <button
            className="mt-2 flex min-h-12 w-full items-center justify-center rounded-full bg-gradient-to-r from-teal-600 to-sky-600 px-5 text-sm font-bold text-white shadow-[0_14px_36px_-24px_rgba(8,145,178,0.8)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            disabled={!canSubmit || submitting}
            type="submit"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Booking appointment
              </>
            ) : (
              'Confirm booking'
            )}
          </button>
        </form>
      </section>
    );
  };

  return (
    <div className="min-h-screen bg-[#eef6fa] text-slate-950">
      <div className="mx-auto flex min-h-screen max-w-[1920px]">
        <DesktopSidebar
          completion={dashboard?.profileCompletion ?? null}
          onNavigate={handleNavAction}
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
                <h1 className="text-xl font-bold leading-tight text-slate-950 sm:text-3xl lg:text-[2.25rem]">
                  {activeTab === 'list' ? 'My Appointments' : 'Book Appointment'}
                </h1>
                <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                  {activeTab === 'list'
                    ? 'Manage your upcoming consultations and bookings'
                    : 'Schedule a new visit in a few taps'}
                </p>
              </div>

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

          {/* Tab Switcher */}
          <div className="flex border-b border-slate-200 bg-white px-4 gap-6 sm:px-7 lg:px-8 shrink-0">
            <button
              type="button"
              onClick={() => {
                setActiveTab('book');
                router.push(PATIENT_APPOINTMENTS);
              }}
              className={`pb-3 pt-3 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === 'book'
                  ? 'border-teal-600 text-teal-600'
                  : 'border-transparent text-slate-500 hover:text-slate-950'
              }`}
            >
              Book Appointment
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('list');
                router.push(`${PATIENT_APPOINTMENTS}?view=list`);
              }}
              className={`pb-3 pt-3 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === 'list'
                  ? 'border-teal-600 text-teal-600'
                  : 'border-transparent text-slate-500 hover:text-slate-950'
              }`}
            >
              My Appointments
            </button>
          </div>

          <main className="flex-1 px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-7 lg:px-8 xl:pb-8">
            {loading ? (
              <div className="space-y-6">
                <div className="h-[74px] animate-pulse rounded-[1.5rem] bg-white" />
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.7fr)]">
                  <div className="h-[520px] animate-pulse rounded-[2rem] bg-white" />
                  <div className="space-y-6">
                    <div className="h-[178px] animate-pulse rounded-[1.5rem] bg-white" />
                    <div className="h-[318px] animate-pulse rounded-[1.5rem] bg-white" />
                  </div>
                </div>
              </div>
            ) : error && !dashboard ? (
              <ErrorState message={error} onRetry={() => void loadInitialData()} />
            ) : confirmedAppointment ? (
              <div className="mx-auto max-w-2xl">
                <AppointmentConfirmedCard
                  appointment={confirmedAppointment}
                  onBookAnother={handleBookAnother}
                  onDashboard={() => router.push(PATIENT_DASHBOARD)}
                />
              </div>
            ) : activeTab === 'list' ? (
              <div className="mx-auto max-w-4xl space-y-6 animate-in fade-in duration-300">
                <UpcomingVisits
                  actionAppointmentId={appointmentActionId}
                  appointments={upcomingAppointments}
                  onCancel={handleCancelAppointment}
                  onContactHospital={handleContactHospital}
                  onEdit={(appointment) => {
                    void handleEditAppointment(appointment);
                  }}
                />
              </div>
            ) : (
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.42fr)_minmax(320px,0.72fr)] animate-in fade-in duration-300">
                <div className="space-y-6">
                  {!isProfileComplete && dashboard ? (
                    <ProfileIncompleteBanner
                      missingFields={dashboard.profileCompletion.missingFields}
                      onCompleteProfile={() => router.push(PATIENT_PROFILE)}
                    />
                  ) : null}

                  <div className={!isProfileComplete ? 'pointer-events-none opacity-50' : undefined}>
                    <Stepper
                      currentStep={currentStep}
                      maxStepIndex={maxStepIndex}
                      onSelectStep={handleStepSelect}
                    />

                    {renderStepContent()}
                  </div>
                </div>

                <aside className="space-y-6">
                  <BookingSummary
                    date={selectedDate}
                    doctor={selectedDoctor}
                    hospital={selectedHospital}
                    time={selectedTime}
                  />

                  <UpcomingVisits
                    actionAppointmentId={appointmentActionId}
                    appointments={upcomingAppointments}
                    onCancel={handleCancelAppointment}
                    onContactHospital={handleContactHospital}
                    onEdit={(appointment) => {
                      void handleEditAppointment(appointment);
                    }}
                  />
                </aside>
              </div>
            )}
          </main>
        </div>
      </div>


      <EditAppointmentModal
        appointment={editingAppointment}
        form={editForm}
        loadingSlots={loadingEditSlots}
        onChange={handleEditFormChange}
        onClose={handleCloseEditAppointment}
        onSubmit={(event) => {
          void handleSaveEditedAppointment(event);
        }}
        saving={savingEdit}
        slots={editSlots}
      />
      <CancelAppointmentDialog
        appointment={cancelAppointmentTarget}
        cancelling={cancellingAppointment}
        onClose={() => {
          if (!cancellingAppointment) setCancelAppointmentTarget(null);
        }}
        onConfirm={() => {
          void handleConfirmCancelAppointment();
        }}
      />
      <ContactHospitalModal
        appointment={contactAppointment}
        onClose={() => setContactAppointment(null)}
      />
      <PlatformAdBanner />
    </div>
  );
}
