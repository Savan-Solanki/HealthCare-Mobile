// =====================================================================
// medikwik Patient - Service Worker
// Handles: offline caching + push notifications
// =====================================================================

const CACHE_NAME = 'medikwik-patient-v6';

const OFFLINE_URL = '/login';

// Assets to pre-cache on install.
// IMPORTANT: Do NOT add dynamic pages like /dashboard or /login here.
// The SW would serve a stale cached version after an account switch,
// showing the wrong user's data. Only cache truly static assets.
const PRE_CACHE_URLS = [
  '/manifest.json',
  '/android/launchericon-192x192.png',
  '/android/launchericon-512x512.png',
];

// ─── Install ──────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRE_CACHE_URLS);
    })
  );
  self.skipWaiting();
});

// ─── Activate ─────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

// Queue DB Helpers for offline mutations
function openQueueDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('medikwik_offline_queue', 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('requests')) {
        db.createObjectStore('requests', { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function queueRequest(request) {
  try {
    const db = await openQueueDB();
    const cloned = request.clone();
    const body = await cloned.text();
    const serialized = {
      url: cloned.url,
      method: cloned.method,
      headers: Array.from(cloned.headers.entries()).reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {}),
      body: body || null,
      timestamp: Date.now()
    };
    return new Promise((resolve, reject) => {
      const tx = db.transaction('requests', 'readwrite');
      const store = tx.objectStore('requests');
      const addReq = store.add(serialized);
      addReq.onsuccess = () => resolve();
      addReq.onerror = () => reject(addReq.error);
    });
  } catch (err) {
    console.error('[SW] Error queuing request:', err);
  }
}

async function replayMutations() {
  try {
    const db = await openQueueDB();
    const tx = db.transaction('requests', 'readonly');
    const store = tx.objectStore('requests');
    const requests = await new Promise((resolve) => {
      const getReq = store.getAll();
      getReq.onsuccess = () => resolve(getReq.result || []);
      getReq.onerror = () => resolve([]);
    });

    if (requests.length === 0) return;

    console.log(`[SW] Replaying ${requests.length} queued mutations...`);

    for (const req of requests) {
      try {
        const res = await fetch(req.url, {
          method: req.method,
          headers: req.headers,
          body: req.body ? req.body : undefined
        });
        if (res.status >= 200 && res.status < 300) {
          await new Promise((resolve) => {
            const deleteTx = db.transaction('requests', 'readwrite');
            const deleteStore = deleteTx.objectStore('requests');
            const delReq = deleteStore.delete(req.id);
            delReq.onsuccess = () => resolve();
            delReq.onerror = () => resolve();
          });
        }
      } catch (err) {
        console.error('[SW] Failed to replay request:', err);
        // Keep in queue and retry on next connection
      }
    }
  } catch (err) {
    console.error('[SW] Error replaying mutations:', err);
  }
}

// Auth-related paths that must never be intercepted offline (would break login/registration)
const AUTH_PATHS = [
  '/patient/auth/',
  '/doctor/auth/',
  '/admin/auth/',
  '/api/v1/patient/auth/',
  '/api/v1/doctor/auth/',
  '/api/v1/admin/auth/',
];

function isAuthRequest(url) {
  return AUTH_PATHS.some((path) => url.pathname.includes(path));
}

// ─── Fetch (Network First, fallback to Cache or Offline Sync) ────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Handle API mutations (POST/PUT/PATCH/DELETE) when offline
  // IMPORTANT: Only intercept same-origin requests, and never intercept auth endpoints.
  if (event.request.method !== 'GET') {
    const isSameOrigin = url.origin === self.location.origin;
    const isAuthPath = isAuthRequest(url);

    // Only queue same-origin non-auth API mutations
    if (isSameOrigin && !isAuthPath && url.pathname.startsWith('/api/')) {
      event.respondWith(
        fetch(event.request.clone())
          .catch(async () => {
            // Queue request and return 202 Accepted response
            await queueRequest(event.request);

            // Try to register background sync if available
            if (self.registration.sync) {
              try {
                await self.registration.sync.register('replay-mutations');
              } catch (e) {
                // Ignore sync registration errors
              }
            }

            return new Response(JSON.stringify({
              success: true,
              offline: true,
              message: 'You are currently offline. Your action has been saved and will sync automatically when connection is restored.'
            }), {
              status: 202,
              headers: { 'Content-Type': 'application/json' }
            });
          })
      );
    }
    // All other non-GET requests (cross-origin, auth, etc.) are passed through without SW intervention
    return;
  }

  // Skip cross-origin requests (e.g. S3 images, external APIs)
  if (url.origin !== self.location.origin) return;

  // Skip API calls and non-http(s) requests
  if (url.pathname.startsWith('/api/') || !event.request.url.startsWith('http')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone and cache successful responses
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Offline fallback
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // For navigation requests, return the login page
          if (event.request.mode === 'navigate') {
            return caches.match(OFFLINE_URL);
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

// ─── Background Sync Event ───────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'replay-mutations') {
    event.waitUntil(replayMutations());
  }
});

// ─── Message Listener (Client notification for manual sync) ──────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'REPLAY_MUTATIONS') {
    event.waitUntil(replayMutations());
  }
});

