'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Search,
  Mail,
  RefreshCw,
  HelpCircle,
  X,
  ArrowRight,
  MessageSquare,
  AlertCircle
} from 'lucide-react';
import { PATIENT_DASHBOARD } from '@/lib/routes';

type FAQItem = {
  id: string;
  question: string;
  answer: string;
};

const FAQS: FAQItem[] = [
  {
    id: 'faq-1',
    question: 'How do I book an appointment?',
    answer: 'Open the Home screen, select a hospital and doctor, choose an available date and time slot, then confirm your appointment.'
  },
  {
    id: 'faq-2',
    question: 'How do I cancel or reschedule an appointment?',
    answer: 'Go to My Appointments, select the appointment, and choose Cancel or Reschedule if allowed by the hospital.'
  },
  {
    id: 'faq-3',
    question: 'How do medicine reminders work?',
    answer: "Medicine reminders are automatically created from your doctor's prescription. You can also create your own custom medicine reminders. Alarms will notify you at the scheduled time."
  },
  {
    id: 'faq-4',
    question: "Why didn't I receive a notification?",
    answer: 'Ensure notifications are enabled, battery optimization is disabled for healthcare, and the app has notification permission. Also verify your reminder is active.'
  },
  {
    id: 'faq-5',
    question: 'How do I download my prescription?',
    answer: 'Open your appointment details or Prescriptions section and tap Download PDF.'
  },
  {
    id: 'faq-6',
    question: 'Can I manage multiple patient accounts?',
    answer: 'Yes. You can switch between linked patient accounts from your profile without logging out.'
  },
  {
    id: 'faq-7',
    question: 'How do I update my profile?',
    answer: 'Go to Profile → Edit Profile, update your information, then tap Save.'
  },
  {
    id: 'faq-8',
    question: 'Is my medical data secure?',
    answer: 'Yes. Your data is securely stored and protected using industry-standard security practices. Only authorized users can access your medical records.'
  },
  {
    id: 'faq-9',
    question: 'How do I reset my password?',
    answer: 'On the login screen, tap Forgot Password and follow the instructions sent to your registered email or phone number.'
  },
  {
    id: 'faq-10',
    question: 'How do I contact healthcare support?',
    answer: 'Email us anytime at: support@medikwikhealthbuddy.in. Our support team will respond as soon as possible.'
  }
];

