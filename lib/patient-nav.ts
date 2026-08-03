import {
  AlarmClock,
  Building2,
  CalendarPlus,
  FileText,
  FlaskConical,
  LayoutGrid,
  Pill,
  Bed,
  FolderOpen,
  type LucideIcon,
} from 'lucide-react';
import {
  PATIENT_APPOINTMENTS,
  PATIENT_DASHBOARD,
  PATIENT_HOSPITAL,
  PATIENT_PRESCRIPTIONS,
  PATIENT_REMINDERS,
  PATIENT_REPORTS,
  PATIENT_ADMISSIONS,
  PATIENT_DOCUMENTS,
} from '@/lib/routes';

/** Lab features are kept in code but hidden until a future release. */
export const SHOW_PATIENT_LAB_FEATURES = false;

export type PatientNavItem = {
  id: string;
  href?: string;
  icon: LucideIcon;
  label: string;
  active?: boolean;
  hidden?: boolean;
};

const desktopNavItemsBase: PatientNavItem[] = [
  { id: 'dashboard', href: PATIENT_DASHBOARD, icon: LayoutGrid, label: 'Dashboard' },
  { id: 'hospital', href: PATIENT_HOSPITAL, icon: Building2, label: 'My Hospital' },
  { id: 'lab', icon: FlaskConical, label: 'My Lab', hidden: !SHOW_PATIENT_LAB_FEATURES },
  { id: 'admissions', href: PATIENT_ADMISSIONS, icon: Bed, label: 'Admissions' },
  { id: 'documents', href: PATIENT_DOCUMENTS, icon: FolderOpen, label: 'My Documents' },
  { id: 'prescriptions', href: PATIENT_PRESCRIPTIONS, icon: Pill, label: 'Prescriptions' },
  { id: 'reports', href: PATIENT_REPORTS, icon: FileText, label: 'Reports' },
  { id: 'reminders', href: PATIENT_REMINDERS, icon: AlarmClock, label: 'Medicine Reminders' },
  { id: 'book', href: PATIENT_APPOINTMENTS, icon: CalendarPlus, label: 'Book Appointment' },
];

const mobileNavItemsBase: PatientNavItem[] = [
  { id: 'home', href: PATIENT_DASHBOARD, icon: LayoutGrid, label: 'Home' },
  { id: 'hospital', href: PATIENT_HOSPITAL, icon: Building2, label: 'Hospital' },
  { id: 'reminders', href: PATIENT_REMINDERS, icon: AlarmClock, label: 'Reminder' },
  { id: 'rx', href: PATIENT_PRESCRIPTIONS, icon: Pill, label: 'Rx' },
  { id: 'admissions', href: PATIENT_ADMISSIONS, icon: Bed, label: 'Admission' },
  { id: 'reports', href: PATIENT_REPORTS, icon: FileText, label: 'Report' },
];

export const getPatientDesktopNavItems = (activeId?: string) =>
  desktopNavItemsBase
    .filter((item) => !item.hidden)
    .map((item) => ({
      ...item,
      active: activeId ? item.id === activeId : item.active,
    }));

export const getPatientMobileNavItems = (activeId?: string) =>
  mobileNavItemsBase
    .filter((item) => !item.hidden)
    .map((item) => ({
      ...item,
      active: activeId ? item.id === activeId : item.active,
    }));
