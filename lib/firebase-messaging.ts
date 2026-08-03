// =====================================================================
// medikwik Patient - Firebase Client-Side Messaging Helper
// Handles: FCM token generation + foreground push notifications
// =====================================================================

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, type Messaging } from 'firebase/messaging';
import { getInstallations, getId } from 'firebase/installations';
import { toast } from 'sonner';
import api from './api';

// ─── Firebase Config ──────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'medikwik-healthbuddy-47bd3'}.firebaseapp.com`,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'medikwik-healthbuddy-47bd3',
  storageBucket: `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'medikwik-healthbuddy-47bd3'}.appspot.com`,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
};

// ─── Initialize Firebase (singleton) ─────────────────────────────────
function getFirebaseApp() {
  if (!firebaseConfig.apiKey) {
    throw new Error('Firebase API key is not configured.');
  }
  if (getApps().length > 0) return getApp();
  return initializeApp(firebaseConfig);
}

// ─── Get Messaging instance (browser only) ───────────────────────────
function getFirebaseMessaging(): Messaging | null {
  if (typeof window === 'undefined') return null;
  if (!firebaseConfig.apiKey) {
    console.info('[FCM] Firebase Messaging is disabled (no API key configured).');
    return null;
  }
  try {
    const app = getFirebaseApp();
    return getMessaging(app);
  } catch (err) {
    console.warn('[FCM] Firebase Messaging not available:', err);
    return null;
  }
}

