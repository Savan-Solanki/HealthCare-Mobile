import api from '@/lib/api';
import type { DashboardPrescription } from '@/lib/patient-dashboard';

export type PrescriptionSource = 'doctor_generated' | 'patient_uploaded';

export const fetchPatientPrescriptions = async (
  source?: PrescriptionSource
): Promise<DashboardPrescription[]> => {
  const response = await api.get<{ data?: DashboardPrescription[] }>('/patient/prescriptions', {
    params: source ? { source } : undefined,
  });

  return response.data?.data || [];
};
