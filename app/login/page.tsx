import type { Metadata } from 'next';
import { Suspense } from 'react';
import PatientAuthScreen from '@/components/auth/patient-auth-screen';

export const metadata: Metadata = {
  title: 'Patient Login',
  description: 'Sign in or create your medikwik patient account to manage appointments and health records.',
  robots: 'noindex, nofollow',
};

export default function LoginPage() {
  return (
    <Suspense>
      <PatientAuthScreen />
    </Suspense>
  );
}
