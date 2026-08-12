'use client';

import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  CalendarPlus,
  Camera,
  Download,
  FileText,
  FlaskConical,
  FolderOpen,
  HeartPulse,
  LayoutGrid,
  Loader2,
  LogOut,
  MapPin,
  Pill,
  RefreshCw,
  Search,
  ShieldCheck,
  Stethoscope,
  Trash2,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import api, { logoutPatient } from '@/lib/api';
import PatientHeaderMenu from '@/components/dashboard/patient-header-menu';
import PatientAvatar from '@/components/dashboard/patient-avatar';
import { isPatientProfileComplete } from '@/lib/patient-profile';
import { fetchPatientPrescriptions } from '@/lib/patient-prescriptions';
import {
  type DashboardPrescription,
  type PatientDashboardData,
  fetchPatientDashboard,
} from '@/lib/patient-dashboard';
import { useSessionGuard } from '@/hooks/use-session-guard';
import { getPatientDB } from '@/lib/db';
import { getActiveAccountId, screenNeedsFreshLoad, markScreenLoaded, clearForceFreshLoad } from '@/lib/session';
import { useLiveQuery } from 'dexie-react-hooks';
import { syncAllPatientData } from '@/lib/db/sync-engine';
import {
  PATIENT_APPOINTMENTS,
  PATIENT_DASHBOARD,
  PATIENT_HOSPITAL,
  PATIENT_LOGIN_PATH,
  PATIENT_PRESCRIPTIONS,
  PATIENT_PRESCRIPTIONS_DOCTOR,
  PATIENT_PRESCRIPTIONS_UPLOADED,
  PATIENT_PROFILE,
  PATIENT_PLANS,
} from '@/lib/routes';
import { getPatientDesktopNavItems } from '@/lib/patient-nav';
import PlatformAdBanner from '@/components/dashboard/platform-ad-banner';

type PrescriptionsView = 'hub' | 'doctor' | 'uploaded';

const desktopNavItems = getPatientDesktopNavItems('prescriptions');

const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const formatShortDate = (value: string | null | undefined) => {
  if (!value) return 'Not available';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';

  return shortDateFormatter.format(date);
};

