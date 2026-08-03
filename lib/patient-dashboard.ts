import api from '@/lib/api';

export type DashboardHospital = {
  id: string;
  name: string;
  city: string | null;
  phone: string | null;
  address: string | null;
};

export type DashboardHospitalSummary = DashboardHospital & {
  doctorCount: number;
  visitCount: number;
  prescriptionCount: number;
  lastActivityDate: string | null;
};

export type DashboardAppointment = {
  id: string;
  doctorId: string | null;
  doctorName: string;
  department: string;
  patientFirstName: string | null;
  patientLastName: string | null;
  patientEmail: string | null;
  appointmentDate: string;
  appointmentTime: string | null;
  status: 'Scheduled' | 'Confirmed' | 'Completed' | 'Cancelled';
  consultationFee: number;
  paymentStatus: 'Pending' | 'Paid';
  appointmentPurpose: string | null;
  description: string | null;
  hospital: DashboardHospital | null;
};

export type DashboardPrescriptionMedicine = {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  schedule?: {
    morning: boolean;
    afternoon: boolean;
    night: boolean;
    morningTime: string;
    afternoonTime: string;
    nightTime: string;
  };
};

export type DashboardPrescription = {
  id: string;
  source: 'doctor_generated' | 'patient_uploaded';
  diagnosis: string;
  prescriptionDate: string;
  followUpDate: string | null;
  instruction: string;
  doctorName: string | null;
  hospital: DashboardHospital | null;
  hasPdf: boolean;
  fileName: string | null;
  fileSize: number | null;
  medicines: DashboardPrescriptionMedicine[];
};

export type DashboardActivity = {
  id: string;
  type: 'appointment' | 'prescription';
  title: string;
  subtitle: string;
  timestamp: string;
  status: string;
};

export type DashboardMonthlyVisit = {
  month: string;
  visits: number;
};

export type PatientDashboardData = {
  profile: {
    id: string;
    name: string;
    firstName: string;
    email: string;
    phone: string;
    avatar: string | null;
    initials: string;
    memberSince: string;
    lastLogin: string | null;
    prescriptionCredits: number;
    reportCredits: number;
    totalCreditsUsed?: number;
    lastCreditUsage?: string | null;
  };
  patientRecord: {
    age: number | null;
    gender: string | null;
    bloodGroup: string | null;
    emergencyContact: string | null;
    address: string | null;
    primaryHospitalName: string | null;
    height: string | null;
    weight: string | null;
    allergies: string | null;
  };
  profileCompletion: {
    percentage: number;
    completedFields: number;
    totalFields: number;
    isComplete?: boolean;
    missingFields: string[];
  };
  stats: {
    totalVisits: number;
    completedVisits: number;
    upcomingVisits: number;
    pendingPayments: number;
    prescriptionCount: number;
    activeMedicineCount: number;
    hospitalCount: number;
    careTeamCount: number;
  };
  nextAppointment: DashboardAppointment | null;
  upcomingAppointments: DashboardAppointment[];
  monthlyVisits: DashboardMonthlyVisit[];
  latestPrescription: DashboardPrescription | null;
  recentPrescriptions: DashboardPrescription[];
  hospitals: DashboardHospitalSummary[];
  recentActivity: DashboardActivity[];
};

type PatientDashboardResponse = {
  success: boolean;
  data: PatientDashboardData;
};

export const fetchPatientDashboard = async () => {
  const response = await api.get<PatientDashboardResponse>(`/patient/dashboard?_t=${Date.now()}`);
  return response.data.data;
};
