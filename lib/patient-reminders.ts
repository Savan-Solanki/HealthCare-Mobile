import api from '@/lib/api';
import type { RepeatType } from '@/lib/db';

// ─── Types ────────────────────────────────────────────────────────────
export type ReminderType = 'doctor_prescription' | 'patient_custom';
export type ReminderStatus = 'active' | 'paused' | 'completed' | 'cancelled';

export type MedicineReminder = {
  id: string;
  type: ReminderType;
  medicineName: string;
  dosage: string;
  frequency: string;
  startDate: string;
  endDate: string;
  times: string[];
  status: ReminderStatus;
  doctorName: string;
  hospitalName: string;
  createdAt: string;
  // ── Extended fields ──────────────────────────────────────────────
  notes?: string;
  repeatType?: RepeatType;
  repeatDays?: number[];
  repeatIntervalHours?: number | null;
};

export type CreateReminderPayload = {
  medicineName: string;
  dosage: string;
  frequency?: string;
  startDate: string;
  endDate?: string; // optional — backend defaults to 1 year from start
  times: string[];
  repeatType?: RepeatType;
  repeatDays?: number[];
  repeatIntervalHours?: number | null;
  notes?: string;
};

export type UpdateReminderPayload = Partial<CreateReminderPayload>;

// ─── Raw response type (MongoDB returns _id) ─────────────────────────
type RawReminder = Omit<MedicineReminder, 'id'> & { _id: string; id?: string };

/** Normalise a MongoDB reminder document so the frontend always has `.id`. */
const normalise = (raw: RawReminder): MedicineReminder => ({
  ...raw,
  id: raw.id ?? raw._id,
});

// ─── API Calls ────────────────────────────────────────────────────────

/** Fetch all reminders, optionally filtered by status. */
export const fetchReminders = async (status?: string): Promise<MedicineReminder[]> => {
  const response = await api.get<{ data?: RawReminder[] }>('/patient/reminders', {
    params: status ? { status } : undefined,
  });

  return (response.data?.data || []).map(normalise);
};

/** Create a new custom medicine reminder. */
export const createReminder = async (data: CreateReminderPayload): Promise<MedicineReminder> => {
  const response = await api.post<{ data: RawReminder }>('/patient/reminders', data);
  return normalise(response.data.data);
};

/** Update an existing custom reminder. */
export const updateReminder = async (
  id: string,
  data: UpdateReminderPayload
): Promise<MedicineReminder> => {
  const response = await api.put<{ data: RawReminder }>(`/patient/reminders/${id}`, data);
  return normalise(response.data.data);
};

/** Pause an active reminder. */
export const pauseReminder = async (id: string): Promise<void> => {
  await api.patch(`/patient/reminders/${id}/pause`);
};

/** Resume a paused reminder. */
export const resumeReminder = async (id: string): Promise<void> => {
  await api.patch(`/patient/reminders/${id}/resume`);
};

/** Delete a custom reminder. */
export const deleteReminder = async (id: string): Promise<void> => {
  await api.delete(`/patient/reminders/${id}`);
};

/** Get the count of active reminders. */
export const getActiveReminderCount = async (): Promise<number> => {
  try {
    const response = await api.get<{ data?: RawReminder[] }>('/patient/reminders', {
      params: { status: 'active' },
    });
    return response.data?.data?.length ?? 0;
  } catch {
    return 0;
  }
};