const buildPatientCode = (value: string) => {
  const clean = String(value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `MW-${(clean.slice(-6) || '000000').padStart(6, '0')}`;
};

const MAX_PRESCRIPTION_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_PRESCRIPTION_UPLOAD_MB = 20;
const getTodayDate = () => new Date().toISOString().split('T')[0];

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = error as { response?: { data?: { message?: string } } };
    return response.response?.data?.message || 'Unable to load your prescriptions right now.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unable to load your prescriptions right now.';
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

const formatMedicineSchedule = (medicine: DashboardPrescription['medicines'][number]) => {
  const schedule = medicine.schedule;
  if (!schedule) return medicine.frequency;

  const labels = [
    schedule.morning ? `Morning${schedule.morningTime ? ` ${schedule.morningTime}` : ''}` : null,
    schedule.afternoon ? `Afternoon${schedule.afternoonTime ? ` ${schedule.afternoonTime}` : ''}` : null,
    schedule.night ? `Night${schedule.nightTime ? ` ${schedule.nightTime}` : ''}` : null,
  ].filter(Boolean);

  return labels.length ? labels.join(' / ') : medicine.frequency;
};

function PrescriptionCard({
  downloading,
  deleting,
  prescription,
  onDownload,
  onDelete,
}: {
  downloading: boolean;
  deleting?: boolean;
  prescription: DashboardPrescription;
  onDownload: (prescription: DashboardPrescription) => void;
  onDelete?: (prescription: DashboardPrescription) => void;
}) {
  const isUploaded = prescription.source === 'patient_uploaded';

  return (
    <article className="overflow-hidden rounded-[1.5rem] sm:rounded-[2rem] border border-slate-100 bg-white shadow-[0_20px_50px_-40px_rgba(15,23,42,0.18)]">
      <div className="border-b border-slate-100 bg-slate-50/70 p-4 sm:p-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-full text-white ${
              isUploaded ? 'bg-sky-700' : 'bg-teal-800'
            }`}
          >
            {isUploaded ? <Upload className="h-5 w-5 sm:h-6 sm:w-6" /> : <Stethoscope className="h-5 w-5 sm:h-6 sm:w-6" />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base sm:text-lg font-bold text-slate-950">
                {isUploaded ? prescription.doctorName || 'Uploaded prescription' : prescription.doctorName || 'Doctor'}
              </h3>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  isUploaded ? 'bg-sky-50 text-sky-700' : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                {isUploaded ? 'Uploaded by you' : 'Doctor issued'}
              </span>
            </div>
            <p className="mt-0.5 sm:mt-1 truncate text-xs sm:text-sm text-slate-500">
              {prescription.diagnosis || 'No diagnosis noted'} &middot; {formatShortDate(prescription.prescriptionDate)}
            </p>
            {prescription.hospital?.name ? (
              <div className={`mt-1.5 flex items-center gap-1.5 text-xs font-semibold rounded-lg px-2.5 py-0.5 w-max max-w-full border ${
                isUploaded 
                  ? 'text-sky-700 bg-sky-50/70 border-sky-100' 
                  : 'text-teal-700 bg-teal-50/70 border-teal-100'
              }`}>
                <Building2 className={`h-3.5 w-3.5 shrink-0 ${isUploaded ? 'text-sky-600' : 'text-teal-600'}`} />
                <span className="truncate">{prescription.hospital.name}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isUploaded && onDelete ? (
            <button
              className="flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-full border border-red-200 bg-white text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={deleting}
              onClick={() => onDelete(prescription)}
              type="button"
              title="Delete prescription"
            >
              {deleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              )}
            </button>
          ) : null}

          <button
            className="flex items-center gap-1 sm:gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 sm:px-4.5 sm:py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={downloading || !prescription.hasPdf}
            onClick={() => onDownload(prescription)}
            type="button"
          >
            {downloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            <span>{downloading ? 'Opening' : 'PDF'}</span>
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {prescription.medicines.length === 0 && isUploaded ? (
          <p className="text-sm text-slate-500">
            Photo-based prescription uploaded from your device. Open the PDF to view the original image.
          </p>
        ) : null}
        <ul className="space-y-2.5">
          {prescription.medicines.map((med, index) => (
            <li className="flex items-center gap-2.5 text-sm sm:text-[0.95rem] text-slate-700" key={`${med.name}-${index}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="font-medium text-slate-900">{med.name}</span>
              <span className="text-slate-500">{med.dosage}</span>
              <span className="text-slate-400 font-semibold">&middot;</span>
              <span className="rounded bg-teal-50 px-1.5 py-0.5 text-xs text-teal-700 font-medium whitespace-nowrap">
                {formatMedicineSchedule(med)}
              </span>
            </li>
          ))}
        </ul>

        {prescription.instruction ? (
          <div className="mt-4 rounded-xl border border-dashed border-teal-100 bg-teal-50/40 p-3">
            <p className="text-[0.65rem] font-bold uppercase tracking-wider text-teal-800">
              Instruction
            </p>
            <p className="mt-1 text-xs sm:text-sm leading-relaxed text-slate-600">
              {prescription.instruction}
            </p>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-[60px] animate-pulse rounded-[1.5rem] bg-white" />
      <div className="grid gap-6 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            className="h-[200px] animate-pulse rounded-[1.5rem] bg-white"
            key={`rx-skeleton-${index}`}
          />
        ))}
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
      <h2 className="mt-4 text-2xl font-bold text-slate-950">Unable to load prescriptions</h2>
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

