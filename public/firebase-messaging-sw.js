// =====================================================================
// medikwik Patient - Firebase Cloud Messaging Background Service Worker
// This file MUST be at /public/firebase-messaging-sw.js
// It handles FCM push notifications when the app is in the BACKGROUND
// =====================================================================

console.log("Firebase Service Worker Loaded");

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// ─── Firebase Config ──────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDEKcouNQ329LSIYly2Yq5hD9JBYLZijus",
  authDomain: "medikwik-63427.firebaseapp.com",
  projectId: "medikwik-63427",
  storageBucket: "medikwik-63427.firebasestorage.app",
  messagingSenderId: "480556738394",
  appId: "1:480556738394:web:878dfd6066536253127563",
  measurementId: "G-54B6MSJC4Q"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// ─── Background Message Handler ───────────────────────────────────────
// Called when app is in background / closed
messaging.onBackgroundMessage((payload) => {
  console.log('[Firebase SW] Background message received:', payload);

  const notificationTitle =
    payload.notification?.title ||
    payload.data?.title ||
    'medikwik – New Update';

  const notificationBody =
    payload.notification?.body ||
    payload.data?.body ||
    'You have a new notification from medikwik.';

  const targetUrl = payload.data?.url || '/dashboard';
  const category = payload.data?.category || '';
  const channelId = payload.data?.channelId || payload.data?.channel_id || '';
  const reminderId = payload.data?.reminderId || '';
  const medicineName = payload.data?.medicineName || '';
  const dosage = payload.data?.dosage || '';
  const doctorName = payload.data?.doctorName || '';
  const scheduledTime = payload.data?.scheduledTime || '';

  const isMedicine =
    category === 'medicine_reminder' ||
    channelId === 'medicine_channel' ||
    channelId === 'medicine_channel_v2' ||
    channelId === 'medicine_channel_v3' ||
    channelId === 'medicine_alarm_channel';

  // Build a richer body for medicine alarms
  let richBody = notificationBody;
  if (isMedicine && medicineName) {
    const lines = [`Dosage: ${dosage}`];
    if (doctorName) lines.push(`Dr. ${doctorName}`);
    else lines.push('Your custom reminder');
    if (scheduledTime) lines.push(`At: ${scheduledTime}`);
    richBody = lines.join(' · ');
  }

  const notificationOptions = {
    body: richBody,
    icon: '/android/launchericon-192x192.png',
    badge: '/android/launchericon-96x96.png',
    tag: isMedicine
      ? `medicine_alarm_${reminderId || Date.now()}`
      : 'medikwik-notification',
    renotify: true,
    vibrate: isMedicine ? [400, 200, 400, 200, 400] : [200, 100, 200],
    requireInteraction: isMedicine, // medicine alarms stay until actioned
    silent: false,
    data: {
      url: targetUrl,
      category,
      channelId,
      reminderId,
      medicineName,
      dosage,
      doctorName,
      scheduledTime,
      isMedicine,
    },
    // Action buttons — shown in notification shade on Android
    ...(isMedicine
      ? {
          actions: [
            { action: 'take', title: '✅ Take Medicine' },
            { action: 'snooze', title: '⏰ Snooze 5 min' },
            { action: 'dismiss', title: '❌ Dismiss' },
          ],
        }
      : {}),
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// ─── Notification Click / Action ──────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const notifData = event.notification.data || {};
  const action = event.action || '';
  const targetUrl = notifData.url || '/dashboard';
  const isMedicine = notifData.isMedicine;

  if (isMedicine && action === 'snooze') {
    // Re-fire the notification after 5 minutes
    event.waitUntil(
      new Promise((resolve) => {
        setTimeout(() => {
          self.registration.showNotification(event.notification.title, {
            body: `⏰ Snoozed · ${event.notification.body}`,
            icon: '/android/launchericon-192x192.png',
            badge: '/android/launchericon-96x96.png',
            tag: `medicine_alarm_snooze_${Date.now()}`,
            renotify: true,
            requireInteraction: true,
            data: notifData,
            actions: [
              { action: 'take', title: '✅ Take Medicine' },
              { action: 'snooze', title: '⏰ Snooze 5 min' },
              { action: 'dismiss', title: '❌ Dismiss' },
            ],
          });
          resolve();
        }, 5 * 60 * 1000);
      })
    );
    return;
  }

  if (isMedicine && (action === 'take' || action === 'dismiss')) {
    // Signal any open app windows
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if ('postMessage' in client) {
            client.postMessage({
              type: 'MEDICINE_ALARM_ACTIONED',
              action,
              reminderId: notifData.reminderId,
            });
          }
        }
      })
    );
    return;
  }

  // Default: open / focus the app at the target URL
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});
