'use client';

import {
  ArrowLeft,
  ArrowRight,
  Check,
  CreditCard,
  HeartPulse,
  Loader2,
  Lock,
  Pill,
  FileText,
  RefreshCw,
  ShoppingBag,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import api from '@/lib/api';
import PatientHeaderMenu from '@/components/dashboard/patient-header-menu';
import { useSessionGuard } from '@/hooks/use-session-guard';
import { PATIENT_DASHBOARD, PATIENT_LOGIN_PATH, PATIENT_PAYMENT_HISTORY } from '@/lib/routes';
import { fetchPatientDashboard, type PatientDashboardData } from '@/lib/patient-dashboard';
import { getPatientDB } from '@/lib/db';
import { getActiveAccountId, screenNeedsFreshLoad, markScreenLoaded, clearForceFreshLoad } from '@/lib/session';

type PlanItem = {
  name: string;
  credits: number;
  price: number;
  popular?: boolean;
};

const PRESCRIPTION_PLANS: PlanItem[] = [
  { name: '10 Prescriptions', credits: 10, price: 29 },
  { name: '50 Prescriptions', credits: 50, price: 129 },
  { name: '100 Prescriptions', credits: 100, price: 199, popular: true },
  { name: '250 Prescriptions', credits: 250, price: 449 },
  { name: '500 Prescriptions', credits: 500, price: 599 },
];

const REPORT_PLANS: PlanItem[] = [
  { name: '10 Reports', credits: 10, price: 49 },
  { name: '50 Reports', credits: 50, price: 229 },
  { name: '100 Reports', credits: 100, price: 400, popular: true },
  { name: '250 Reports', credits: 250, price: 699 },
  { name: '500 Reports', credits: 500, price: 999 },
];

type PurchaseHistoryItem = {
  id: string;
  planType: string;
  planName: string;
  amount: number;
  status: string;
  purchasedAt: string;
};

// Dynamically load Razorpay SDK helper
const loadRazorpaySDK = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }
    // Already loaded
    if ((window as any).Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export default function PatientPlansScreen() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<PatientDashboardData | null>(null);
  const [history, setHistory] = useState<PurchaseHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [purchasingPlanName, setPurchasingPlanName] = useState<string | null>(null);

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
          console.error('[Plans] Error caching snapshot:', dbErr);
        }
      }
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, []);

  const loadPurchaseHistory = useCallback(async (options?: { silent?: boolean }) => {
    try {
      const response = await api.get<{ data: PurchaseHistoryItem[] }>('/patient/payments/history');
      // Show only recent 3 purchases in summary
      setHistory(response.data.data.slice(0, 3));
    } catch (err) {
      console.error('Failed to load purchase history:', err);
    }
  }, []);

  const initData = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadDashboard({ silent: true }), loadPurchaseHistory({ silent: true })]);
    setLoading(false);
  }, [loadDashboard, loadPurchaseHistory]);


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
    if (screenNeedsFreshLoad('plans')) {
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
        markScreenLoaded('plans');
      })();
      return;
    }

    // Always load fresh from API first (credits must be current).
    // Seed the display from cache only if we have no data yet after API fails.
    const fetchFresh = async () => {
      try {
        await loadDashboard();
      } catch {
        // If API fails, try IndexedDB snapshot as fallback
        if (activeAccountId) {
          try {
            const db = getPatientDB(activeAccountId);
            const cached = await db.syncMeta.get('dashboard_snapshot');
            if (cached) {
              setDashboard(JSON.parse(cached.value));
              setLoading(false);
            }
          } catch {
            // ignore
          }
        }
      }
    };
    void fetchFresh();
    void loadPurchaseHistory({ silent: true });
  }, [loadDashboard, loadPurchaseHistory, router]);


  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleProfileUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      console.log('[Plans] Received profile:updated event, refreshing...', detail);

      // Immediately apply credit changes from the socket payload for instant UI feedback
      if (detail && (detail.prescriptionCredits !== undefined || detail.reportCredits !== undefined)) {
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
        toast.success('Credits updated in real-time.');
      }

      // Then confirm with a background API refresh
      void loadDashboard({ silent: true });
    };

    window.addEventListener('patient-profile-updated', handleProfileUpdate);
    return () => {
      window.removeEventListener('patient-profile-updated', handleProfileUpdate);
    };
  }, [loadDashboard]);


  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadDashboard({ silent: true }), loadPurchaseHistory({ silent: true })]);
    setRefreshing(false);
    toast.success('Credits updated.');
  };

  const handlePurchasePlan = async (plan: PlanItem, planType: 'prescription' | 'report') => {
    try {
      setPurchasingPlanName(plan.name);

      // 1. Load Razorpay script
      const sdkLoaded = await loadRazorpaySDK();
      if (!sdkLoaded) {
        toast.error('Unable to load Payment Gateway. Check your internet connection.');
        return;
      }

      // 2. Create Order in Backend
      const orderResponse = await api.post<{
        data: {
          keyId: string;
          orderId: string;
          amount: number;
          currency: string;
          planName: string;
          planType: string;
          transactionId: string;
        };
      }>('/patient/payments/create-order', {
        planType,
        planName: plan.name,
      });

      const orderData = orderResponse.data?.data;
      if (!orderData || !orderData.keyId) {
        throw new Error(
          typeof orderResponse.data === 'string' && (orderResponse.data as string).includes('<!DOCTYPE html>')
            ? 'Received HTML response instead of JSON. Ensure your NEXT_PUBLIC_API_URL is set to the local backend (http://localhost:5000) and the server is running.'
            : 'Invalid order response from server.'
        );
      }

      // 3. Configure Razorpay Options
      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'healthcare',
        description: `Purchase: ${orderData.planName}`,
        order_id: orderData.orderId,
        prefill: {
          name: dashboard?.profile?.name || '',
          email: dashboard?.profile?.email || '',
          contact: dashboard?.profile?.phone || '',
        },
        theme: {
          color: '#0d9488', // Teal 600
        },
        handler: async (response: any) => {
          try {
            setLoading(true);
            // 4. Verify Payment in Backend
            await api.post('/patient/payments/verify-payment', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });

            toast.success(`Plan ${plan.name} activated! Credits added.`);
            await initData();
          } catch (verifyErr: any) {
            const msg = verifyErr.response?.data?.message || 'Verification failed.';
            toast.error(msg);
          } finally {
            setLoading(false);
          }
        },
        modal: {
          ondismiss: () => {
            toast.info('Payment cancelled.');
          },
        },
      };

      // 4. Open Razorpay Gateway
      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Payment initiation failed.';
      toast.error(msg);
    } finally {
      setPurchasingPlanName(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-8 xl:py-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(PATIENT_DASHBOARD)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 hover:bg-slate-50"
          >
            <ArrowLeft className="h-5 w-5 text-slate-600" />
          </button>
          <h1 className="text-xl font-bold text-slate-950 sm:text-2xl">Plans & Subscriptions</h1>
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

      <main className="p-5 sm:p-8 space-y-8 max-w-5xl w-full mx-auto pb-12">
        {/* Credits Balance Cards */}
        <section className="grid md:grid-cols-2 gap-5">
          {/* Prescriptions Balance */}
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-700">
                <Pill className="h-3 w-3" /> Prescriptions
              </span>
              <p className="text-3xl font-extrabold text-slate-950 mt-3">
                {loading ? '...' : `${dashboard?.profile?.prescriptionCredits ?? 0} Credits`}
              </p>
              <p className="text-slate-500 text-xs font-medium">Available upload balance</p>
            </div>
            <div className="h-14 w-14 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <Pill className="h-7 w-7" />
            </div>
          </div>

          {/* Reports Balance */}
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 px-2.5 py-0.5 text-xs font-semibold text-cyan-700">
                <FileText className="h-3 w-3" /> Medical Reports
              </span>
              <p className="text-3xl font-extrabold text-slate-950 mt-3">
                {loading ? '...' : `${dashboard?.profile?.reportCredits ?? 0} Credits`}
              </p>
              <p className="text-slate-500 text-xs font-medium">Available upload balance</p>
            </div>
            <div className="h-14 w-14 rounded-2xl bg-cyan-50 text-cyan-700 flex items-center justify-center">
              <FileText className="h-7 w-7" />
            </div>
          </div>
        </section>

        {/* Prescription Plans */}
        <section className="space-y-4">
          <div className="border-l-4 border-teal-600 pl-3">
            <h2 className="text-lg font-bold text-slate-900">Prescription Upload Plans</h2>
            <p className="text-slate-500 text-sm">Select a credit pack to upload photos and documents of prescriptions.</p>
          </div>

          <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {PRESCRIPTION_PLANS.map((plan) => {
              const activeBuy = purchasingPlanName === plan.name;
              return (
                <div
                  key={plan.name}
                  className={`relative flex flex-col justify-between rounded-3xl border bg-white p-5 shadow-sm transition hover:shadow-md hover:scale-[1.02] ${
                    plan.popular ? 'border-teal-500 ring-1 ring-teal-500/20' : 'border-slate-200'
                  }`}
                >
                  {plan.popular && (
                    <span className="absolute -top-3 right-4 rounded-full bg-teal-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                      Popular
                    </span>
                  )}
                  <div>
                    <h3 className="text-sm font-bold text-slate-700">{plan.name}</h3>
                    <p className="text-3xl font-extrabold text-slate-950 mt-4">₹{plan.price}</p>
                    <p className="text-slate-500 text-[11px] font-medium mt-1">₹{(plan.price / plan.credits).toFixed(2)} / credit</p>
                    <ul className="mt-4 space-y-2 text-xs text-slate-600">
                      <li className="flex items-center gap-1.5">
                        <Check className="h-3.5 w-3.5 text-teal-600" /> {plan.credits} Rx Uploads
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Check className="h-3.5 w-3.5 text-teal-600" /> Lifetime Validity
                      </li>
                    </ul>
                  </div>

                  <button
                    onClick={() => handlePurchasePlan(plan, 'prescription')}
                    disabled={purchasingPlanName !== null}
                    className={`mt-6 w-full rounded-xl py-2.5 text-xs font-bold transition active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 ${
                      plan.popular
                        ? 'bg-teal-600 text-white hover:bg-teal-700'
                        : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                    }`}
                  >
                    {activeBuy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <ShoppingBag className="h-3.5 w-3.5" /> Buy Plan
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* Report Plans */}
        <section className="space-y-4">
          <div className="border-l-4 border-cyan-600 pl-3">
            <h2 className="text-lg font-bold text-slate-900">Lab Report Upload Plans</h2>
            <p className="text-slate-500 text-sm">Select a credit pack to upload medical lab reports (PDF, JPG, PNG, DOC/DOCX).</p>
          </div>

          <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {REPORT_PLANS.map((plan) => {
              const activeBuy = purchasingPlanName === plan.name;
              return (
                <div
                  key={plan.name}
                  className={`relative flex flex-col justify-between rounded-3xl border bg-white p-5 shadow-sm transition hover:shadow-md hover:scale-[1.02] ${
                    plan.popular ? 'border-cyan-500 ring-1 ring-cyan-500/20' : 'border-slate-200'
                  }`}
                >
                  {plan.popular && (
                    <span className="absolute -top-3 right-4 rounded-full bg-cyan-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                      Popular
                    </span>
                  )}
                  <div>
                    <h3 className="text-sm font-bold text-slate-700">{plan.name}</h3>
                    <p className="text-3xl font-extrabold text-slate-950 mt-4">₹{plan.price}</p>
                    <p className="text-slate-500 text-[11px] font-medium mt-1">₹{(plan.price / plan.credits).toFixed(2)} / credit</p>
                    <ul className="mt-4 space-y-2 text-xs text-slate-600">
                      <li className="flex items-center gap-1.5">
                        <Check className="h-3.5 w-3.5 text-cyan-600" /> {plan.credits} Report Uploads
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Check className="h-3.5 w-3.5 text-cyan-600" /> Lifetime Validity
                      </li>
                    </ul>
                  </div>

                  <button
                    onClick={() => handlePurchasePlan(plan, 'report')}
                    disabled={purchasingPlanName !== null}
                    className={`mt-6 w-full rounded-xl py-2.5 text-xs font-bold transition active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 ${
                      plan.popular
                        ? 'bg-cyan-600 text-white hover:bg-cyan-700'
                        : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                    }`}
                  >
                    {activeBuy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <ShoppingBag className="h-3.5 w-3.5" /> Buy Plan
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* Secure gateway seal */}
        <section className="flex flex-col sm:flex-row items-center justify-center gap-3 py-4 text-xs text-slate-400 bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
          <div className="flex items-center gap-1.5 font-bold uppercase text-teal-600">
            <Lock className="h-4.5 w-4.5" /> Secure Checkout
          </div>
          <span className="hidden sm:inline">|</span>
          <p className="text-center font-medium">All payments processed securely using Razorpay 256-bit SSL encrypted gateway.</p>
        </section>

        {/* Purchase History Summary */}
        <section className="bg-white rounded-[2rem] border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">Recent Purchases</h3>
            <button
              onClick={() => router.push(PATIENT_PAYMENT_HISTORY)}
              className="text-xs font-bold text-teal-600 hover:underline flex items-center gap-1.5"
            >
              Full History <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-slate-500 text-xs font-medium py-2 text-center">No purchases recorded yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {history.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-xs font-bold text-slate-800">{t.planName}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{new Date(t.purchasedAt).toLocaleDateString()} at {new Date(t.purchasedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-extrabold text-slate-950">₹{t.amount}</p>
                    <span className={`inline-flex rounded px-1.5 py-0.5 text-[9px] font-bold capitalize ${
                      t.status === 'completed'
                        ? 'bg-teal-50 text-teal-700'
                        : t.status === 'failed'
                        ? 'bg-red-50 text-red-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}>
                      {t.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
