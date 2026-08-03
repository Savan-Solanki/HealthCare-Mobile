// =====================================================================
// medikwik Patient — TWA (Trusted Web Activity) Detection
//
// Detects whether the PWA is running inside an Android TWA wrapper.
// When inside a TWA, all PWA install prompts are suppressed because
// the app is already installed natively.
// =====================================================================
'use client';

/**
 * Returns `true` when the page is rendered inside a Trusted Web Activity.
 *
 * Detection methods (any match → TWA):
 *   1. `document.referrer` starts with "android-app://"
 *   2. Display mode is "standalone" or "fullscreen" (TWA sets this)
 *   3. User-agent contains the Android package name or "AO" overlay flag
 *   4. `sessionStorage` flag set by a prior check (survives soft navigations)
 */
export function isTWA(): boolean {
  if (typeof window === 'undefined') return false;

  // Fast path: cached result in sessionStorage
  try {
    if (sessionStorage.getItem('__medikwik_twa') === '1') return true;
  } catch {
    // sessionStorage blocked — continue with live checks
  }

  const detected =
    checkReferrer() ||
    checkDisplayMode() ||
    checkUserAgent();

  if (detected) {
    try { sessionStorage.setItem('__medikwik_twa', '1'); } catch { /* ignore */ }
  }

  return detected;
}

// ─── Detection Strategies ──────────────────────────────────────────────

/** 1. Android TWAs set document.referrer to "android-app://<package>" */
function checkReferrer(): boolean {
  try {
    return document.referrer.startsWith('android-app://');
  } catch {
    return false;
  }
}

/** 2. TWA runs in standalone/fullscreen display mode */
function checkDisplayMode(): boolean {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches
    );
  } catch {
    return false;
  }
}

/** 3. Check user-agent for our Android package name or TWA-specific tokens */
function checkUserAgent(): boolean {
  try {
    const ua = navigator.userAgent || '';
    // Our TWA package name
    if (ua.includes('in.medikwik.healthbuddy.patient')) return true;
    // Chrome TWA overlay flag
    if (/\bTWA\b/.test(ua)) return true;
    return false;
  } catch {
    return false;
  }
}

// ─── Install Prompt Suppression ────────────────────────────────────────

let _suppressionInstalled = false;

/**
 * Call this once at app startup (e.g. in PWAInit).
 * Prevents the browser from showing its native "Add to Home Screen"
 * mini-infobar or install prompt when running inside a TWA.
 */
export function suppressInstallPromptInTWA(): void {
  if (typeof window === 'undefined') return;
  if (_suppressionInstalled) return;
  _suppressionInstalled = true;

  window.addEventListener('beforeinstallprompt', (e) => {
    if (isTWA()) {
      e.preventDefault();
      console.log('[TWA] Install prompt suppressed — app is already installed natively.');
    }
  });
}