// ─── Push Notifications ───────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {
    title: 'medikwik',
    body: 'You have a new notification.',
    icon: '/android/launchericon-192x192.png',
    badge: '/android/launchericon-96x96.png',
    url: '/dashboard',
  };

  let category = '';
  let channelId = '';
  let reminderId = '';
  let medicineName = '';
  let dosage = '';
  let doctorName = '';
  let scheduledTime = '';

  if (event.data) {
    try {
      const payload = event.data.json();
      data = {
        title: payload.notification?.title || payload.title || data.title,
        body: payload.notification?.body || payload.body || data.body,
        icon: payload.notification?.icon || data.icon,
        badge: data.badge,
        url: payload.data?.url || payload.url || data.url,
      };

      category = payload.data?.category || payload.category || '';
      channelId = payload.data?.channelId || payload.channelId || payload.data?.channel_id || '';
      reminderId = payload.data?.reminderId || '';
      medicineName = payload.data?.medicineName || '';
      dosage = payload.data?.dosage || '';
      doctorName = payload.data?.doctorName || '';
      scheduledTime = payload.data?.scheduledTime || '';
    } catch {
      data.body = event.data.text() || data.body;
    }
  }

  const isMedicine =
    category === 'medicine_reminder' ||
    channelId === 'medicine_channel' ||
    channelId === 'medicine_channel_v2' ||
    channelId === 'medicine_channel_v3' ||
    channelId === 'medicine_alarm_channel';

  let notifBody = data.body;
  if (isMedicine && medicineName) {
    const lines = [`Dosage: ${dosage}`];
    if (doctorName) lines.push(`Dr. ${doctorName}`);
    else lines.push('Your custom reminder');
    if (scheduledTime) lines.push(`At: ${scheduledTime}`);
    notifBody = lines.join(' · ');
  }

  const options = {
    body: notifBody,
    icon: data.icon,
    badge: data.badge,
    vibrate: isMedicine ? [400, 200, 400, 200, 400] : [200, 100, 200],
    tag: isMedicine
      ? `medicine_alarm_${reminderId || Date.now()}`
      : 'medikwik-notification',
    renotify: true,
    requireInteraction: isMedicine, // medicine alarms stay until actioned
    silent: false,
    data: {
      url: data.url,
      category,
      channelId,
      reminderId,
      medicineName,
      dosage,
      doctorName,
      scheduledTime,
      isMedicine,
    },
    // Action buttons shown on lock screen / notification shade
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

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ─── Notification Click / Action ─────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const notifData = event.notification.data || {};
  const action = event.action || '';
  const targetUrl = notifData.url || '/dashboard';
  const isMedicine = notifData.isMedicine;

  if (isMedicine && action === 'snooze') {
    // Re-show the notification after 5 minutes
    event.waitUntil(
      new Promise((resolve) => {
        setTimeout(() => {
          self.registration.showNotification(event.notification.title, {
            ...event.notification,
            body: `⏰ Snoozed · ${event.notification.body}`,
            tag: `${notifData.isMedicine ? 'medicine_alarm_snooze' : 'medikwik'}_${Date.now()}`,
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
    // Just close (already closed above) and optionally signal the app
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

  // Default: open / focus the app
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing window if open
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        // Open new window
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});

// ─── Push Subscription Change ─────────────────────────────────────────
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true })
      .then((subscription) => {
        console.log('[SW] Push subscription updated:', subscription);
      })
  );
});

// ─── Message: Clear page cache on account switch ───────────────────────
// Called by the app via: navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_PAGE_CACHE' })
// This ensures that when the user switches accounts, the SW cache does not
// serve stale page HTML from the previous account session.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_PAGE_CACHE') {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.keys().then((keys) => {
          return Promise.all(keys.map((key) => cache.delete(key)));
        });
      }).then(() => {
        console.log('[SW] Page cache cleared for account switch.');
      })
    );
  }
});
