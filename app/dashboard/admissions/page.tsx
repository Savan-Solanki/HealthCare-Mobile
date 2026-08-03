import type { Metadata } from 'next';
import PatientAdmissionsScreen from '@/components/dashboard/patient-admissions-screen';

export const metadata: Metadata = {
  title: 'Hospital Admissions',
  description: 'View your hospital admission stays, ward allocations, and discharge certificates.',
};

export default function PatientAdmissionsPage() {
  return <PatientAdmissionsScreen />;
}
