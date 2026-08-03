import { patientSocket } from './socket';
import { syncAllPatientData } from './db/sync-engine';

// Storage keys
const KEYS = {
  ACCESS_TOKEN: 'patient_access_token',
  USER: 'patient_user',
  LINKED_ACCOUNTS: 'patient_linked_accounts',
  ACTIVE_ACCOUNT_ID: 'patient_active_account_id',
  SESSION_START: 'patient_session_start',
  // Set to '1' before a hard-reload after account switch/add.
  // On the next page load every screen checks this flag:
  //   - clears the NEW account's IndexedDB so it starts 100% empty
  //   - skips the IndexedDB snapshot and goes straight to the API
  // The flag is consumed (deleted) on first use.
  FORCE_FRESH_LOAD: 'patient_force_fresh_load',
} as const;

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type LinkedAccount = {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  age: number | null;
  gender: string | null;
  accountIndex: number;
  accountLabel: string;
  isActive: boolean;
};

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar: string | null;
  accountIndex?: number;
  accountLabel?: string;
};

/** Initialize a new session after login/register */
export function initSession(accessToken: string, user: SessionUser): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEYS.ACCESS_TOKEN, accessToken);
  localStorage.setItem(KEYS.USER, JSON.stringify(user));
  localStorage.setItem(KEYS.ACTIVE_ACCOUNT_ID, user.id);
  localStorage.setItem(KEYS.SESSION_START, Date.now().toString());

  // Ensure this account is not in the removed accounts list
  try {
    const removedRaw = localStorage.getItem('patient_removed_accounts');
    if (removedRaw) {
      const removed: string[] = JSON.parse(removedRaw);
      if (removed.includes(user.id)) {
        localStorage.setItem(
          'patient_removed_accounts',
          JSON.stringify(removed.filter((id) => id !== user.id))
        );
      }
    }
  } catch {}

  // Connect socket and fire data sync
  patientSocket.connect(accessToken, user.id);
  void syncAllPatientData(user.id).catch((err) => {
    console.error('[Session] Initial sync failed:', err);
  });
}

/** Get the current access token */
export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(KEYS.ACCESS_TOKEN);
}

/** Get the current user */
export function getSessionUser(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEYS.USER);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Check if the session is still valid (within 7 days) */
export function isSessionValid(): boolean {
  if (typeof window === 'undefined') return false;
  const token = localStorage.getItem(KEYS.ACCESS_TOKEN);
  if (!token) return false;
  const start = localStorage.getItem(KEYS.SESSION_START);
  if (!start) return false;
  return Date.now() - Number(start) < SESSION_MAX_AGE_MS;
}

/** Clear all session data */
export function clearSession(): void {
  if (typeof window === 'undefined') return;
  patientSocket.disconnect();
  Object.values(KEYS).forEach((key) => localStorage.removeItem(key));
  // Clear per-screen account markers
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('patient_screen_acct_')) toRemove.push(key);
  }
  toRemove.forEach((key) => localStorage.removeItem(key));
}

/** Get linked accounts */
export function getLinkedAccounts(): LinkedAccount[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEYS.LINKED_ACCOUNTS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Set linked accounts */
export function setLinkedAccounts(accounts: LinkedAccount[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEYS.LINKED_ACCOUNTS, JSON.stringify(accounts));
}

/** Get active account ID */
export function getActiveAccountId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(KEYS.ACTIVE_ACCOUNT_ID);
}

/**
 * Update stored credentials after an account switch or new account creation.
 *
 * WHY we do NOT clear IndexedDB here:
 *   clearPatientDB() is async. Calling it fire-and-forget before
 *   window.location.href fires means the browser navigates away before the
 *   IndexedDB transaction commits — the clear silently does nothing.
 *
 * Instead we set FORCE_FRESH_LOAD. Every screen checks this on mount,
 * clears its OWN IndexedDB first (properly awaited), then fetches from API.
 * Old accounts keep their IndexedDB untouched so switching back restores data.
 */
