'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  RefreshCw,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import Script from 'next/script';
import api from '@/lib/api';
import {
  getLinkedAccounts,
  setLinkedAccounts,
  updateSessionForSwitch,
  getFilteredAccounts,
  type LinkedAccount,
  type SessionUser,
} from '@/lib/session';

type SwitchAccountModalProps = {
  open: boolean;
  onClose: () => void;
};

const MAX_ACCOUNTS = 3;

type AddStep = 'idle' | 'google' | 'setup';

export default function SwitchAccountModal({ open, onClose }: SwitchAccountModalProps) {
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  /* ── Google-based Add Account state ── */
  const [addStep, setAddStep] = useState<AddStep>('idle');
  const [googleLoaded, setGoogleLoaded] = useState(() => typeof window !== 'undefined' && !!window.google);
  const googleInitRef = useRef(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const [addLoading, setAddLoading] = useState(false);

  // Setup form state (shown when Google email is new — no existing account)
  const [googleCredential, setGoogleCredential] = useState<string | null>(null);
  const [setupEmail, setSetupEmail] = useState('');
  const [setupName, setSetupName] = useState('');
  const [setupAvatar, setSetupAvatar] = useState<string | null>(null);
  const [setupPassword, setSetupPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Poll for window.google if not loaded yet
  useEffect(() => {
    if (googleLoaded) return;
    if (typeof window === 'undefined') return;
    if (window.google) {
      setGoogleLoaded(true);
      return;
    }
    const interval = setInterval(() => {
      if (window.google) {
        setGoogleLoaded(true);
        clearInterval(interval);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [googleLoaded]);

  /* ── Fetch all accounts linked to this phone number ── */
  const fetchAccounts = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get<{ accounts: LinkedAccount[] }>('/patient/auth/linked-accounts');
      const fetched = res.data.accounts || [];
      setAccounts(getFilteredAccounts(fetched));
      setLinkedAccounts(fetched);
    } catch {
      // Fall back to local cache
      const cached = getLinkedAccounts();
      if (cached.length > 0) setAccounts(getFilteredAccounts(cached));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void fetchAccounts();
      setShowAddForm(false);
      setJustAddedId(null);
      resetAddState();
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

  const resetAddState = () => {
    setAddStep('idle');
    setGoogleCredential(null);
    setSetupEmail('');
    setSetupName('');
    setSetupAvatar(null);
    setSetupPassword('');
    setShowPassword(false);
    setAddLoading(false);
    googleInitRef.current = false;
  };

  /* ── Switch to another account ── */
  const handleSwitch = async (targetAccountId: string) => {
    if (switching) return;
    setSwitching(targetAccountId);
    try {
      const res = await api.post<{
        accessToken: string;
        user: SessionUser;
        accounts: LinkedAccount[];
      }>('/patient/auth/switch-account', { targetAccountId });

      // Sets FORCE_FRESH_LOAD + clears SW page cache so /dashboard loads fresh
      updateSessionForSwitch(res.data.accessToken, res.data.user);
      if (res.data.accounts) setLinkedAccounts(res.data.accounts);

      toast.success(`Switched to ${res.data.user.name}`);
      window.location.href = '/dashboard';
    } catch {
      toast.error('Failed to switch account. Please try again.');
      setSwitching(null);
    }
  };

  /* ── Google GSI initialization ── */
  const initGoogle = useCallback(() => {
    const cid = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!cid || !googleLoaded || !window.google || googleInitRef.current) return;

    window.google.accounts.id.initialize({
      client_id: cid,
      cancel_on_tap_outside: true,
      callback: (response: { credential: string }) => {
        const credential = response.credential;
        if (!credential) return;
        setAddLoading(true);
        void (async () => {
        try {
          const res = await api.post<{
            // Existing account auto-switch
            existingAccount?: boolean;
            alreadyActive?: boolean;
            accessToken?: string;
            user?: SessionUser;
            accounts?: LinkedAccount[];
            message?: string;
            // New account needs setup
            requiresSetup?: boolean;
            googleEmail?: string;
            googleName?: string;
            googleAvatar?: string | null;
          }>('/patient/auth/google-add-account', { credential });

          if (res.data.alreadyActive) {
            toast.info('This is already your active account.');
            setAddLoading(false);
            setShowAddForm(false);
            return;
          }

          if (res.data.existingAccount && res.data.accessToken && res.data.user) {
            // Existing account with same phone — auto-switch
            updateSessionForSwitch(res.data.accessToken, res.data.user);
            if (res.data.accounts) setLinkedAccounts(res.data.accounts);
            toast.success(`Switched to ${res.data.user.name}`);
            window.location.href = '/dashboard';
            return;
          }

          if (res.data.requiresSetup) {
            // New Google account — show password setup form
            setGoogleCredential(credential);
            setSetupEmail(res.data.googleEmail || '');
            setSetupName(res.data.googleName || '');
            setSetupAvatar(res.data.googleAvatar || null);
            setAddStep('setup');
            setAddLoading(false);
            return;
          }

          // Unexpected response
          toast.error('Unexpected response from server.');
          setAddLoading(false);
        } catch (err) {
          const axErr = err as { response?: { data?: { message?: string } } };
          toast.error(axErr.response?.data?.message || 'Failed to add account via Google.');
          setAddLoading(false);
        }
        })();
      },
    });

    googleInitRef.current = true;
  }, [googleLoaded]);

  /* Render Google button when ready */
  useEffect(() => {
    if (!showAddForm || addStep !== 'google' || !googleLoaded || !window.google) return;

    initGoogle();

    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      const el = googleBtnRef.current;
      if (!el || !window.google) return;

      el.innerHTML = '';
      window.google.accounts.id.renderButton(el, {
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        width: el.offsetWidth || 340,
      });
    }, 100);

    return () => clearTimeout(timer);
  }, [showAddForm, addStep, googleLoaded, initGoogle]);

  /* ── Complete setup — create account with Google + password ── */
  const handleCompleteSetup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!googleCredential) {
      toast.error('Google session expired. Please try again.');
      resetAddState();
      return;
    }

    if (!setupPassword || setupPassword.length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }
    if (!/\d/.test(setupPassword)) {
      toast.error('Password must contain at least one digit.');
      return;
    }

    setAddLoading(true);
    try {
      const res = await api.post<{
        accessToken: string;
        user: SessionUser;
        accounts: LinkedAccount[];
      }>('/patient/auth/google-complete-add-account', {
        credential: googleCredential,
        password: setupPassword,
      });

      // Sets FORCE_FRESH_LOAD + clears SW page cache so /dashboard loads fresh
      updateSessionForSwitch(res.data.accessToken, res.data.user);

      // Update accounts list — show all accounts including the new one
      const serverAccounts = res.data.accounts || [];
      if (serverAccounts.length > 0) {
        setLinkedAccounts(serverAccounts);
        setAccounts(getFilteredAccounts(serverAccounts));
      } else {
        await fetchAccounts(true);
      }

      // Highlight the new account briefly
      setJustAddedId(res.data.user.id);
      setShowAddForm(false);
      resetAddState();

      toast.success(`Account "${res.data.user.name}" created! Loading your dashboard...`);

      // Redirect after a brief moment so the user can see the updated list
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 1800);
    } catch (err) {
      const axErr = err as { response?: { data?: { message?: string } } };
      toast.error(axErr.response?.data?.message || 'Failed to create account.');
    } finally {
      setAddLoading(false);
    }
  };

  const getInitials = (name: string) =>
    name
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  const activeAccount = accounts.find((a) => a.isActive);
  const slotsUsed = accounts.length;
  const canAddMore = slotsUsed < MAX_ACCOUNTS;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Google GSI Script */}
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="lazyOnload"
        onLoad={() => setGoogleLoaded(true)}
      />

      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md rounded-t-[2rem] bg-white shadow-2xl sm:rounded-2xl sm:mx-4 max-h-[90vh] overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100">
              <Users className="h-5 w-5 text-teal-700" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 leading-tight">Switch Account</h2>
              {!loading && (
                <p className="text-xs text-slate-400">
                  {slotsUsed} of {MAX_ACCOUNTS} accounts used
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Refresh button */}
            <button
              type="button"
              onClick={() => void fetchAccounts()}
              disabled={loading}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
              aria-label="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* ── Account List ── */}
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
              <p className="mt-3 text-sm text-slate-500">No linked accounts found.</p>
              <button
                type="button"
                onClick={() => void fetchAccounts()}
                className="mt-3 text-xs font-semibold text-teal-600 hover:underline"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {/* Section label */}
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 px-1">
                All accounts on this number
              </p>

              {accounts.map((account) => {
                const isJustAdded = account.id === justAddedId;
                return (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => {
                      if (!account.isActive) void handleSwitch(account.id);
                    }}
                    disabled={account.isActive || !!switching}
                    className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition ${
                      account.isActive
                        ? 'border-teal-300 bg-gradient-to-r from-teal-50 to-cyan-50 cursor-default ring-1 ring-teal-200'
                        : 'border-slate-100 bg-white hover:border-teal-200 hover:bg-teal-50/30 cursor-pointer'
                    } ${switching === account.id ? 'opacity-70' : ''}`}
                  >
                    {/* Avatar */}
                    {account.avatar ? (
                      <img
                        src={account.avatar}
                        alt={account.name}
                        className="h-11 w-11 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${
                          account.isActive
                            ? 'bg-gradient-to-br from-teal-600 to-cyan-600'
                            : isJustAdded
                            ? 'bg-gradient-to-br from-violet-500 to-purple-600'
                            : 'bg-gradient-to-br from-slate-500 to-slate-600'
                        }`}
                      >
                        {getInitials(account.name)}
                      </div>
                    )}

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {account.name}
                        </p>
                        {account.isActive && (
                          <span className="shrink-0 rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-700">
                            Active
                          </span>
                        )}
                        {isJustAdded && !account.isActive && (
                          <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700">
                            New
                          </span>
                        )}
                        {account.accountLabel && (
                          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            {account.accountLabel}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{account.email}</p>
                    </div>

                    {/* Right status */}
                    {switching === account.id ? (
                      <Loader2 className="h-5 w-5 shrink-0 animate-spin text-teal-600" />
                    ) : account.isActive ? (
                      <Check className="h-5 w-5 shrink-0 text-teal-600" />
                    ) : (
                      <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-teal-500" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Auto-redirecting notice (shown after adding a new account) ── */}
          {justAddedId && (
            <div className="flex items-center gap-2.5 rounded-2xl bg-teal-50 border border-teal-200 px-4 py-3">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-teal-600" />
              <p className="text-sm font-semibold text-teal-700">
                Loading your new account dashboard…
              </p>
            </div>
          )}

          {/* ── Slot indicator ── */}
          {!loading && accounts.length > 0 && (
            <div className="flex gap-1.5 items-center justify-center pt-1">
              {Array.from({ length: MAX_ACCOUNTS }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i < slotsUsed ? 'bg-teal-500 w-6' : 'bg-slate-200 w-4'
                  }`}
                />
              ))}
              <span className="ml-1 text-[11px] text-slate-400 font-medium">
                {slotsUsed}/{MAX_ACCOUNTS} slots
              </span>
            </div>
          )}

          {/* ── Add New Account ── */}
          {!loading && canAddMore && (
            <div className="border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => {
                  setShowAddForm((v) => {
                    if (!v) {
                      // Opening — start at Google step
                      setAddStep('google');
                    } else {
                      resetAddState();
                    }
                    return !v;
                  });
                }}
                className="flex w-full items-center justify-between rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-3 text-left transition hover:border-teal-300 hover:bg-teal-50/30"
              >
                <span className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-100">
                    <UserPlus className="h-4 w-4 text-teal-700" />
                  </div>
                  <div>
                    <span className="block text-sm font-semibold text-slate-700">Add New Account</span>
                    <span className="block text-xs text-slate-400">{MAX_ACCOUNTS - slotsUsed} slot{MAX_ACCOUNTS - slotsUsed !== 1 ? 's' : ''} remaining</span>
                  </div>
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-slate-400 transition-transform ${
                    showAddForm ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {showAddForm && (
                <div className="mt-3 rounded-2xl border border-slate-100 bg-white p-4 space-y-4">

                  {/* ── Step: Google Sign-In ── */}
                  {addStep === 'google' && (
                    <>
                      <div className="text-center space-y-2">
                        <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-500">
                          <Plus className="h-6 w-6 text-white" />
                        </div>
                        <p className="text-sm font-semibold text-slate-800">Add a new account</p>
                        <p className="text-xs text-slate-500">
                          Sign in with Google to add an account. If you already have one, we&apos;ll switch you automatically.
                        </p>
                      </div>

                      {addLoading ? (
                        <div className="flex items-center justify-center gap-2.5 py-4">
                          <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
                          <p className="text-sm font-medium text-slate-600">Checking account…</p>
                        </div>
                      ) : process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? (
                        <div className="flex justify-center">
                          <div
                            ref={googleBtnRef}
                            className="w-full max-w-[340px] min-h-[44px]"
                          />
                        </div>
                      ) : (
                        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-center">
                          <p className="text-xs text-amber-700">
                            Google Sign-In is not configured.
                          </p>
                        </div>
                      )}
                    </>
                  )}

                  {/* ── Step: Setup (password for new Google account) ── */}
                  {addStep === 'setup' && (
                    <form onSubmit={(e) => void handleCompleteSetup(e)} className="space-y-3">
                      {/* Google user info preview */}
                      <div className="flex items-center gap-3 rounded-xl bg-slate-50 border border-slate-100 p-3">
                        {setupAvatar ? (
                          <img
                            src={setupAvatar}
                            alt={setupName}
                            className="h-10 w-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-teal-600 to-cyan-600 text-sm font-bold text-white">
                            {getInitials(setupName || 'NA')}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">{setupName || 'New Account'}</p>
                          <p className="truncate text-xs text-slate-500">{setupEmail}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">
                          New
                        </span>
                      </div>

                      <p className="text-xs text-slate-500 font-medium">
                        This account will be linked to your current phone number. Please create a password to secure it.
                      </p>

                      <div className="space-y-1.5">
                        <label htmlFor="setup-pwd" className="block text-xs font-medium text-slate-600">
                          Create Password
                        </label>
                        <div className="relative">
                          <input
                            id="setup-pwd"
                            type={showPassword ? 'text' : 'password'}
                            required
                            minLength={8}
                            value={setupPassword}
                            onChange={(e) => setSetupPassword(e.target.value)}
                            disabled={addLoading}
                            placeholder="Min. 8 characters + 1 digit"
                            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 pr-10 text-sm text-slate-900 transition focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                          />
                          <button
                            type="button"
                            tabIndex={-1}
                            onClick={() => setShowPassword((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            resetAddState();
                            setAddStep('google');
                          }}
                          disabled={addLoading}
                          className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                        >
                          Back
                        </button>
                        <button
                          type="submit"
                          disabled={addLoading}
                          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
                        >
                          {addLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                          {addLoading ? 'Creating…' : 'Create Account'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Max accounts reached notice */}
          {!loading && !canAddMore && (
            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-center">
              <p className="text-xs font-semibold text-amber-700">
                Maximum {MAX_ACCOUNTS} accounts per phone number reached.
              </p>
              <p className="mt-0.5 text-xs text-amber-600">
                Remove an account to create a new one.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
