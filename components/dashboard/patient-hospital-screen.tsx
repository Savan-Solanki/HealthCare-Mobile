'use client';

import {
  Activity,
  Building2,
  CalendarDays,
  CalendarPlus,
  FileText,
  FlaskConical,
  HeartPulse,
  LayoutGrid,
  LogOut,
  MapPin,
  Phone,
  Pill,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { logoutPatient } from '@/lib/api';
import PatientHeaderMenu from '@/components/dashboard/patient-header-menu';
import PatientAvatar from '@/components/dashboard/patient-avatar';
import { isPatientProfileComplete } from '@/lib/patient-profile';
import {
  type DashboardPrescription,
  type PatientDashboardData,
  fetchPatientDashboard,
} from '@/lib/patient-dashboard';
import { PATIENT_APPOINTMENTS, PATIENT_DASHBOARD, PATIENT_HOSPITAL, PATIENT_LOGIN_PATH, PATIENT_PRESCRIPTIONS, PATIENT_PROFILE } from '@/lib/routes';
import { useSessionGuard } from '@/hooks/use-session-guard';
import { getPatientDB } from '@/lib/db';
import { getActiveAccountId, screenNeedsFreshLoad, markScreenLoaded, clearForceFreshLoad } from '@/lib/session';
import { syncAllPatientData } from '@/lib/db/sync-engine';
import { getPatientDesktopNavItems } from '@/lib/patient-nav';
import PlatformAdBanner from '@/components/dashboard/platform-ad-banner';

const desktopNavItems = getPatientDesktopNavItems('hospital');

const hospitalGradients = [
  'from-cyan-500 to-sky-500',
  'from-violet-500 to-fuchsia-500',
  'from-emerald-500 to-teal-500',
  'from-teal-500 to-cyan-500',
];

const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const numberFormatter = new Intl.NumberFormat();

const sanitizePhone = (value: string | null | undefined) =>
  String(value || '').replace(/[^\d+]/g, '');

const buildPatientCode = (value: string) => {
  const clean = String(value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `MW-${(clean.slice(-6) || '000000').padStart(6, '0')}`;
};

const formatShortDate = (value: string | null | undefined) => {
  if (!value) return 'Not available';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';

  return shortDateFormatter.format(date);
};

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = error as { response?: { data?: { message?: string } } };
    return response.response?.data?.message || 'Unable to load your hospitals right now.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unable to load your hospitals right now.';
};



function DesktopSidebar({
  completion,
  onNavigate,
  onSignOut,
  signingOut,
  onProfileClick,
}: {
  completion: PatientDashboardData['profileCompletion'] | null;
  onNavigate: (item: { href?: string; label: string }) => void;
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
            <p className="text-[1.9rem] font-bold leading-none text-slate-950">Healthcare</p>
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

function HospitalCard({
  hospital,
  index,
  onCall,
}: {
  hospital: PatientDashboardData['hospitals'][number];
  index: number;
  onCall: (phone: string | null) => void;
}) {
  const gradient = hospitalGradients[index % hospitalGradients.length];

  return (
    <article className="overflow-hidden rounded-[1.5rem] sm:rounded-[2rem] bg-white shadow-[0_22px_60px_-40px_rgba(15,23,42,0.25)] ring-1 ring-slate-100">
      <div className={`h-24 sm:h-28 bg-gradient-to-r ${gradient}`} />

      <div className="relative p-4 sm:p-6 pb-5 sm:pb-6 pt-7 sm:pt-8">
        <div className="absolute -top-7 sm:-top-8 left-4 sm:left-6 flex h-14 w-14 sm:h-[72px] sm:w-[72px] items-center justify-center rounded-full bg-white text-teal-600 shadow-[0_20px_45px_-32px_rgba(15,23,42,0.3)]">
          <Stethoscope className="h-6 w-6 sm:h-8 sm:w-8" />
        </div>

        <div className="pt-6 sm:pt-8">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-3">
            <h3 className="text-xl sm:text-2xl md:text-[1.9rem] font-bold leading-tight text-slate-950">
              {hospital.name}
            </h3>
            {hospital.lastActivityDate ? (
              <span className="self-start rounded-full bg-slate-100 px-2.5 py-0.5 sm:px-3 sm:py-1 text-xs font-semibold text-slate-500 whitespace-nowrap">
                Last visit {formatShortDate(hospital.lastActivityDate)}
              </span>
            ) : null}
          </div>

          <div className="mt-4 space-y-2 text-slate-500">
            <div className="flex items-center gap-2 text-sm sm:text-base">
              <MapPin className="h-4 w-4 shrink-0" />
              <span>{hospital.city || hospital.address || 'Location will be shared by your hospital'}</span>
            </div>
            <button
              className="flex items-center gap-2 text-left text-sm sm:text-base transition-colors hover:text-teal-700"
              onClick={() => onCall(hospital.phone)}
              type="button"
            >
              <Phone className="h-4 w-4 shrink-0" />
              <span className="break-all">{hospital.phone || 'Phone number unavailable'}</span>
            </button>
          </div>
        </div>

        <div className="mt-5 sm:mt-6 border-t border-slate-200 pt-4 sm:pt-5">
          <div className="grid grid-cols-3 gap-2 sm:gap-3 text-sm text-slate-500">
            <div>
              <p className="text-[0.65rem] sm:text-xs font-semibold uppercase tracking-[0.15em] sm:tracking-[0.2em] text-slate-400">Rx</p>
              <p className="mt-1 sm:mt-2 text-base sm:text-lg font-semibold text-slate-950">
                {numberFormatter.format(hospital.prescriptionCount)}
              </p>
            </div>
            <div>
              <p className="text-[0.65rem] sm:text-xs font-semibold uppercase tracking-[0.15em] sm:tracking-[0.2em] text-slate-400">Doctors</p>
              <p className="mt-1 sm:mt-2 text-base sm:text-lg font-semibold text-slate-950">
                {numberFormatter.format(hospital.doctorCount)}
              </p>
            </div>
            <div>
              <p className="text-[0.65rem] sm:text-xs font-semibold uppercase tracking-[0.15em] sm:tracking-[0.2em] text-slate-400">Visits</p>
              <p className="mt-1 sm:mt-2 text-base sm:text-lg font-semibold text-slate-950">
                {numberFormatter.format(hospital.visitCount)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function PrescriptionDetails({
  prescription,
}: {
  prescription: DashboardPrescription;
}) {
  return (
    <div className="mt-4 rounded-[1.5rem] bg-slate-50 px-4 py-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
        <span className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-sky-600" />
          {formatShortDate(prescription.prescriptionDate)}
        </span>
        {prescription.hospital?.name ? (
          <span className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-teal-600" />
            {prescription.hospital.name}
          </span>
        ) : null}
      </div>

      <div className="mt-4 space-y-3">
        {prescription.medicines.map((medicine, index) => (
          <div
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
            key={`${prescription.id}-${medicine.name}-${index}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950">{medicine.name}</p>
                <p className="mt-1 text-sm text-slate-500">{medicine.dosage}</p>
              </div>
              <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">
                {medicine.frequency}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-500">Duration: {medicine.duration}</p>
          </div>
        ))}
      </div>

      {prescription.instruction ? (
        <div className="mt-4 rounded-2xl border border-dashed border-teal-200 bg-teal-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
            Doctor note
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-700">{prescription.instruction}</p>
        </div>
      ) : null}
    </div>
  );
}

function PrescriptionRow({
  expanded,
  onToggle,
  prescription,
}: {
  expanded: boolean;
  onToggle: () => void;
  prescription: DashboardPrescription;
}) {
  const title = prescription.doctorName ? `Dr. ${prescription.doctorName}` : prescription.diagnosis;
  const subtitleParts = [prescription.diagnosis, formatShortDate(prescription.prescriptionDate)].filter(Boolean);

  return (
    <div className="border-b border-slate-200 py-4 sm:py-5 last:border-b-0">
      <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-lg sm:text-xl md:text-[1.55rem] font-semibold leading-tight text-slate-950">{title}</p>
          <p className="mt-1.5 sm:mt-2 text-sm sm:text-base text-slate-500">{subtitleParts.join(' / ')}</p>
          {prescription.hospital?.name ? (
            <p className="mt-1 text-xs sm:text-sm text-slate-400">{prescription.hospital.name}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-3 self-start lg:mt-1">
          <span className="rounded-full bg-cyan-50 px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-semibold text-cyan-800">
            {prescription.medicines.length} meds
          </span>
          <button
            className="text-xs sm:text-sm font-semibold text-teal-700 transition-colors hover:text-teal-800"
            onClick={onToggle}
            type="button"
          >
            {expanded ? 'Hide' : 'View'}
          </button>
        </div>
      </div>

      {expanded ? <PrescriptionDetails prescription={prescription} /> : null}
    </div>
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
    <section className="rounded-[2rem] border border-dashed border-slate-200 bg-white px-6 py-10 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-50 text-slate-400">
        <Building2 className="h-7 w-7" />
      </div>
      <h2 className="mt-4 text-2xl font-bold text-slate-950">{title}</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">{description}</p>
    </section>
  );
}

function HospitalPageSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid gap-5 xl:grid-cols-3 md:grid-cols-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            className="h-[360px] animate-pulse rounded-[2rem] bg-white/80"
            key={`hospital-card-skeleton-${index}`}
          />
        ))}
      </div>
      <div className="h-[340px] animate-pulse rounded-[2rem] bg-white/80" />
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
      <h2 className="mt-4 text-2xl font-bold text-slate-950">Unable to load hospitals</h2>
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

export default function PatientHospitalScreen() {
  useSessionGuard();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dashboard, setDashboard] = useState<PatientDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedPrescriptionId, setExpandedPrescriptionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAllPrescriptions, setShowAllPrescriptions] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

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

        // Save snapshot to IndexedDB
        const activeAccountId = getActiveAccountId();
        if (activeAccountId) {
          try {
            const db = getPatientDB(activeAccountId);
            await db.syncMeta.put({
              key: 'dashboard_snapshot',
              value: JSON.stringify(nextDashboard),
            });
            // Background sync
            await syncAllPatientData(activeAccountId, true);
          } catch (dbErr) {
            console.error('[Hospital] Error caching snapshot/sync:', dbErr);
          }
        }

        startTransition(() => {
          setDashboard(nextDashboard);
          setError(null);
        });
      } catch (nextError: any) {
        const is429 = nextError?.response?.status === 429;
        if (is429 || silent) {
          // Rate-limited or background refresh — show cached data, no toast, no error
          console.warn('[Hospital] Fetch skipped:', is429 ? '429' : nextError?.message);
        } else {
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
    if (screenNeedsFreshLoad('hospital')) {
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
        await loadDashboard();
        markScreenLoaded('hospital');
      })();
      return;
    }

    if (activeAccountId) {
      const db = getPatientDB(activeAccountId);
      db.syncMeta.get('dashboard_snapshot').then((cached) => {
        if (cached) {
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

  const handleUnavailableSection = useCallback((label: string) => {
    toast.info(`${label} is coming soon.`);
  }, []);

  const handleNavAction = useCallback(
    (item: { href?: string; label: string }) => {
      if (item.href) {
        router.push(item.href);
        return;
      }

      handleUnavailableSection(item.label);
    },
    [handleUnavailableSection, router]
  );

  const handleCall = useCallback((phone: string | null) => {
    const sanitized = sanitizePhone(phone);
    if (!sanitized) {
      toast.info('Phone number has not been added yet.');
      return;
    }

    window.location.href = `tel:${sanitized}`;
  }, []);

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

  const visiblePrescriptions = useMemo(() => {
    const items = dashboard?.recentPrescriptions ?? [];
    return showAllPrescriptions ? items : items.slice(0, 3);
  }, [dashboard?.recentPrescriptions, showAllPrescriptions]);

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
                <h1 className="text-xl sm:text-3xl lg:text-[2.25rem] font-bold leading-tight text-slate-950">
                  My Hospital
                </h1>
                <p className="mt-1 text-xs sm:text-sm text-slate-500">Hospitals you&apos;ve visited recently</p>
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
              <HospitalPageSkeleton />
) : error && !dashboard ? (
              <ErrorState
                message={error}
                onRetry={() => {
                  void loadDashboard();
                }}
              />
            ) : dashboard ? (
              <div className="space-y-8">
                {dashboard.hospitals.length ? (
                  <section className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
                    {dashboard.hospitals.map((hospital, index) => (
                      <HospitalCard
                        hospital={hospital}
                        index={index}
                        key={hospital.id}
                        onCall={handleCall}
                      />
                    ))}
                  </section>
                ) : (
                  <EmptyState
                    description="Once your appointments or prescriptions are linked to a hospital, they will appear here with visit and doctor counts."
                    title="No hospitals linked yet"
                  />
                )}

                <section className="rounded-[1.5rem] sm:rounded-[2rem] bg-white p-4 sm:p-6 shadow-[0_22px_60px_-40px_rgba(15,23,42,0.25)] ring-1 ring-slate-100">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg sm:text-xl md:text-[1.8rem] font-bold leading-tight text-slate-950">
                        Recent prescriptions
                      </h2>
                      <p className="mt-1 text-xs sm:text-sm text-slate-500">
                        Real prescriptions issued through your hospital visits.
                      </p>
                    </div>

                    {dashboard.recentPrescriptions.length > 3 ? (
                      <button
                        className="self-start sm:self-center text-sm sm:text-base font-semibold text-teal-700 transition-colors hover:text-teal-800"
                        onClick={() => setShowAllPrescriptions((value) => !value)}
                        type="button"
                      >
                        {showAllPrescriptions ? 'Show less' : 'View all'}
                      </button>
                    ) : null}
                  </div>

                  {visiblePrescriptions.length ? (
                    <div className="mt-6">
                      {visiblePrescriptions.map((prescription) => (
                        <PrescriptionRow
                          expanded={expandedPrescriptionId === prescription.id}
                          key={prescription.id}
                          onToggle={() =>
                            setExpandedPrescriptionId((value) =>
                                value === prescription.id ? null : prescription.id
                            )
                          }
                          prescription={prescription}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="mt-6 rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
                      Prescriptions will appear here after your doctors add them to your patient record.
                    </div>
                  )}
                </section>
              </div>
            ) : (
              <ErrorState
                message="We could not find your hospital details yet."
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
