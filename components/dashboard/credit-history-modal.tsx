'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Coins,
  Loader2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';

type CreditTransaction = {
  id: string;
  creditType: 'report' | 'prescription';
  type: 'addition' | 'consumption';
  amount: number;
  reason: string;
  performedBy: 'system' | 'admin';
  createdAt: string;
};

type CreditHistoryModalProps = {
  open: boolean;
  onClose: () => void;
};

export default function CreditHistoryModal({ open, onClose }: CreditHistoryModalProps) {
  const [history, setHistory] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: CreditTransaction[] }>('/patient/credits/history');
      setHistory(res.data.data || []);
    } catch {
      toast.error('Failed to load credit history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void fetchHistory();
    }
  }, [open, fetchHistory]);

  /* Close on Escape */
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

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
            <h2 className="text-lg font-bold text-slate-900">Credit History</h2>
            <p className="text-xs text-slate-500">History of your welcome bonuses & usage</p>
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
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-4"
                >
                  <div className="h-10 w-10 animate-pulse rounded-full bg-slate-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-24 animate-pulse rounded-lg bg-slate-200" />
                    <div className="h-3 w-40 animate-pulse rounded-lg bg-slate-200" />
                  </div>
                </div>
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="py-10 text-center">
              <Coins className="mx-auto h-12 w-12 text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-500">No transactions yet</p>
              <p className="mt-1 text-xs text-slate-400">Credits are automatically logged when accounts are created or files are uploaded.</p>
            </div>
          ) : (
            <div className="relative border-l-2 border-slate-100 pl-4 ml-3 my-2 space-y-6">
              {history.map((tx) => {
                const isAddition = tx.type === 'addition';
                const formattedDate = new Date(tx.createdAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                });

                return (
                  <div key={tx.id} className="relative">
                    {/* Circle marker on line */}
                    <span className={`absolute -left-[25px] top-1 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white ${
                      isAddition ? 'bg-emerald-500' : 'bg-rose-500'
                    }`} />

                    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                            tx.creditType === 'report'
                              ? 'bg-indigo-50 text-indigo-700'
                              : 'bg-teal-50 text-teal-700'
                          }`}>
                            {tx.creditType} credit
                          </span>
                          <h4 className="mt-1.5 text-sm font-bold text-slate-900 leading-tight">
                            {tx.reason}
                          </h4>
                          <p className="mt-1 text-[10px] text-slate-400">
                            {formattedDate} • Performed by {tx.performedBy}
                          </p>
                        </div>

                        {/* Amount */}
                        <div className={`flex items-center text-sm font-black whitespace-nowrap ${
                          isAddition ? 'text-emerald-600' : 'text-rose-600'
                        }`}>
                          {isAddition ? (
                            <ArrowUpRight className="h-4 w-4 shrink-0" />
                          ) : (
                            <ArrowDownRight className="h-4 w-4 shrink-0" />
                          )}
                          {isAddition ? '+' : '-'}{tx.amount}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
