'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import {
  getLinkedAccounts,
  setLinkedAccounts,
  removeAccountFromDevice,
  getFilteredAccounts,
  type LinkedAccount,
} from '@/lib/session';

type ManageAccountsModalProps = {
  open: boolean;
  onClose: () => void;
};

export default function ManageAccountsModal({ open, onClose }: ManageAccountsModalProps) {
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [labelValue, setLabelValue] = useState('');
  const [savingLabel, setSavingLabel] = useState(false);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ accounts: LinkedAccount[] }>('/patient/auth/linked-accounts');
      const fetched = res.data.accounts || [];
      setAccounts(getFilteredAccounts(fetched));
      setLinkedAccounts(fetched);
    } catch {
      setAccounts(getFilteredAccounts(getLinkedAccounts()));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void fetchAccounts();
      setEditingLabel(null);
    }
  }, [open, fetchAccounts]);

  /* Close on Escape */
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const startEditLabel = (account: LinkedAccount) => {
    setEditingLabel(account.id);
    setLabelValue(account.accountLabel || '');
  };

  const handleSaveLabel = async (accountId: string) => {
    if (!labelValue.trim()) {
      toast.error('Label cannot be empty.');
      return;
    }

    setSavingLabel(true);
    try {
      await api.patch('/patient/auth/update-account-label', {
        accountLabel: labelValue.trim(),
      });
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === accountId ? { ...a, accountLabel: labelValue.trim() } : a
        )
      );
      // Also update local cache
      const cached = getLinkedAccounts().map((a) =>
        a.id === accountId ? { ...a, accountLabel: labelValue.trim() } : a
      );
      setLinkedAccounts(cached);
      toast.success('Account label updated.');
      setEditingLabel(null);
    } catch (err) {
      const axErr = err as { response?: { data?: { message?: string } } };
      toast.error(axErr.response?.data?.message || 'Failed to update label.');
    } finally {
      setSavingLabel(false);
    }
  };

  const handleRemoveFromDevice = (account: LinkedAccount) => {
    removeAccountFromDevice(account.id);
    setAccounts((prev) => prev.filter((a) => a.id !== account.id));
    toast.success(`"${account.name}" removed from this device.`);
  };

  const getInitials = (name: string) => {
    return name
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
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
          <div className="flex items-center gap-2.5">
            <Users className="h-5 w-5 text-teal-600" />
            <h2 className="text-lg font-bold text-slate-900">Manage Accounts</h2>
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
          ) : accounts.length === 0 ? (
            <div className="py-8 text-center">
              <Users className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">No linked accounts.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className={`rounded-2xl border p-4 ${
                    account.isActive
                      ? 'border-teal-200 bg-teal-50/40'
                      : 'border-slate-100 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    {account.avatar ? (
                      <img
                        src={account.avatar}
                        alt={account.name}
                        className="h-11 w-11 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-teal-600 to-cyan-600 text-sm font-bold text-white">
                        {getInitials(account.name)}
                      </div>
                    )}

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {account.name}
                        </p>
                        {account.isActive && (
                          <span className="flex items-center gap-1 shrink-0 text-[10px] font-bold text-teal-600">
                            <Check className="h-3 w-3" /> Active
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{account.email}</p>
                    </div>
                  </div>

                  {/* Label editing (only active account) */}
                  {editingLabel === account.id ? (
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        type="text"
                        value={labelValue}
                        onChange={(e) => setLabelValue(e.target.value)}
                        disabled={savingLabel}
                        placeholder="e.g. Primary, Family"
                        className="h-9 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-900 transition focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => void handleSaveLabel(account.id)}
                        disabled={savingLabel}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600 text-white transition hover:bg-teal-700 disabled:opacity-50"
                        aria-label="Save label"
                      >
                        {savingLabel ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingLabel(null)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:bg-slate-50"
                        aria-label="Cancel edit"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        {account.accountLabel || 'No label'}
                      </span>

                      {/* Only active account can rename */}
                      {account.isActive && (
                        <button
                          type="button"
                          onClick={() => startEditLabel(account)}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-teal-600 transition hover:bg-teal-50"
                        >
                          <Pencil className="h-3 w-3" /> Rename
                        </button>
                      )}

                      {/* Remove non-active accounts */}
                      {!account.isActive && (
                        <button
                          type="button"
                          onClick={() => handleRemoveFromDevice(account)}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-red-500 transition hover:bg-red-50"
                        >
                          <Trash2 className="h-3 w-3" /> Remove from device
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add Account shortcut */}
          {!loading && accounts.length < 3 && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  // Dispatch event to open Switch Account modal with add-account flow
                  window.dispatchEvent(new CustomEvent('open-switch-account'));
                }}
                className="flex w-full items-center gap-2.5 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-teal-300 hover:bg-teal-50/30"
              >
                <Plus className="h-4 w-4 text-teal-600" />
                Add Account
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
