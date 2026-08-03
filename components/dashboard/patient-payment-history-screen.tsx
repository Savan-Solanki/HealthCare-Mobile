'use client';

import {
  ArrowLeft,
  Calendar,
  CreditCard,
  Download,
  HeartPulse,
  Loader2,
  Printer,
  Receipt,
  RefreshCw,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import api from '@/lib/api';
import PatientHeaderMenu from '@/components/dashboard/patient-header-menu';
import { useSessionGuard } from '@/hooks/use-session-guard';
import { PATIENT_DASHBOARD, PATIENT_LOGIN_PATH } from '@/lib/routes';
import { fetchPatientDashboard, type PatientDashboardData } from '@/lib/patient-dashboard';

type TransactionItem = {
  id: string;
  planType: string;
  planName: string;
  amount: number;
  paymentId: string;
  orderId: string;
  status: string;
  purchasedAt: string;
};

export default function PatientPaymentHistoryScreen() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<PatientDashboardData | null>(null);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<TransactionItem | null>(null);

  useSessionGuard();

  const loadDashboard = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    try {
      const nextDashboard = await fetchPatientDashboard();
      setDashboard(nextDashboard);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    try {
      const response = await api.get<{ data: TransactionItem[] }>('/patient/payments/history');
      setTransactions(response.data.data);
    } catch (err) {
      toast.error('Unable to retrieve payment logs.');
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, []);

  const initData = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadDashboard({ silent: true }), loadHistory({ silent: true })]);
    setLoading(false);
  }, [loadDashboard, loadHistory]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('patient_access_token');
    if (!token) {
      router.replace(PATIENT_LOGIN_PATH);
      return;
    }
    void initData();
  }, [initData, router]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadDashboard({ silent: true }), loadHistory({ silent: true })]);
    setRefreshing(false);
    toast.success('Logs updated.');
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-8 xl:py-5 print:hidden">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(PATIENT_DASHBOARD)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 hover:bg-slate-50"
          >
            <ArrowLeft className="h-5 w-5 text-slate-600" />
          </button>
          <h1 className="text-xl font-bold text-slate-950 sm:text-2xl">Payment History</h1>
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

      {/* Main Content */}
      <main className="p-5 sm:p-8 space-y-6 max-w-4xl w-full mx-auto print:p-0 print:bg-white print:shadow-none">
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm space-y-4 print:border-none print:shadow-none">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3 print:hidden">
            <Receipt className="h-5 w-5 text-teal-600" /> All Transactions
          </h2>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
              <p className="text-sm font-semibold">Loading transaction history...</p>
            </div>
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 text-center space-y-3 print:hidden">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-400 border border-slate-100">
                <Receipt className="h-7 w-7" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">No transactions recorded</p>
                <p className="text-xs text-slate-500 mt-0.5">Purchased subscription plans will appear here.</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-[10px] font-bold uppercase tracking-wider print:border-slate-300">
                    <th className="pb-3 pr-4 font-semibold">Plan Purchased</th>
                    <th className="pb-3 px-4 font-semibold">Transaction ID</th>
                    <th className="pb-3 px-4 font-semibold">Payment ID</th>
                    <th className="pb-3 px-4 font-semibold">Status</th>
                    <th className="pb-3 px-4 font-semibold">Date</th>
                    <th className="pb-3 px-4 font-semibold text-right">Amount</th>
                    <th className="pb-3 pl-4 font-semibold text-right print:hidden">Invoice</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700 font-medium">
                  {transactions.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/50 transition print:hover:bg-transparent">
                      <td className="py-3.5 pr-4 font-bold text-slate-900">{t.planName}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-500 text-[10px] truncate max-w-[100px]">{t.id}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-500 text-[10px] truncate max-w-[100px]">{t.paymentId}</td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex rounded px-2 py-0.5 text-[9px] font-bold capitalize ${
                          t.status === 'completed'
                            ? 'bg-teal-50 text-teal-700'
                            : t.status === 'failed'
                            ? 'bg-red-50 text-red-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-500">
                        {new Date(t.purchasedAt).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-4 text-right font-extrabold text-slate-900">₹{t.amount}</td>
                      <td className="py-3.5 pl-4 text-right print:hidden">
                        <button
                          onClick={() => setSelectedInvoice(t)}
                          className="inline-flex h-8 px-2.5 items-center justify-center gap-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-[10px] font-bold text-slate-600 transition cursor-pointer"
                        >
                          Receipt
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* ─── Invoice Modal ─────────────────────────────────────────────────── */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm print:relative print:z-0 print:p-0 print:bg-white print:backdrop-none">
          <div className="relative w-full max-w-lg overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl print:border-none print:shadow-none print:p-0">
            {/* Modal close / print controls */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6 print:hidden">
              <span className="text-sm font-bold text-slate-900">Tax Invoice / Receipt</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrint}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition cursor-pointer"
                  title="Print Invoice"
                >
                  <Printer className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setSelectedInvoice(null)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition cursor-pointer"
                  title="Close"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>
            </div>

            {/* Print Header Branding */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-6">
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-teal-700 to-sky-700 text-white">
                    <HeartPulse className="h-4.5 w-4.5" />
                  </div>
                  <span className="text-base font-extrabold tracking-tight text-slate-950">healthcare</span>
                </div>
                <p className="mt-1 text-[10px] text-slate-500 font-medium leading-normal">
                  healthcare Pvt Ltd<br />
                  info@medikwikhealthbuddy.in
                </p>
              </div>
              <div className="text-right">
                <span className="rounded bg-teal-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-teal-700 print:border print:border-teal-700/20">
                  Paid Receipt
                </span>
                <p className="mt-2 text-xs font-bold text-slate-900">Invoice: #{selectedInvoice.id.toUpperCase().slice(-8)}</p>
                <p className="text-[10px] text-slate-500 font-medium">Date: {new Date(selectedInvoice.purchasedAt).toLocaleDateString()}</p>
              </div>
            </div>

            {/* Client Info */}
            <div className="grid grid-cols-2 gap-4 py-6 text-xs leading-relaxed border-b border-slate-100">
              <div>
                <p className="font-bold text-slate-500 uppercase text-[9px] tracking-wider">Billed To</p>
                <p className="mt-1.5 font-bold text-slate-900">{dashboard?.profile?.name}</p>
                <p className="text-slate-500 text-[11px] mt-0.5">{dashboard?.profile?.email}</p>
                <p className="text-slate-500 text-[11px]">{dashboard?.profile?.phone}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-slate-500 uppercase text-[9px] tracking-wider">Payment Method</p>
                <p className="mt-1.5 font-bold text-slate-900">Razorpay Gateway</p>
                <p className="text-slate-500 text-[11px] mt-0.5">PayID: {selectedInvoice.paymentId}</p>
                <p className="text-slate-500 text-[11px]">OrderID: {selectedInvoice.orderId}</p>
              </div>
            </div>

            {/* Invoice Table */}
            <div className="py-6 border-b border-slate-100">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-slate-400 font-bold uppercase text-[9px] tracking-wider">
                    <th className="pb-3">Item Description</th>
                    <th className="pb-3 text-right">Qty</th>
                    <th className="pb-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                  <tr>
                    <td className="py-4">
                      <p className="font-bold text-slate-900">{selectedInvoice.planName}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 capitalize">{selectedInvoice.planType} upload credit pack</p>
                    </td>
                    <td className="py-4 text-right">1</td>
                    <td className="py-4 text-right font-bold text-slate-900">₹{selectedInvoice.amount.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Total Math */}
            <div className="py-6 space-y-2.5 text-xs font-semibold text-slate-600 text-right max-w-[200px] ml-auto">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span className="text-slate-900 font-bold">₹{(selectedInvoice.amount * 0.82).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>CGST (9%):</span>
                <span className="text-slate-900 font-bold">₹{(selectedInvoice.amount * 0.09).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>SGST (9%):</span>
                <span className="text-slate-900 font-bold">₹{(selectedInvoice.amount * 0.09).toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2.5 text-sm">
                <span className="text-slate-900 font-bold">Total Paid:</span>
                <span className="text-teal-700 font-extrabold">₹{selectedInvoice.amount.toFixed(2)}</span>
              </div>
            </div>

            {/* Invoice Footer note */}
            <p className="mt-4 text-center text-[10px] text-slate-400 font-medium">
              Thank you for trusting healthcare. This is a computer-generated tax receipt.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
