'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import api from '@/lib/api';

type PlatformAd = {
  id: string;
  title: string;
  businessLink: string;
  posterUrl: string | null;
};

const getDismissKey = (adId: string) => `medikwik_ad_dismissed_${adId}`;

export default function PlatformAdBanner() {
  const [ad, setAd] = useState<PlatformAd | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem('patient_access_token')) return;

    void (async () => {
      try {
        const response = await api.get<{ data?: PlatformAd[] }>('/patient/ads/active');
        const nextAd = response.data?.data?.[0];
        if (!nextAd?.posterUrl) return;
        if (sessionStorage.getItem(getDismissKey(nextAd.id))) return;
        setAd(nextAd);
        setVisible(true);
      } catch {
        // Ads are optional; ignore failures.
      }
    })();
  }, []);

  if (!visible || !ad?.posterUrl) return null;

  const handleClose = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (ad) {
      sessionStorage.setItem(getDismissKey(ad.id), '1');
    }
    setVisible(false);
  };

  const handleOpenLink = () => {
    if (ad) {
      window.open(ad.businessLink, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="relative w-full max-w-md overflow-hidden rounded-[1.75rem] border border-white/10 bg-white shadow-2xl">
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/70"
          aria-label="Close advertisement"
        >
          <X className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={handleOpenLink}
          className="block w-full text-left"
          aria-label={ad.title || 'Open advertisement'}
        >
          <img
            src={ad.posterUrl}
            alt={ad.title || 'Advertisement'}
            className="max-h-[70vh] w-full object-cover"
          />
          {ad.title ? (
            <div className="border-t border-slate-100 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">{ad.title}</p>
              <p className="mt-1 text-xs text-teal-700">Tap poster to visit partner website</p>
            </div>
          ) : null}
        </button>
      </div>
    </div>
  );
}
