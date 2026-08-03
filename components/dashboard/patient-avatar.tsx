import { useState } from 'react';

type PatientAvatarProps = {
  avatar: string | null;
  className?: string;
  initials: string;
  name: string;
};

export default function PatientAvatar({
  avatar,
  className,
  initials,
  name,
}: PatientAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);

  if (avatar && avatar.trim() !== '' && !imgFailed) {
    return (
      <div className={`relative overflow-hidden rounded-full ${className ?? ''}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatar}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setImgFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-full bg-gradient-to-br from-teal-700 to-sky-700 font-bold text-white shrink-0 ${className ?? ''}`}
    >
      {initials}
    </div>
  );
}
