import type { Metadata } from 'next';
import PatientPrescriptionsScreen from '@/components/dashboard/patient-prescriptions-screen';

export const metadata: Metadata = {
  title: 'Prescriptions',
  description: 'Manage and download all your prescriptions in one place.',
};

export default function PrescriptionsPage() {
  return <PatientPrescriptionsScreen view="hub" />;
}