// ─── Request Notification Permission & Get FCM Token ─────────────────
export async function requestNotificationPermission(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  // Check if notifications are supported
  if (!('Notification' in window)) {
    console.warn('[FCM] Notifications not supported in this browser.');
    return null;
  }

  // Check if Firebase config is available
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey || vapidKey === 'PASTE_YOUR_VAPID_KEY') {
    console.warn('[FCM] VAPID key not configured. Push notifications disabled.');
    return null;
  }

  try {
    let permission = Notification.permission;
    if (permission !== 'granted') {
      console.log("Before:", permission);
      const result = await Notification.requestPermission();
      console.log("Request result:", result);
      console.log("After:", Notification.permission);
      permission = result;
    } else {
      console.log("[FCM] Notification permission already granted. Skipping requestPermission().");
    }

    if (permission !== 'granted') {
      console.log('[FCM] Notification permission denied.');
      return null;
    }

    const messaging = getFirebaseMessaging();
    if (!messaging) return null;

    // Wait for service worker to be ready
    const swRegistration = await navigator.serviceWorker.ready;

    // ──────────────────────────────────────────────────────────────────
    // FCM DIAGNOSTICS & VERIFICATION
    // ──────────────────────────────────────────────────────────────────
    console.log("[FCM Diagnostic] Starting verification checks...");

    // 1. Chrome Version
    const getChromeVersion = () => {
      if (typeof navigator === 'undefined') return 'unknown';
      const ua = navigator.userAgent;
      const match = ua.match(/Chrome\/([0-9.]+)/);
      return match ? match[1] : 'Not Chrome';
    };
    const chromeVer = getChromeVersion();
    console.log("[FCM Diagnostic] 1. Chrome version:", chromeVer);

    // 2. Google Play Services Version
    console.log("[FCM Diagnostic] 2. Google Play Services version: Web API cannot access native package information (sandboxed environment).");

    // 3. Firebase Installations API success
    console.log("[FCM Diagnostic] 3. Verifying Firebase Installations API...");
    try {
      const app = getFirebaseApp();
      const installations = getInstallations(app);
      const fid = await getId(installations);
      console.log("[FCM Diagnostic] Firebase Installations API SUCCESS. FID:", fid);
    } catch (installErr: any) {
      console.error("[FCM Diagnostic] Firebase Installations API FAILED:", installErr);
      console.log("[FCM Diagnostic] Exact failing API call: getId(installations)");
      console.log("[FCM Diagnostic] Installations error object:", installErr);
      console.log("[FCM Diagnostic] Installations error name:", installErr?.name);
      console.log("[FCM Diagnostic] Installations error message:", installErr?.message);
      console.log("[FCM Diagnostic] Installations error stack:", installErr?.stack);
    }

    // 4. Whether Service Worker can subscribe to PushManager
    const canSubscribe = !!(swRegistration && swRegistration.pushManager);
    console.log("[FCM Diagnostic] 4. Service Worker can subscribe to PushManager:", canSubscribe);

    // 5. Whether PushManager.subscribe() fails
    if (canSubscribe) {
      console.log("[FCM Diagnostic] 5. Running native PushManager.subscribe() test...");
      try {
        const convertVapidKey = (base64String: string) => {
          const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
          const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
          const rawData = window.atob(base64);
          const outputArray = new Uint8Array(rawData.length);
          for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
          }
          return outputArray;
        };

        const applicationServerKey = convertVapidKey(vapidKey);
        const newSub = await swRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey
        });
        console.log("[FCM Diagnostic] Native PushManager.subscribe SUCCESS:", newSub);
      } catch (pushErr: any) {
        console.error("[FCM Diagnostic] Native PushManager.subscribe FAILED:", pushErr);
        console.log("[FCM Diagnostic] Exact failing API call: registration.pushManager.subscribe()");
        console.log("[FCM Diagnostic] Native error object:", pushErr);
        console.log("[FCM Diagnostic] Native error name:", pushErr?.name);
        console.log("[FCM Diagnostic] Native error message:", pushErr?.message);
        console.log("[FCM Diagnostic] Native error stack:", pushErr?.stack);
      }
    } else {
      console.log("[FCM Diagnostic] 5. Native PushManager.subscribe() test SKIPPED because pushManager is unavailable.");
    }
    // ──────────────────────────────────────────────────────────────────

    const registration = swRegistration;
    console.log("Firebase getToken started");
    console.log("VAPID key:", vapidKey);
    console.log("Service Worker Registration:", registration);

    let token = null;
    try {
      token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: swRegistration,
      });
    } catch (tokenErr: any) {
      const error = tokenErr;
      console.log("Error object:", error);
      console.log("Error name:", error?.name);
      console.log("Error code:", error?.code);
      console.log("Error message:", error?.message);
      console.log("Full stack:", error?.stack);
      
      console.warn('[FCM] First getToken attempt failed, attempting self-healing (unregister and re-register SW)...', tokenErr);
      
      try {
        // Self-healing: Unregister all active service workers to clear any corrupted push subscription states
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.unregister();
          console.log('[FCM Self-Healing] Unregistered service worker:', reg.scope);
        }
        
        // Re-register sw.js clean
        const newReg = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        });
        console.log('[FCM Self-Healing] Re-registered service worker scope:', newReg.scope);
        
        // Wait up to 3 seconds for service worker to reach active state
        await new Promise<void>((resolve) => {
          const checkState = () => {
            const sw = newReg.installing || newReg.waiting || newReg.active;
            if (sw && sw.state === 'activated') {
              resolve();
            }
          };
          if (newReg.installing) {
            newReg.installing.addEventListener('statechange', checkState);
          }
          if (newReg.waiting) {
            newReg.waiting.addEventListener('statechange', checkState);
          }
          // Fallback timeout
          setTimeout(resolve, 2000);
        });

        const registrationSecond = newReg;
        console.log("Firebase getToken started");
        console.log("VAPID key:", vapidKey);
        console.log("Service Worker Registration:", registrationSecond);

        // Try getting token again with the new clean registration
        token = await getToken(messaging, {
          vapidKey,
          serviceWorkerRegistration: newReg,
        });
        console.log('[FCM Self-Healing] Successfully obtained token on second attempt:', token);
      } catch (retryErr: any) {
        const error = retryErr;
        console.log("Error object:", error);
        console.log("Error name:", error?.name);
        console.log("Error code:", error?.code);
        console.log("Error message:", error?.message);
        console.log("Full stack:", error?.stack);
        console.error('[FCM Self-Healing] Retry failed:', retryErr);
        throw tokenErr; // Throw original error if self-healing failed
      }
    }

    console.log("FCM Token:", token);
    console.log("Firebase Config:", firebaseConfig.projectId);

    if (token) {
      console.log("FCM TOKEN GENERATED:", token);
      if (typeof window !== 'undefined') {
        localStorage.setItem('medikwik_fcm_token', token);
        localStorage.setItem('medikwik_fcm_token_time', new Date().toISOString());
      }
      // Send token to backend to store against this patient's account
      await sendTokenToServer(token);
      return token;
    }

    console.warn('[FCM] No token received.');
    return null;
  } catch (err: any) {
    const errCode = typeof err?.code === 'string' ? err.code : '';
    const errMsg = typeof err?.message === 'string' ? err.message : '';
    const isPermissionOrKeyRestricted = 
      errCode === 'messaging/permission-blocked' || 
      errMsg.includes('PERMISSION_DENIED') || 
      errMsg.includes('permission') ||
      errCode.includes('installations/');

    if (isPermissionOrKeyRestricted) {
      console.warn(
        '[FCM] Firebase Installations or Cloud Messaging API key permission denied. ' +
        'Push notifications are disabled. To fix this, verify that the "Firebase Installations API" ' +
        'and "Cloud Messaging" are enabled and authorized under API restrictions for your browser API key ' +
        'in the Google Cloud Console (APIs & Services > Credentials).',
        err
      );
    } else {
      console.warn('[FCM] Error getting token:', err);
    }
    throw err; // Propagate the error so the page console catches the exact trace
  }
}

