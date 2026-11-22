'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

interface Agent {
  id: number;
  name: string;
  email: string;
  role: string;
}

const DEMO_AGENTS: Agent[] = [
  { id: 1, name: 'Meera Sharma', email: 'meera@frontdesk.test', role: 'agent' },
  { id: 2, name: 'Rahul Verma', email: 'rahul@frontdesk.test', role: 'agent' },
  { id: 3, name: 'Priya Patel', email: 'priya@frontdesk.test', role: 'agent' },
];

export default function AgentLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Force light theme on login page
  useEffect(() => {
    document.documentElement.classList.remove('dark');
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail) {
      setError('Enter your agent email address.');
      setLoading(false);
      return;
    }

    if (!cleanPassword) {
      setError('Enter your password.');
      setLoading(false);
      return;
    }

    if (cleanPassword !== 'frontdesk-agent') {
      setError('Invalid password. Demo password is frontdesk-agent');
      setLoading(false);
      return;
    }

    try {
      let agentList = DEMO_AGENTS;
      try {
        const res = await fetch(`${API_BASE}/api/agents`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            agentList = data;
          }
        }
      } catch {
        // Fallback to DEMO_AGENTS if offline or cold start
      }

      const matchedAgent = agentList.find(
        (a) => a.email.toLowerCase() === cleanEmail
      );

      if (!matchedAgent) {
        setError('Agent email not recognized. Use one of the demo accounts below.');
        setLoading(false);
        return;
      }

      localStorage.setItem('frontdesk_agent', JSON.stringify(matchedAgent));

      // Restore user's preferred theme when entering dashboard
      const savedTheme = localStorage.getItem('frontdesk-theme');
      if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
      }

      router.push('/');
    } catch {
      setError('An error occurred during authentication. Please retry.');
      setLoading(false);
    }
  };

  const handleFillDemo = (agentEmail: string) => {
    setEmail(agentEmail);
    setPassword('frontdesk-agent');
    setError(null);
  };

  return (
    <div
      className="min-h-screen flex flex-col justify-center items-center px-4 py-12 sm:px-6 relative overflow-hidden bg-[#0F172A]"
      style={{
        background: 'radial-gradient(circle at 50% 0%, #1E293B 0%, #0F172A 70%)',
      }}
    >
      {/* Container Card (Light Theme Only) */}
      <div className="relative z-10 max-w-[400px] w-full bg-white rounded-xl border border-slate-200 shadow-xl p-8">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-7">
          <div className="w-10 h-10 rounded-lg bg-slate-900 border border-slate-800 text-white flex items-center justify-center font-bold text-sm tracking-tight mb-3.5 shadow-2xs">
            FD
          </div>
          <h1 className="text-xl font-bold tracking-[-0.02em] text-slate-900">
            Frontdesk
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Arvo Systems Support &bull; Staff Authentication
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-5 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2 text-xs text-rose-700">
            <svg className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Login form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="agent-email" className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500 mb-1.5">
              Email Address
            </label>
            <input
              id="agent-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="agent@frontdesk.test"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 text-sm placeholder-slate-400 focus:outline-hidden focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition shadow-2xs"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="agent-password" className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500">
                Password
              </label>
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                className="text-[11px] font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <input
              id="agent-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 text-sm placeholder-slate-400 focus:outline-hidden focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition shadow-2xs"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white font-medium text-sm rounded-lg border border-slate-800 shadow-2xs transition duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-current" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                <span>Authenticating...</span>
              </>
            ) : (
              <span>Sign In to Dashboard</span>
            )}
          </button>
        </form>

        {/* Demo credentials quick-fill */}
        <div className="mt-6 pt-5 border-t border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500">
              Demo Credentials
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              pw: frontdesk-agent
            </span>
          </div>
          <div className="space-y-1.5">
            {DEMO_AGENTS.map((ag) => (
              <button
                key={ag.id}
                type="button"
                onClick={() => handleFillDemo(ag.email)}
                className="w-full text-left px-2.5 py-1.5 rounded-md border border-slate-200/80 bg-slate-50/60 hover:bg-slate-100 hover:border-slate-300 transition flex items-center justify-between text-xs cursor-pointer group"
              >
                <span className="font-medium text-slate-700 group-hover:text-slate-900">
                  {ag.name}
                </span>
                <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                  {ag.email}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Footer navigation */}
        <div className="mt-6 text-center text-xs text-slate-500">
          Customer needing assistance?{' '}
          <Link
            href="/support"
            className="text-slate-900 font-medium hover:underline transition"
          >
            Contact support &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