export function updateSessionForSwitch(
  accessToken: string,
  user: SessionUser,
): void {
  if (typeof window === 'undefined') return;

  // ── 1. Write new account credentials ──────────────────────────────────────
  localStorage.setItem(KEYS.ACCESS_TOKEN, accessToken);
  localStorage.setItem(KEYS.USER, JSON.stringify(user));
  localStorage.setItem(KEYS.ACTIVE_ACCOUNT_ID, user.id);
  // Don't reset SESSION_START — keep original login time

  // Ensure this account is not in the removed accounts list
  try {
    const removedRaw = localStorage.getItem('patient_removed_accounts');
    if (removedRaw) {
      const removed: string[] = JSON.parse(removedRaw);
      if (removed.includes(user.id)) {
        localStorage.setItem(
          'patient_removed_accounts',
          JSON.stringify(removed.filter((id) => id !== user.id))
        );
      }
    }
  } catch {}

  // ── 3. Signal all screens to skip the IndexedDB snapshot on next load ───────
  // Secondary defense: each screen will clear its own IndexedDB and load from API.
  localStorage.setItem(KEYS.FORCE_FRESH_LOAD, '1');

  // ── 4. Tell the service worker to clear its page cache ───────────────────────
  // The SW may have cached /dashboard HTML from the old account. Clearing it
  // ensures the browser fetches a fresh page after the redirect.
  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_PAGE_CACHE' });
    }
  } catch {
    // best-effort — not fatal
  }

  // ── 5. Reconnect socket with the new account's token ────────────────────────
  patientSocket.connect(accessToken, user.id);
}

/**
 * Returns true if the next dashboard load must:
 *   1. Clear the current account's IndexedDB (properly awaited)
 *   2. Skip the snapshot and go straight to the API
 */
export function shouldForceFreshLoad(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(KEYS.FORCE_FRESH_LOAD) === '1';
}

/** Consume the force-fresh flag — call once after acting on it */
export function clearForceFreshLoad(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(KEYS.FORCE_FRESH_LOAD);
}

/** Remove a specific account from the linked accounts list */
export function removeAccountFromDevice(accountId: string): void {
  const accounts = getLinkedAccounts().filter((a) => a.id !== accountId);
  setLinkedAccounts(accounts);

  // Add to local list of removed accounts
  try {
    const removedRaw = localStorage.getItem('patient_removed_accounts');
    const removed: string[] = removedRaw ? JSON.parse(removedRaw) : [];
    if (!removed.includes(accountId)) {
      removed.push(accountId);
      localStorage.setItem('patient_removed_accounts', JSON.stringify(removed));
    }
  } catch {}
}

/** Filter out removed accounts from switch lists, unless active */
export function getFilteredAccounts(accountsList: LinkedAccount[]): LinkedAccount[] {
  if (typeof window === 'undefined') return accountsList;
  try {
    const removedRaw = localStorage.getItem('patient_removed_accounts');
    const removed: string[] = removedRaw ? JSON.parse(removedRaw) : [];
    return accountsList.filter((a) => !removed.includes(a.id) || a.isActive);
  } catch {
    return accountsList;
  }
}

// ─── Per-screen account tracking (data isolation) ─────────────────────────────
// Each screen stores which accountId it last loaded data for.
// On mount, a screen compares its last-loaded account with the active account.
// If they differ (account was switched), the screen clears its IDB and re-fetches.

const SCREEN_ACCOUNT_PREFIX = 'patient_screen_acct_';

/**
 * Returns true if the given screen needs a fresh load:
 * - the global force-fresh flag is set, OR
 * - the screen's last-loaded account differs from the active account
 */
export function screenNeedsFreshLoad(screenKey: string): boolean {
  if (typeof window === 'undefined') return false;

  // The global flag always forces a fresh load
  if (shouldForceFreshLoad()) return true;

  const activeId = getActiveAccountId();
  if (!activeId) return false;

  const lastLoaded = localStorage.getItem(SCREEN_ACCOUNT_PREFIX + screenKey);
  return lastLoaded !== activeId;
}

/** Mark a screen as having loaded data for the current active account */
export function markScreenLoaded(screenKey: string): void {
  if (typeof window === 'undefined') return;
  const activeId = getActiveAccountId();
  if (activeId) {
    localStorage.setItem(SCREEN_ACCOUNT_PREFIX + screenKey, activeId);
  }
}

/** Clear all per-screen tracking (called on logout) */
export function clearAllScreenMarkers(): void {
  if (typeof window === 'undefined') return;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(SCREEN_ACCOUNT_PREFIX)) toRemove.push(key);
  }
  toRemove.forEach((key) => localStorage.removeItem(key));
}
