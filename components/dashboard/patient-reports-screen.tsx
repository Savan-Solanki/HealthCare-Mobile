'use client';

import {
  Activity,
  ArrowLeft,
  Building2,
  CalendarDays,
  CalendarPlus,
  Camera,
  Download,
  FileText,
  FileImage,
  File,
  FolderOpen,
  HeartPulse,
  LayoutGrid,
  Loader2,
  LogOut,
  Pill,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import api, { logoutPatient } from '@/lib/api';
import PatientHeaderMenu from '@/components/dashboard/patient-header-menu';
import { useSessionGuard } from '@/hooks/use-session-guard';
import { getActiveAccountId, screenNeedsFreshLoad, markScreenLoaded, clearForceFreshLoad } from '@/lib/session';
import { getPatientDB } from '@/lib/db';
import {
  PATIENT_APPOINTMENTS,
  PATIENT_DASHBOARD,
  PATIENT_HOSPITAL,
  PATIENT_LOGIN_PATH,
  PATIENT_PRESCRIPTIONS,
  PATIENT_REPORTS,
  PATIENT_PLANS,
} from '@/lib/routes';
import { getPatientDesktopNavItems } from '@/lib/patient-nav';
import { fetchPatientDashboard, type PatientDashboardData } from '@/lib/patient-dashboard';
import PlatformAdBanner from '@/components/dashboard/platform-ad-banner';

type ReportItem = {
  id: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  uploadedAt: string;
  downloadUrl: string;
};

const desktopNavItems = getPatientDesktopNavItems('reports');

const MAX_REPORT_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_REPORT_UPLOAD_MB = 50;

const formatShortDate = (value: string) => {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const getReportIcon = (contentType: string) => {
  const type = contentType.toLowerCase();
  if (type.includes('pdf')) return FileText;
  if (type.includes('image') || type.includes('png') || type.includes('jpeg')) return FileImage;
  if (type.includes('word') || type.includes('msword') || type.includes('officedocument')) return File;
  return FileText;
};

export default function PatientReportsScreen() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dashboard, setDashboard] = useState<PatientDashboardData | null>(null);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null);
  const [downloadingReportId, setDownloadingReportId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  useSessionGuard();

  const loadDashboard = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    try {
      const nextDashboard = await fetchPatientDashboard();
      setDashboard(nextDashboard);
      
      const activeAccountId = getActiveAccountId();
      if (activeAccountId) {
        try {
          const db = getPatientDB(activeAccountId);
          await db.syncMeta.put({
            key: 'dashboard_snapshot',
            value: JSON.stringify(nextDashboard),
          });
        } catch (dbErr) {
          console.error('[Reports] Error caching snapshot:', dbErr);
        }
      }
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, []);

  const loadReports = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    try {
      const response = await api.get<{ data: ReportItem[] }>('/patient/reports');
      setReports(response.data.data);
    } catch (err) {
      toast.error('Unable to retrieve medical reports.');
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, []);

  const initData = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadDashboard({ silent: true }), loadReports({ silent: true })]);
    setLoading(false);
  }, [loadDashboard, loadReports]);

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
    if (screenNeedsFreshLoad('reports')) {
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
        markScreenLoaded('reports');
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

    void loadReports({ silent: true });
  }, [loadDashboard, loadReports, router]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleProfileUpdate = () => {
      console.log('[Reports] Received profile:updated event, refreshing...');
      void loadDashboard({ silent: true });
    };

    window.addEventListener('patient-profile-updated', handleProfileUpdate);
    return () => {
      window.removeEventListener('patient-profile-updated', handleProfileUpdate);
    };
  }, [loadDashboard]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadDashboard({ silent: true }), loadReports({ silent: true })]);
    setRefreshing(false);
    toast.success('Data refreshed.');
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check size limit (50 MB)
    if (file.size > MAX_REPORT_UPLOAD_BYTES) {
      toast.error(`File is too large. Maximum size is ${MAX_REPORT_UPLOAD_MB} MB.`);
      return;
    }

    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (!allowedTypes.includes(file.type)) {
      toast.error('Only PDF, JPG, PNG, and Word (DOC/DOCX) files are allowed.');
      return;
    }

    const credits = dashboard?.profile?.reportCredits ?? 0;
    if (credits <= 0) {
      toast.error('No report credits remaining. Please purchase a plan.', {
        action: {
          label: 'Buy Plan',
          onClick: () => router.push(PATIENT_PLANS),
        },
      });
      return;
    }

    try {
      setUploading(true);
      setIsUploadOpen(false);

      // 1. Create upload session
      const sessionResponse = await api.post<{
        data: { uploadUrl: string; uploadToken: string; contentType: string };
      }>('/patient/reports/upload-session', {
        contentType: file.type,
        fileSize: file.size,
        fileName: file.name,
      });

      const { uploadUrl, uploadToken, contentType: signedContentType } = sessionResponse.data.data;

      // 2. Put file to S3 (with fallback to server upload if CORS blocks it)
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
        console.warn('[Reports] Direct S3 upload blocked by CORS. Using server fallback...', s3Err);
      }

      if (s3Success) {
        // 3. Complete session
        await api.post('/patient/reports/upload-complete', { uploadToken });
      } else {
        // Fallback: upload file directly through backend API
        const formData = new FormData();
        formData.append('report', file);
        formData.append('fileName', file.name);

        await api.post('/patient/reports/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 120000,
        });
      }

      toast.success('Medical report uploaded successfully!');
      void initData();
    } catch (error: any) {
      const errMsg = error.response?.data?.message || error.message || 'Failed to upload report.';
      toast.error(errMsg);
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadReport = useCallback(async (report: ReportItem) => {
    try {
      setDownloadingReportId(report.id);
      const response = await api.get<{ data?: { url?: string } }>(
        `/files/${report.id}/download`
      );
      const url = response.data?.data?.url;

      if (!url) {
        throw new Error('Signed URL missing');
      }

      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      const errMsg = err.response?.data?.message || err.message || 'Failed to download report.';
      toast.error(errMsg);
    } finally {
      setDownloadingReportId(null);
    }
  }, []);

  const handleDeleteReport = async (reportId: string) => {
    if (!confirm('Are you sure you want to delete this report permanently?')) return;

    try {
      setDeletingReportId(reportId);
      await api.delete(`/patient/reports/${reportId}`);
      toast.success('Report deleted successfully.');
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      void loadDashboard({ silent: true });
    } catch {
      toast.error('Failed to delete the report.');
    } finally {
      setDeletingReportId(null);
    }
  };

  const handleNavAction = (item: { href?: string; label: string }) => {
    if (item.href) {
      router.push(item.href);
    } else {
      toast.info(`${item.label} feature is coming soon.`);
    }
  };

  const filteredReports = useMemo(() => {
    if (!searchQuery.trim()) return reports;
    const q = searchQuery.toLowerCase();
    return reports.filter((r) => r.fileName.toLowerCase().includes(q));
  }, [reports, searchQuery]);

  return (
    <div className="flex min-h-screen bg-slate-50 pb-[calc(4.5rem+env(safe-area-inset-bottom))] xl:pb-0">
      {/* ─── Desktop Sidebar ────────────────────────────────────────────────── */}
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
                  if (!active) handleNavAction(item);
                }}
                type="button"
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* ─── Main Content ───────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Header */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-8 xl:py-5">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push(PATIENT_DASHBOARD)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 hover:bg-slate-50 xl:hidden"
            >
              <ArrowLeft className="h-5 w-5 text-slate-600" />
            </button>
            <h1 className="text-xl font-bold text-slate-950 sm:text-2xl">Medical Reports</h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-50"
            >
              <RefreshCw className={`h-4.5 w-4.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            {dashboard && (
              <PatientHeaderMenu
                name={dashboard.profile.name}
                firstName={dashboard.profile.firstName}
                id={dashboard.profile.id}
                avatar={dashboard.profile.avatar}
                initials={dashboard.profile.initials}
              />
            )}
          </div>
        </header>

        <main className="flex-1 p-5 sm:p-8 space-y-6 max-w-4xl w-full mx-auto">
          {/* Credit balance card */}
          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-r from-teal-700 to-cyan-800 p-6 text-white shadow-xl">
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/35 px-3 py-1 text-xs font-semibold uppercase tracking-wider backdrop-blur-sm">
                  <ShieldCheck className="h-3.5 w-3.5" /> Direct Upload Plan
                </span>
                <p className="mt-4 text-3xl font-bold">
                  {loading ? '...' : `${dashboard?.profile?.reportCredits ?? 0} Credits`}
                </p>
                <p className="mt-1 text-teal-100 text-sm">Remaining medical report upload credits</p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => router.push(PATIENT_PLANS)}
                  className="rounded-2xl bg-white px-5 py-3 text-sm font-bold text-teal-950 transition hover:bg-teal-50 active:scale-95 cursor-pointer"
                >
                  Buy Credits
                </button>

                <label className="inline-flex items-center gap-2 rounded-2xl bg-teal-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-teal-500 active:scale-95 cursor-pointer shadow-md">
                  <Upload className="h-4.5 w-4.5" />
                  {uploading ? 'Uploading...' : 'Upload Report'}
                  <input
                    type="file"
                    className="hidden"
                    onChange={handleFileChange}
                    disabled={uploading}
                    accept="application/pdf,image/jpeg,image/png,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  />
                </label>
              </div>
            </div>
            <div className="absolute -right-10 -bottom-10 h-40 w-40 rounded-full bg-white/5" />
          </div>

          {/* Search and List */}
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search reports by filename..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none"
              />
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
                <p className="text-sm font-semibold">Retrieving your reports...</p>
              </div>
            ) : filteredReports.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-500 text-center space-y-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50 text-slate-400 border border-slate-100">
                  <FolderOpen className="h-8 w-8" />
                </div>
                <div>
                  <p className="text-base font-semibold text-slate-900">No reports found</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {searchQuery ? 'Try matching a different filename.' : 'Upload your medical reports to keep them secure and accessible.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredReports.map((report) => {
                  const Icon = getReportIcon(report.contentType);

                  return (
                    <div key={report.id} className="flex items-center justify-between py-4 first:pt-0 last:pb-0 gap-4">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 border border-teal-100/50">
                          <Icon className="h-5.5 w-5.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-900" title={report.fileName}>
                            {report.fileName}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-slate-500">
                            <span>{formatShortDate(report.uploadedAt)}</span>
                            <span className="h-1 w-1 rounded-full bg-slate-300" />
                            <span>{formatBytes(report.fileSize)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleDownloadReport(report)}
                          disabled={downloadingReportId === report.id || deletingReportId === report.id}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition disabled:opacity-50"
                          title="View or Download"
                        >
                          {downloadingReportId === report.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDeleteReport(report.id)}
                          disabled={deletingReportId === report.id}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-red-100 hover:bg-red-50 text-red-600 transition disabled:opacity-50"
                          title="Delete Report"
                        >
                          {deletingReportId === report.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>


      <PlatformAdBanner />
    </div>
  );
}
