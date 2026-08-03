import api from '../api';
import { getPatientDB } from './index';
import { updateAlarmReminders } from '../reminder-alarm';

export interface SyncStatus {
  isSyncing: boolean;
  lastSyncTime: string | null;
  error: string | null;
  isRateLimited: boolean;
  rateLimitedUntil: number | null;
}

const syncStatuses = new Map<string, SyncStatus>();
const syncListeners = new Set<(accountId: string, status: SyncStatus) => void>();
const lastSyncAttemptTimes = new Map<string, number>();
const clientRateLimitBlockedUntil = new Map<string, number>();

/**
 * Background syncs are throttled to once every 30 seconds per account.
 * force=true bypasses the throttle (e.g. manual pull-to-refresh).
 */
const SYNC_THROTTLE_MS = 30_000;

export const getSyncStatus = (accountId: string): SyncStatus => {
  return (
    syncStatuses.get(accountId) || {
      isSyncing: false,
      lastSyncTime: null,
      error: null,
      isRateLimited: false,
      rateLimitedUntil: null,
    }
  );
};

/** True if there is an active client-side rate-limit cooldown for this account. */
export const isRateLimited = (accountId: string): boolean => {
  const until = clientRateLimitBlockedUntil.get(accountId) || 0;
  return Date.now() < until;
};

/** Remaining seconds of rate-limit block, or 0 if not blocked. */
export const rateLimitRemainingSeconds = (accountId: string): number => {
  const until = clientRateLimitBlockedUntil.get(accountId) || 0;
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
};

export const subscribeToSync = (
  listener: (accountId: string, status: SyncStatus) => void
) => {
  syncListeners.add(listener);
  return () => {
    syncListeners.delete(listener);
  };
};

const notifySyncStatus = (accountId: string, status: SyncStatus) => {
  syncStatuses.set(accountId, status);
  syncListeners.forEach((l) => l(accountId, status));
};

/**
 * Syncs all patient data from the backend into local IndexedDB.
 *
 * Guarantees:
 * - Never throws — all errors are swallowed so callers never need try/catch.
 * - 429 errors set a client-side cooldown and are silently skipped on retry.
 * - Throttled to once per SYNC_THROTTLE_MS unless force=true.
 * - Returns true if sync succeeded, false otherwise.
 */
