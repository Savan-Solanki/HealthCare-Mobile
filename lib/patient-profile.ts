import type { PatientDashboardData } from '@/lib/patient-dashboard';

export const isPatientProfileComplete = (
  completion: PatientDashboardData['profileCompletion'] | null | undefined
) => {
  if (!completion) return false;
  if (typeof completion.isComplete === 'boolean') return completion.isComplete;
  return completion.completedFields >= completion.totalFields && completion.totalFields > 0;
};
