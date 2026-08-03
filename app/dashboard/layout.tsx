'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import CreditUpdateAnimation, { CreditUpdatePayload } from '@/components/dashboard/credit-update-animation';
import { useSessionGuard } from '@/hooks/use-session-guard';
import { getPatientMobileNavItems } from '@/lib/patient-nav';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  useSessionGuard();
  const pathname = usePathname();
  const router = useRouter();
  const [pendingCreditUpdate, setPendingCreditUpdate] = useState<CreditUpdatePayload | null>(null);

  const mobileNavItems = getPatientMobileNavItems().map((item) => {
    const active = item.href === '/dashboard'
      ? pathname === '/dashboard'
      : pathname?.startsWith(item.href || '');
    return { ...item, active };
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleProfileUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      console.log('[DashboardLayout] Received profile:updated event:', detail);

      if (detail && detail.creditUpdated) {
        setPendingCreditUpdate(detail.creditUpdated);
      }
    };

    window.addEventListener('patient-profile-updated', handleProfileUpdate);
    return () => {
      window.removeEventListener('patient-profile-updated', handleProfileUpdate);
    };
  }, []);

  // Expose a helper for manual animation testing in developer tools
  useEffect(() => {
    if (typeof window === 'undefined') return;

    (window as any).__testCreditUpdateAnimation = (
      type: 'increase' | 'decrease',
      amount: number,
      creditType: string,
      reason: string
    ) => {
      console.log('[Test] Triggering manual credit update animation:', { type, amount, creditType, reason });
      setPendingCreditUpdate({
        type,
        amount,
        creditType,
        reason
      });
    };

    return () => {
      delete (window as any).__testCreditUpdateAnimation;
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] xl:pb-0">
      <div className="flex-1 flex flex-col">
        {children}
      </div>

      <nav className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 px-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur xl:hidden z-30">
        <div className="mx-auto grid max-w-3xl grid-cols-6 gap-1">
          {mobileNavItems.map((item) => {
            const Icon = item.icon;
            const active = Boolean(item.active);

            return (
              <button
                className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-xs font-semibold transition-colors ${
                  active ? 'text-teal-700' : 'text-slate-500 hover:text-slate-700'
                }`}
                key={item.id}
                onClick={() => {
                  if (!active && item.href) router.push(item.href);
                }}
                type="button"
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                    active ? 'bg-teal-50 text-teal-700' : 'bg-transparent'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <CreditUpdateAnimation
        pendingUpdate={pendingCreditUpdate}
        onClose={() => setPendingCreditUpdate(null)}
      />
    </div>
  );
}
