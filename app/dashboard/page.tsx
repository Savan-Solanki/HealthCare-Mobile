import type { Metadata } from 'next';
import PatientHomeScreen from '@/components/dashboard/patient-home-screen';

export const metadata: Metadata = {
  title: 'Patient Home',
  description: 'Track your appointments, care plan, medications, and patient profile in one place.',
};

export default function DashboardPage() {
  return <PatientHomeScreen />;
}
