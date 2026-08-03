'use client';

import {
  Activity,
  ArrowLeft,
  Building2,
  CalendarPlus,
  FileText,
  FlaskConical,
  HeartPulse,
  LayoutGrid,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  Phone,
  Pill,
  Settings,
  ShieldCheck,
  UserPen,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import PatientAvatar from '@/components/dashboard/patient-avatar';
import PatientHeaderMenu from '@/components/dashboard/patient-header-menu';
import ProfileEditModal from '@/components/dashboard/profile-edit-modal';
import { isPatientProfileComplete } from '@/lib/patient-profile';
import { fetchPatientDashboard, type PatientDashboardData } from '@/lib/patient-dashboard';
import {
  PATIENT_APPOINTMENTS,
  PATIENT_DASHBOARD,
  PATIENT_HOSPITAL,
  PATIENT_LOGIN_PATH,
  PATIENT_PRESCRIPTIONS,
} from '@/lib/routes';
import { logoutPatient } from '@/lib/api';
import { useSessionGuard } from '@/hooks/use-session-guard';
import { getSessionUser, getActiveAccountId, screenNeedsFreshLoad, markScreenLoaded, clearForceFreshLoad } from '@/lib/session';
import { getPatientDB } from '@/lib/db';
import SwitchAccountModal from '@/components/dashboard/switch-account-modal';
import ManageAccountsModal from '@/components/dashboard/manage-accounts-modal';
import ManageDevicesModal from '@/components/dashboard/manage-devices-modal';
import CreditHistoryModal from '@/components/dashboard/credit-history-modal';

const buildPatientCode = (value: string) => {
  const clean = String(value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `MW-${(clean.slice(-6) || '000000').padStart(6, '0')}`;
};

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = error as { response?: { data?: { message?: string } } };
    return response.response?.data?.message || 'Unable to load your profile right now.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unable to load your profile right now.';
};

export default function PatientProfileScreen() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dashboard, setDashboard] = useState<PatientDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [isProfileEditOpen, setIsProfileEditOpen] = useState(false);
  const [isSwitchOpen, setIsSwitchOpen] = useState(false);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [isDevicesOpen, setIsDevicesOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  useSessionGuard();

  // Listen for event from ManageAccountsModal to open Switch Account modal
  useEffect(() => {
    const handleOpenSwitch = () => setIsSwitchOpen(true);
    window.addEventListener('open-switch-account', handleOpenSwitch);
    return () => window.removeEventListener('open-switch-account', handleOpenSwitch);
  }, []);

  const loadDashboard = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const nextDashboard = await fetchPatientDashboard();
      
      const activeAccountId = getActiveAccountId();
      if (activeAccountId) {
        try {
          const db = getPatientDB(activeAccountId);
          await db.syncMeta.put({
            key: 'dashboard_snapshot',
            value: JSON.stringify(nextDashboard),
          });
        } catch (dbErr) {
          console.error('[Profile] Error caching snapshot:', dbErr);
        }
      }

      startTransition(() => {
        setDashboard(nextDashboard);
        setError(null);
      });
    } catch (nextError) {
      if (!silent) {
        setError(getErrorMessage(nextError));
        setDashboard(null);
      } else {
        console.warn('[Profile] Silent refresh failed:', nextError);
      }
    } finally {
      if (!silent) setLoading(false);
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
    if (screenNeedsFreshLoad('profile')) {
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
        markScreenLoaded('profile');
      })();
      return;
    }

    if (activeAccountId) {
      const db = getPatientDB(activeAccountId);
      db.syncMeta.get('dashboard_snapshot').then((cached) => {
        if (cached) {
          setDashboard(JSON.parse(cached.value));
          setLoading(false);
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

    const handleProfileUpdate = () => {
      console.log('[Profile] Received profile:updated event, refreshing...');
      void loadDashboard({ silent: true });
    };

    window.addEventListener('patient-profile-updated', handleProfileUpdate);
    return () => {
      window.removeEventListener('patient-profile-updated', handleProfileUpdate);
    };
  }, [loadDashboard]);

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

  return (
    <div className="min-h-screen bg-[#eef6fa] text-slate-950">
      <div className="mx-auto min-h-screen max-w-3xl">
        <header className="border-b border-slate-200 bg-white">
          <div className="flex items-center gap-3 px-4 py-4 sm:px-6">
            <button
              type="button"
              onClick={() => router.push(PATIENT_DASHBOARD)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-600 transition hover:bg-slate-50"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold text-slate-950">My Profile</h1>
              <p className="text-xs text-slate-500">Account details and health record</p>
            </div>

            {dashboard ? (
              <PatientHeaderMenu
                avatar={dashboard.profile.avatar}
                firstName={dashboard.profile.firstName}
                id={dashboard.profile.id}
                initials={dashboard.profile.initials}
                name={dashboard.profile.name}
              />
            ) : null}
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6">
          {loading ? (
            <div className="space-y-4">
              <div className="h-56 animate-pulse rounded-[2rem] bg-white" />
              <div className="h-40 animate-pulse rounded-[2rem] bg-white" />
            </div>
          ) : error || !dashboard ? (
            <section className="rounded-[2rem] border border-red-100 bg-white px-6 py-8 text-center">
              <Activity className="mx-auto h-8 w-8 text-red-500" />
              <p className="mt-4 text-sm text-slate-600">{error || 'Profile unavailable.'}</p>
              <button
                type="button"
                onClick={() => void loadDashboard()}
                className="mt-4 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white"
              >
                Try again
              </button>
            </section>
          ) : (
            <div className="space-y-5">
              <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
                <div className="bg-gradient-to-r from-teal-700 via-cyan-700 to-sky-700 px-6 py-8 text-white">
                  <div className="flex flex-col items-center text-center">
                    <PatientAvatar
                      avatar={dashboard.profile.avatar}
                      className="h-28 w-28 border-4 border-white/30 text-2xl shadow-lg"
                      initials={dashboard.profile.initials}
                      name={dashboard.profile.name}
                    />
                    <h2 className="mt-4 text-2xl font-bold">{dashboard.profile.name}</h2>
                    <p className="mt-1 text-sm text-cyan-100">{buildPatientCode(dashboard.profile.id)}</p>
                  </div>
                </div>

                <div className="space-y-4 p-6">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                        <Mail className="h-4 w-4" />
                        Email
                      </div>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{dashboard.profile.email}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                        <Phone className="h-4 w-4" />
                        Phone
                      </div>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{dashboard.profile.phone}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 sm:col-span-2">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                        <Phone className="h-4 w-4" />
                        Emergency Contact
                      </div>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {dashboard.patientRecord.emergencyContact || 'Not added'}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Profile completion</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {dashboard.profileCompletion.completedFields} of {dashboard.profileCompletion.totalFields} fields
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          isPatientProfileComplete(dashboard.profileCompletion)
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {dashboard.profileCompletion.percentage}%
                      </span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-teal-700 to-sky-700"
                        style={{ width: `${dashboard.profileCompletion.percentage}%` }}
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsProfileEditOpen(true)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-800 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-teal-900"
                  >
                    <UserPen className="h-4 w-4" />
                    Edit profile
                  </button>
                </div>
              </section>

              {/* ── Account Management ── */}
              <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <Users className="h-4 w-4 text-teal-600" />
                  Account Management
                </div>

                <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Current account</p>
                  <p className="mt-1.5 text-sm font-semibold text-slate-900">
                    {dashboard.profile.name}
                    {getSessionUser()?.accountLabel && (
                      <span className="ml-2 rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-700">
                        {getSessionUser()?.accountLabel}
                      </span>
                    )}
                  </p>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsSwitchOpen(true)}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <Users className="h-4 w-4 text-teal-600" />
                    Switch Account
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsManageOpen(true)}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <Settings className="h-4 w-4 text-teal-600" />
                    Manage Accounts
                  </button>
                </div>
              </section>

              {/* ── Credits & Device Security ── */}
              <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <ShieldCheck className="h-4 w-4 text-teal-600" />
                  Credits & Device Security
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Report Credits</p>
                    <p className="mt-1.5 text-2xl font-extrabold text-slate-900">
                      {dashboard.profile.reportCredits}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Prescription Credits</p>
                    <p className="mt-1.5 text-2xl font-extrabold text-slate-900">
                      {dashboard.profile.prescriptionCredits}
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsHistoryOpen(true)}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <Activity className="h-4 w-4 text-teal-600" />
                    Usage History
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsDevicesOpen(true)}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <Settings className="h-4 w-4 text-teal-600" />
                    Manage Devices
                  </button>
                </div>
              </section>

              <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <HeartPulse className="h-4 w-4 text-teal-600" />
                  Medical record
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-100 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Age / Gender</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {[dashboard.patientRecord.age ? `${dashboard.patientRecord.age} yrs` : null, dashboard.patientRecord.gender]
                        .filter(Boolean)
                        .join(' · ') || 'Not added'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Blood group</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {dashboard.patientRecord.bloodGroup || 'Not added'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs text-slate-400 mb-1">Height</p>
                    <p className="text-sm font-semibold text-slate-800">
                      {dashboard.patientRecord.height || 'Not added'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs text-slate-400 mb-1">Weight</p>
                    <p className="text-sm font-semibold text-slate-800">
                      {dashboard.patientRecord.weight || 'Not added'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4 sm:col-span-2">
                    <p className="text-xs text-slate-400 mb-1">Allergies</p>
                    <p className="text-sm font-semibold text-slate-800">
                      {dashboard.patientRecord.allergies || 'None reported'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-100 p-4 sm:col-span-2">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                      <MapPin className="h-4 w-4" />
                      Address
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {dashboard.patientRecord.address || 'Not added'}
                    </p>
                  </div>
                </div>
              </section>

              <section className="grid gap-3 sm:grid-cols-2">
                {[
                  { label: 'Dashboard', href: PATIENT_DASHBOARD, icon: LayoutGrid },
                  { label: 'Prescriptions', href: PATIENT_PRESCRIPTIONS, icon: Pill },
                  { label: 'My Hospital', href: PATIENT_HOSPITAL, icon: Building2 },
                  { label: 'Book appointment', href: PATIENT_APPOINTMENTS, icon: CalendarPlus },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => router.push(item.href)}
                      className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <Icon className="h-4 w-4 text-teal-600" />
                      {item.label}
                    </button>
                  );
                })}
              </section>

              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={signingOut}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-70"
              >
                {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                {signingOut ? 'Signing out...' : 'Sign out'}
              </button>
            </div>
          )}
        </main>
      </div>

      <ProfileEditModal
        isOpen={isProfileEditOpen}
        onClose={() => setIsProfileEditOpen(false)}
        initialProfile={dashboard ? dashboard.profile : null}
        initialRecord={dashboard ? dashboard.patientRecord : null}
        onSaveSuccess={() => loadDashboard()}
      />

      <SwitchAccountModal open={isSwitchOpen} onClose={() => setIsSwitchOpen(false)} />
      <ManageAccountsModal open={isManageOpen} onClose={() => setIsManageOpen(false)} />
      <ManageDevicesModal open={isDevicesOpen} onClose={() => setIsDevicesOpen(false)} />
      <CreditHistoryModal open={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} />
    </div>
  );
}
