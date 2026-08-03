import type { Metadata } from 'next';
import PatientHospitalScreen from '@/components/dashboard/patient-hospital-screen';

export const metadata: Metadata = {
  title: 'My Hospital',
  description: 'Review the hospitals connected to your patient history and your recent prescriptions.',
};

export default function PatientHospitalPage() {
  return <PatientHospitalScreen />;
}
