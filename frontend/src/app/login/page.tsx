'use client';

import React, { useState } from 'react';
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail) {
      setError('Please enter your agent email address.');
      setLoading(false);
      return;
    }

    if (!cleanPassword) {
      setError('Please enter your password.');
      setLoading(false);
      return;
    }

    if (cleanPassword !== 'frontdesk-agent') {
      setError('Invalid password. Demo password is frontdesk-agent');
      setLoading(false);
      return;
    }

    try {
      // Fetch current agents list from backend, with DEMO_AGENTS fallback
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
        // Use DEMO_AGENTS fallback if network/cold start
      }

      const matchedAgent = agentList.find(
        (a) => a.email.toLowerCase() === cleanEmail
      );

      if (!matchedAgent) {
        setError('Agent email not recognized. Please use one of the seeded demo agent accounts.');
        setLoading(false);
        return;
      }

      // Save logged-in agent to localStorage
      localStorage.setItem('frontdesk_agent', JSON.stringify(matchedAgent));

      // Redirect to the Agent Dashboard
      router.push('/');
    } catch {
      setError('An error occurred during login. Please try again.');
      setLoading(false);
    }
  };

  const handleFillDemo = (agentEmail: string) => {
    setEmail(agentEmail);
    setPassword('frontdesk-agent');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center px-4 py-12 sm:px-6 lg:px-8">
      {/* Centered White Card */}
      <div className="max-w-md w-full bg-white rounded-2xl shadow-md border border-slate-200/80 p-8 sm:p-10">
        {/* Brand Icon & Heading */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-blue-600 text-white font-black text-2xl flex items-center justify-center mx-auto mb-3 shadow-xs">
            F
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Frontdesk</h1>
          <p className="text-sm text-slate-500 mt-1 font-medium">Arvo Systems support: agent login</p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-3.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex items-start gap-2.5">
            <span className="text-red-500 font-bold shrink-0">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email input */}
          <div>
            <label htmlFor="agent-email" className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Email
            </label>
            <input
              id="agent-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. meera@frontdesk.test"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
            />
          </div>

          {/* Password input with Show/Hide toggle */}
          <div>
            <label htmlFor="agent-password" className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                id="agent-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-3.5 py-2.5 pr-20 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-xs font-semibold text-slate-500 hover:text-slate-800 transition cursor-pointer"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {/* Full-width blue Log in button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-sm rounded-lg shadow-xs transition duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                <span>Logging in...</span>
              </>
            ) : (
              <span>Log in</span>
            )}
          </button>
        </form>

        {/* Helper text showing seeded demo agents and demo password */}
        <div className="mt-6 pt-5 border-t border-slate-200">
          <p className="text-xs font-semibold text-slate-700 mb-2">
            Demo Credentials <span className="font-normal text-slate-500">(password: <code className="bg-slate-100 text-blue-700 font-mono px-1.5 py-0.5 rounded text-[11px] font-bold">frontdesk-agent</code>)</span>:
          </p>
          <div className="space-y-1.5">
            {DEMO_AGENTS.map((ag) => (
              <button
                key={ag.id}
                type="button"
                onClick={() => handleFillDemo(ag.email)}
                className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-blue-50/80 transition flex items-center justify-between text-xs group cursor-pointer border border-transparent hover:border-blue-200"
              >
                <span className="font-medium text-slate-700 group-hover:text-blue-700">
                  {ag.name}
                </span>
                <span className="font-mono text-slate-500 text-[11px] group-hover:text-blue-600">
                  {ag.email}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Bottom link: Not an agent? Customer portal: contact support */}
        <div className="mt-6 text-center text-xs text-slate-600">
          Not an agent?{' '}
          <Link
            href="/support"
            className="text-blue-600 hover:text-blue-800 font-semibold underline underline-offset-2 transition"
          >
            Customer portal: contact support →
          </Link>
        </div>
      </div>
    </div>
  );
}

