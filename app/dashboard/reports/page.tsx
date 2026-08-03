import type { Metadata } from 'next';
import PatientReportsScreen from '@/components/dashboard/patient-reports-screen';

export const metadata: Metadata = {
  title: 'Medical Reports',
  description: 'Upload, manage, and download all your medical lab reports.',
};

export default function ReportsPage() {
  return <PatientReportsScreen />;
}