// ─── Send FCM Token to Backend ────────────────────────────────────────
async function sendTokenToServer(token: string): Promise<void> {
  try {
    console.log("Saving token to backend:", token);
    const response = await api.post('/notifications/fcm-token', { fcmToken: token, platform: 'web' });
    console.log("Backend response:", response.data);
    console.log('[FCM] Token registered successfully on backend.');
  } catch (err) {
    // Non-critical — log only
    console.warn('[FCM] Could not send token to server:', err);
    throw err;
  }
}

// ─── Listen for Foreground Messages ──────────────────────────────────
// Call this once in your app (e.g. in layout or after login)
export function setupForegroundNotifications(): (() => void) | null {
  if (typeof window === 'undefined') return null;

  const messaging = getFirebaseMessaging();
  if (!messaging) return null;

  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey || vapidKey === 'PASTE_YOUR_VAPID_KEY') return null;

  const unsubscribe = onMessage(messaging, (payload) => {
    console.log('[FCM] Foreground message received:', payload);

    const data = payload.data || {};
    const type = (data.type as string) || '';
    const category = (data.category as string) || '';
    const isMedicineReminder =
      type === 'medicine_reminder' || category === 'medicine_reminder';

    const title = payload.notification?.title || 'medikwik';
    const body = payload.notification?.body || 'You have a new update.';
    const url = (data.url as string) || '/dashboard';

    if (isMedicineReminder) {
      // ── 1. Trigger the in-app alarm modal via a custom DOM event ────
      // Forward ALL medicine fields so the modal can render even if
      // the reminder isn't in the local IndexedDB cache yet.
      window.dispatchEvent(
        new CustomEvent('medikwik:medicine-alarm', {
          detail: {
            reminderId: data.reminderId,
            medicineName: data.medicineName,
            dosage: data.dosage,
            doctorName: data.doctorName,
            scheduledTime: data.scheduledTime,
            title,
            body,
            url,
          },
        })
      );

      // ── 2. Show a service-worker notification for alarm sound ───────
      // On Android TWA, JavaScript audio is blocked without a user gesture.
      // The OS WILL play the default ringtone for service worker notifications.
      // This ensures the user hears an alert even if JS audio is blocked.
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready
          .then((reg) => {
            return reg.showNotification(title, {
              body,
              icon: '/android/launchericon-192x192.png',
              badge: '/android/launchericon-96x96.png',
              tag: `medicine_alarm_fg_${data.reminderId || Date.now()}`,
              renotify: true,
              requireInteraction: true,
              silent: false, // Let the OS play the default notification sound
              data: {
                url,
                isMedicine: true,
                reminderId: data.reminderId,
                medicineName: data.medicineName,
                dosage: data.dosage,
                doctorName: data.doctorName,
              },
              actions: [
                { action: 'take', title: '✅ Take Medicine' },
                { action: 'snooze', title: '⏰ Snooze 5 min' },
                { action: 'dismiss', title: '❌ Dismiss' },
              ],
            } as NotificationOptions);
          })
          .catch(() => { /* non-fatal */ });
      }
    } else {
      // All other notification types: show a toast
      toast.success(title, {
        description: body,
        duration: 8000,
        action: {
          label: 'View',
          onClick: () => { window.location.href = url; },
        },
      });
    }
  });

  return unsubscribe;
}

// ─── Register Service Worker ──────────────────────────────────────────
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined') return null;
  if (!('serviceWorker' in navigator)) {
    console.warn('[SW] Service workers not supported.');
    return null;
  }

  try {
    const reg = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
    console.log('[SW] Service worker registered:', reg.scope);
    return reg;
  } catch (err) {
    console.error('[SW] Service worker registration failed:', err);
    return null;
  }
}
