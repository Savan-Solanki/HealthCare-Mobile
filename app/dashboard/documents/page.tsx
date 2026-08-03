import type { Metadata } from 'next';
import PatientDocumentsScreen from '@/components/dashboard/patient-documents-screen';

export const metadata: Metadata = {
  title: 'My Documents',
  description: 'Manage, search, and download all your clinical prescriptions, admissions slips, and medical reports.',
};

export default function PatientDocumentsPage() {
  return <PatientDocumentsScreen />;
}
