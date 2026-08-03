'use client';

import {
  Activity,
  ArrowLeft,
  Building2,
  CalendarDays,
  Download,
  FileText,
  HeartPulse,
  LayoutGrid,
  Loader2,
  LogOut,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  Stethoscope,
  Info,
  Receipt,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import api, { logoutPatient } from '@/lib/api';
import PatientHeaderMenu from '@/components/dashboard/patient-header-menu';
import { useSessionGuard } from '@/hooks/use-session-guard';
import { getPatientDesktopNavItems } from '@/lib/patient-nav';
import { fetchPatientDashboard, type PatientDashboardData } from '@/lib/patient-dashboard';

type ReceiptItem = {
  _id: string;
  receiptNumber: string;
  paidAmount: number;
  createdAt: string;
};

type AdmissionRecord = {
  _id: string;
  admissionId: string;
  status: 'Admitted' | 'Under Treatment' | 'Critical' | 'Stable' | 'Discharged';
  doctorName: string;
  department: string;
  roomNumber?: string;
  bedNumber?: string;
  admissionDate: string;
  dischargeDate?: string;
  hospitalName: string;
  hospitalAddress: string;
  hospitalPhone: string;
  notes?: string;
  admissionReason: string;
  receipts?: ReceiptItem[];
};

type DischargeRecord = {
  _id: string;
  admissionId: string;
  dischargeId: string;
  patientName: string;
  doctorName: string;
  hospitalName: string;
  dischargeDate: string;
  admissionDate: string;
  diagnosis: string;
  historyAndClinicalSummary?: string | null;
  treatmentGiven?: string | null;
  investigations?: string | null;
  surgeryProcedureName?: string | null;
  surgeryDate?: string | null;
  surgeonName?: string | null;
  anesthesiologistName?: string | null;
  surgicalNotes?: string | null;
  conditionOnDischarge?: string | null;
  hospitalCourseSummary?: string | null;
  medications: Array<{
    medicineName: string;
    dose?: string;
    frequency?: string;
    duration?: string;
  }>;
  followUpDate?: string | null;
  followUpInstructions?: string | null;
  pdfUrl?: string;
};

const desktopNavItems = getPatientDesktopNavItems('admissions');

const formatShortDate = (value: string | null | undefined) => {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function PatientAdmissionsScreen() {
  useSessionGuard();
  const router = useRouter();
  const [dashboard, setDashboard] = useState<PatientDashboardData | null>(null);
  const [admissions, setAdmissions] = useState<AdmissionRecord[]>([]);
  const [discharges, setDischarges] = useState<DischargeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadingReceiptId, setDownloadingReceiptId] = useState<string | null>(null);

  const handleViewReceipt = async (receiptId: string) => {
    try {
      setDownloadingReceiptId(receiptId);
      const response = await api.get(`/patient/receipts/${receiptId}/download`);
      const url = response.data?.data?.url;
      if (url) {
        window.open(url, '_blank');
      } else {
        toast.error('PDF URL not available');
      }
    } catch {
      toast.error('Failed to retrieve receipt PDF URL');
    } finally {
      setDownloadingReceiptId(null);
    }
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [admissionsRes, dischargesRes, dashboardData] = await Promise.all([
        api.get('/patient/admissions'),
        api.get('/patient/discharges'),
        fetchPatientDashboard().catch(() => null),
      ]);

      if (admissionsRes.data?.success) {
        setAdmissions(admissionsRes.data.data || []);
      }
      if (dischargesRes.data?.success) {
        setDischarges(dischargesRes.data.data || []);
      }
      if (dashboardData) {
        setDashboard(dashboardData);
      }
    } catch (err) {
      toast.error('Failed to load your admissions records.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();

    // Listen to custom updates from WebSocket events
    const handleUpdate = () => {
      void loadData();
    };
    window.addEventListener('patient-admissions-updated', handleUpdate);
    return () => {
      window.removeEventListener('patient-admissions-updated', handleUpdate);
    };
  }, [loadData]);

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

  const handleDownloadSlip = async (id: string, name: string) => {
    try {
      setDownloadingId(id);
      const response = await api.get(`/patient/admissions/${id}/slip`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `admission-slip-${name.replace(/\s+/g, '_')}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Admission slip downloaded.');
    } catch (error) {
      toast.error('Failed to download admission slip.');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleOpenDischarge = (admissionId: string) => {
    const summary = discharges.find((d) => d.admissionId === admissionId);
    if (!summary?.pdfUrl) {
      toast.error('Discharge summary is not ready yet.');
      return;
    }
    window.open(summary.pdfUrl, '_blank');
  };

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
            <h1 className="text-lg font-bold text-slate-950">Hospital Admissions</h1>
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
              <h2 className="text-3xl font-extrabold text-slate-950">Admissions History</h2>
              <p className="mt-1.5 text-sm text-slate-500">
                Track your active hospital stays, room allocations, and doctor discharge summaries.
              </p>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
                <p className="mt-3 text-sm font-semibold">Loading admissions records...</p>
              </div>
            ) : admissions.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-white py-16 px-6 text-center shadow-sm">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-teal-50 text-teal-600">
                  <Building2 className="h-8 w-8" />
                </div>
                <h3 className="mt-5 text-lg font-bold text-slate-950">No Hospital Admissions</h3>
                <p className="mt-2 text-sm text-slate-500 max-w-sm mx-auto">
                  You have not been admitted to any of our partner hospitals. Any current or past admission slips will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {admissions.map((admission) => {
                  const isDischarged = admission.status === 'Discharged';
                  const summary = discharges.find((d) => d.admissionId === admission._id);

                  return (
                    <article
                      key={admission._id}
                      className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-[0_20px_50px_-40px_rgba(15,23,42,0.15)]"
                    >
                      <div className="bg-slate-50/70 border-b border-slate-100 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-teal-800 text-white">
                            <Building2 className="h-6 w-6" />
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-lg font-bold text-slate-950">{admission.hospitalName}</h3>
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                                  isDischarged
                                    ? 'bg-slate-50 text-slate-500 border-slate-200'
                                    : admission.status === 'Critical'
                                    ? 'bg-rose-50 text-rose-600 border-rose-200 animate-pulse'
                                    : 'bg-emerald-50 text-emerald-600 border-emerald-200'
                                }`}
                              >
                                {admission.status}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                              Admission ID: <span className="font-mono">{admission.admissionId}</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
                            onClick={() => void handleDownloadSlip(admission._id, admission.hospitalName)}
                            disabled={downloadingId === admission._id}
                            type="button"
                          >
                            {downloadingId === admission._id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Download className="h-3.5 w-3.5" />
                            )}
                            Admission Slip
                          </button>
                          {isDischarged && summary && (
                            <button
                              className="flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-slate-800"
                              onClick={() => handleOpenDischarge(admission._id)}
                              type="button"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              Discharge Summary
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Stay Details</p>
                            <div className="mt-2 flex items-center gap-2 text-sm text-slate-950 font-semibold">
                              <Activity className="h-4 w-4 text-teal-600" />
                              {admission.roomNumber ? (
                                <span>
                                  Room {admission.roomNumber}{' '}
                                  {admission.bedNumber && <span className="text-slate-500 font-normal">(Bed {admission.bedNumber})</span>}
                                </span>
                              ) : (
                                <span className="text-slate-400 italic font-normal">Waiting for bed assignment</span>
                              )}
                            </div>
                          </div>

                          <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Admitting Doctor</p>
                            <div className="mt-2 flex items-center gap-2 text-sm text-slate-950 font-semibold">
                              <Stethoscope className="h-4 w-4 text-teal-600" />
                              <span>Dr. {admission.doctorName}</span>
                              <span className="text-slate-400 font-normal">&middot;</span>
                              <span className="text-slate-500 text-xs font-medium bg-slate-100 px-2 py-0.5 rounded">
                                {admission.department}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Admitted On</p>
                              <p className="mt-2 text-sm font-semibold text-slate-800">
                                {formatShortDate(admission.admissionDate)}
                              </p>
                            </div>
                            {isDischarged && (
                              <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Discharged On</p>
                                <p className="mt-2 text-sm font-semibold text-slate-800">
                                  {formatShortDate(admission.dischargeDate)}
                                </p>
                              </div>
                            )}
                          </div>

                          <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Reason for Admission</p>
                            <p className="mt-1.5 text-sm text-slate-700 leading-relaxed bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3">
                              {admission.admissionReason}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Stay Receipts Section */}
                      {admission.receipts && admission.receipts.length > 0 && (
                        <div className="border-t border-slate-100 p-5 bg-slate-50/20 space-y-3">
                          <div className="flex items-center gap-2">
                            <Receipt className="h-4 w-4 text-teal-700" />
                            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Stay Receipts & Billing</h4>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {admission.receipts.map((rcpt: any) => (
                              <div
                                key={rcpt._id}
                                className="flex items-center justify-between rounded-2xl border border-slate-150 bg-white p-3 shadow-sm"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-bold text-slate-900 truncate">{rcpt.receiptNumber}</p>
                                  <p className="text-[10px] text-slate-400">
                                    {new Date(rcpt.createdAt).toLocaleDateString()} · Paid: ₹{rcpt.paidAmount.toFixed(0)}
                                  </p>
                                </div>
                                <button
                                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60 transition"
                                  onClick={() => void handleViewReceipt(rcpt._id)}
                                  disabled={downloadingReceiptId === rcpt._id}
                                  type="button"
                                  title="View Receipt"
                                >
                                  {downloadingReceiptId === rcpt._id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Download className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {isDischarged && summary && (
                        <div className="border-t border-slate-100 p-5 bg-slate-50/30 space-y-4">
                          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                            <FileText className="h-4 w-4 text-teal-700" />
                            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Discharge Summary Details</h4>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                            <div className="space-y-3">
                              <div>
                                <span className="font-bold text-slate-500 uppercase tracking-wide block mb-0.5">Diagnosis</span>
                                <p className="text-slate-800 font-medium leading-relaxed">{summary.diagnosis}</p>
                              </div>
                              {summary.historyAndClinicalSummary && (
                                <div>
                                  <span className="font-bold text-slate-500 uppercase tracking-wide block mb-0.5">History & Clinical Summary</span>
                                  <p className="text-slate-700 leading-relaxed">{summary.historyAndClinicalSummary}</p>
                                </div>
                              )}
                              {summary.treatmentGiven && (
                                <div>
                                  <span className="font-bold text-slate-500 uppercase tracking-wide block mb-0.5">Treatment Given</span>
                                  <p className="text-slate-700 leading-relaxed">{summary.treatmentGiven}</p>
                                </div>
                              )}
                              {summary.investigations && (
                                <div>
                                  <span className="font-bold text-slate-500 uppercase tracking-wide block mb-0.5">Investigations</span>
                                  <p className="text-slate-700 leading-relaxed">{summary.investigations}</p>
                                </div>
                              )}
                            </div>

                            <div className="space-y-3">
                              {summary.surgeryProcedureName && (
                                <div className="bg-white border border-slate-100 rounded-2xl p-3 space-y-1.5">
                                  <span className="font-bold text-teal-700 uppercase tracking-wide block text-[10px] mb-0.5">Surgical Procedure</span>
                                  <p className="text-slate-800 font-bold text-xs">{summary.surgeryProcedureName}</p>
                                  {summary.surgeryDate && (
                                    <p className="text-slate-500">Date: <span className="font-medium text-slate-800">{formatShortDate(summary.surgeryDate)}</span></p>
                                  )}
                                  {summary.surgeonName && (
                                    <p className="text-slate-500">Surgeon: <span className="font-medium text-slate-800">Dr. {summary.surgeonName}</span></p>
                                  )}
                                  {summary.anesthesiologistName && (
                                    <p className="text-slate-500">Anesthesiologist: <span className="font-medium text-slate-800">Dr. {summary.anesthesiologistName}</span></p>
                                  )}
                                  {summary.surgicalNotes && (
                                    <p className="text-slate-600 mt-1 text-[11px] border-t border-slate-50 pt-1.5 leading-relaxed">{summary.surgicalNotes}</p>
                                  )}
                                </div>
                              )}
                              {summary.conditionOnDischarge && (
                                <div>
                                  <span className="font-bold text-slate-500 uppercase tracking-wide block mb-0.5">Condition On Discharge</span>
                                  <p className="text-slate-700 leading-relaxed">{summary.conditionOnDischarge}</p>
                                </div>
                              )}
                              {summary.hospitalCourseSummary && (
                                <div>
                                  <span className="font-bold text-slate-500 uppercase tracking-wide block mb-0.5">Course in Hospital</span>
                                  <p className="text-slate-700 leading-relaxed">{summary.hospitalCourseSummary}</p>
                                </div>
                              )}
                            </div>
                          </div>

                          {summary.medications && summary.medications.length > 0 && (
                            <div className="bg-teal-50/20 border border-teal-100/50 rounded-2xl p-4">
                              <span className="font-bold text-teal-800 uppercase tracking-wide block text-[10px] mb-2.5">RX (Advice On Discharge)</span>
                              <div className="divide-y divide-teal-100/20 space-y-2">
                                {summary.medications.map((med, index) => (
                                  <div key={index} className="flex flex-wrap items-center justify-between gap-2 pt-2 first:pt-0">
                                    <span className="text-xs font-bold text-slate-900">{med.medicineName}</span>
                                    <div className="flex gap-2 text-[10px] font-bold text-teal-700">
                                      {med.dose && <span className="bg-teal-50 px-2 py-0.5 rounded">Dose: {med.dose}</span>}
                                      {med.frequency && <span className="bg-teal-50 px-2 py-0.5 rounded">Freq: {med.frequency}</span>}
                                      {med.duration && <span className="bg-teal-50 px-2 py-0.5 rounded">Dur: {med.duration}</span>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {(summary.followUpDate || summary.followUpInstructions) && (
                            <div className="border-t border-slate-200/80 pt-3 flex flex-wrap items-start justify-between gap-4 text-xs">
                              {summary.followUpDate && (
                                <div>
                                  <span className="font-bold text-slate-500 uppercase tracking-wide block">Follow-up Date</span>
                                  <span className="text-slate-800 font-semibold">{formatShortDate(summary.followUpDate)}</span>
                                </div>
                              )}
                              {summary.followUpInstructions && (
                                <div className="flex-1 md:text-right">
                                  <span className="font-bold text-slate-500 uppercase tracking-wide block">Follow-up Instructions</span>
                                  <p className="text-slate-750 leading-relaxed mt-0.5">{summary.followUpInstructions}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {admission.notes && (
                        <div className="border-t border-slate-100 px-5 py-4 bg-teal-50/20 flex gap-2.5">
                          <Info className="h-4 w-4 text-teal-700 shrink-0 mt-0.5" />
                          <div className="text-xs text-teal-800 leading-relaxed">
                            <span className="font-bold">Medical Notes:</span> {admission.notes}
                          </div>
                        </div>
                      )}
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
