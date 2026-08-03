'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isSessionValid, clearSession, getAccessToken, getActiveAccountId } from '@/lib/session';
import api from '@/lib/api';
import { patientSocket } from '@/lib/socket';
import { syncAllPatientData } from '@/lib/db/sync-engine';

/**
 * Hook that guards authenticated pages.
 * - Checks session validity on mount and when the tab regains focus.
 * - Sends a heartbeat to the backend on focus to keep the session alive.
 * - Redirects to login if the session has expired.
 */
export function useSessionGuard(): void {
  const router = useRouter();

  useEffect(() => {
    // ── Initial check ──
    if (!isSessionValid()) {
      const isDeliberate = typeof window !== 'undefined' && sessionStorage.getItem('patient_deliberate_logout') === '1';
      clearSession();
      if (isDeliberate) {
        sessionStorage.removeItem('patient_deliberate_logout');
        router.replace('/login');
      } else {
        router.replace('/login?expired=1');
      }
      return;
    }

    const token = getAccessToken();
    const activeAccountId = getActiveAccountId();
    if (token && activeAccountId) {
      patientSocket.connect(token, activeAccountId);
      void syncAllPatientData(activeAccountId);
    }

    // ── Visibility / focus handler ──
    const handleFocus = () => {
      if (!isSessionValid()) {
        const isDeliberate = typeof window !== 'undefined' && sessionStorage.getItem('patient_deliberate_logout') === '1';
        clearSession();
        if (isDeliberate) {
          sessionStorage.removeItem('patient_deliberate_logout');
          router.replace('/login');
        } else {
          router.replace('/login?expired=1');
        }
        return;
      }
      
      const currentToken = getAccessToken();
      const currentAccountId = getActiveAccountId();
      if (currentToken && currentAccountId) {
        patientSocket.connect(currentToken, currentAccountId);
        void syncAllPatientData(currentAccountId);
      }

      // Fire-and-forget heartbeat
      api.post('/patient/auth/heartbeat').catch(() => {});
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') handleFocus();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [router]);
}
