'use client';

import { useCallback, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { Check, X, ZoomIn } from 'lucide-react';
import { toast } from 'sonner';
import { getCroppedAvatarDataUrl } from '@/lib/avatar-image';

interface AvatarCropModalProps {
  imageSrc: string;
  onCancel: () => void;
  onComplete: (dataUrl: string) => void;
}

export default function AvatarCropModal({ imageSrc, onCancel, onComplete }: AvatarCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);

  const onCropComplete = useCallback((_croppedArea: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleApply = async () => {
    if (!croppedAreaPixels) return;

    try {
      setProcessing(true);
      const dataUrl = await getCroppedAvatarDataUrl(imageSrc, croppedAreaPixels);
      onComplete(dataUrl);
    } catch {
      toast.error('Unable to crop image. Please try another photo.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-lg font-bold text-slate-950">Crop profile photo</h3>
            <p className="text-xs text-slate-500">Drag to reposition and use the slider to zoom.</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100"
            aria-label="Close crop editor"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative h-72 bg-slate-900 sm:h-80">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        <div className="space-y-4 px-5 py-4">
          <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
            <ZoomIn className="h-4 w-4 text-teal-600" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="h-2 flex-1 cursor-pointer accent-teal-600"
            />
          </label>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={processing}
              className="min-h-11 flex-1 rounded-full border border-slate-200 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleApply()}
              disabled={processing || !croppedAreaPixels}
              className="min-h-11 flex-1 rounded-full bg-gradient-to-r from-teal-700 to-sky-700 text-sm font-bold text-white transition hover:brightness-105 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Check className="h-4 w-4" />
              {processing ? 'Saving...' : 'Use photo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
