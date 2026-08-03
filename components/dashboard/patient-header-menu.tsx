'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CalendarDays, CreditCard, FolderOpen, History, MoreVertical, Pill, Receipt, UserRound, Users } from 'lucide-react';
import PatientAvatar from '@/components/dashboard/patient-avatar';
import { PATIENT_APPOINTMENTS, PATIENT_DOCUMENTS, PATIENT_HELP_CENTER, PATIENT_NOTIFICATIONS, PATIENT_PAYMENT_HISTORY, PATIENT_PLANS, PATIENT_PROFILE, PATIENT_RECEIPTS, PATIENT_REMINDERS } from '@/lib/routes';
import { getUnreadCount } from '@/lib/patient-notifications';
import { getActiveReminderCount } from '@/lib/patient-reminders';
import { getLinkedAccounts } from '@/lib/session';
import SwitchAccountModal from '@/components/dashboard/switch-account-modal';

type PatientHeaderMenuProps = {
  name: string;
  firstName?: string;
  id: string;
  avatar: string | null;
  initials: string;
};

const buildPatientCode = (value: string) => {
  const clean = String(value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `MW-${(clean.slice(-6) || '000000').padStart(6, '0')}`;
};

export default function PatientHeaderMenu({
  name,
  firstName,
  id,
  avatar,
  initials,
}: PatientHeaderMenuProps) {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeReminders, setActiveReminders] = useState(0);
  const [linkedCount, setLinkedCount] = useState(0);
  const [switchModalOpen, setSwitchModalOpen] = useState(false);
  const displayName = firstName || name.split(/\s+/)[0] || name;

  /* ── Fetch counts on mount ─────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;

    getUnreadCount().then((count) => {
      if (cancelled) return;
      setUnreadCount(count);
    });

    // Read linked accounts count from local cache
    setLinkedCount(getLinkedAccounts().length);

    return () => {
      cancelled = true;
    };
  }, []);

  /* ── Close on outside click ────────────────────────────────────── */
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  /* ── Badge helper (total indicator on 3-dot button) ────────────── */
  const totalBadge = unreadCount;

  return (
    <div className="relative flex items-center gap-2 sm:gap-3" ref={menuRef}>
      <div className="min-w-0 text-right">
        <p className="max-w-[7.5rem] truncate text-sm font-semibold text-slate-950 sm:max-w-[12rem] lg:max-w-none">
          {displayName}
        </p>
        <p className="text-[10px] text-slate-500 sm:text-xs">{buildPatientCode(id)}</p>
      </div>

      <PatientAvatar
        avatar={avatar}
        className="h-11 w-11 shrink-0 text-sm sm:h-12 sm:w-12"
        initials={initials}
        name={name}
      />

      {/* ─── 3-dot trigger ──────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
        aria-label="Open menu"
        aria-expanded={open}
      >
        <MoreVertical className="h-5 w-5" />
        {totalBadge > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white">
            {totalBadge > 99 ? '99+' : totalBadge}
          </span>
        ) : null}
      </button>

      {/* ─── Dropdown menu ──────────────────────────────────────── */}
      {open ? (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-60 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          {/* Profile card */}
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-3">
              <PatientAvatar
                avatar={avatar}
                className="h-12 w-12 text-sm"
                initials={initials}
                name={name}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">{name}</p>
                <p className="text-xs text-slate-500">{buildPatientCode(id)}</p>
              </div>
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1">
            {/* Notifications */}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push(PATIENT_NOTIFICATIONS);
              }}
              className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <span className="flex items-center gap-2.5">
                <Bell className="h-4 w-4 text-teal-600" />
                Notifications
              </span>
              {unreadCount > 0 ? (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : null}
            </button>

            {/* Switch Account */}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setSwitchModalOpen(true);
              }}
              className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <span className="flex items-center gap-2.5">
                <Users className="h-4 w-4 text-teal-600" />
                Switch Account
              </span>
              {linkedCount > 1 ? (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-teal-100 px-1.5 text-[10px] font-bold text-teal-700">
                  {linkedCount}
                </span>
              ) : null}
            </button>

            {/* Divider */}
            <div className="mx-3 my-1 border-t border-slate-100" />

            {/* View profile */}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push(PATIENT_PROFILE);
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <UserRound className="h-4 w-4 text-teal-600" />
              View profile
            </button>

            {/* My Appointments */}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push(`${PATIENT_APPOINTMENTS}?view=list`);
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <CalendarDays className="h-4 w-4 text-teal-600" />
              My Appointments
            </button>

            {/* Receipts */}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push(PATIENT_RECEIPTS);
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <Receipt className="h-4 w-4 text-teal-600" />
              Receipts
            </button>

            {/* Documents */}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push(PATIENT_DOCUMENTS);
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <FolderOpen className="h-4 w-4 text-teal-600" />
              Documents
            </button>

            {/* Plans & Subscription */}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push(PATIENT_PLANS);
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <CreditCard className="h-4 w-4 text-teal-600" />
              Plans & Subscription
            </button>

            {/* Payment History */}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push(PATIENT_PAYMENT_HISTORY);
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <History className="h-4 w-4 text-teal-600" />
              Payment History
            </button>

            {/* Help Center */}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push(PATIENT_HELP_CENTER);
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <span className="text-base select-none shrink-0 w-4 h-4 flex items-center justify-center">🆘</span>
              Help Center
            </button>
          </div>
        </div>
      ) : null}

      <SwitchAccountModal open={switchModalOpen} onClose={() => setSwitchModalOpen(false)} />
    </div>
  );
}
