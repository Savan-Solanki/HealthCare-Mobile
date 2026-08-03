import type { Metadata } from 'next';
import PatientPlansScreen from '@/components/dashboard/patient-plans-screen';

export const metadata: Metadata = {
  title: 'Plans & Subscriptions',
  description: 'Purchase prescription and report upload plans using Razorpay.',
};

export default function PlansPage() {
  return <PatientPlansScreen />;
}
