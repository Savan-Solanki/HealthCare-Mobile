'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CircleDollarSign,
  Download,
  ExternalLink,
  Loader2,
  Receipt,
  Share2,
  Activity,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useSessionGuard } from '@/hooks/use-session-guard';
import PatientHeaderMenu from '@/components/dashboard/patient-header-menu';
import { fetchPatientDashboard, type PatientDashboardData } from '@/lib/patient-dashboard';
import { PATIENT_PROFILE } from '@/lib/routes';

type PatientReceipt = {
  _id: string;
  receiptNumber: string;
  subtotal: number;
  discount: number;
  tax: number;
  amount: number;
  paidAmount: number;
  dueAmount: number;
  createdAt: string;
  doctorId: {
    firstName: string;
    lastName: string;
    specialization?: string;
    department?: string;
  };
  hospitalId: {
    name: string;
    address?: string;
    phone?: string;
  };
};

export default function PatientReceiptsScreen() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dashboard, setDashboard] = useState<PatientDashboardData | null>(null);
  const [receipts, setReceipts] = useState<PatientReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useSessionGuard();

  // Load patient dashboard to display header profile
  const loadDashboard = useCallback(async () => {
    try {
      const nextDashboard = await fetchPatientDashboard();
      startTransition(() => {
        setDashboard(nextDashboard);
      });
    } catch {
      // Ignore dashboard error, fail silently
    }
  }, [startTransition]);

  // Load patient receipts from backend
  const loadReceipts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/patient/receipts');
      setReceipts(response.data?.data || []);
      setError(null);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Unable to load your receipts right now.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
    void loadReceipts();
  }, [loadDashboard, loadReceipts]);

  // Handle PDF View
  const handleViewReceipt = async (receiptId: string) => {
    try {
      setActionLoading(receiptId);
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
      setActionLoading(null);
    }
  };

  // Handle Share S3 Link
  const handleShareReceipt = async (receipt: PatientReceipt) => {
    try {
      setActionLoading(receipt._id);
      const response = await api.get(`/patient/receipts/${receipt._id}/download`);
      const url = response.data?.data?.url;
      if (!url) {
        toast.error('PDF URL not available');
        return;
      }

      if (navigator.share) {
        await navigator.share({
          title: `Receipt ${receipt.receiptNumber}`,
          text: `Bill Receipt for consultation at ${receipt.hospitalId.name}`,
          url: url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success('Secure PDF Link copied to clipboard.');
      }
    } catch (err) {
      // Handle cancellation or clipboard failures
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#eef6fa] text-slate-950">
      <div className="mx-auto min-h-screen max-w-3xl">
        <header className="border-b border-slate-200 bg-white">
          <div className="flex items-center gap-3 px-4 py-4 sm:px-6">
            <button
              type="button"
              onClick={() => router.push(PATIENT_PROFILE)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-600 transition hover:bg-slate-50"
              aria-label="Back to profile"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold text-slate-950">My Receipts</h1>
              <p className="text-xs text-slate-500">View and download your consultation bills</p>
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
              <div className="h-28 animate-pulse rounded-3xl bg-white" />
              <div className="h-28 animate-pulse rounded-3xl bg-white" />
              <div className="h-28 animate-pulse rounded-3xl bg-white" />
            </div>
          ) : error ? (
            <section className="rounded-[2rem] border border-red-100 bg-white px-6 py-8 text-center">
              <Activity className="mx-auto h-8 w-8 text-red-500" />
              <p className="mt-4 text-sm text-slate-600">{error}</p>
              <button
                type="button"
                onClick={() => {
                  void loadDashboard();
                  void loadReceipts();
                }}
                className="mt-4 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white"
              >
                Try again
              </button>
            </section>
          ) : receipts.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-slate-400 p-8 text-center bg-white rounded-[2rem] border border-slate-200 min-h-[16rem]">
              <CircleDollarSign size={48} className="text-slate-200 mb-3" />
              <p className="text-lg font-medium text-slate-900">No receipts found</p>
              <p className="text-sm text-slate-400 mt-1 max-w-xs">
                Your consultation receipts generated by the hospital will be listed here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {receipts.map((r) => {
                const docName = [r.doctorId?.firstName, r.doctorId?.lastName].filter(Boolean).join(' ');
                const dateStr = new Date(r.createdAt).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric'
                });

                return (
                  <div
                    key={r._id}
                    className="overflow-hidden rounded-[2rem] border border-slate-250 bg-white p-5 shadow-sm space-y-4"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <Receipt size={16} className="text-teal-600" />
                          <span className="font-bold text-slate-900">{r.receiptNumber}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">Date: {dateStr}</p>
                      </div>

                      {r.dueAmount > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-600">
                          <AlertCircle size={12} />
                          Due: ₹{r.dueAmount.toFixed(0)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">
                          <CheckCircle2 size={12} />
                          Paid
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400">Hospital</span>
                        <p className="font-semibold text-sm text-slate-800 truncate">{r.hospitalId.name}</p>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400">Doctor</span>
                        <p className="font-semibold text-sm text-slate-800 truncate">Dr. {docName}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400">Amount Paid</span>
                        <p className="text-base font-bold text-slate-900">₹{r.paidAmount.toFixed(2)}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleShareReceipt(r)}
                          disabled={actionLoading !== null}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
                          title="Share Link"
                        >
                          {actionLoading === r._id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Share2 size={16} />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleViewReceipt(r._id)}
                          disabled={actionLoading !== null}
                          className="inline-flex h-9 px-3 items-center justify-center gap-1.5 rounded-xl bg-teal-800 text-white font-semibold text-xs transition hover:bg-teal-900"
                        >
                          {actionLoading === r._id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ExternalLink size={14} />
                          )}
                          View PDF
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
