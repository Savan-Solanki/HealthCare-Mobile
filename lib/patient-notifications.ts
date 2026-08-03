import api from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────
export type NotificationCategory = 'medicine_reminder' | 'prescription' | 'appointment' | 'system';

export type PatientNotification = {
  id: string;
  title: string;
  body: string;
  category: NotificationCategory;
  actionUrl: string;
  isRead: boolean;
  createdAt: string;
};

// ─── Raw response type (MongoDB returns _id) ─────────────────────────
type RawNotification = Omit<PatientNotification, 'id'> & { _id: string; id?: string };

/** Normalise a MongoDB notification document so the frontend always has `.id`. */
const normalise = (raw: RawNotification): PatientNotification => ({
  ...raw,
  id: raw.id ?? raw._id,
});

// ─── API Calls ────────────────────────────────────────────────────────

/** Fetch all notifications for the current patient. */
export const fetchNotifications = async (): Promise<PatientNotification[]> => {
  const response = await api.get<{ data?: RawNotification[] }>('/patient/notifications');
  return (response.data?.data || []).map(normalise);
};

/** Get the count of unread notifications. */
export const getUnreadCount = async (): Promise<number> => {
  const response = await api.get<{ data?: { count: number } }>('/patient/notifications/unread-count');
  return response.data?.data?.count ?? 0;
};

/** Mark a single notification as read. */
export const markAsRead = async (id: string): Promise<void> => {
  await api.patch(`/patient/notifications/${id}/read`);
};

/** Mark all notifications as read. */
export const markAllAsRead = async (): Promise<void> => {
  await api.patch('/patient/notifications/read-all');
};