export async function syncAllPatientData(
  accountId: string,
  force = false
): Promise<boolean> {
  const prevStatus = getSyncStatus(accountId);
  if (prevStatus.isSyncing) return false;

  const now = Date.now();

  // ── 1. Check active rate-limit cooldown ────────────────────────────────────
  const blockedUntil = clientRateLimitBlockedUntil.get(accountId) || 0;
  if (!force && now < blockedUntil) {
    console.log(
      `[SyncEngine] Skipped — rate-limited until ${new Date(blockedUntil).toLocaleTimeString()}`
    );
    return false;
  }

  // ── 2. Throttle non-forced syncs ───────────────────────────────────────────
  const lastAttempt = lastSyncAttemptTimes.get(accountId) || 0;
  if (!force && now - lastAttempt < SYNC_THROTTLE_MS) {
    console.log(
      `[SyncEngine] Throttled — last sync was ${Math.round((now - lastAttempt) / 1000)}s ago`
    );
    return false;
  }

  lastSyncAttemptTimes.set(accountId, now);
  notifySyncStatus(accountId, {
    isSyncing: true,
    lastSyncTime: prevStatus.lastSyncTime,
    error: null,
    isRateLimited: false,
    rateLimitedUntil: null,
  });

  try {
    const db = getPatientDB(accountId);

    // Fetch all data in parallel
    const [dashboardRes, prescriptionsRes, remindersRes, notificationsRes] =
      await Promise.all([
        api.get(`/patient/dashboard?_t=${Date.now()}`),
        api.get(`/patient/prescriptions?_t=${Date.now()}`),
        api.get(`/patient/reminders?_t=${Date.now()}`),
        api.get(`/patient/notifications?_t=${Date.now()}`),
      ]);

    const dashboard = dashboardRes.data?.data;
    const prescriptions = prescriptionsRes.data?.data || [];
    const reminders = remindersRes.data?.data || [];
    const notifications = notificationsRes.data?.data || [];

    await db.transaction(
      'rw',
      [
        db.profile,
        db.prescriptions,
        db.appointments,
        db.reminders,
        db.notifications,
        db.syncMeta,
      ],
      async () => {
        // Profile
        if (dashboard?.profile) {
          await db.profile.put({
            id: dashboard.profile.id,
            name: dashboard.profile.name,
            firstName: dashboard.profile.firstName,
            email: dashboard.profile.email,
            phone: dashboard.profile.phone,
            avatar: dashboard.profile.avatar,
            initials: dashboard.profile.initials,
            memberSince: dashboard.profile.memberSince,
            lastLogin: dashboard.profile.lastLogin,
            prescriptionCredits: dashboard.profile.prescriptionCredits ?? 0,
            reportCredits: dashboard.profile.reportCredits ?? 0,
            totalCreditsUsed: dashboard.profile.totalCreditsUsed ?? 0,
            lastCreditUsage: dashboard.profile.lastCreditUsage ?? null,
          });
        }


        // Prescriptions
        await db.prescriptions.clear();
        for (const rx of prescriptions) {
          await db.prescriptions.put({
            id: rx.id,
            source: rx.source,
            diagnosis: rx.diagnosis,
            prescriptionDate: rx.prescriptionDate,
            followUpDate: rx.followUpDate,
            instruction: rx.instruction,
            doctorName: rx.doctorName,
            hospital: rx.hospital,
            hasPdf: rx.hasPdf,
            fileName: rx.fileName,
            fileSize: rx.fileSize,
            medicines: rx.medicines || [],
          });
        }

        // Appointments
        await db.appointments.clear();
        if (dashboard?.nextAppointment) {
          const appt = dashboard.nextAppointment;
          await db.appointments.put({
            id: appt.id,
            doctorId: appt.doctorId ?? null,
            doctorName: appt.doctorName,
            department: appt.department,
            patientFirstName: appt.patientFirstName ?? null,
            patientLastName: appt.patientLastName ?? null,
            patientEmail: appt.patientEmail ?? null,
            appointmentDate: appt.appointmentDate,
            appointmentTime: appt.appointmentTime,
            status: appt.status,
            consultationFee: appt.consultationFee,
            paymentStatus: appt.paymentStatus,
            appointmentPurpose: appt.appointmentPurpose ?? null,
            description: appt.description ?? null,
            hospital: appt.hospital,
          });
        }
        if (Array.isArray(dashboard?.upcomingAppointments)) {
          for (const appt of dashboard.upcomingAppointments) {
            await db.appointments.put({
              id: appt.id,
              doctorId: appt.doctorId ?? null,
              doctorName: appt.doctorName,
              department: appt.department,
              patientFirstName: appt.patientFirstName ?? null,
              patientLastName: appt.patientLastName ?? null,
              patientEmail: appt.patientEmail ?? null,
              appointmentDate: appt.appointmentDate,
              appointmentTime: appt.appointmentTime,
              status: appt.status,
              consultationFee: appt.consultationFee,
              paymentStatus: appt.paymentStatus,
              appointmentPurpose: appt.appointmentPurpose ?? null,
              description: appt.description ?? null,
              hospital: appt.hospital,
            });
          }
        }

        // Reminders
        await db.reminders.clear();
        for (const reminder of reminders) {
          await db.reminders.put({
            id: reminder._id || reminder.id,
            patientUserId: reminder.patientUserId,
            prescriptionId: reminder.prescriptionId,
            type: reminder.type,
            medicineName: reminder.medicineName,
            dosage: reminder.dosage,
            frequency: reminder.frequency,
            startDate: reminder.startDate,
            endDate: reminder.endDate,
            times: reminder.times || [],
            status: reminder.status,
            doctorName: reminder.doctorName,
            hospitalName: reminder.hospitalName,
            createdAt: reminder.createdAt || new Date().toISOString(),
            // Extended fields
            notes: reminder.notes || '',
            repeatType: reminder.repeatType || 'daily',
            repeatDays: reminder.repeatDays || [],
            repeatIntervalHours: reminder.repeatIntervalHours ?? null,
          });
        }

        // Notifications
        await db.notifications.clear();
        for (const notification of notifications) {
          await db.notifications.put({
            id: notification._id || notification.id,
            title: notification.title,
            body: notification.body,
            category: notification.category,
            actionUrl: notification.actionUrl,
            isRead: notification.isRead || false,
            createdAt: notification.createdAt,
          });
        }

        // Sync timestamp
        await db.syncMeta.put({
          key: 'last_sync_timestamp',
          value: new Date().toISOString(),
        });
      }
    );

    // Clear any stale rate-limit block on success
    clientRateLimitBlockedUntil.delete(accountId);

    // Keep the alarm scheduler's in-memory reminder list current
    try {
      const allReminders = await getPatientDB(accountId).reminders.toArray();
      updateAlarmReminders(allReminders);
    } catch { /* non-fatal */ }

    notifySyncStatus(accountId, {
      isSyncing: false,
      lastSyncTime: new Date().toISOString(),
      error: null,
      isRateLimited: false,
      rateLimitedUntil: null,
    });

    return true;
  } catch (error: any) {
    const status429 = error?.response?.status === 429;

    if (status429) {
      // Parse how long the backend wants us to wait
      const retryAfterSecs =
        error.response?.data?.retryAfterSeconds ||
        Number(error.response?.headers?.['retry-after']) ||
        3600;
      const cooldownUntil = Date.now() + retryAfterSecs * 1000;
      clientRateLimitBlockedUntil.set(accountId, cooldownUntil);

      console.warn(
        `[SyncEngine] 429 received. Sync blocked for ${retryAfterSecs}s (until ${new Date(cooldownUntil).toLocaleTimeString()})`
      );

      notifySyncStatus(accountId, {
        isSyncing: false,
        lastSyncTime: prevStatus.lastSyncTime,
        error: null, // Don't surface to UI — cached data is shown
        isRateLimited: true,
        rateLimitedUntil: cooldownUntil,
      });

      // DO NOT throw — callers get false and show cached data silently
      return false;
    }

    // Non-rate-limit errors: log only, do not surface to UI
    console.warn('[SyncEngine] Backend server offline or network unavailable:', error?.message || error);
    notifySyncStatus(accountId, {
      isSyncing: false,
      lastSyncTime: prevStatus.lastSyncTime,
      error: null, // Suppress — cached data is shown
      isRateLimited: false,
      rateLimitedUntil: null,
    });

    return false;
  }
}
