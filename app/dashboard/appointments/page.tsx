import { Suspense } from 'react';
import type { Metadata } from 'next';
import PatientAppointmentScreen from '@/components/dashboard/patient-appointment-screen';

export const metadata: Metadata = {
  title: 'Book Appointment',
  description: 'Book a hospital appointment with a doctor and patient details.',
};

export default function PatientAppointmentsPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[#eef6fa]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
      </div>
    }>
      <PatientAppointmentScreen />
    </Suspense>
  );
}