export default function PatientPrescriptionsScreen({ view = 'hub' }: { view?: PrescriptionsView }) {
  useSessionGuard();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const storageInputRef = useRef<HTMLInputElement | null>(null);
  const [dashboard, setDashboard] = useState<PatientDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloadingPrescriptionId, setDownloadingPrescriptionId] = useState<string | null>(null);
  const [deletingPrescriptionId, setDeletingPrescriptionId] = useState<string | null>(null);
  const [uploadForm, setUploadForm] = useState({
    diagnosis: '',
    doctorName: '',
    hospitalName: '',
    hospitalAddress: '',
    prescriptionDate: getTodayDate(),
  });
  
  const [searchQuery, setSearchQuery] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [selectedHospital, setSelectedHospital] = useState('all');

  const activeAccountId = getActiveAccountId();
  const db = activeAccountId ? getPatientDB(activeAccountId) : null;

  const dbPrescriptions = useLiveQuery(
    () => {
      if (!db) return [];
      return db.prescriptions.toArray();
    },
    [db]
  );

  const { doctorPrescriptionCount, uploadedPrescriptionCount, filteredPrescriptions } = useMemo(() => {
    if (!dbPrescriptions) {
      return { doctorPrescriptionCount: 0, uploadedPrescriptionCount: 0, filteredPrescriptions: [] };
    }
    const docList = dbPrescriptions.filter((p) => p.source === 'doctor_generated');
    const uploadList = dbPrescriptions.filter((p) => p.source === 'patient_uploaded');

    let list = [];
    if (view === 'doctor') {
      list = docList;
    } else if (view === 'uploaded') {
      list = uploadList;
    } else {
      list = dbPrescriptions;
    }

    list.sort((a, b) => new Date(b.prescriptionDate).getTime() - new Date(a.prescriptionDate).getTime());

    return {
      doctorPrescriptionCount: docList.length,
      uploadedPrescriptionCount: uploadList.length,
      filteredPrescriptions: list,
    };
  }, [dbPrescriptions, view]);

  const uniqueHospitals = useMemo(() => {
    if (!filteredPrescriptions) return [];
    const names = new Set<string>();
    filteredPrescriptions.forEach((p) => {
      if (p.hospital?.name) {
        names.add(p.hospital.name);
      }
    });
    return Array.from(names).sort();
  }, [filteredPrescriptions]);

  useEffect(() => {
    setSelectedHospital('all');
    setSearchQuery('');
    setInputValue('');
  }, [view]);

  const loadDashboard = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!activeAccountId) return;
      const silent = options?.silent ?? false;

      if (silent) {
        setRefreshing(true);
      } else {
        setError(null);
      }

      try {
        const nextDashboard = await fetchPatientDashboard();
        
        if (db) {
          try {
            await db.syncMeta.put({
              key: 'dashboard_snapshot',
              value: JSON.stringify(nextDashboard),
            });
          } catch (dbErr) {
            console.error('[Prescriptions] Error caching snapshot:', dbErr);
          }
        }

        await syncAllPatientData(activeAccountId, true);

        startTransition(() => {
          setDashboard(nextDashboard);
          setError(null);
        });
      } catch (nextError: any) {
        const is429 = nextError?.response?.status === 429;

        if (is429 || silent) {
          // Rate-limited or background refresh — show cached data, no toast, no error
          console.warn('[Prescriptions] Fetch skipped:', is429 ? '429' : nextError?.message);
        } else {
          setError(getErrorMessage(nextError));
          setDashboard(null);
        }
      } finally {
        setRefreshing(false);
      }
    },
    [startTransition, activeAccountId, db]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // After an account switch: clear this account's IndexedDB first (properly
    // awaited), then load fresh data from the API. Old accounts keep their own
    // IndexedDB intact so switching back restores their data.
    if (screenNeedsFreshLoad('prescriptions')) {
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
        markScreenLoaded('prescriptions');
      })();
      return;
    }

    if (activeAccountId) {
      const dbInstance = getPatientDB(activeAccountId);
      dbInstance.syncMeta.get('dashboard_snapshot').then((cached) => {
        if (cached) {
          setDashboard(JSON.parse(cached.value));
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
  }, [loadDashboard, activeAccountId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleProfileUpdate = () => {
      console.log('[Prescriptions] Received profile:updated event, refreshing...');
      void loadDashboard({ silent: true });
    };

    window.addEventListener('patient-profile-updated', handleProfileUpdate);
    return () => {
      window.removeEventListener('patient-profile-updated', handleProfileUpdate);
    };
  }, [loadDashboard]);

  const handleNavAction = useCallback(
    (item: { href?: string; label: string }) => {
      if (item.href) {
        router.push(item.href);
        return;
      }
      toast.info(`${item.label} is coming soon.`);
    },
    [router]
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

  const handleDownloadPDF = useCallback(async (prescription: DashboardPrescription) => {
    if (!prescription.hasPdf) {
      toast.error('Prescription PDF is not available yet.');
      return;
    }

    try {
      setDownloadingPrescriptionId(prescription.id);
      const response = await api.get<{ data?: { url?: string } }>(
        `/files/${prescription.id}/download`
      );
      const url = response.data?.data?.url;

      if (!url) {
        throw new Error('Signed URL missing');
      }

      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (nextError) {
      toast.error(getErrorMessage(nextError));
    } finally {
      setDownloadingPrescriptionId(null);
    }
  }, []);

  const handleDeletePrescription = async (prescription: DashboardPrescription) => {
    if (
      !window.confirm(
        `Are you sure you want to delete this prescription? ${
          prescription.fileName ? `(${prescription.fileName})` : ''
        }`
      )
    ) {
      return;
    }

    try {
      if (db) {
        await db.prescriptions.delete(prescription.id);
      }
      await api.delete(`/patient/prescriptions/${prescription.id}`);
      toast.success('Prescription deleted successfully.');
      void loadDashboard({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err));
      void loadDashboard({ silent: true });
    }
  };

  const handleUploadFieldChange = (field: keyof typeof uploadForm, value: string) => {
    setUploadForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handlePrescriptionFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    if (file.size > MAX_PRESCRIPTION_UPLOAD_BYTES) {
      toast.error(`File must be ${MAX_PRESCRIPTION_UPLOAD_MB} MB or smaller.`);
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Only JPG, PNG, and PDF files are allowed.');
      return;
    }

    const credits = dashboard?.profile?.prescriptionCredits ?? 0;
    if (credits <= 0) {
      toast.error('No prescription credits remaining. Please purchase a plan.', {
        action: {
          label: 'Buy Plan',
          onClick: () => router.push(PATIENT_PLANS),
        },
      });
      return;
    }

    try {
      setUploading(true);

      const sessionPayload: Record<string, string | number> = {
        contentType: file.type,
        fileSize: file.size,
        fileName: file.name,
      };
      Object.entries(uploadForm).forEach(([key, value]) => {
        if (value.trim()) sessionPayload[key] = value.trim();
      });

      const sessionResponse = await api.post<{
        data?: { uploadUrl?: string; uploadToken?: string; contentType?: string };
      }>('/patient/prescriptions/upload-session', sessionPayload, {
        timeout: 60000,
      });

      const uploadUrl = sessionResponse.data?.data?.uploadUrl;
      const uploadToken = sessionResponse.data?.data?.uploadToken;
      const signedContentType = sessionResponse.data?.data?.contentType || file.type;

      if (!uploadUrl || !uploadToken) {
        throw new Error('Upload session could not be started.');
      }

      let s3Success = false;
      try {
        const s3Response = await fetch(uploadUrl, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': signedContentType,
          },
        });
        if (s3Response.ok) {
          s3Success = true;
        }
      } catch (s3Err) {
        console.warn('[Prescriptions] Direct S3 upload failed or blocked by CORS. Using server upload fallback...', s3Err);
      }

      if (s3Success) {
        await api.post(
          '/patient/prescriptions/upload-complete',
          { uploadToken },
          { timeout: 120000 }
        );
      } else {
        // Fallback: Send file directly to backend API endpoint to bypass browser S3 CORS block
        const formData = new FormData();
        formData.append('prescription', file);
        Object.entries(uploadForm).forEach(([key, value]) => {
          if (value.trim()) formData.append(key, value.trim());
        });

        await api.post('/patient/prescriptions/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 120000,
        });
      }
      toast.success('Prescription uploaded successfully.');
      setDashboard((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          profile: {
            ...prev.profile,
            prescriptionCredits: Math.max(0, prev.profile.prescriptionCredits - 1),
          },
        };
      });
      setUploadForm({
        diagnosis: '',
        doctorName: '',
        hospitalName: '',
        hospitalAddress: '',
        prescriptionDate: getTodayDate(),
      });
      await loadDashboard({ silent: true });
    } catch (nextError) {
      toast.error(getErrorMessage(nextError));
    } finally {
      setUploading(false);
    }
  };

  const filteredPrescriptionsList = useMemo(() => {
    const list = view === 'hub' ? [] : filteredPrescriptions;

    let result = list;
    if (selectedHospital !== 'all') {
      result = result.filter((p) => p.hospital?.name === selectedHospital);
    }

    if (!searchQuery.trim()) return result;

    const q = searchQuery.toLowerCase().trim();
    return result.filter(
      (p) =>
        (p.diagnosis || '').toLowerCase().includes(q) ||
        (p.doctorName || '').toLowerCase().includes(q) ||
        (p.hospital?.name || '').toLowerCase().includes(q) ||
        p.medicines.some((m) => m.name.toLowerCase().includes(q))
    );
  }, [filteredPrescriptions, searchQuery, selectedHospital, view]);

  const pageTitle =
    view === 'doctor'
      ? 'Doctor prescriptions'
      : view === 'uploaded'
        ? 'Uploaded prescriptions'
        : 'Prescriptions';

  const pageSubtitle =
    view === 'doctor'
      ? 'Structured prescriptions issued by your doctors'
      : view === 'uploaded'
        ? 'Photos and documents you uploaded from your device'
        : 'Choose between doctor-issued and self-uploaded prescriptions';

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(inputValue);
  };

  const loading = dbPrescriptions === undefined || dashboard === null;

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
              {view !== 'hub' ? (
                <button
                  type="button"
                  onClick={() => router.push(PATIENT_PRESCRIPTIONS)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-600 transition hover:bg-slate-50"
                  aria-label="Back to prescriptions hub"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
              ) : null}
              <div className="min-w-0 flex-1">
                <h1 className="text-xl sm:text-3xl lg:text-[2.25rem] font-bold leading-tight text-slate-950">
                  {pageTitle}
                </h1>
                <p className="mt-1 text-xs sm:text-sm text-slate-500">
                  {pageSubtitle}
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
              <PageSkeleton />
            ) : error && !dashboard ? (
              <ErrorState
                message={error}
                onRetry={() => {
                  void loadDashboard();
                }}
              />
            ) : dashboard ? (
              <div className="space-y-6">
                {view === 'hub' ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => router.push(PATIENT_PRESCRIPTIONS_DOCTOR)}
                      className="group rounded-[1.75rem] border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
                          <Stethoscope className="h-7 w-7" />
                        </div>
                        <ArrowRight className="h-5 w-5 text-slate-300 transition group-hover:text-teal-600" />
                      </div>
                      <h2 className="mt-5 text-xl font-bold text-slate-950">Doctor created</h2>
                      <p className="mt-2 text-sm leading-6 text-slate-500">
                        Structured prescriptions with medicines, dosage, and follow-up dates from your doctors.
                      </p>
                      <p className="mt-4 text-sm font-semibold text-teal-700">{doctorPrescriptionCount} available</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => router.push(PATIENT_PRESCRIPTIONS_UPLOADED)}
                      className="group rounded-[1.75rem] border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                          <Upload className="h-7 w-7" />
                        </div>
                        <ArrowRight className="h-5 w-5 text-slate-300 transition group-hover:text-sky-600" />
                      </div>
                      <h2 className="mt-5 text-xl font-bold text-slate-950">Uploaded by you</h2>
                      <p className="mt-2 text-sm leading-6 text-slate-500">
                        Keep photos of prescriptions you received outside the app or scanned from paper records.
                      </p>
                      <p className="mt-4 text-sm font-semibold text-sky-700">{uploadedPrescriptionCount} available</p>
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                    <form className="relative flex flex-1 items-center gap-3 rounded-[1.5rem] bg-white p-2 shadow-sm ring-1 ring-slate-200/80 focus-within:ring-teal-500/50" onSubmit={handleSearchSubmit}>
                      <div className="flex flex-1 items-center gap-2.5 pl-3">
                        <Search className="h-5 w-5 text-slate-400 shrink-0" />
                        <input
                          className="w-full text-sm sm:text-base text-slate-900 placeholder:text-slate-400 outline-none"
                          onChange={(e) => setInputValue(e.target.value)}
                          placeholder="Search by doctor, medication, or date..."
                          type="text"
                          value={inputValue}
                        />
                      </div>
                      <button
                        className="rounded-[1rem] sm:rounded-[1.2rem] bg-teal-800 hover:bg-teal-900 transition-colors px-4 py-2 sm:px-6 sm:py-2.5 text-xs sm:text-sm font-semibold text-white cursor-pointer"
                        type="submit"
                      >
                        Search
                      </button>
                    </form>

                    {uniqueHospitals.length > 0 ? (
                      <div className="relative flex items-center gap-2 rounded-[1.5rem] bg-white p-2 pl-4 pr-10 shadow-sm ring-1 ring-slate-200/80 focus-within:ring-teal-500/50 sm:w-72">
                        <Building2 className="h-5 w-5 text-slate-400 shrink-0" />
                        <select
                          className="w-full bg-transparent text-sm font-semibold text-slate-700 outline-none cursor-pointer appearance-none"
                          value={selectedHospital}
                          onChange={(e) => setSelectedHospital(e.target.value)}
                        >
                          <option value="all">All Hospitals</option>
                          {uniqueHospitals.map((hospital) => (
                            <option key={hospital} value={hospital}>
                              {hospital}
                            </option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute right-4 flex items-center text-slate-400">
                          <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20">
                            <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                          </svg>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}

                {view === 'uploaded' ? (
                <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <input
                    accept="image/jpeg,image/png"
                    capture="environment"
                    className="hidden"
                    onChange={(event) => {
                      void handlePrescriptionFileChange(event);
                    }}
                    ref={fileInputRef}
                    type="file"
                  />
                  <input
                    accept="image/jpeg,image/png,application/pdf"
                    className="hidden"
                    onChange={(event) => {
                      void handlePrescriptionFileChange(event);
                    }}
                    ref={storageInputRef}
                    type="file"
                  />
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
                    <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                      <label className="space-y-1.5">
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Date</span>
                        <div className="flex h-11 items-center gap-2 rounded-2xl border border-slate-200 px-3">
                          <CalendarDays className="h-4 w-4 text-slate-400" />
                          <input
                            className="w-full bg-transparent text-sm font-semibold text-slate-900 outline-none"
                            onChange={(event) =>
                              handleUploadFieldChange('prescriptionDate', event.target.value)
                            }
                            type="date"
                            value={uploadForm.prescriptionDate}
                          />
                        </div>
                      </label>
                      <label className="space-y-1.5">
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Diagnosis</span>
                        <input
                          className="h-11 w-full rounded-2xl border border-slate-200 px-3 text-sm font-semibold text-slate-900 outline-none focus:border-teal-500"
                          onChange={(event) => handleUploadFieldChange('diagnosis', event.target.value)}
                          placeholder="Diagnosis"
                          type="text"
                          value={uploadForm.diagnosis}
                        />
                      </label>
                      <label className="space-y-1.5">
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Doctor</span>
                        <input
                          className="h-11 w-full rounded-2xl border border-slate-200 px-3 text-sm font-semibold text-slate-900 outline-none focus:border-teal-500"
                          onChange={(event) => handleUploadFieldChange('doctorName', event.target.value)}
                          placeholder="Doctor name"
                          type="text"
                          value={uploadForm.doctorName}
                        />
                      </label>
                      <label className="space-y-1.5">
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Hospital</span>
                        <input
                          className="h-11 w-full rounded-2xl border border-slate-200 px-3 text-sm font-semibold text-slate-900 outline-none focus:border-teal-500"
                          onChange={(event) => handleUploadFieldChange('hospitalName', event.target.value)}
                          placeholder="Hospital name"
                          type="text"
                          value={uploadForm.hospitalName}
                        />
                      </label>
                      <label className="space-y-1.5">
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Address</span>
                        <div className="flex h-11 items-center gap-2 rounded-2xl border border-slate-200 px-3">
                          <MapPin className="h-4 w-4 text-slate-400" />
                          <input
                            className="w-full bg-transparent text-sm font-semibold text-slate-900 outline-none"
                            onChange={(event) =>
                              handleUploadFieldChange('hospitalAddress', event.target.value)
                            }
                            placeholder="Hospital address"
                            type="text"
                            value={uploadForm.hospitalAddress}
                          />
                        </div>
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-teal-800 px-5 text-sm font-bold text-white transition-colors hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-70"
                        disabled={uploading}
                        onClick={() => fileInputRef.current?.click()}
                        type="button"
                      >
                        {uploading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Camera className="h-4 w-4" />
                        )}
                        {uploading ? 'Uploading' : 'Take photo'}
                      </button>
                      <button
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-teal-700 bg-white px-5 text-sm font-bold text-teal-800 transition-colors hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-70"
                        disabled={uploading}
                        onClick={() => storageInputRef.current?.click()}
                        type="button"
                      >
                        {uploading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <FolderOpen className="h-4 w-4" />
                        )}
                        {uploading ? 'Uploading' : 'Upload file'}
                      </button>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-slate-400">Accepted: JPG, PNG, or PDF (max {MAX_PRESCRIPTION_UPLOAD_MB} MB)</p>
                </section>
                ) : null}

                {view !== 'hub' && filteredPrescriptionsList.length > 0 ? (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filteredPrescriptionsList.map((prescription) => (
                      <PrescriptionCard
                        downloading={downloadingPrescriptionId === prescription.id}
                        deleting={deletingPrescriptionId === prescription.id}
                        key={prescription.id}
                        onDownload={handleDownloadPDF}
                        onDelete={handleDeletePrescription}
                        prescription={prescription}
                      />
                    ))}
                  </div>
                ) : view !== 'hub' ? (
                  <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-white px-5 py-12 text-center text-slate-500">
                    <Pill className="mx-auto h-10 w-10 text-slate-300" />
                    <h3 className="mt-4 text-base font-bold text-slate-900">No prescriptions found</h3>
                    <p className="mt-2 text-sm text-slate-400">
                      {searchQuery
                        ? 'Try refining your search term'
                        : view === 'uploaded'
                          ? 'Upload a prescription photo to keep your records in one place.'
                          : 'Your doctor-issued prescriptions will appear here when added by your care team.'}
                    </p>
                  </div>
                ) : null}
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
