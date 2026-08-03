'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Laptop,
  Loader2,
  Smartphone,
  Tablet,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';

type DeviceSession = {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  browserVersion: string;
  loginTime: string;
  lastActive: string;
  isCurrentDevice: boolean;
};

type ManageDevicesModalProps = {
  open: boolean;
  onClose: () => void;
};

export default function ManageDevicesModal({ open, onClose }: ManageDevicesModalProps) {
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [terminating, setTerminating] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: DeviceSession[] }>('/patient/auth/sessions');
      setSessions(res.data.data || []);
    } catch {
      toast.error('Failed to load active sessions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void fetchSessions();
    }
  }, [open, fetchSessions]);

  /* Close on Escape */
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const handleTerminate = async (deviceId: string) => {
    if (terminating) return;
    setTerminating(deviceId);
    try {
      await api.delete(`/patient/auth/sessions/${deviceId}`);
      toast.success('Session terminated successfully.');
      void fetchSessions();
    } catch {
      toast.error('Failed to terminate session.');
    } finally {
      setTerminating(null);
    }
  };

  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType.toLowerCase()) {
      case 'mobile':
        return <Smartphone className="h-5 w-5 text-slate-500" />;
      case 'tablet':
        return <Tablet className="h-5 w-5 text-slate-500" />;
      default:
        return <Laptop className="h-5 w-5 text-slate-500" />;
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md rounded-t-[2rem] bg-white shadow-2xl sm:rounded-2xl sm:mx-4 max-h-[85vh] overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Manage Devices</h2>
            <p className="text-xs text-slate-500">Your currently active login sessions</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            /* Skeletons */
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-4"
                >
                  <div className="h-11 w-11 animate-pulse rounded-full bg-slate-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 animate-pulse rounded-lg bg-slate-200" />
                    <div className="h-3 w-44 animate-pulse rounded-lg bg-slate-200" />
                  </div>
                </div>
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="py-8 text-center">
              <Smartphone className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">No active sessions found.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => (
                <div
                  key={session.deviceId}
                  className={`flex items-start gap-3 rounded-2xl border p-4 transition ${
                    session.isCurrentDevice
                      ? 'border-teal-200 bg-teal-50/40'
                      : 'border-slate-100 bg-white hover:border-slate-200'
                  }`}
                >
                  {/* Icon Container */}
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100">
                    {getDeviceIcon(session.deviceType)}
                  </div>

                  {/* Details */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {session.deviceName}
                      </p>
                      {session.isCurrentDevice && (
                        <span className="shrink-0 rounded-full bg-teal-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-teal-700">
                          Current Device
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 truncate">
                      {session.browserVersion}
                    </p>
                    <p className="mt-2 text-[10px] text-slate-400">
                      Login: {new Date(session.loginTime).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>

                  {/* Action */}
                  {!session.isCurrentDevice && (
                    <button
                      type="button"
                      onClick={() => void handleTerminate(session.deviceId)}
                      disabled={!!terminating}
                      className="shrink-0 rounded-xl border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 hover:border-rose-300 disabled:opacity-60 transition"
                    >
                      {terminating === session.deviceId ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        'Log out'
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
