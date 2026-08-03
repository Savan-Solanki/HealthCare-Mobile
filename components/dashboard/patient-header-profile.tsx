'use client';

import PatientAvatar from '@/components/dashboard/patient-avatar';

type PatientHeaderProfileProps = {
  name: string;
  firstName?: string;
  id: string;
  avatar: string | null;
  initials: string;
  onClick?: () => void;
};

const buildPatientCode = (value: string) => {
  const clean = String(value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `MW-${(clean.slice(-6) || '000000').padStart(6, '0')}`;
};

export default function PatientHeaderProfile({
  name,
  firstName,
  id,
  avatar,
  initials,
  onClick,
}: PatientHeaderProfileProps) {
  const displayName = firstName || name.split(/\s+/)[0] || name;
  const content = (
    <>
      <div className="min-w-0 text-right">
        <p className="max-w-[7.5rem] truncate text-sm font-semibold text-slate-950 sm:max-w-[12rem] lg:max-w-none">
          {displayName}
        </p>
        <p className="text-[10px] text-slate-500 sm:text-xs">{buildPatientCode(id)}</p>
      </div>
      <PatientAvatar avatar={avatar} className="h-11 w-11 shrink-0 text-sm sm:h-12 sm:w-12" initials={initials} name={name} />
    </>
  );

  if (!onClick) {
    return <div className="flex items-center gap-2 sm:gap-3">{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-2xl p-1 transition hover:bg-slate-50 sm:gap-3"
      aria-label="Edit profile"
    >
      {content}
    </button>
  );
}
