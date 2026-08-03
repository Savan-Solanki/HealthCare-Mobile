'use client';

import {
  useCallback, useEffect, useId, useRef, useState,
} from 'react';
import Script from 'next/script';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Loader2, ArrowLeft, Eye, EyeOff,
  Phone, Mail, Lock, User,
  CheckCircle2, ShieldCheck, HeartPulse,
  Smartphone, Tablet, Laptop,
} from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { initSession, setLinkedAccounts, isSessionValid, type LinkedAccount } from '@/lib/session';
import { requestNotificationPermission } from '@/lib/firebase-messaging';

/*  Cloudflare Turnstile  */
declare global {
  interface Window {
    turnstile?: {
      render: (
        el: string | HTMLElement,
        opts: {
          sitekey: string;
          callback?: (t: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
          theme?: 'light' | 'dark' | 'auto';
        }
      ) => string;
      remove: (id: string) => void;
      reset: (id?: string) => void;
    };
    google?: {
      accounts: {
        id: {
          initialize: (cfg: {
            client_id: string;
            callback: (r: { credential: string }) => void;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (
            el: HTMLElement,
            cfg: {
              theme?: string; size?: string; text?: string;
              shape?: string; width?: number;
            }
          ) => void;
        };
      };
    };
  }
}

/*  Helpers  */
const apiErrMsg = (err: unknown, fallback: string): string => {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const r = err as { response?: { status?: number; data?: { message?: string; retryAfterSeconds?: number } } };
    if (r.response?.status === 429) {
      const waitSecs = r.response?.data?.retryAfterSeconds;
      if (waitSecs && waitSecs > 60) {
        const mins = Math.ceil(waitSecs / 60);
        return `Too many attempts. Please wait ${mins} minute${mins > 1 ? 's' : ''} before trying again.`;
      }
      return 'Too many attempts. Please wait a moment before trying again.';
    }
    if (r.response?.status === 409) return 'This mobile number is already registered.';
    return r.response?.data?.message || fallback;
  }
  if (typeof err === 'object' && err !== null) {
    const netErr = err as { code?: string; message?: string; request?: unknown };
    if (netErr.code === 'ECONNABORTED') {
      return 'The server took too long to respond. Please try again in a moment.';
    }
    if (netErr.code === 'ERR_NETWORK' || netErr.request) {
      return 'Cannot reach the production API. Please check your connection and try again.';
    }
    if (netErr.message) {
      return netErr.message;
    }
  }
  return fallback;
};

type Mode = 'login' | 'signup';
type Step = 'auth' | 'mobile' | 'otp' | 'forgot' | 'forgot-otp' | 'done';

/*  Small UI bits  */
function Spinner() {
  return (
    <svg className="spin" width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83
               M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

function FeatureRow({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2.5 text-teal-100 text-sm">
      <span className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center shrink-0">
        <Icon className="w-3 h-3" />
      </span>
      {label}
    </div>
  );
}

/*  Main component  */
export default function PatientAuthScreen() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  /* Turnstile */
  const tsId      = useId().replace(/:/g, 'ts');
  const tsWidget  = useRef<string | null>(null);
  const tsSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const [turnstileLoaded, setTurnstileLoaded] = useState(false);

  /* Google */
  const gId = useId().replace(/:/g, 'gs');
  const googleInitialized = useRef(false);
  const [googleLoaded, setGoogleLoaded] = useState(false);
  const [googleLoadError, setGoogleLoadError] = useState(false);
  const [googleLoadTimeout, setGoogleLoadTimeout] = useState(false);
  const [googleScriptKey, setGoogleScriptKey] = useState(0);
  const [googleRendered, setGoogleRendered] = useState(false);
  const [isOffline, setIsOffline] = useState(typeof window !== 'undefined' ? !navigator.onLine : false);
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (isSessionValid()) {
      router.replace('/dashboard');
    }
  }, [router]);

  useEffect(() => {
    if (googleLoaded || isOffline) return;
    const timer = setTimeout(() => {
      if (!googleLoaded) {
        setGoogleLoadTimeout(true);
      }
    }, 6000);
    return () => clearTimeout(timer);
  }, [googleLoaded, googleScriptKey, isOffline]);

  const handleRetryGoogleLoad = useCallback(() => {
    setGoogleLoadError(false);
    setGoogleLoadTimeout(false);
    setGoogleRendered(false);
    googleInitialized.current = false;
    setGoogleScriptKey(k => k + 1);
  }, []);

  const handlePlaceholderClick = useCallback(() => {
    if (isOffline) {
      setErrMsg('You are currently offline. Please check your internet connection.');
      return;
    }

    if (googleLoaded && !googleRendered) {
      setErrMsg(
        'Google Sign-In is currently unavailable. Please verify your internet connection, ' +
        'disable Brave shields or ad-blockers for this site, or sign in using your email.'
      );
      return;
    }

    handleRetryGoogleLoad();
    setErrMsg('Connecting to Google Sign-In services...');
    setTimeout(() => {
      setErrMsg(prev => prev === 'Connecting to Google Sign-In services...' ? '' : prev);
    }, 5000);
  }, [isOffline, googleLoaded, googleRendered, handleRetryGoogleLoad]);

  /* State */
  const initMode: Mode = searchParams.get('tab') === 'signup' ? 'signup' : 'login';
  const [mode, setMode] = useState<Mode>(initMode);
  const [step, setStep] = useState<Step>('auth');
  const [flowEmail, setFlowEmail] = useState('');

  const googleButtonLabel =
    googleLoadError || googleLoadTimeout
      ? 'Retry Google Sign-In'
      : mode === 'login'
        ? 'Sign in with Google'
        : 'Sign up with Google';

  /* Login */
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPwd,  setShowPwd]  = useState(false);

  /* Signup extras */
  const [fullName,       setFullName]       = useState('');
  const [sEmail,         setSEmail]         = useState('');
  const [sPwd,           setSPwd]           = useState('');
  const [sCPwd,          setSCPwd]          = useState('');
  const [showSPwd,       setShowSPwd]       = useState(false);
  const [showSCPwd,      setShowSCPwd]      = useState(false);
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);
  const [setupPwd,           setSetupPwd]           = useState('');
  const [setupCPwd,          setSetupCPwd]          = useState('');
  const [showSetupPwd,       setShowSetupPwd]       = useState(false);
  const [showSetupCPwd,      setShowSetupCPwd]      = useState(false);

  /* Mobile */
  const [cc,     setCc]     = useState('+91');
  const [mobile, setMobile] = useState('');

  /* OTP */
  const [otp,    setOtp]    = useState(['', '', '', '', '', '']);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const otpVal  = otp.join('');

  /* Misc */
  const [tsToken,    setTsToken]    = useState('');
  const [googleCred, setGoogleCred] = useState('');
  const [loading,    setLoading]    = useState(false);
  const [resend,     setResend]     = useState(0);
  const [resetEmail, setResetEmail] = useState('');
  const [resetPwd,   setResetPwd]   = useState('');
  const [resetCPwd,  setResetCPwd]  = useState('');
  const [showResetPwd,  setShowResetPwd]  = useState(false);
  const [showResetCPwd, setShowResetCPwd] = useState(false);
  const [resetResend, setResetResend] = useState(0);

  /* Max devices handling */
  const [limitReachedSessions, setLimitReachedSessions] = useState<any[]>([]);
  const [pendingRequest, setPendingRequest] = useState<{ url: string; data: any } | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  /*  Turnstile  */
  const removeTs = useCallback(() => {
    const widgetId = tsWidget.current;
    const el = document.getElementById(tsId);

    if (widgetId && window.turnstile) {
      try {
        window.turnstile.remove(widgetId);
      } catch {
        // Ignore stale widget ids during fast UI transitions.
      }
    }

    tsWidget.current = null;
    if (el) {
      el.innerHTML = '';
    }
  }, [tsId]);

  const resetTs = useCallback(() => {
    setTsToken('');
    if (tsWidget.current && window.turnstile) {
      window.turnstile.reset(tsWidget.current);
    }
  }, []);

  const renderTs = useCallback(() => {
    if (!tsSiteKey || !turnstileLoaded || !window.turnstile || tsWidget.current) return;
    const el = document.getElementById(tsId);
    if (!el) return;

    el.innerHTML = '';
    tsWidget.current = window.turnstile.render(el, {
      sitekey: tsSiteKey,
      theme: 'light',
      callback: (t) => { setTsToken(t); setErrMsg(''); },
      'expired-callback': () => setTsToken(''),
      'error-callback':   () => { setTsToken(''); setErrMsg('Captcha failed. Please retry.'); },
    });
  }, [setErrMsg, tsId, tsSiteKey, turnstileLoaded]);

  /*  Auth success  */
  const onSuccess = useCallback((rawData: any) => {
    console.log('[Auth] onSuccess triggered, rawData type:', typeof rawData);
    
    let data = rawData;
    if (typeof rawData === 'string') {
      try {
        console.log('[Auth] Received raw string in onSuccess. Attempting to extract JSON...');
        const jsonStartIndex = rawData.indexOf('{');
        if (jsonStartIndex !== -1) {
          const jsonStr = rawData.substring(jsonStartIndex);
          data = JSON.parse(jsonStr);
          console.log('[Auth] Successfully parsed JSON from raw string:', JSON.stringify(data));
        } else {
          console.error('[Auth] Raw string does not contain JSON block:', rawData);
        }
      } catch (parseErr) {
        console.error('[Auth] Failed to parse raw string data:', parseErr);
      }
    } else {
      console.log('[Auth] onSuccess data:', JSON.stringify(data));
    }

    // Robust token and user extraction
    let token = '';
    let userPayload: any = null;

    if (data) {
      if (typeof data === 'string') {
        if (data.startsWith('eyJ') && data.includes('.')) {
          token = data;
        }
      } else if (typeof data === 'object') {
        token = data.accessToken || data.token || data.sessionToken ||
                data.data?.accessToken || data.data?.token || data.data?.sessionToken;
        userPayload = data.user || data.data?.user;
      }
    }

    if (token) {
      try {
        const user = (userPayload || {}) as { id?: string; name?: string; email?: string; phone?: string; avatar?: string | null };
        
        let userId = user.id || '';
        if (!userId) {
          try {
            const parts = token.split('.');
            if (parts.length === 3) {
              const decoded = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
              userId = decoded.id || '';
            }
          } catch (jwtErr) {
            console.warn('[Auth] Failed to decode JWT for user ID fallback:', jwtErr);
          }
        }

        console.log('[Auth] Initializing session for user ID:', userId);
        initSession(token, {
          id: userId,
          name: user.name || '',
          email: user.email || '',
          phone: user.phone || '',
          avatar: user.avatar || null,
        });

        // Sync notification token immediately if permission is already granted.
        // If the permission is 'default' or 'denied', the dashboard page will handle showing the appropriate banner/modal.
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          requestNotificationPermission().catch((err) => {
            console.warn('[Auth] Notification sync error:', err);
          });
        }
        
        console.log('[Auth] Session initialized successfully. Fetching linked accounts...');
        // Fetch linked accounts after successful login
        api.get<{ data?: LinkedAccount[] }>('/patient/auth/linked-accounts')
          .then((res) => {
            console.log('[Auth] Linked accounts response:', JSON.stringify(res.data));
            if (res.data.data) setLinkedAccounts(res.data.data);
          })
          .catch((err) => {
            console.warn('[Auth] Fetching linked accounts failed:', err);
          });
        
        setStep('done');
        console.log('[Auth] Navigating to /dashboard in 1.4 seconds...');
        setTimeout(() => {
          console.log('[Auth] Replacing route with /dashboard now.');
          router.replace('/dashboard');
        }, 1400);
      } catch (err) {
        console.error('[Auth] Exception in onSuccess processing:', err);
        toast.error(`Session setup failed: ${err instanceof Error ? err.message : String(err)}`);
        setErrMsg(`Session setup failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      const payloadString = typeof data === 'object' ? JSON.stringify(data) : String(data);
      console.error('[Auth] onSuccess called but accessToken is missing. Data:', payloadString);
      toast.error(`Authentication succeeded on server, but no session token was received. Payload: ${payloadString}`);
      setErrMsg(`Authentication succeeded, but no session token was received. Payload: ${payloadString}`);
    }
  }, [router, setErrMsg]);

  /*  Google  */
  const initGoogle = useCallback(() => {
    const cid = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!cid || !googleLoaded || !window.google || googleInitialized.current) return;

    window.google.accounts.id.initialize({
      client_id: cid,
      cancel_on_tap_outside: true,
      callback: async ({ credential }) => {
        setErrMsg('');
        try {
          setLoading(true);
          const res = await api.post('/patient/auth/google-login', { credential });
          if (res.data.requiresMobile) {
            setGoogleCred(credential);
            setFlowEmail(res.data.email || '');
            setNeedsPasswordSetup(!!res.data.requiresPasswordSetup);
            setSetupPwd('');
            setSetupCPwd('');
            setOtp(['', '', '', '', '', '']);
            setResend(0);
            setStep('mobile');
          } else {
            onSuccess(res.data);
          }
        } catch (err: any) {
          if (err?.response?.data?.code === 'MAX_DEVICES_REACHED') {
            setLimitReachedSessions(err.response.data.sessions || []);
            setPendingRequest({
              url: '/patient/auth/google-login',
              data: { credential }
            });
          } else {
            setErrMsg(apiErrMsg(err, 'Google Sign-In failed. Please try again.'));
          }
        } finally {
          setLoading(false);
        }
      },
    });

    googleInitialized.current = true;
  }, [googleLoaded, onSuccess, setErrMsg]);

  const renderGoogleButton = useCallback(() => {
    if (!googleLoaded || !window.google || step !== 'auth') return;

    const el = document.getElementById(gId);
    if (!el) return;

    el.innerHTML = '';
    window.google.accounts.id.renderButton(el, {
      theme: 'outline', size: 'large',
      text: mode === 'login' ? 'signin_with' : 'signup_with',
      shape: 'pill', width: el.offsetWidth || 340,
    });

    // Verify if Google GSI rendered elements successfully (disallowed origins render nothing)
    if (el.children.length > 0) {
      setGoogleRendered(true);
    } else {
      setGoogleRendered(false);
      console.warn('[FCM] Google Sign-In button container has no child elements after render.');
    }
  }, [gId, googleLoaded, mode, step]);

  /*  Effects  */
  useEffect(() => {
    const err = searchParams.get('error');
    if (err) { alert(err); router.replace('/login'); }

    // Show expired session toast
    if (searchParams.get('expired') === '1') {
      toast.error('Your session has expired. Please login again.');
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (step !== 'auth') {
      removeTs();
      return;
    }

    renderTs();
    initGoogle();

    const renderTimer = window.setTimeout(() => {
      renderGoogleButton();
    }, 0);

    return () => window.clearTimeout(renderTimer);
  }, [initGoogle, removeTs, renderGoogleButton, renderTs, step]);

  useEffect(() => {
    if (resend <= 0) return;
    const id = setInterval(() => setResend(s => s > 0 ? s - 1 : 0), 1000);
    return () => clearInterval(id);
  }, [resend]);

  useEffect(() => {
    if (resetResend <= 0) return;
    const id = setInterval(() => setResetResend(s => s > 0 ? s - 1 : 0), 1000);
    return () => clearInterval(id);
  }, [resetResend]);

  useEffect(() => () => {
    removeTs();
  }, [removeTs]);

  /*  OTP helpers  */
  const changeOtp = (i: number, v: string) => {
    const d = v.replace(/\D/g, '').slice(-1);
    const next = [...otp]; next[i] = d; setOtp(next);
    if (d && i < 5) otpRefs.current[i + 1]?.focus();
  };
  const keyOtp = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
  };
  const pasteOtp = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const p = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (p.length === 6) setOtp(p.split(''));
  };

  /*  Switch mode  */
  const switchMode = (m: Mode) => {
    setMode(m); setStep('auth'); setErrMsg('');
    setEmail(''); setPassword('');
    setFullName(''); setSEmail(''); setSPwd(''); setSCPwd('');
    setFlowEmail('');
    setNeedsPasswordSetup(false);
    setSetupPwd(''); setSetupCPwd('');
    setMobile(''); setOtp(['', '', '', '', '', '']);
    setTsToken(''); setGoogleCred('');
    setResetEmail(''); setResetPwd(''); setResetCPwd('');
    setResend(0); setResetResend(0);
    setGoogleRendered(false);
    removeTs();
  };

  const openForgotPassword = () => {
    setErrMsg('');
    setOtp(['', '', '', '', '', '']);
    setResetEmail((email || flowEmail).trim().toLowerCase());
    setResetPwd('');
    setResetCPwd('');
    setResetResend(0);
    setStep('forgot');
  };

  /*  Login  */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setErrMsg('');
    if (!email || !password) { setErrMsg('Enter email and password.'); return; }
    if (tsSiteKey && !tsToken) { setErrMsg('Complete the security check.'); return; }
    try {
      setLoading(true);
      const res = await api.post('/patient/auth/login', { email, password, turnstileToken: tsToken });
      if (res.data.requiresMobile) { setStep('mobile'); return; }
      if (res.data.requiresOtp)    { setResend(res.data.otpExpiresIn || 120); setStep('otp'); return; }
      onSuccess(res.data);
    } catch (err: any) {
      if (err?.response?.data?.code === 'MAX_DEVICES_REACHED') {
        setLimitReachedSessions(err.response.data.sessions || []);
        setPendingRequest({
          url: '/patient/auth/login',
          data: { email, password, turnstileToken: tsToken }
        });
      } else {
        const m = apiErrMsg(err, 'Login failed. Please try again.');
        setErrMsg(m); resetTs();
      }
    } finally { setLoading(false); }
  };

  /*  Signup  */
  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault(); setErrMsg('');
    if (!fullName || !sEmail || !sPwd || !sCPwd) { setErrMsg('Fill all fields.'); return; }
    if (sPwd !== sCPwd) { setErrMsg('Passwords do not match.'); return; }
    if (sPwd.length < 8) { setErrMsg('Password must be at least 8 characters.'); return; }
    if (tsSiteKey && !tsToken) { setErrMsg('Complete the security check.'); return; }
    setStep('mobile');
  };

  /*  Mobile submit  */
  const handleMobile = async (e: React.FormEvent) => {
    e.preventDefault(); setErrMsg('');
    if (mobile.length !== 10) { setErrMsg('Enter a valid 10-digit mobile number.'); return; }
    if (googleCred && needsPasswordSetup) {
      if (!setupPwd || !setupCPwd) { setErrMsg('Create and confirm your password.'); return; }
      if (setupPwd !== setupCPwd) { setErrMsg('Passwords do not match.'); return; }
      if (setupPwd.length < 8 || !/\d/.test(setupPwd)) {
        setErrMsg('Password must be at least 8 characters and contain a number.');
        return;
      }
    }
    const full = `${cc}${mobile}`;
    let url = '';
    let requestData: any = {};
    if (googleCred) {
      url = '/patient/auth/google-mobile';
      requestData = {
        credential: googleCred,
        mobile: full,
        ...(needsPasswordSetup ? { password: setupPwd } : {}),
      };
    } else if (mode === 'signup') {
      url = '/patient/auth/register';
      requestData = {
        fullName, email: sEmail, password: sPwd, mobile: full, turnstileToken: tsToken,
      };
    } else {
      url = '/patient/auth/add-mobile';
      requestData = { email, mobile: full };
    }
    try {
      setLoading(true);
      const res = await api.post(url, requestData);
      if (res.data.accessToken) {
        onSuccess(res.data);
      } else {
        setFlowEmail(res.data.email || flowEmail);
        setOtp(['', '', '', '', '', '']);
        setResend(res.data.otpExpiresIn || 120);
        setStep('otp');
      }
    } catch (err: any) {
      if (err?.response?.data?.code === 'MAX_DEVICES_REACHED') {
        setLimitReachedSessions(err.response.data.sessions || []);
        setPendingRequest({ url, data: requestData });
      } else {
        setErrMsg(apiErrMsg(err, 'Failed to send OTP.'));
      }
    } finally { setLoading(false); }
  };

  /*  Verify OTP  */
  const handleOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpVal.length < 6) { setErrMsg('Enter the 6-digit OTP.'); return; }
    const full = `${cc}${mobile}`;
    let url = '';
    let requestData: any = {};
    if (googleCred) {
      url = '/patient/auth/verify-google-otp';
      requestData = { credential: googleCred, mobile: full, otp: otpVal };
    } else {
      url = '/patient/auth/verify-otp';
      requestData = {
        email: mode === 'login' ? email : sEmail, mobile: full, otp: otpVal, mode,
      };
    }
    try {
      setLoading(true);
      const res = await api.post(url, requestData);
      onSuccess(res.data);
    } catch (err: any) {
      if (err?.response?.data?.code === 'MAX_DEVICES_REACHED') {
        setLimitReachedSessions(err.response.data.sessions || []);
        setPendingRequest({ url, data: requestData });
      } else {
        setErrMsg(apiErrMsg(err, 'Invalid or expired OTP.'));
      }
    } finally { setLoading(false); }
  };

  /*  Resend OTP  */
  const handleResend = async () => {
    if (resend > 0) return;
    try {
      setLoading(true);
      const full = `${cc}${mobile}`;
      const res = googleCred
        ? await api.post('/patient/auth/resend-google-otp', { credential: googleCred })
        : await api.post('/patient/auth/resend-otp', {
            mobile: full, email: mode === 'login' ? email : sEmail,
          });
      setResend(res.data.otpExpiresIn || 120);
    } catch (err) {
      const r = err as { response?: { data?: { message?: string } } };
      setErrMsg(r.response?.data?.message || 'Failed to resend OTP.');
    } finally { setLoading(false); }
  };

  const handleForgotPasswordStart = async (e: React.FormEvent) => {
    e.preventDefault(); setErrMsg('');
    if (!resetEmail) { setErrMsg('Enter your email address.'); return; }
    try {
      setLoading(true);
      const res = await api.post('/patient/auth/forgot-password', { email: resetEmail });
      setOtp(['', '', '', '', '', '']);
      setResetResend(res.data.otpExpiresIn || 120);
      setStep('forgot-otp');
    } catch (err) {
      setErrMsg(apiErrMsg(err, 'Failed to send password reset OTP.'));
    } finally { setLoading(false); }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault(); setErrMsg('');
    if (otpVal.length < 6) { setErrMsg('Enter the 6-digit OTP.'); return; }
    if (!resetPwd || !resetCPwd) { setErrMsg('Create and confirm your new password.'); return; }
    if (resetPwd !== resetCPwd) { setErrMsg('Passwords do not match.'); return; }
    if (resetPwd.length < 8 || !/\d/.test(resetPwd)) {
      setErrMsg('Password must be at least 8 characters and contain a number.');
      return;
    }
    try {
      setLoading(true);
      await api.post('/patient/auth/reset-password', {
        email: resetEmail,
        otp: otpVal,
        newPassword: resetPwd,
      });
      setStep('auth');
      setMode('login');
      setGoogleCred('');
      setFlowEmail('');
      setNeedsPasswordSetup(false);
      setPassword('');
      setOtp(['', '', '', '', '', '']);
      setResetPwd('');
      setResetCPwd('');
      setResetResend(0);
      setEmail(resetEmail);
      if (typeof window !== 'undefined') {
        window.alert('Password reset successful. Please sign in with your new password.');
      }
    } catch (err) {
      setErrMsg(apiErrMsg(err, 'Failed to reset password.'));
    } finally { setLoading(false); }
  };

  const handleResetResend = async () => {
    if (resetResend > 0) return;
    try {
      setLoading(true);
      const res = await api.post('/patient/auth/resend-password-reset', { email: resetEmail });
      setResetResend(res.data.otpExpiresIn || 120);
    } catch (err) {
      setErrMsg(apiErrMsg(err, 'Failed to resend password reset OTP.'));
    } finally { setLoading(false); }
  };

  const handleForceLogoutAndRetry = async () => {
    if (!selectedDeviceId || !pendingRequest) {
      toast.error('Please select a device to disconnect.');
      return;
    }
    setErrMsg('');
    try {
      setLoading(true);
      const res = await api.post(pendingRequest.url, {
        ...pendingRequest.data,
        forceLogoutDeviceId: selectedDeviceId,
      });

      // Reset states
      setPendingRequest(null);
      setLimitReachedSessions([]);
      setSelectedDeviceId(null);

      if (res.data.requiresMobile) {
        setStep('mobile');
      } else if (res.data.requiresOtp) {
        setResend(res.data.otpExpiresIn || 120);
        setStep('otp');
      } else {
        onSuccess(res.data);
      }
    } catch (err: any) {
      setErrMsg(apiErrMsg(err, 'Failed to log out device and sign in. Please try again.'));
      resetTs();
    } finally {
      setLoading(false);
    }
  };

  /*  Render  */
  return (
    <div className="min-h-screen flex flex-col lg:flex-row" style={{ background: 'var(--bg)' }}>

      {/*  Left hero panel  */}
      <aside className="hidden lg:flex lg:w-[42%] xl:w-[38%] relative flex-col justify-between p-12 xl:p-16 overflow-hidden gradient-brand">
        {/* Decorative blobs */}
        <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-white/5" />
        <div className="absolute top-1/2 -left-20 w-64 h-64 rounded-full bg-white/5" />
        <div className="absolute bottom-16 right-8  w-48 h-48 rounded-full bg-white/5" />

        <div className="relative z-10">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-16">
            <img src="/logo.jpg" alt="healthcare Logo" className="w-10 h-10 rounded-xl object-cover bg-white/20 backdrop-blur-sm" />
            <span className="text-white font-bold text-lg tracking-tight">healthcare Patient</span>
          </div>

          {/* Headline */}
          <div className="space-y-4 mb-10">
            <h1 className="text-4xl xl:text-5xl font-extrabold text-white leading-tight">
              Your health,<br />
              <span className="text-teal-200">always at hand.</span>
            </h1>
            <p className="text-teal-100 text-base leading-relaxed max-w-sm">
              Book appointments, access records, and consult doctors securely, anytime.
            </p>
          </div>

          <div className="space-y-3">
            <FeatureRow icon={HeartPulse}    label="Real-time health monitoring" />
            <FeatureRow icon={CheckCircle2}  label="Instant appointment booking" />
            <FeatureRow icon={ShieldCheck}   label="Bank-grade data security" />
          </div>
        </div>

        <p className="relative z-10 text-teal-200/70 text-xs italic border-l-2 border-teal-300/40 pl-4">
          &ldquo;Prevention is better than cure.&rdquo; - trusted by 50,000+ patients
        </p>
      </aside>

      {/*  Right form panel  */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 md:p-10 min-h-screen lg:min-h-0">

        {/* Mobile logo */}
        <div className="flex lg:hidden items-center gap-2.5 mb-8">
          <img src="/logo.jpg" alt="healthcare Logo" className="w-9 h-9 rounded-xl object-cover" />
          <span className="font-bold text-gray-800">healthcare Patient</span>
        </div>

        {/* Card */}
        <div className="w-full max-w-[420px] bg-white rounded-2xl overflow-hidden card-shadow fade-up">
          {/* top accent bar */}
          <div className="h-1 w-full gradient-brand" />

          {/* Back button */}
          {(step === 'mobile' || step === 'otp' || step === 'forgot' || step === 'forgot-otp') && (
            <div className="px-6 pt-5">
              <button
                onClick={() => {
                  if (step === 'otp') {
                    setStep('mobile');
                  } else if (step === 'forgot-otp') {
                    setStep('forgot');
                  } else {
                    setStep('auth');
                    if (step === 'mobile') {
                      setGoogleCred('');
                      setFlowEmail('');
                      setNeedsPasswordSetup(false);
                    }
                  }
                  setOtp(['', '', '', '', '', '']);
                  setErrMsg('');
                }}
                disabled={loading}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
            </div>
          )}

          <div className="p-6 sm:p-8">

            {/*  STEP auth  */}
            {step === 'auth' && (<>
              {/* Tab switcher */}
              <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
                {(['login', 'signup'] as Mode[]).map(m => (
                  <button key={m} onClick={() => switchMode(m)}
                    className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
                      mode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}>
                    {m === 'login' ? 'Sign In' : 'Sign Up'}
                  </button>
                ))}
              </div>

              {/* Heading */}
              <div className="mb-5">
                <h2 className="text-xl font-bold text-gray-900">
                  {mode === 'login' ? 'Welcome back' : 'Create your account'}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {mode === 'login'
                    ? 'Sign in to access your health dashboard'
                    : ' Mobile number required.'}
                </p>
              </div>

              {/* Error */}
              {errMsg && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex gap-2">
                  <span>!</span><span>{errMsg}</span>
                </div>
              )}

              {/* Google Sign-In */}
              <div className="mb-4">
                {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? (
                  <div className="relative min-h-11">
                    <div id={gId} className="flex min-h-11 w-full justify-center" />
                    {!googleRendered && (
                      <button
                        type="button"
                        onClick={handlePlaceholderClick}
                        className="absolute inset-0 flex h-11 w-full items-center justify-center gap-3 rounded-full border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50/80 active:scale-[0.98] cursor-pointer"
                      >
                        <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                        </svg>
                        <span>
                          {googleButtonLabel}
                        </span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                    Add <code className="font-mono bg-amber-100 px-1 rounded">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> to enable Google sign-in
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3 mb-5">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400 font-medium whitespace-nowrap">or continue with email</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              {/* Login form */}
              {mode === 'login' ? (
                <form onSubmit={e => void handleLogin(e)} className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="lg-email" className="block text-sm font-medium text-gray-700">Email address</label>
                    <div className="relative">
                      <Mail aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input id="lg-email" type="email" required autoComplete="email"
                        value={email} onChange={e => setEmail(e.target.value)} disabled={loading}
                        placeholder="patient@email.com"
                        className="input-teal input-with-left-icon" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="lg-pwd" className="block text-sm font-medium text-gray-700">Password</label>
                    <div className="relative">
                      <Lock aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input id="lg-pwd" type={showPwd ? 'text' : 'password'} required autoComplete="current-password"
                        value={password} onChange={e => setPassword(e.target.value)} disabled={loading}
                        placeholder="********"
                        className="input-teal input-with-left-icon input-with-right-icon" />
                      <button type="button" tabIndex={-1} onClick={() => setShowPwd(v => !v)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                        {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className="flex justify-end">
                      <button type="button" onClick={openForgotPassword}
                        className="text-xs font-medium text-teal-600 hover:text-teal-700 transition-colors">
                        Forgot password?
                      </button>
                    </div>
                  </div>

                  {/* Turnstile */}
                  {tsSiteKey && (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-gray-700 block">Security Check</label>
                      <div className="flex justify-center min-h-[65px]">
                        <div id={tsId} />
                      </div>
                    </div>
                  )}

                  <button type="submit" id="patient-login-btn" disabled={loading || (!!tsSiteKey && !tsToken)}
                    className="btn-primary mt-1">
                    {loading ? <Spinner /> : 'Sign In'}
                  </button>
                </form>

              ) : (
                /* Signup form */
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="sg-name" className="block text-sm font-medium text-gray-700">Full Name</label>
                    <div className="relative">
                      <User aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input id="sg-name" type="text" required autoComplete="name"
                        value={fullName} onChange={e => setFullName(e.target.value)} disabled={loading}
                        placeholder="Your full name" className="input-teal input-with-left-icon" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="sg-email" className="block text-sm font-medium text-gray-700">Email address</label>
                    <div className="relative">
                      <Mail aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input id="sg-email" type="email" required autoComplete="email"
                        value={sEmail} onChange={e => setSEmail(e.target.value)} disabled={loading}
                        placeholder="patient@email.com" className="input-teal input-with-left-icon" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="sg-pwd" className="block text-sm font-medium text-gray-700">Password</label>
                    <div className="relative">
                      <Lock aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input id="sg-pwd" type={showSPwd ? 'text' : 'password'} required autoComplete="new-password"
                        minLength={8} value={sPwd} onChange={e => setSPwd(e.target.value)} disabled={loading}
                        placeholder="Min. 8 characters" className="input-teal input-with-left-icon input-with-right-icon" />
                      <button type="button" tabIndex={-1} onClick={() => setShowSPwd(v => !v)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                        {showSPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {/* Strength bar */}
                    {sPwd && (
                      <div className="flex gap-1 mt-1">
                        {[...Array(4)].map((_, i) => {
                          const s = sPwd.length >= 12 ? 4 : sPwd.length >= 10 ? 3 : sPwd.length >= 8 ? 2 : 1;
                          const c = ['bg-red-400','bg-orange-400','bg-yellow-400','bg-green-500'][s - 1];
                          return <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < s ? c : 'bg-gray-200'}`} />;
                        })}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="sg-cpwd" className="block text-sm font-medium text-gray-700">Confirm Password</label>
                    <div className="relative">
                      <Lock aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input id="sg-cpwd" type={showSCPwd ? 'text' : 'password'} required autoComplete="new-password"
                        value={sCPwd} onChange={e => setSCPwd(e.target.value)} disabled={loading}
                        placeholder="Repeat your password" className="input-teal input-with-left-icon input-with-right-icon" />
                      <button type="button" tabIndex={-1} onClick={() => setShowSCPwd(v => !v)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                        {showSCPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Turnstile */}
                  {tsSiteKey && (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-gray-700 block">Security Check</label>
                      <div className="flex justify-center min-h-[65px]">
                        <div id={tsId} />
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-gray-500 text-center leading-relaxed">
                    By signing up you agree to our{' '}
                    <a href="#" className="text-teal-600 hover:underline font-medium">Terms</a> &{' '}
                    <a href="#" className="text-teal-600 hover:underline font-medium">Privacy Policy</a>.{' '}
                    A mobile number is required.
                  </p>

                  <button type="submit" id="patient-signup-btn" disabled={loading || (!!tsSiteKey && !tsToken)}
                    className="btn-primary">
                    {loading ? <Spinner /> : 'Continue - Verify Mobile'}
                  </button>
                </form>
              )}

              {/* Footer toggle */}
              <p className="text-center text-sm text-gray-500 mt-6">
                {mode === 'login' ? <>New patient?{' '}
                  <button onClick={() => switchMode('signup')} className="font-semibold text-teal-600 hover:text-teal-700 transition-colors">Create account</button>
                </> : <>Already have an account?{' '}
                  <button onClick={() => switchMode('login')} className="font-semibold text-teal-600 hover:text-teal-700 transition-colors">Sign in</button>
                </>}
              </p>
            </>)}

            {/*  STEP forgot  */}
            {step === 'forgot' && (<>
              <div className="text-center mb-7 fade-up">
                <div className="w-14 h-14 gradient-brand rounded-2xl mx-auto mb-4 flex items-center justify-center">
                  <Mail className="w-7 h-7 text-white" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Reset your password</h2>
                <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
                  We&apos;ll send a 6-digit OTP to your email address.
                </p>
              </div>

              {errMsg && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex gap-2">
                  <span>!</span><span>{errMsg}</span>
                </div>
              )}

              <form onSubmit={e => void handleForgotPasswordStart(e)} className="space-y-5 fade-up">
                <div className="space-y-1.5">
                  <label htmlFor="reset-email" className="block text-sm font-medium text-gray-700">Email address</label>
                  <div className="relative">
                    <Mail aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input id="reset-email" type="email" required autoComplete="email"
                      value={resetEmail} onChange={e => setResetEmail(e.target.value.trim().toLowerCase())} disabled={loading}
                      placeholder="patient@email.com"
                      className="input-teal input-with-left-icon" />
                  </div>
                </div>

                <div className="flex gap-2.5 rounded-xl bg-teal-50 border border-teal-100 px-4 py-3">
                  <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-teal-700 leading-relaxed">
                    You can request up to 5 reset OTPs in 24 hours. After 3 wrong OTP attempts, reset is blocked for 24 hours.
                  </p>
                </div>

                <button type="submit" id="patient-forgot-btn" disabled={loading || !resetEmail}
                  className="btn-primary">
                  {loading ? <Spinner /> : 'Send Reset OTP'}
                </button>
              </form>
            </>)}

            {/*  STEP forgot-otp  */}
            {step === 'forgot-otp' && (<>
              <div className="text-center mb-7 fade-up">
                <div className="w-14 h-14 gradient-brand rounded-2xl mx-auto mb-4 flex items-center justify-center">
                  <ShieldCheck className="w-7 h-7 text-white" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Enter OTP and new password</h2>
                <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
                  Sent to <span className="font-semibold text-gray-700">{resetEmail}</span>
                </p>
              </div>

              {errMsg && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex gap-2">
                  <span>!</span><span>{errMsg}</span>
                </div>
              )}

              <form onSubmit={e => void handleResetPassword(e)} className="space-y-5 fade-up">
                <div className="flex gap-2 justify-center" onPaste={pasteOtp} role="group" aria-label="Password reset OTP input">
                  {otp.map((d, i) => (
                    <input
                      key={`reset-otp-${i}`}
                      ref={el => { otpRefs.current[i] = el; }}
                      type="text" inputMode="numeric" maxLength={1}
                      value={d}
                      onChange={e => changeOtp(i, e.target.value)}
                      onKeyDown={e => keyOtp(i, e)}
                      aria-label={`Reset OTP digit ${i + 1}`}
                      disabled={loading}
                      className={`otp-box ${d ? 'filled' : ''}`}
                    />
                  ))}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="reset-pwd" className="block text-sm font-medium text-gray-700">New Password</label>
                  <div className="relative">
                    <Lock aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input id="reset-pwd" type={showResetPwd ? 'text' : 'password'} autoComplete="new-password"
                      value={resetPwd} onChange={e => setResetPwd(e.target.value)} disabled={loading}
                      placeholder="Min. 8 characters"
                      className="input-teal input-with-left-icon input-with-right-icon" />
                    <button type="button" tabIndex={-1} onClick={() => setShowResetPwd(v => !v)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                      {showResetPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="reset-cpwd" className="block text-sm font-medium text-gray-700">Confirm Password</label>
                  <div className="relative">
                    <Lock aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input id="reset-cpwd" type={showResetCPwd ? 'text' : 'password'} autoComplete="new-password"
                      value={resetCPwd} onChange={e => setResetCPwd(e.target.value)} disabled={loading}
                      placeholder="Repeat your new password"
                      className="input-teal input-with-left-icon input-with-right-icon" />
                    <button type="button" tabIndex={-1} onClick={() => setShowResetCPwd(v => !v)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                      {showResetCPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="text-center text-sm">
                  {resetResend > 0
                    ? <p className="text-gray-500">Resend in <span className="font-semibold text-gray-700">{resetResend}s</span></p>
                    : <button type="button" onClick={() => void handleResetResend()} disabled={loading}
                        className="font-semibold text-teal-600 hover:text-teal-700 transition-colors">
                        Resend OTP
                      </button>
                  }
                </div>

                <button type="submit" id="patient-reset-btn" disabled={loading || otpVal.length < 6}
                  className="btn-primary">
                  {loading ? <Spinner /> : 'Reset Password'}
                </button>
              </form>
            </>)}

            {/*  STEP mobile  */}
            {step === 'mobile' && (<>
              <div className="text-center mb-7 fade-up">
                <div className="w-14 h-14 gradient-brand rounded-2xl mx-auto mb-4 flex items-center justify-center">
                  <Phone className="w-7 h-7 text-white" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Verify your mobile</h2>
                <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
                  {googleCred
                    ? 'Add your mobile number to finish setting up your patient account.'
                    : 'A mobile number is required. One number = one account.'}
                </p>
              </div>

              {errMsg && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex gap-2">
                  <span>!</span><span>{errMsg}</span>
                </div>
              )}

              <form onSubmit={e => void handleMobile(e)} className="space-y-5 fade-up">
                <div className="space-y-1.5">
                  <label htmlFor="mob-num" className="block text-sm font-medium text-gray-700">Mobile Number</label>
                  <div className="flex gap-2">
                    <select value={cc} onChange={e => setCc(e.target.value)} disabled={loading}
                      id="mob-cc" aria-label="Country code"
                      className="h-11 px-2 rounded-xl border border-gray-200 bg-gray-50 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 shrink-0 w-[86px] transition-all">
                      <option value="+91">IN +91</option>
                      <option value="+1">US +1</option>
                      <option value="+44">UK +44</option>
                      <option value="+971">AE +971</option>
                      <option value="+65">SG +65</option>
                      <option value="+61">AU +61</option>
                      <option value="+81">JP +81</option>
                    </select>
                    <div className="relative flex-1">
                      <Phone aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input id="mob-num" type="tel" required inputMode="numeric"
                        maxLength={10} autoComplete="tel"
                        value={mobile} onChange={e => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        disabled={loading} placeholder="10-digit number"
                        className="input-teal input-with-left-icon" />
                    </div>
                  </div>
                  {mobile.length > 0 && mobile.length < 10 && (
                    <p className="text-xs text-amber-600 mt-1">{10 - mobile.length} more digit{10 - mobile.length !== 1 ? 's' : ''} needed</p>
                  )}
                </div>

                {googleCred && needsPasswordSetup && (
                  <>
                    <div className="space-y-1.5">
                      <label htmlFor="setup-pwd" className="block text-sm font-medium text-gray-700">Create Password</label>
                      <div className="relative">
                        <Lock aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input id="setup-pwd" type={showSetupPwd ? 'text' : 'password'} autoComplete="new-password"
                          minLength={8} value={setupPwd} onChange={e => setSetupPwd(e.target.value)} disabled={loading}
                          placeholder="Min. 8 characters"
                          className="input-teal input-with-left-icon input-with-right-icon" />
                        <button type="button" tabIndex={-1} onClick={() => setShowSetupPwd(v => !v)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                          {showSetupPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="setup-cpwd" className="block text-sm font-medium text-gray-700">Confirm Password</label>
                      <div className="relative">
                        <Lock aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input id="setup-cpwd" type={showSetupCPwd ? 'text' : 'password'} autoComplete="new-password"
                          value={setupCPwd} onChange={e => setSetupCPwd(e.target.value)} disabled={loading}
                          placeholder="Repeat your password"
                          className="input-teal input-with-left-icon input-with-right-icon" />
                        <button type="button" tabIndex={-1} onClick={() => setShowSetupCPwd(v => !v)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                          {showSetupCPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </>
                )}

                <div className="flex gap-2.5 rounded-xl bg-teal-50 border border-teal-100 px-4 py-3">
                  <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-teal-700 leading-relaxed">
                    {googleCred
                      ? <>We&apos;ll send a one-time password to <span className="font-semibold">{flowEmail || 'your email'}</span> to verify this setup.</>
                      : 'We&apos;ll send a one-time password to verify. Each mobile number can only be linked to one account.'}
                  </p>
                </div>

                <button type="submit" id="patient-mobile-btn" disabled={loading || mobile.length !== 10}
                  className="btn-primary">
                  {loading ? <Spinner /> : googleCred ? 'Continue - Send Email OTP' : 'Send OTP'}
                </button>
              </form>
            </>)}

            {/*  STEP otp  */}
            {step === 'otp' && (<>
              <div className="text-center mb-7 fade-up">
                <div className="w-14 h-14 gradient-brand rounded-2xl mx-auto mb-4 flex items-center justify-center">
                  <ShieldCheck className="w-7 h-7 text-white" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Enter OTP</h2>
                <p className="text-sm text-gray-500 mt-1.5">
                  Sent to <span className="font-semibold text-gray-700">{googleCred ? (flowEmail || 'your email') : `${cc} ${mobile}`}</span>
                </p>
              </div>

              {errMsg && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex gap-2">
                  <span>!</span><span>{errMsg}</span>
                </div>
              )}

              <form onSubmit={e => void handleOtp(e)} className="space-y-6 fade-up">
                {/* OTP boxes */}
                <div className="flex gap-2 justify-center" onPaste={pasteOtp} role="group" aria-label="OTP input">
                  {otp.map((d, i) => (
                    <input
                      key={i}
                      ref={el => { otpRefs.current[i] = el; }}
                      type="text" inputMode="numeric" maxLength={1}
                      value={d}
                      onChange={e => changeOtp(i, e.target.value)}
                      onKeyDown={e => keyOtp(i, e)}
                      id={`otp-${i}`} aria-label={`OTP digit ${i + 1}`}
                      disabled={loading}
                      className={`otp-box ${d ? 'filled' : ''}`}
                    />
                  ))}
                </div>

                <div className="text-center text-sm">
                  {resend > 0
                    ? <p className="text-gray-500">Resend in <span className="font-semibold text-gray-700">{resend}s</span></p>
                    : <button type="button" onClick={() => void handleResend()} disabled={loading}
                        className="font-semibold text-teal-600 hover:text-teal-700 transition-colors">
                        Resend OTP
                      </button>
                  }
                </div>

                <button type="submit" id="patient-otp-btn" disabled={loading || otpVal.length < 6}
                  className="btn-primary">
                  {loading ? <Spinner /> : 'Verify & Continue'}
                </button>
              </form>
            </>)}

            {/*  STEP done  */}
            {step === 'done' && (
              <div className="py-8 flex flex-col items-center text-center gap-4 fade-up">
                <div className="w-16 h-16 gradient-brand rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">You&apos;re all set!</h2>
                  <p className="text-sm text-gray-500 mt-1">Redirecting to your dashboard...</p>
                </div>
                <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
              </div>
            )}

            {step !== 'done' && (
              <p className="text-center text-xs text-gray-400 mt-7">
                Copyright {new Date().getFullYear()} MedkwikHealthbuddy. All rights reserved.
              </p>
            )}
          </div>
        </div>
      </main>

      {/* Session Limit Reached Modal */}
      {limitReachedSessions.length > 0 && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-md rounded-t-[2rem] bg-white p-6 shadow-2xl sm:rounded-2xl sm:mx-4 max-h-[85vh] overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300">
            <div className="text-center mb-6">
              <Smartphone className="mx-auto h-12 w-12 text-teal-600 mb-3 animate-bounce" />
              <h3 className="text-lg font-bold text-slate-900">Device Limit Reached</h3>
              <p className="text-xs text-slate-500 mt-1">
                You are currently logged into 3 devices. Please select one to log out and continue.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 max-h-[40vh] pr-1">
              {limitReachedSessions.map((session) => {
                const isSelected = selectedDeviceId === session.deviceId;
                return (
                  <button
                    key={session.deviceId}
                    type="button"
                    onClick={() => setSelectedDeviceId(session.deviceId)}
                    className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition ${
                      isSelected
                        ? 'border-teal-500 bg-teal-50/40'
                        : 'border-slate-100 bg-white hover:border-slate-200'
                    }`}
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 shrink-0">
                      {session.deviceType === 'Mobile' ? (
                        <Smartphone className="h-4 w-4 text-slate-500" />
                      ) : session.deviceType === 'Tablet' ? (
                        <Tablet className="h-4 w-4 text-slate-500" />
                      ) : (
                        <Laptop className="h-4 w-4 text-slate-500" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {session.deviceName}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {session.browserVersion}
                      </p>
                    </div>
                    <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      isSelected ? 'border-teal-500 bg-teal-500' : 'border-slate-300'
                    }`}>
                      {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setLimitReachedSessions([]);
                  setPendingRequest(null);
                  setSelectedDeviceId(null);
                }}
                className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleForceLogoutAndRetry()}
                disabled={!selectedDeviceId || loading}
                className="flex-1 rounded-xl bg-teal-700 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60 transition"
              >
                {loading ? 'Processing...' : 'Remove & Continue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scripts */}
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={() => setTurnstileLoaded(true)}
      />
      <Script
        key={`google-gsi-${googleScriptKey}`}
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => {
          setGoogleLoaded(true);
          setGoogleLoadError(false);
          setGoogleLoadTimeout(false);
        }}
        onError={() => {
          setGoogleLoadError(true);
        }}
      />
    </div>
  );
}
