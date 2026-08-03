import { io, Socket } from 'socket.io-client';
import { getPatientDB } from './db';
import { syncAllPatientData } from './db/sync-engine';
import { API_ORIGIN } from './api-url';

class PatientSocketManager {
  private socket: Socket | null = null;
  private currentAccountId: string | null = null;

  connect(token: string, accountId: string) {
    if (this.socket) {
      if (this.currentAccountId === accountId) {
        return; // Already connected to correct account
      }
      console.log('[Socket] Account changed, reconnecting...');
      this.disconnect();
    }

    this.currentAccountId = accountId;

    console.log(`[Socket] Connecting to ${API_ORIGIN}/patient for account: ${accountId}`);

    this.socket = io(`${API_ORIGIN}/patient`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    // Lifecycle logging
    this.socket.on('connect', () => {
      console.log(`[Socket] Successfully connected to socket namespace /patient at ${API_ORIGIN}`);
    });

    this.socket.on('connect_error', (error) => {
      console.warn('[Socket] Backend server unreachable on /patient namespace. Retrying...', error?.message || error);
    });

    this.socket.on('disconnect', (reason) => {
      console.warn(`[Socket] Disconnected from /patient namespace. Reason: ${reason}`);
    });

    this.socket.on('reconnect_attempt', (attempt) => {
      console.log(`[Socket] Reconnection attempt #${attempt}...`);
    });

    this.socket.on('reconnect', (attempt) => {
      console.log(`[Socket] Reconnected successfully after ${attempt} attempts`);
    });

    this.setupEventHandlers(accountId);
  }

  private setupEventHandlers(accountId: string) {
    if (!this.socket) return;

    const db = getPatientDB(accountId);

    // 1. Prescription created/updated
    this.socket.on('prescription:created', async (data) => {
      if (data && data._id) {
        await db.prescriptions.put({
          id: data._id,
          source: data.source || 'doctor_generated',
          diagnosis: data.diagnosis,
          prescriptionDate: data.prescriptionDate,
          followUpDate: data.followUpDate,
          instruction: data.instruction,
          doctorName: data.doctorName,
          hospital: data.hospital,
          hasPdf: data.hasPdf,
          fileName: data.fileName,
          fileSize: data.fileSize,
          medicines: data.medicines || [],
        });
      }
    });

    // 2. Reminder created
    this.socket.on('reminder:created', async (data) => {
      if (data && data._id) {
        await db.reminders.put({
          id: data._id,
          patientUserId: data.patientUserId,
          prescriptionId: data.prescriptionId,
          type: data.type,
          medicineName: data.medicineName,
          dosage: data.dosage,
          frequency: data.frequency,
          startDate: data.startDate,
          endDate: data.endDate,
          times: data.times || [],
          status: data.status,
          doctorName: data.doctorName,
          hospitalName: data.hospitalName,
          createdAt: data.createdAt || new Date().toISOString(),
        });
      }
    });

    // 3. Appointment events
    this.socket.on('appointment:created', async (data) => {
      if (data && data._id) {
        await db.appointments.put({
          id: data._id,
          doctorName: data.doctorName,
          department: data.department || 'General care',
          appointmentDate: data.appointmentDate,
          appointmentTime: data.appointmentTime,
          status: data.status,
          consultationFee: data.consultationFee || 0,
          paymentStatus: data.paymentStatus,
          hospital: data.hospital,
        });
      }
    });

    this.socket.on('appointment:updated', async (data) => {
      if (data && data._id) {
        await db.appointments.put({
          id: data._id,
          doctorName: data.doctorName,
          department: data.department || 'General care',
          appointmentDate: data.appointmentDate,
          appointmentTime: data.appointmentTime,
          status: data.status,
          consultationFee: data.consultationFee || 0,
          paymentStatus: data.paymentStatus,
          hospital: data.hospital,
        });
      }
    });

    this.socket.on('appointment:cancelled', async (data) => {
      if (data && data._id) {
        await db.appointments.update(data._id, { status: 'Cancelled' });
      }
    });

    // 4. In-app notifications
    this.socket.on('notification:new', async (data) => {
      if (data && data._id) {
        await db.notifications.put({
          id: data._id,
          title: data.title,
          body: data.body,
          category: data.category,
          actionUrl: data.actionUrl,
          isRead: data.isRead || false,
          createdAt: data.createdAt || new Date().toISOString(),
        });
      }
    });

    // 5. Profile / Credit updates
    this.socket.on('profile:updated', async (data) => {
      console.log('[Socket] profile:updated received in mobile client:', data);
      // Trigger data sync to fetch fresh dashboard/credits
      void syncAllPatientData(accountId, true).catch((err) => {
        console.error('[Socket] Sync on profile update failed:', err);
      });

      // Dispatch custom event for real-time UI updates
      if (typeof window !== 'undefined') {
        console.log('[Socket] Dispatching patient-profile-updated event with detail:', data);
        window.dispatchEvent(new CustomEvent('patient-profile-updated', { detail: data }));
      }
    });

    // 6. Admission & Discharge updates
    this.socket.on('patient_admitted', async (data) => {
      void syncAllPatientData(accountId, true).catch((err) => {
        console.error('[Socket] Sync on admission failed:', err);
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('patient-admissions-updated', { detail: data }));
      }
    });

    this.socket.on('patient_discharged', async (data) => {
      void syncAllPatientData(accountId, true).catch((err) => {
        console.error('[Socket] Sync on discharge failed:', err);
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('patient-admissions-updated', { detail: data }));
        window.dispatchEvent(new CustomEvent('patient-documents-updated', { detail: data }));
      }
    });

    // 7. Slots updated real-time sync
    this.socket.on('slots:updated', async (data) => {
      console.log('[Socket] slots:updated received in mobile client:', data);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('patient-slots-updated', { detail: data }));
      }
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.currentAccountId = null;
  }
}

export const patientSocket = new PatientSocketManager();
export default patientSocket;
