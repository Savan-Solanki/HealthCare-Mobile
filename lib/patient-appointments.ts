import api from '@/lib/api';

export type PatientBookingProfile = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  initials: string;
};

export type PatientBookingHospital = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  address: string | null;
  phone: string | null;
  type: string | null;
  specializations: string[];
  doctorCount: number;
};

export type PatientBookingDoctor = {
  id: string;
  hospitalId: string;
  fullName: string;
  firstName: string;
  lastName: string;
  initials: string;
  specialization: string | null;
  department: string | null;
  qualification: string | null;
  experience: string | null;
  availableTime: string | null;
  consultationFee: number;
};

export type PatientBookingOptions = {
  profile: PatientBookingProfile;
  hospitals: PatientBookingHospital[];
};

export type PatientBookingAvailability = {
  doctorId: string;
  date: string;
  slots: string[];
  isOnLeave?: boolean;
  leaveMessage?: string | null;
};

export type CreatePatientAppointmentInput = {
  hospitalId: string;
  doctorId: string;
  appointmentDate: string;
  appointmentTime: string;
  patientFirstName: string;
  patientLastName: string;
  patientEmail: string;
  purpose: string;
  description?: string;
};

export type UpdatePatientAppointmentInput = Omit<
  CreatePatientAppointmentInput,
  'hospitalId' | 'doctorId'
>;

type BookingOptionsResponse = {
  success: boolean;
  data: PatientBookingOptions;
};

type BookingDoctorsResponse = {
  success: boolean;
  total: number;
  data: PatientBookingDoctor[];
};

type BookingAvailabilityResponse = {
  success: boolean;
  data: PatientBookingAvailability;
};

export const fetchPatientBookingOptions = async () => {
  const response = await api.get<BookingOptionsResponse>('/patient/booking/options');
  return response.data.data;
};

export const fetchPatientBookingDoctors = async (hospitalId: string) => {
  const response = await api.get<BookingDoctorsResponse>(
    `/patient/booking/hospitals/${hospitalId}/doctors`
  );
  return response.data.data;
};

export const fetchPatientBookingAvailability = async (
  doctorId: string,
  date: string,
  excludeAppointmentId?: string
) => {
  const response = await api.get<BookingAvailabilityResponse>('/patient/booking/availability', {
    params: { doctorId, date, excludeAppointmentId },
  });
  return response.data.data;
};

export const createPatientAppointment = async (payload: CreatePatientAppointmentInput) => {
  const response = await api.post('/patient/appointments', payload);
  return response.data;
};

export const updatePatientAppointment = async (
  appointmentId: string,
  payload: UpdatePatientAppointmentInput
) => {
  const response = await api.put(`/patient/appointments/${appointmentId}`, payload);
  return response.data;
};

export const cancelPatientAppointment = async (appointmentId: string) => {
  const response = await api.delete(`/patient/appointments/${appointmentId}`);
  return response.data;
};
