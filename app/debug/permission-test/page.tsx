'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, ShieldAlert, ShieldCheck, Terminal, ArrowLeft, RefreshCw, HelpCircle } from 'lucide-react';

interface LogLine {
  time: string;
  type: 'info' | 'success' | 'warn' | 'error';
  message: string;
}

export default function PermissionTestPage() {
  const router = useRouter();
  const [permission, setPermission] = useState<string>('unknown');
  const [queryState, setQueryState] = useState<string>('unknown');
  const [logs, setLogs] = useState<LogLine[]>([]);

  const addLog = (message: string, type: LogLine['type'] = 'info') => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [{ time, type, message }, ...prev]);
  };

  const checkPermission = async () => {
    if (typeof window === 'undefined') return;

    addLog('--- Checking Current Permission States ---', 'info');

    // 1. Notification.permission
    const currentPermission = Notification.permission;
    setPermission(currentPermission);
    addLog(`Notification.permission: "${currentPermission}"`, 
      currentPermission === 'granted' ? 'success' : currentPermission === 'denied' ? 'error' : 'warn'
    );

    // 2. navigator.permissions.query
    if (navigator.permissions) {
      try {
        const queryResult = await navigator.permissions.query({ name: 'notifications' });
        setQueryState(queryResult.state);
        addLog(`navigator.permissions.query({ name: 'notifications' }): "${queryResult.state}"`,
          queryResult.state === 'granted' ? 'success' : queryResult.state === 'denied' ? 'error' : 'warn'
        );
      } catch (err: any) {
        addLog(`navigator.permissions.query error: ${err.message}`, 'error');
      }
    } else {
      addLog('navigator.permissions API is not supported in this browser.', 'warn');
    }
  };

  const requestPermission = async () => {
    if (typeof window === 'undefined') return;

    addLog('--- Starting Permission Request ---', 'info');

    // Before request
    const beforeVal = Notification.permission;
    addLog(`Before request: Notification.permission = "${beforeVal}"`, 'info');
    console.log("Before request:", beforeVal);

    try {
      // Call requestPermission
      addLog('Calling Notification.requestPermission()...', 'info');
      const result = await Notification.requestPermission();
      
      // After request
      addLog(`Request result (resolved promise): "${result}"`, 
        result === 'granted' ? 'success' : result === 'denied' ? 'error' : 'warn'
      );
      console.log("Request result:", result);

      const afterVal = Notification.permission;
      addLog(`After request: Notification.permission = "${afterVal}"`, 
        afterVal === 'granted' ? 'success' : afterVal === 'denied' ? 'error' : 'warn'
      );
      console.log("After request:", afterVal);

      setPermission(afterVal);
    } catch (err: any) {
      addLog(`Request failed with exception: ${err.message}`, 'error');
      if (err.stack) {
        addLog(`Stack trace: ${err.stack}`, 'error');
      }
      console.error("requestPermission exception:", err);
    }
  };

  useEffect(() => {
    addLog('Permission Test Screen Loaded', 'info');
    checkPermission();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-teal-500/20 selection:text-teal-400">
      {/* Header */}
      <header className="border-b border-slate-900 bg-slate-900/50 backdrop-blur sticky top-0 z-10 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => router.push('/debug/notifications')}
            className="p-2 rounded-full hover:bg-slate-800 transition text-slate-400 hover:text-slate-100"
            title="Back to Diagnostics"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-teal-400 flex items-center gap-2">
              <Shield className="w-5 h-5 animate-pulse" />
              Permission Tester
            </h1>
            <p className="text-xs text-slate-400">Isolate & inspect Chrome permission prompt behavior</p>
          </div>
        </div>
        <button 
          onClick={checkPermission}
          className="p-2 rounded-full hover:bg-slate-800 transition text-teal-400 hover:text-teal-300"
          title="Refresh States"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 md:p-6 space-y-6">
        
        {/* Status Dashboard Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2">
            Current Permission Statuses
          </h2>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 flex flex-col items-center justify-center text-center gap-2">
              <span className="text-xs text-slate-400">Notification.permission</span>
              <div className="flex items-center gap-1.5 mt-1">
                {permission === 'granted' && <ShieldCheck className="w-4 h-4 text-emerald-400" />}
                {permission === 'denied' && <ShieldAlert className="w-4 h-4 text-red-400" />}
                {permission === 'default' && <HelpCircle className="w-4 h-4 text-amber-400" />}
                <span className={`text-sm font-bold uppercase ${
                  permission === 'granted' ? 'text-emerald-400' :
                  permission === 'denied' ? 'text-red-400' : 'text-amber-400'
                }`}>
                  {permission}
                </span>
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 flex flex-col items-center justify-center text-center gap-2">
              <span className="text-xs text-slate-400">Permissions API Query</span>
              <span className={`text-sm font-bold uppercase mt-1 ${
                queryState === 'granted' ? 'text-emerald-400' :
                queryState === 'denied' ? 'text-red-400' : 'text-amber-400'
              }`}>
                {queryState}
              </span>
            </div>
          </div>
        </div>

        {/* Buttons Panel */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2">
            Interactive Triggers
          </h2>
          
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={checkPermission}
              className="py-3 px-4 bg-slate-850 hover:bg-slate-800 active:scale-95 text-teal-400 font-semibold border border-slate-700 rounded-xl transition cursor-pointer text-xs flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Check Permission
            </button>

            <button
              onClick={requestPermission}
              className="py-3 px-4 bg-teal-600 hover:bg-teal-500 active:scale-95 text-slate-950 font-bold rounded-xl transition cursor-pointer text-xs flex items-center justify-center gap-2 shadow-lg shadow-teal-500/20"
            >
              <Shield className="w-4 h-4" />
              Request Permission
            </button>
          </div>
          
          <p className="text-[10px] text-slate-500 text-center leading-relaxed">
            Note: If the state is already <strong>DENIED</strong>, modern browsers will immediately resolve the request with 'denied' without opening any dialog.
          </p>
        </div>

        {/* Console Log Output */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-teal-400" />
              Isolated Test Console
            </h2>
            <button
              onClick={() => setLogs([])}
              className="text-[10px] text-slate-500 hover:text-slate-350 transition cursor-pointer"
            >
              Clear Logs
            </button>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 h-72 overflow-y-auto font-mono text-[11px] space-y-2 select-text">
            {logs.length === 0 ? (
              <div className="text-slate-600 italic text-center py-12">No console output yet. Click one of the triggers above.</div>
            ) : (
              logs.map((log, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <span className="text-slate-600 shrink-0">{log.time}</span>
                  <span className={`font-bold shrink-0 ${
                    log.type === 'success' ? 'text-emerald-400' :
                    log.type === 'error' ? 'text-red-400' :
                    log.type === 'warn' ? 'text-amber-400' : 'text-sky-400'
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
      <footer className="border-t border-slate-900 bg-slate-950 p-4 text-center text-xs text-slate-650">
        medikwik Healthbuddy Diagnostic Sandbox
      </footer>
    </div>
  );
}
