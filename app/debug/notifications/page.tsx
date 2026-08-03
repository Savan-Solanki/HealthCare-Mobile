'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Bell, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Smartphone, 
  Globe, 
  Settings, 
  Copy, 
  Send, 
  Terminal, 
  RefreshCw, 
  ArrowLeft, 
  Play
} from 'lucide-react';
import api from '@/lib/api';
import { requestNotificationPermission } from '@/lib/firebase-messaging';
import { isTWA } from '@/lib/twa-detection';
import { toast } from 'sonner';

interface LogEntry {
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export default function DebugNotificationsPage() {
  const router = useRouter();
  const [permission, setPermission] = useState<string>('unknown');
  const [navPermission, setNavPermission] = useState<string>('unknown');
  const [inTwa, setInTwa] = useState<boolean | null>(null);
  const [swStatus, setSwStatus] = useState<string>('checking');
  const [fcmToken, setFcmToken] = useState<string>('');
  const [localStorageToken, setLocalStorageToken] = useState<string>('');
  const [localStorageTime, setLocalStorageTime] = useState<string>('');
  const [backendTokens, setBackendTokens] = useState<{ fcmToken?: string; fcmTokens?: string[] }>({});
  const [userProfile, setUserProfile] = useState<any>(null);
  const [authError, setAuthError] = useState<string>('');
  const [isLoadingToken, setIsLoadingToken] = useState<boolean>(false);
  const [isSendingTest, setIsSendingTest] = useState<boolean>(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [{ timestamp, type, message }, ...prev].slice(0, 100));
  }, []);

  // Fetch status and backend data
  const checkStatus = useCallback(async () => {
    if (typeof window === 'undefined') return;

    addLog('Running system status diagnostics...', 'info');

    // 1. Notification Permission & navigator.permissions
    const currentPermission = Notification.permission;
    setPermission(currentPermission);
    addLog(`Notification.permission is "${currentPermission}"`, currentPermission === 'granted' ? 'success' : currentPermission === 'denied' ? 'error' : 'warning');

    if (navigator.permissions) {
      try {
        const queryResult = await navigator.permissions.query({ name: 'notifications' });
        setNavPermission(queryResult.state);
        addLog(`navigator.permissions.query state is "${queryResult.state}"`, queryResult.state === 'granted' ? 'success' : queryResult.state === 'denied' ? 'error' : 'warning');
      } catch (err: any) {
        addLog(`Could not query navigator.permissions: ${err.message}`, 'warning');
      }
    }

    // 2. Read from localStorage
    const localTok = localStorage.getItem('medikwik_fcm_token') || '';
    const localTime = localStorage.getItem('medikwik_fcm_token_time') || '';
    setLocalStorageToken(localTok);
    setLocalStorageTime(localTime);
    if (localTok) {
      addLog(`Found cached token in localStorage generated at ${localTime}`, 'info');
    } else {
      addLog('No cached token found in localStorage.', 'info');
    }

    // 3. TWA Check
    const twaActive = isTWA();
    setInTwa(twaActive);
    addLog(`Detected environment: ${twaActive ? 'Android TWA Wrapper' : 'Standard Web/PWA'}`, 'info');

    // 4. Service Worker Check
    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        const activeSw = registrations.find(r => r.active);
        if (activeSw) {
          setSwStatus('active');
          addLog(`Active Service Worker found (scope: ${activeSw.scope})`, 'success');
        } else {
          setSwStatus('none');
          addLog('No active service worker found.', 'warning');
        }
      } catch (err: any) {
        setSwStatus('error');
        addLog(`Error checking service worker: ${err.message}`, 'error');
      }
    } else {
      setSwStatus('unsupported');
      addLog('Service Workers are not supported in this browser.', 'error');
    }

    // 5. Fetch local token if available
    try {
      if (currentPermission === 'granted') {
        setIsLoadingToken(true);
        const token = await requestNotificationPermission();
        if (token) {
          setFcmToken(token);
          addLog(`FCM Token retrieved successfully: ${token.substring(0, 15)}...`, 'success');
        } else {
          addLog('Could not retrieve FCM token.', 'warning');
        }
        setIsLoadingToken(false);
      }
    } catch (err: any) {
      addLog(`Error loading token: ${err.message}`, 'error');
      if (err.message?.includes('push service error') || err.message?.includes('Registration failed')) {
        addLog('DIAGNOSTIC SUGGESTION: "push service error" indicates Android has blocked the browser from connecting to the push servers, or Chrome notifications are disabled in Android Settings. Go to Android Settings > Apps > Chrome > Notifications and verify that Chrome app-level notifications are enabled.', 'warning');
      }
      setIsLoadingToken(false);
    }

    // 6. Fetch Backend user info
    try {
      setAuthError('');
      const res = await api.get('/patient/auth/me');
      if (res.data?.success && res.data?.user) {
        setUserProfile(res.data.user);
        setBackendTokens({
          fcmToken: res.data.user.fcmToken,
          fcmTokens: res.data.user.fcmTokens,
        });
        addLog(`Authenticated as: ${res.data.user.name} (${res.data.user.phone})`, 'success');
        addLog(`Backend saved fcmToken: ${res.data.user.fcmToken ? res.data.user.fcmToken.substring(0, 15) + '...' : 'none'}`, 'info');
        addLog(`Backend saved fcmTokens array length: ${res.data.user.fcmTokens?.length || 0}`, 'info');
      }
    } catch (err: any) {
      setAuthError(err.response?.data?.message || 'Authentication check failed');
      addLog(`Failed to fetch backend profile: ${err.message}`, 'error');
    }
  }, [addLog]);

  useEffect(() => {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    const safeStringify = (arg: any): string => {
      if (arg === null) return 'null';
      if (arg === undefined) return 'undefined';
      if (arg instanceof Error) {
        return `${arg.name}: ${arg.message}\nStack: ${arg.stack || 'N/A'}`;
      }
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch {
          try {
            const seen = new WeakSet();
            return JSON.stringify(arg, (key, value) => {
              if (typeof value === 'object' && value !== null) {
                if (seen.has(value)) return '[Circular]';
                seen.add(value);
              }
              return value;
            });
          } catch {
            return Object.prototype.toString.call(arg);
          }
        }
      }
      return String(arg);
    };

    console.log = (...args) => {
      originalLog(...args);
      const msg = args.map(safeStringify).join(' ');
      addLog(msg, 'info');
    };

    console.warn = (...args) => {
      originalWarn(...args);
      const msg = args.map(safeStringify).join(' ');
      addLog(msg, 'warning');
    };

    console.error = (...args) => {
      originalError(...args);
      const msg = args.map(safeStringify).join(' ');
      addLog(msg, 'error');
    };

    addLog('Diagnostic Screen Loaded', 'info');
    checkStatus();

    // Listen to custom alarm dispatch
    const handleAlarm = (e: any) => {
      addLog(`[FOREGROUND ALARM EVENT] Received medikwik:medicine-alarm for ID: ${e.detail?.reminderId}`, 'success');
    };
    window.addEventListener('medikwik:medicine-alarm', handleAlarm);

    return () => {
      window.removeEventListener('medikwik:medicine-alarm', handleAlarm);
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    };
  }, [checkStatus, addLog]);

  // Request/Update Token
  const handleRequestPermission = async () => {
    addLog('Requesting notification permission...', 'info');
    setIsLoadingToken(true);
    try {
      const token = await requestNotificationPermission();
      if (token) {
        setFcmToken(token);
        addLog(`FCM Token retrieved and updated on backend: ${token.substring(0, 15)}...`, 'success');
        toast.success('FCM Token generated successfully!');
      } else {
        const perm = typeof window !== 'undefined' ? Notification.permission : 'unknown';
        addLog(`FCM token registration returned null. Current Notification.permission: "${perm}"`, 'error');
        if (perm === 'denied') {
          addLog('FAILURE ROOT CAUSE: Browser/App blocked notifications. Reset permission settings to continue.', 'error');
        }
        toast.error('Token registration failed.');
      }
    } catch (err: any) {
      addLog(`FCM Registration Error: ${err.message}`, 'error');
      if (err.message?.includes('push service error') || err.message?.includes('Registration failed')) {
        addLog('DIAGNOSTIC SUGGESTION: "push service error" indicates Android has blocked the browser from connecting to the push servers, or Chrome notifications are disabled in Android Settings. Go to Android Settings > Apps > Chrome > Notifications and verify that Chrome app-level notifications are enabled.', 'warning');
      }
      if (err.stack) {
        addLog(`Stack Trace: ${err.stack.split('\n').slice(0, 2).join(' | ')}`, 'error');
      }
      toast.error(`Error: ${err.message}`);
    } finally {
      setIsLoadingToken(false);
      checkStatus();
    }
  };

  // Trigger test notification
  const handleSendTestNotification = async (isMedicine: boolean) => {
    addLog(`Triggering test push (isMedicineReminder=${isMedicine})...`, 'info');
    setIsSendingTest(true);
    try {
      const res = await api.post('/notifications/send-test', {
        title: isMedicine ? '💊 Medicine Time! (Diagnostic)' : '🔔 medikwik Test Push',
        body: isMedicine 
          ? 'Diagnostic medicine alarm check. Custom alarm sound should play on Android.'
          : 'Diagnostic general notification check. Default system sound should play.',
        isMedicineReminder: isMedicine,
      });

      if (res.data?.success) {
        addLog(`Backend Push Sent! Result messageId: ${res.data.result?.messageId || 'none'}`, 'success');
        toast.success('Test notification dispatched!');
      } else {
        addLog(`Failed to send test push: ${res.data?.message || 'unknown error'}`, 'error');
        toast.error('Failed to send test notification.');
      }
    } catch (err: any) {
      addLog(`Test push failed: ${err.response?.data?.message || err.message}`, 'error');
      toast.error(`Push failed: ${err.response?.data?.message || err.message}`);
    } finally {
      setIsSendingTest(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
    addLog(`Copied ${label} to clipboard`, 'info');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-teal-500/20 selection:text-teal-400">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-10 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => router.push('/dashboard')}
            className="p-2 rounded-full hover:bg-slate-800 transition text-slate-400 hover:text-slate-100"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-teal-400 flex items-center gap-2">
              <Settings className="w-5 h-5" />
              medikwik FCM Diagnostics
            </h1>
            <p className="text-xs text-slate-400">Validate push notification pipeline on PWA & TWA</p>
          </div>
        </div>
        <button 
          onClick={checkStatus}
          className="p-2 rounded-full hover:bg-slate-800 transition text-teal-400 hover:text-teal-300"
          title="Refresh Diagnostics"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </header>

      {/* Main Content Dashboard */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-6 space-y-6">
        
        {authError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-400">Authentication Required</h3>
              <p className="text-sm text-red-200/80 mt-1">
                You are currently not logged in as a patient on this device. Backend diagnostics (fetching/saving tokens and sending test pushes) will fail.
              </p>
              <button 
                onClick={() => router.push('/login')}
                className="mt-3 text-xs bg-red-500 hover:bg-red-600 text-white font-medium py-1.5 px-3 rounded-lg transition"
              >
                Go to Login Screen
              </button>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          
          {/* Card 1: Browser & Environment */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2 border-b border-slate-800 pb-2">
              <Smartphone className="w-4 h-4 text-teal-400" />
              Environment & Permission
            </h2>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Browser Permission:</span>
                <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                  permission === 'granted' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                  permission === 'denied' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                  'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}>
                  {permission === 'granted' ? <CheckCircle className="w-3.5 h-3.5" /> : 
                   permission === 'denied' ? <XCircle className="w-3.5 h-3.5" /> : 
                   <AlertTriangle className="w-3.5 h-3.5" />}
                  {permission.toUpperCase()}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Permissions API Query:</span>
                <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                  navPermission === 'granted' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                  navPermission === 'denied' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                  'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}>
                  {navPermission.toUpperCase()}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Client Shell Wrapper:</span>
                <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                  inTwa === true ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20' :
                  inTwa === false ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                  'bg-slate-800 text-slate-400'
                }`}>
                  {inTwa === true ? 'Android TWA' : inTwa === false ? 'Standard PWA' : 'Detecting...'}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Service Worker:</span>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                  swStatus === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                  'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}>
                  {swStatus.toUpperCase()}
                </span>
              </div>

              <div className="flex justify-between items-center font-sans">
                <span className="text-sm text-slate-400">User Agent:</span>
                <span className="text-xs text-slate-500 max-w-[200px] truncate" title={typeof window !== 'undefined' ? navigator.userAgent : ''}>
                  {typeof window !== 'undefined' ? navigator.userAgent : 'N/A'}
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Firebase Client Setup */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2 border-b border-slate-800 pb-2">
              <Globe className="w-4 h-4 text-teal-400" />
              Firebase Setup
            </h2>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Project ID:</span>
                <span className="text-sm font-mono text-slate-200">
                  {process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'medikwik-d5787'}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">VAPID Key Configured:</span>
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                  process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                }`}>
                  {process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ? 'YES' : 'NO'}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">FCM Sender ID:</span>
                <span className="text-sm font-mono text-slate-200">
                  {process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '1057901705975'}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Client App ID:</span>
                <span className="text-xs font-mono text-slate-400 truncate max-w-[200px]" title={process.env.NEXT_PUBLIC_FIREBASE_APP_ID}>
                  {process.env.NEXT_PUBLIC_FIREBASE_APP_ID || 'N/A'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: FCM Token Details & Status */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2 border-b border-slate-800 pb-2">
            <Bell className="w-4 h-4 text-teal-400" />
            FCM Tokens & Sync Status
          </h2>

          <div className="space-y-4">
            {/* Local Token */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-slate-400 flex items-center gap-1">
                  Local Browser Token:
                  {isLoadingToken && <RefreshCw className="w-3.5 h-3.5 animate-spin text-teal-400" />}
                </span>
                {fcmToken && (
                  <button 
                    onClick={() => copyToClipboard(fcmToken, 'Local Token')}
                    className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1 transition cursor-pointer"
                  >
                    <Copy className="w-3 h-3" /> Copy Token
                  </button>
                )}
              </div>
              {fcmToken ? (
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-slate-300 break-all select-all">
                  {fcmToken}
                </div>
              ) : (
                <div className="p-3 bg-slate-950 border border-dashed border-slate-800 rounded-xl text-center text-xs text-slate-500">
                  No local token generated. Click "Re-request Permission" below.
                </div>
              )}
            </div>

            {/* LocalStorage Stored Token */}
            <div className="space-y-1.5 pt-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-slate-400">
                  Token Stored in LocalStorage:
                </span>
                {localStorageToken && (
                  <button 
                    onClick={() => copyToClipboard(localStorageToken, 'localStorage Token')}
                    className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1 transition cursor-pointer"
                  >
                    <Copy className="w-3 h-3" /> Copy
                  </button>
                )}
              </div>
              {localStorageToken ? (
                <div className="space-y-1">
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-slate-300 break-all select-all">
                    {localStorageToken}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium font-sans">
                    Generated at: {localStorageTime}
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-slate-950 border border-dashed border-slate-800 rounded-xl text-center text-xs text-slate-500">
                  No token stored in localStorage.
                </div>
              )}
            </div>

            {/* DB Tokens */}
            <div className="space-y-1.5 pt-2">
              <span className="text-xs font-medium text-slate-400">Database Registered Tokens (Primary fcmToken):</span>
              {backendTokens.fcmToken ? (
                <div className="flex gap-2 items-center p-3 bg-slate-950 border border-slate-800 rounded-xl">
                  <div className="font-mono text-xs text-slate-300 break-all select-all flex-1">
                    {backendTokens.fcmToken}
                  </div>
                  {fcmToken && backendTokens.fcmToken === fcmToken ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                      MATCHES LOCAL
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 shrink-0">
                      MISMATCH
                    </span>
                  )}
                </div>
              ) : (
                <div className="p-3 bg-slate-950 border border-dashed border-slate-800 rounded-xl text-center text-xs text-slate-500">
                  No primary token saved in database.
                </div>
              )}
            </div>

            {/* DB Tokens Array */}
            <div className="space-y-1.5 pt-1">
              <span className="text-xs font-medium text-slate-400">Database saved fcmTokens array:</span>
              {backendTokens.fcmTokens && backendTokens.fcmTokens.length > 0 ? (
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {backendTokens.fcmTokens.map((tok, idx) => (
                    <div key={idx} className="flex gap-2 items-center p-2.5 bg-slate-950 border border-slate-900 rounded-lg">
                      <span className="text-[10px] text-slate-500 font-mono shrink-0">#{idx + 1}</span>
                      <div className="font-mono text-xs text-slate-400 truncate flex-1">
                        {tok}
                      </div>
                      {tok === fcmToken && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                          LOCAL
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-2.5 bg-slate-950 border border-dashed border-slate-900 rounded-lg text-center text-xs text-slate-500">
                  Tokens array is empty.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Card 4: Action Center */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2 border-b border-slate-800 pb-2">
            <Play className="w-4 h-4 text-teal-400" />
            Diagnostic Actions
          </h2>
          
          <div className="grid sm:grid-cols-3 gap-4">
            <button
              onClick={handleRequestPermission}
              disabled={isLoadingToken}
              className="px-4 py-2.5 bg-slate-850 hover:bg-slate-800 text-teal-400 font-semibold rounded-xl text-xs flex items-center justify-center gap-2 border border-slate-700 active:scale-95 transition disabled:opacity-55 disabled:pointer-events-none cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingToken ? 'animate-spin' : ''}`} />
              Re-Request Permission
            </button>

            <button
              onClick={() => handleSendTestNotification(false)}
              disabled={isSendingTest || !fcmToken || !!authError}
              className="px-4 py-2.5 bg-slate-850 hover:bg-slate-800 text-teal-400 font-semibold rounded-xl text-xs flex items-center justify-center gap-2 border border-slate-700 active:scale-95 transition disabled:opacity-55 disabled:pointer-events-none cursor-pointer"
            >
              <Send className="w-4 h-4" />
              Send Test (General)
            </button>

            <button
              onClick={() => handleSendTestNotification(true)}
              disabled={isSendingTest || !fcmToken || !!authError}
              className="px-4 py-2.5 bg-teal-600 hover:bg-teal-500 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 active:scale-95 transition shadow-lg shadow-teal-500/20 disabled:opacity-55 disabled:pointer-events-none cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              Send Test (Medicine Sound)
            </button>
          </div>
        </div>

        {/* Card 5: Log Console */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-teal-400" />
              Real-time Logging Output
            </h2>
            <button 
              onClick={() => { setLogs([]); addLog('Console cleared', 'info'); }}
              className="text-xs text-slate-500 hover:text-slate-350 transition cursor-pointer"
            >
              Clear Logs
            </button>
          </div>
          
          <div className="bg-slate-950 rounded-xl p-4 border border-slate-850 h-64 overflow-y-auto font-mono text-[11px] space-y-2 select-text">
            {logs.length === 0 ? (
              <div className="text-slate-600 italic text-center py-8">Waiting for diagnostic actions...</div>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="flex items-start gap-2">
                  <span className="text-slate-600 shrink-0">{log.timestamp}</span>
                  <span className={`font-bold shrink-0 ${
                    log.type === 'success' ? 'text-emerald-400' :
                    log.type === 'error' ? 'text-red-400' :
                    log.type === 'warning' ? 'text-amber-400' :
                    'text-cyan-400'
                  }`}>
                    [{log.type.toUpperCase()}]
                  </span>
                  <span className="text-slate-300 break-all">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>

      </main>
      
      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 p-4 text-center text-xs text-slate-500">
        medikwik Healthbuddy Diagnostic Dashboard • Version 1.0.0
      </footer>
    </div>
  );
}
