import Dexie, { type Table } from 'dexie';

export interface LocalProfile {
  id: string;
  name: string;
  firstName: string;
  email: string;
  phone: string;
  avatar: string | null;
  initials: string;
  memberSince?: string;
  lastLogin?: string | null;
  prescriptionCredits?: number;
  reportCredits?: number;
  totalCreditsUsed?: number;
  lastCreditUsage?: string | null;
}


export interface LocalPrescription {
  id: string;
  source: 'doctor_generated' | 'patient_uploaded';
  diagnosis: string;
  prescriptionDate: string;
  followUpDate: string | null;
  instruction: string;
  doctorName: string | null;
  hospital: {
    id: string;
    name: string;
    city: string | null;
    phone: string | null;
    address: string | null;
  } | null;
  hasPdf: boolean;
  fileName: string | null;
  fileSize: number | null;
  medicines: Array<{
    name: string;
    dosage: string;
    frequency: string;
    duration: string;
    schedule: {
      morning: boolean;
      afternoon: boolean;
      night: boolean;
      morningTime: string;
      afternoonTime: string;
      nightTime: string;
    };
  }>;
}

export interface LocalAppointment {
  id: string;
  doctorId?: string | null;
  doctorName: string;
  department: string;
  patientFirstName?: string | null;
  patientLastName?: string | null;
  patientEmail?: string | null;
  appointmentDate: string;
  appointmentTime: string | null;
  status: string;
  consultationFee: number;
  paymentStatus: string;
  appointmentPurpose?: string | null;
  description?: string | null;
  hospital: {
    id: string;
    name: string;
    city: string | null;
    phone: string | null;
    address: string | null;
  } | null;
}

export type RepeatType = 'daily' | 'weekly' | 'custom_days' | 'every_x_hours';

export interface LocalReminder {
  id: string;
  patientUserId: string;
  prescriptionId?: string;
  type: 'doctor_prescription' | 'patient_custom';
  medicineName: string;
  dosage: string;
  frequency?: string;
  startDate: string;
  endDate: string;
  times: string[];
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  doctorName?: string;
  hospitalName?: string;
  createdAt: string;
  // ── Extended fields (v3) ──────────────────────────────────────
  notes?: string;
  repeatType?: RepeatType;
  /** Weekdays (0=Sun … 6=Sat) — used for weekly / custom_days */
  repeatDays?: number[];
  /** Hours between alarms — used for every_x_hours */
  repeatIntervalHours?: number | null;
}

export interface LocalNotification {
  id: string;
  title: string;
  body: string;
  category: 'medicine_reminder' | 'prescription' | 'appointment' | 'system';
  actionUrl: string;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
}

export interface SyncMeta {
  key: string; // e.g. "prescriptions_last_sync", "appointments_last_sync", etc.
  value: string; // ISO string timestamp
}

export class PatientDexieDB extends Dexie {
  profile!: Table<LocalProfile, string>;
  prescriptions!: Table<LocalPrescription, string>;
  appointments!: Table<LocalAppointment, string>;
  reminders!: Table<LocalReminder, string>;
  notifications!: Table<LocalNotification, string>;
  syncMeta!: Table<SyncMeta, string>;

  constructor(accountId: string) {
    // Isolated database name per account prevents any data leakage
    super(`medikwik_patient_${accountId}`);
    
    this.version(1).stores({
      profile: '&id',
      prescriptions: '&id, source, prescriptionDate',
      appointments: '&id, status, appointmentDate',
      reminders: '&id, status, type, startDate, endDate',
      notifications: '&id, category, isRead, createdAt',
      syncMeta: '&key',
    });

    // v2: added prescriptionCredits, reportCredits, totalCreditsUsed, lastCreditUsage to LocalProfile
    this.version(2).stores({
      profile: '&id',
      prescriptions: '&id, source, prescriptionDate',
      appointments: '&id, status, appointmentDate',
      reminders: '&id, status, type, startDate, endDate',
      notifications: '&id, category, isRead, createdAt',
      syncMeta: '&key',
    });

    // v3: added notes, repeatType, repeatDays, repeatIntervalHours to LocalReminder
    this.version(3).stores({
      profile: '&id',
      prescriptions: '&id, source, prescriptionDate',
      appointments: '&id, status, appointmentDate',
      reminders: '&id, status, type, startDate, endDate, repeatType',
      notifications: '&id, category, isRead, createdAt',
      syncMeta: '&key',
    });
  }
}


const dbCache = new Map<string, PatientDexieDB>();

export function getPatientDB(accountId: string): PatientDexieDB {
  if (!accountId) {
    throw new Error('getPatientDB: accountId is required');
  }
  let db = dbCache.get(accountId);
  if (!db) {
    db = new PatientDexieDB(accountId);
    dbCache.set(accountId, db);
  }
  return db;
}

/**
 * Completely destroys the IndexedDB for a given account.
 *
 * Uses Dexie.delete() (not table.clear()) because:
 *   - Clearing tables can silently fail if another connection holds the DB open
 *   - Dexie.delete() removes the entire database from the browser storage
 *   - On next access, getPatientDB() creates a fresh empty database
 *
 * Steps:
 *   1. Close + remove the cached Dexie instance (releases the connection)
 *   2. Call Dexie.delete() to nuke the entire IDB database
 */
export async function clearPatientDB(accountId: string): Promise<void> {
  const dbName = `medikwik_patient_${accountId}`;

  // Step 1: Close the existing Dexie instance if it's open
  const existing = dbCache.get(accountId);
  if (existing) {
    try { existing.close(); } catch { /* ignore */ }
    dbCache.delete(accountId);
  }

  // Step 2: Delete the entire IndexedDB database
  // This is equivalent to "format" — next open creates a fresh empty DB
  await Dexie.delete(dbName);
}