export default function HelpCenterPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Filter FAQs based on search query
  const filteredFAQs = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return FAQS;
    return FAQS.filter(
      (faq) =>
        faq.question.toLowerCase().includes(query) ||
        faq.answer.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  // Handle accordion toggle (only one expanded at a time)
  const toggleFAQ = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  // Simulate pull-to-refresh/loading state
  const handleRefresh = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
    }, 800);
  };

  // Action to contact support via mailto
  const handleContactSupport = () => {
    const email = 'support@medikwikhealthbuddy.in';
    const subject = 'medikwik Support Request';
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}`;
  };

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-slate-50 dark:bg-slate-900 pb-20 transition-colors">
      {/* ─── Header ───────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-white dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800/80 shadow-sm transition-colors">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => router.push(PATIENT_DASHBOARD)}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Back to dashboard"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex flex-1 items-center gap-2">
            <span className="text-xl select-none">🆘</span>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">Help Center</h1>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 dark:text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-40"
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4.5 w-4.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* Description Section */}
        <div className="text-center py-2">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Find answers to common questions or contact our support team.
          </p>
        </div>

        {/* ─── Contact Support Card ──────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-2xl border border-teal-100 dark:border-teal-900/50 bg-white dark:bg-slate-950 p-5 shadow-sm transition-all duration-300 hover:shadow-md">
          {/* Subtle gradient accent background */}
          <div className="absolute top-0 right-0 -mr-6 -mt-6 h-24 w-24 rounded-full bg-gradient-to-br from-teal-50 to-emerald-50 dark:from-teal-950/20 dark:to-emerald-950/20 opacity-70 blur-xl pointer-events-none" />
          
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 ring-1 ring-teal-100/50 dark:ring-teal-900/20">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div className="flex-1 space-y-1">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Need more help?</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal">
                If your issue isn't listed below, our friendly support team is always ready to assist you.
              </p>
              <div className="pt-2">
                <span className="block text-xs font-semibold text-slate-450 dark:text-slate-500">Email us at:</span>
                <a
                  href="mailto:support@medikwikhealthbuddy.in?subject=medikwik%20Support%20Request"
                  className="text-sm font-bold text-teal-600 dark:text-teal-400 hover:underline inline-flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-teal-100 dark:focus:ring-teal-900/30 rounded"
                >
                  <Mail className="h-3.5 w-3.5" />
                  support@medikwikhealthbuddy.in
                </a>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-50 dark:border-slate-900/60">
            <button
              onClick={handleContactSupport}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 dark:from-teal-600 dark:to-cyan-600 py-3 text-sm font-bold text-white shadow-md shadow-teal-500/10 hover:shadow-teal-500/20 transition-all active:scale-98"
            >
              Contact Support
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ─── Search Bar ────────────────────────────────────────────── */}
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-4.5 w-4.5 text-slate-400 dark:text-slate-500" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search FAQs..."
            className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 py-3 pl-10 pr-10 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition focus:border-teal-400 dark:focus:border-teal-500 focus:ring-2 focus:ring-teal-100 dark:focus:ring-teal-900/30"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-350"
              aria-label="Clear search"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          )}
        </div>

        {/* ─── FAQ List / States ──────────────────────────────────────── */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-1">
            Frequently Asked Questions
          </h3>

          {isLoading ? (
            // Loading state skeleton
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-2xl border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-950 p-4"
                />
              ))}
            </div>
          ) : filteredFAQs.length === 0 ? (
            // Empty state
            <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 dark:border-slate-850 py-12 px-6 text-center bg-white dark:bg-slate-950/20">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 dark:bg-amber-950/30 text-amber-500 dark:text-amber-400 ring-1 ring-amber-100/50 dark:ring-amber-900/10">
                <AlertCircle className="h-7 w-7" />
              </div>
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">No results found</h4>
              <p className="mt-1 max-w-xs text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
                We couldn't find any match for &ldquo;{searchQuery}&rdquo;. Try checking the spelling or searching other keywords.
              </p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-4 rounded-xl bg-slate-100 dark:bg-slate-800 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                >
                  Clear Search
                </button>
              )}
            </div>
          ) : (
            // FAQ list with accordion animations
            <div className="space-y-2.5">
              {filteredFAQs.map((faq) => {
                const isExpanded = expandedId === faq.id;
                return (
                  <div
                    key={faq.id}
                    className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-950 transition-all duration-300 hover:shadow-sm"
                  >
                    <button
                      type="button"
                      onClick={() => toggleFAQ(faq.id)}
                      className="flex w-full items-center justify-between gap-3 px-5 py-4.5 text-left transition hover:bg-slate-50/50 dark:hover:bg-slate-900/30 focus:outline-none"
                      aria-expanded={isExpanded}
                    >
                      <span className="text-sm font-bold text-slate-850 dark:text-slate-100 pr-2 leading-snug">
                        {faq.question}
                      </span>
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-400 dark:text-slate-500 transition-colors group-hover:text-slate-600">
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                    </button>

                    {/* Expandable answer panel */}
                    <div
                      className={`grid transition-all duration-300 ease-in-out ${
                        isExpanded
                          ? 'grid-rows-[1fr] border-t border-slate-100 dark:border-slate-900/60'
                          : 'grid-rows-[0fr]'
                      }`}
                    >
                      <div className="overflow-hidden">
                        <div className="px-5 py-4 text-sm leading-relaxed text-slate-600 dark:text-slate-350 bg-slate-50/30 dark:bg-slate-950/20">
                          {faq.answer}
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
