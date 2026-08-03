import type { Metadata } from 'next';
import PatientPaymentHistoryScreen from '@/components/dashboard/patient-payment-history-screen';

export const metadata: Metadata = {
  title: 'Payment History',
  description: 'View your billing and subscription purchase transaction logs.',
};

export default function PaymentHistoryPage() {
  return <PatientPaymentHistoryScreen />;
}
