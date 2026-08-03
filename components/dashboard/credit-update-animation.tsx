'use client';

import { useEffect, useState } from 'react';

function ConfettiEffect() {
  const [particles, setParticles] = useState<Array<{
    id: number;
    left: number;
    delay: number;
    duration: number;
    color: string;
    size: number;
    shape: 'circle' | 'square' | 'triangle';
  }>>([]);

  useEffect(() => {
    const colors = ['#f43f5e', '#eab308', '#06b6d4', '#10b981', '#f97316', '#a855f7'];
    const shapes: Array<'circle' | 'square' | 'triangle'> = ['circle', 'square', 'triangle'];
    const list = Array.from({ length: 80 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 4,
      duration: 2.5 + Math.random() * 2.5,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 8 + Math.random() * 10,
      shape: shapes[Math.floor(Math.random() * shapes.length)],
    }));
    setParticles(list);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
      {particles.map((p) => {
        let borderRadius = '0px';
        let clipPath = undefined;
        if (p.shape === 'circle') {
          borderRadius = '50%';
        } else if (p.shape === 'triangle') {
          clipPath = 'polygon(50% 0%, 0% 100%, 100% 100%)';
        }

        return (
          <div
            key={p.id}
            className="animate-confetti-fall absolute"
            style={{
              left: `${p.left}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              backgroundColor: p.color,
              borderRadius,
              clipPath,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              top: '-20px',
            }}
          />
        );
      })}
    </div>
  );
}

function SadRainEffect() {
  const [drops, setDrops] = useState<Array<{
    id: number;
    left: number;
    delay: number;
    duration: number;
    size: number;
  }>>([]);

  useEffect(() => {
    const list = Array.from({ length: 40 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 3,
      duration: 1.5 + Math.random() * 1.5,
      size: 10 + Math.random() * 15,
    }));
    setDrops(list);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
      {drops.map((d) => (
        <svg
          key={d.id}
          className="animate-confetti-fall absolute text-blue-400/40"
          style={{
            left: `${d.left}%`,
            width: `${d.size}px`,
            height: `${d.size * 1.5}px`,
            animationDelay: `${d.delay}s`,
            animationDuration: `${d.duration}s`,
            top: '-30px',
          }}
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
        </svg>
      ))}
    </div>
  );
}

export type CreditUpdatePayload = {
  type: 'increase' | 'decrease';
  amount: number;
  creditType: string;
  reason: string;
};

function CreditUpdateModal({
  type,
  amount,
  creditType,
  reason,
  onClose,
}: {
  type: 'increase' | 'decrease';
  amount: number;
  creditType: string;
  reason: string;
  onClose: () => void;
}) {
  const isIncrease = type === 'increase';

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md animate-in fade-in duration-300">
      {isIncrease ? <ConfettiEffect /> : <SadRainEffect />}
      
      <div className="animate-scale-up relative w-full max-w-sm overflow-hidden rounded-[2rem] border border-white/20 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 p-6 text-center text-white shadow-2xl">
        {/* Decorative backdrop glows */}
        {isIncrease ? (
          <>
            <div className="absolute -left-16 -top-16 h-36 w-36 rounded-full bg-teal-500/20 blur-3xl" />
            <div className="absolute -right-16 -bottom-16 h-36 w-36 rounded-full bg-cyan-500/20 blur-3xl" />
          </>
        ) : (
          <>
            <div className="absolute -left-16 -top-16 h-36 w-36 rounded-full bg-rose-500/20 blur-3xl" />
            <div className="absolute -right-16 -bottom-16 h-36 w-36 rounded-full bg-red-500/20 blur-3xl" />
          </>
        )}

        {/* Floating Celebration or Sad Icon */}
        {isIncrease ? (
          <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-tr from-amber-400 to-yellow-300 shadow-[0_0_30px_rgba(245,158,11,0.5)]">
            <svg
              className="animate-star-rotate h-10 w-10 text-slate-900"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
            </svg>
          </div>
        ) : (
          <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-tr from-rose-600 to-red-400 shadow-[0_0_30px_rgba(239,68,68,0.5)]">
            <svg
              className="h-10 w-10 text-white animate-bounce"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.22 14.33a4 4 0 01-6.44 0M9 9h.01M15 9h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        )}

        <h2 className={`mt-5 text-2xl font-black tracking-tight ${isIncrease ? 'text-yellow-300' : 'text-rose-400'}`}>
          {isIncrease ? 'Credits Added!' : 'Credits Deducted'}
        </h2>
        <p className="mt-1 text-sm text-slate-300">
          {isIncrease 
            ? 'The administrator has added credits to your account.' 
            : 'The administrator has deducted credits from your account.'}
        </p>

        {/* Big Credit Number */}
        <div className="my-6 inline-flex flex-col items-center justify-center rounded-2xl bg-white/5 px-6 py-4 ring-1 ring-white/10 backdrop-blur-sm">
          <span className={`text-4xl font-extrabold tracking-tight ${isIncrease ? 'text-teal-400 drop-shadow-[0_0_15px_rgba(45,212,191,0.4)]' : 'text-rose-400 drop-shadow-[0_0_15px_rgba(251,113,133,0.4)]'}`}>
            {isIncrease ? `+${amount}` : `-${amount}`}
          </span>
          <span className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            {creditType === 'report' ? 'Report Credits' : 'Prescription Credits'}
          </span>
        </div>

        {/* Details */}
        <div className="rounded-xl bg-white/5 p-4 text-left ring-1 ring-white/5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Reason for adjustment
          </p>
          <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-200">
            {reason || 'Reward/Adjustment'}
          </p>
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className={`mt-6 w-full rounded-full py-3 text-sm font-bold text-white shadow-lg transition-all hover:scale-102 active:scale-98 ${
            isIncrease 
              ? 'bg-gradient-to-r from-teal-500 to-cyan-500 hover:shadow-teal-500/20' 
              : 'bg-gradient-to-r from-slate-600 to-slate-500 hover:shadow-slate-600/20'
          }`}
        >
          {isIncrease ? 'Awesome, Thanks!' : 'Understood'}
        </button>
      </div>
    </div>
  );
}

type CreditUpdateAnimationProps = {
  pendingUpdate: CreditUpdatePayload | null;
  onClose: () => void;
};

export default function CreditUpdateAnimation({ pendingUpdate, onClose }: CreditUpdateAnimationProps) {
  if (!pendingUpdate) return null;

  return (
    <CreditUpdateModal
      type={pendingUpdate.type}
      amount={pendingUpdate.amount}
      creditType={pendingUpdate.creditType}
      reason={pendingUpdate.reason}
      onClose={onClose}
    />
  );
}
