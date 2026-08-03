'use client';

import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Download,
  FileText,
  FlaskConical,
  FolderOpen,
  HeartPulse,
  LayoutGrid,
  Loader2,
  LogOut,
  Pill,
  RefreshCw,
  Search,
  Stethoscope,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import api, { logoutPatient } from '@/lib/api';
import PatientHeaderMenu from '@/components/dashboard/patient-header-menu';
import { useSessionGuard } from '@/hooks/use-session-guard';
import { getPatientDesktopNavItems } from '@/lib/patient-nav';
import { fetchPatientDashboard, type PatientDashboardData } from '@/lib/patient-dashboard';

type DocumentType = 'Prescription' | 'Admission Slip' | 'Discharge Summary' | 'Lab Report';

type UnifiedDocument = {
  id: string;
  name: string;
  type: DocumentType;
  date: string;
  doctorName?: string;
  hospitalName?: string;
  fileSize?: string;
  downloadUrl?: string; // S3 pre-signed URL for direct download
  apiPath?: string; // API endpoint for generating PDF on-the-fly
};

const desktopNavItems = getPatientDesktopNavItems('documents');

const formatBytes = (bytes?: number) => {
  if (!bytes) return 'N/A';
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const getDocIcon = (type: DocumentType): LucideIcon => {
  switch (type) {
    case 'Prescription':
      return Pill;
    case 'Admission Slip':
      return Building2;
    case 'Discharge Summary':
      return FileText;
    case 'Lab Report':
      return FlaskConical;
    default:
      return FileText;
  }
};

const getTypeStyle = (type: DocumentType): string => {
  switch (type) {
    case 'Prescription':
      return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    case 'Admission Slip':
      return 'bg-blue-50 text-blue-700 border-blue-100';
    case 'Discharge Summary':
      return 'bg-teal-50 text-teal-700 border-teal-100';
    case 'Lab Report':
      return 'bg-indigo-50 text-indigo-700 border-indigo-100';
    default:
      return 'bg-slate-50 text-slate-700 border-slate-100';
  }
};

export default function PatientDocumentsScreen() {
  useSessionGuard();
  const router = useRouter();
  const [dashboard, setDashboard] = useState<PatientDashboardData | null>(null);
  const [documents, setDocuments] = useState<UnifiedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [signingOut, setSigningOut] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true);
      // Parallel fetch prescriptions, admissions, discharges, reports and dashboard data
      const [rxRes, admissionsRes, dischargesRes, reportsRes, dashboardData] = await Promise.all([
        api.get('/patient/prescriptions?source=doctor_generated'),
        api.get('/patient/admissions'),
        api.get('/patient/discharges'),
        api.get('/patient/reports'),
        fetchPatientDashboard().catch(() => null),
      ]);

      if (dashboardData) {
        setDashboard(dashboardData);
      }

      const list: UnifiedDocument[] = [];

      // 1. Add Prescriptions
      if (rxRes.data?.success && rxRes.data?.data) {
        rxRes.data.data.forEach((rx: any) => {
          list.push({
            id: rx._id,
            name: `${rx.diagnosis || 'Prescription'} - Dr. ${rx.doctorName || 'Doctor'}`,
            type: 'Prescription',
            date: rx.prescriptionDate || rx.createdAt,
            doctorName: rx.doctorName,
            hospitalName: rx.hospital?.name || 'Partner Hospital',
            fileSize: rx.fileSize ? formatBytes(rx.fileSize) : 'PDF Document',
            apiPath: `/patient/prescriptions/${rx._id}/download`,
          });
        });
      }

      // 2. Add Admission Slips
      if (admissionsRes.data?.success && admissionsRes.data?.data) {
        admissionsRes.data.data.forEach((adm: any) => {
          list.push({
            id: adm._id,
            name: `Admission Slip - ${adm.admissionId}`,
            type: 'Admission Slip',
            date: adm.admissionDate,
            doctorName: adm.doctorName,
            hospitalName: adm.hospitalName || 'Partner Hospital',
            fileSize: 'Admission Record',
            apiPath: `/patient/admissions/${adm._id}/slip`,
          });
        });
      }

      // 3. Add Discharge Summaries
      if (dischargesRes.data?.success && dischargesRes.data?.data) {
        dischargesRes.data.data.forEach((ds: any) => {
          list.push({
            id: ds._id,
            name: `Discharge Summary - ${ds.dischargeId}`,
            type: 'Discharge Summary',
            date: ds.dischargeDate || ds.createdAt,
            doctorName: ds.doctorName,
            hospitalName: ds.hospitalName || 'Partner Hospital',
            fileSize: 'Official Clinical Summary',
            downloadUrl: ds.pdfUrl,
          });
        });
      }

      // 4. Add Lab Reports
      if (reportsRes.data?.success && reportsRes.data?.data) {
        reportsRes.data.data.forEach((rep: any) => {
          list.push({
            id: rep.id || rep._id,
            name: rep.fileName || 'Lab Report',
            type: 'Lab Report',
            date: rep.uploadedAt,
            doctorName: 'Lab Diagnostics',
            hospitalName: 'HMS Laboratories',
            fileSize: rep.fileSize ? formatBytes(rep.fileSize) : 'Result Sheet',
            downloadUrl: rep.downloadUrl,
          });
        });
      }

      // Sort by date descending
      list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setDocuments(list);
    } catch (err) {
      toast.error('Failed to load My Documents folder.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDocuments();

    // Listen to custom updates from WebSocket events
    const handleUpdate = () => {
      void loadDocuments();
    };
    window.addEventListener('patient-documents-updated', handleUpdate);
    return () => {
      window.removeEventListener('patient-documents-updated', handleUpdate);
    };
  }, [loadDocuments]);

  const handleSignOut = async () => {
    try {
      setSigningOut(true);
      await logoutPatient();
      router.replace('/login');
    } catch {
      toast.error('Failed to sign out. Please try again.');
    } finally {
      setSigningOut(false);
    }
  };

  const handleDownload = async (doc: UnifiedDocument) => {
    if (doc.downloadUrl) {
      // Direct opening/downloading S3 pre-signed link
      window.open(doc.downloadUrl, '_blank');
      toast.success('Document opened successfully.');
      return;
    }

    if (doc.apiPath) {
      try {
        setDownloadingId(doc.id);
        const response = await api.get(doc.apiPath, {
          responseType: 'blob',
        });
        const blob = new Blob([response.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${doc.name.replace(/\s+/g, '_')}.pdf`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        toast.success('PDF document downloaded.');
      } catch (error) {
        toast.error('Failed to generate document download.');
      } finally {
        setDownloadingId(null);
      }
    }
  };

  // Filter list by search query and document type
  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch =
      doc.name.toLowerCase().includes(search.toLowerCase()) ||
      (doc.doctorName && doc.doctorName.toLowerCase().includes(search.toLowerCase())) ||
      (doc.hospitalName && doc.hospitalName.toLowerCase().includes(search.toLowerCase()));

    const matchesType = typeFilter === 'all' || doc.type === typeFilter;

    return matchesSearch && matchesType;
  });

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop Sidebar */}
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
                  if (!active && item.href) router.push(item.href);
                }}
                type="button"
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-slate-200 px-5 py-6">
          <button
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-950"
            disabled={signingOut}
            onClick={handleSignOut}
            type="button"
          >
            <LogOut className="h-5 w-5" />
            <span className="font-medium">{signingOut ? 'Signing out...' : 'Sign out'}</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col pb-24 xl:pb-0">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/80 px-4 backdrop-blur-md sm:h-20 sm:px-8 xl:justify-end">
          <div className="flex items-center gap-3 xl:hidden">
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
              onClick={() => router.back()}
              type="button"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-bold text-slate-950">My Documents</h1>
          </div>
          {dashboard && (
            <PatientHeaderMenu
              name={dashboard.profile.name}
              firstName={dashboard.profile.firstName}
              id={dashboard.profile.id}
              avatar={dashboard.profile.avatar}
              initials={dashboard.profile.initials}
            />
          )}
        </header>

        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <div className="mx-auto max-w-4xl space-y-6">
            <div className="hidden xl:block">
              <h2 className="text-3xl font-extrabold text-slate-950">Documents Hub</h2>
              <p className="mt-1.5 text-sm text-slate-500">
                Search, view, and print all prescriptions, admissions records, discharge summaries, and lab findings.
              </p>
            </div>

            {/* Filters Bar */}
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="relative w-full sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
                <input
                  type="text"
                  value={search}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                  placeholder="Search file name, doctor, hospital..."
                  className="pl-9 h-10 w-full rounded-2xl bg-white border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div className="flex flex-wrap gap-1.5 w-full sm:w-auto">
                {['all', 'Prescription', 'Admission Slip', 'Discharge Summary', 'Lab Report'].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setTypeFilter(type)}
                    className={`rounded-full px-4 py-2 text-xs font-bold transition-all border ${
                      typeFilter === type
                        ? 'bg-slate-950 text-white border-slate-950 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {type === 'all' ? 'All Files' : type}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
                <p className="mt-3 text-sm font-semibold">Loading documents hub...</p>
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-white py-16 px-6 text-center shadow-sm">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-50 text-slate-400">
                  <FolderOpen className="h-8 w-8" />
                </div>
                <h3 className="mt-5 text-lg font-bold text-slate-950">No Documents Found</h3>
                <p className="mt-2 text-sm text-slate-500 max-w-sm mx-auto">
                  We couldn't find any medical records matching your criteria. Make sure files have been generated by your doctor.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredDocuments.map((doc) => {
                  const DocIcon = getDocIcon(doc.type);
                  const isDownloading = downloadingId === doc.id;

                  return (
                    <article
                      key={`${doc.type}-${doc.id}`}
                      className="rounded-[1.75rem] border border-slate-100 bg-white p-5 shadow-[0_15px_35px_-20px_rgba(15,23,42,0.12)] flex items-start justify-between gap-4"
                    >
                      <div className="flex items-start gap-4 min-w-0">
                        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${getTypeStyle(doc.type)}`}>
                          <DocIcon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <span className={`inline-flex items-center rounded-full border text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 mb-1.5 ${getTypeStyle(doc.type)}`}>
                            {doc.type}
                          </span>
                          <h3 className="text-sm font-bold text-slate-950 truncate leading-snug" title={doc.name}>
                            {doc.name}
                          </h3>
                          {doc.hospitalName && (
                            <p className="text-[11px] text-slate-500 font-semibold mt-1 flex items-center gap-1">
                              <Building2 className="h-3 w-3 shrink-0" />
                              <span className="truncate">{doc.hospitalName}</span>
                            </p>
                          )}
                          <div className="text-[10px] text-slate-400 mt-2 flex items-center gap-1.5">
                            <span>{new Date(doc.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                            <span>&middot;</span>
                            <span className="font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{doc.fileSize}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition-all hover:bg-slate-200 disabled:opacity-60"
                        onClick={() => void handleDownload(doc)}
                        disabled={isDownloading}
                        type="button"
                        title="Download PDF file"
                      >
                        {isDownloading ? (
                          <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>

    </div>
  );
}
