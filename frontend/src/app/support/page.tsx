'use client';

import React, { useState } from 'react';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

type ImpactLevel = 'URGENT' | 'MEDIUM' | 'LOW';

interface SubmittedTicket {
  id: number;
  subject: string;
  description: string;
  priority: ImpactLevel;
  status: string;
  customer_id: number;
  created_at: string;
}

interface CustomerViewData {
  ticket: {
    id: number;
    subject: string;
    description: string;
    priority: string;
    status: string;
    created_at: string;
    first_replied_at: string | null;
    resolved_at: string | null;
    customer_name?: string;
    customer_email?: string;
  };
  public_messages: Array<{
    id: number;
    ticket_id: number;
    sender_id: number;
    body: string;
    created_at: string;
    sender_name?: string;
    sender_role?: string;
  }>;
}

export default function CustomerSupportPortal() {
  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [impact, setImpact] = useState<ImpactLevel>('MEDIUM');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedTicket, setSubmittedTicket] = useState<SubmittedTicket | null>(null);

  // Status inspection state
  const [inspectingStatus, setInspectingStatus] = useState(false);
  const [customerData, setCustomerData] = useState<CustomerViewData | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [customerReply, setCustomerReply] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [replySuccess, setReplySuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Please provide your name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Please provide a valid email address.');
      return;
    }
    if (!subject.trim()) {
      setError('Please provide a subject for your request.');
      return;
    }
    if (!message.trim()) {
      setError('Please describe your issue or message.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE}/api/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          company: company.trim() || undefined,
          subject: subject.trim(),
          description: company.trim()
            ? `[Company: ${company.trim()}]\n\n${message.trim()}`
            : message.trim(),
          priority: impact,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to submit support request');
      }

      const ticket: SubmittedTicket = await res.json();
      setSubmittedTicket(ticket);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to submit support request. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const fetchCustomerTicketStatus = async (ticketId: number) => {
    setLoadingStatus(true);
    setInspectingStatus(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/customer/tickets/${ticketId}`);
      if (!res.ok) {
        throw new Error('Unable to fetch ticket status');
      }
      const data: CustomerViewData = await res.json();
      setCustomerData(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to load ticket status');
      }
    } finally {
      setLoadingStatus(false);
    }
  };

  const handleSendCustomerReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerReply.trim() || !submittedTicket) return;

    setSendingReply(true);
    setReplySuccess(null);
    try {
      const res = await fetch(`${API_BASE}/api/tickets/${submittedTicket.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_id: submittedTicket.customer_id,
          body: customerReply.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to send message');
      }

      setCustomerReply('');
      setReplySuccess('Reply sent to support agents.');
      // Refresh status view
      await fetchCustomerTicketStatus(submittedTicket.id);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      }
    } finally {
      setSendingReply(false);
    }
  };

  const handleResetForm = () => {
    setSubmittedTicket(null);
    setInspectingStatus(false);
    setCustomerData(null);
    setSubject('');
    setMessage('');
    setCompany('');
    setError(null);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">Open</span>;
      case 'WAITING_ON_CUSTOMER':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800">Waiting on Customer</span>;
      case 'RESOLVED':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">Resolved</span>;
      case 'CLOSED':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-800">Closed</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">{status}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Bar */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white font-black text-base flex items-center justify-center shadow-xs">
            A
          </div>
          <span className="font-bold text-slate-900 text-base sm:text-lg tracking-tight">
            Arvo Systems Support
          </span>
        </div>

        <div className="flex items-center gap-3 sm:gap-4 text-xs font-medium">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 font-semibold border border-blue-200/60">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
            New request
          </span>
          <Link
            href="/login"
            className="text-slate-600 hover:text-slate-900 px-2.5 py-1 rounded-md hover:bg-slate-100 transition"
          >
            Agent login
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-start px-4 py-8 sm:py-12">
        {!submittedTicket ? (
          /* Clean White Card: Contact Support Form */
          <div className="max-w-2xl w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-10">
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Contact support</h1>
              <p className="text-sm text-slate-500 mt-1 font-medium">
                We reply within working hours (Mon–Fri, 09:30–18:30 IST).
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-6 p-3.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex items-start gap-2.5">
                <span className="text-red-500 font-bold shrink-0">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Your name and Email side-by-side */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="user-name" className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                    Your name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="user-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Alex Chen"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                  />
                </div>

                <div>
                  <label htmlFor="user-email" className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                    Email address <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="user-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. alex@example.com"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                  />
                </div>
              </div>

              {/* Company (optional) full-width input */}
              <div>
                <label htmlFor="user-company" className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                  Company <span className="text-slate-400 font-normal lowercase">(optional)</span>
                </label>
                <input
                  id="user-company"
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="e.g. Acme Corporation"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                />
              </div>

              {/* How much is this affecting you? — 3 selectable radio cards */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2.5">
                  How much is this affecting you?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Option 1: I can't work at all -> URGENT */}
                  <label
                    onClick={() => setImpact('URGENT')}
                    className={`p-3.5 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between ${
                      impact === 'URGENT'
                        ? 'border-red-500 bg-red-50/50 shadow-xs'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1.5">
                      <span className="text-xs font-bold text-slate-900">I can&apos;t work at all</span>
                      <input
                        type="radio"
                        name="impact"
                        checked={impact === 'URGENT'}
                        onChange={() => setImpact('URGENT')}
                        className="text-red-600 focus:ring-red-500 mt-0.5 cursor-pointer"
                      />
                    </div>
                    <p className="text-xs text-slate-500 leading-snug">
                      Something is down or blocking you completely
                    </p>
                    <div className="mt-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                        Urgent SLA (4h)
                      </span>
                    </div>
                  </label>

                  {/* Option 2: Partly affected -> MEDIUM */}
                  <label
                    onClick={() => setImpact('MEDIUM')}
                    className={`p-3.5 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between ${
                      impact === 'MEDIUM'
                        ? 'border-blue-600 bg-blue-50/50 shadow-xs'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1.5">
                      <span className="text-xs font-bold text-slate-900">Partly affected</span>
                      <input
                        type="radio"
                        name="impact"
                        checked={impact === 'MEDIUM'}
                        onChange={() => setImpact('MEDIUM')}
                        className="text-blue-600 focus:ring-blue-500 mt-0.5 cursor-pointer"
                      />
                    </div>
                    <p className="text-xs text-slate-500 leading-snug">
                      Something is broken but you can work around it
                    </p>
                    <div className="mt-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                        Medium SLA (16h)
                      </span>
                    </div>
                  </label>

                  {/* Option 3: Just a question -> LOW */}
                  <label
                    onClick={() => setImpact('LOW')}
                    className={`p-3.5 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between ${
                      impact === 'LOW'
                        ? 'border-emerald-600 bg-emerald-50/50 shadow-xs'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1.5">
                      <span className="text-xs font-bold text-slate-900">Just a question</span>
                      <input
                        type="radio"
                        name="impact"
                        checked={impact === 'LOW'}
                        onChange={() => setImpact('LOW')}
                        className="text-emerald-600 focus:ring-emerald-500 mt-0.5 cursor-pointer"
                      />
                    </div>
                    <p className="text-xs text-slate-500 leading-snug">
                      How-to, billing, or a general request
                    </p>
                    <div className="mt-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                        Low SLA (24h)
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Subject input */}
              <div>
                <label htmlFor="ticket-subject" className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                  Subject <span className="text-red-500">*</span>
                </label>
                <input
                  id="ticket-subject"
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Production API returning 500 error on checkout"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                />
              </div>

              {/* Message textarea */}
              <div>
                <label htmlFor="ticket-message" className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                  Message <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="ticket-message"
                  required
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Please describe the issue in detail, including steps to reproduce, relevant error logs, or links..."
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition font-sans"
                />
              </div>

              {/* Blue Submit request button */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-sm rounded-lg shadow-sm transition duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    <span>Submitting request...</span>
                  </>
                ) : (
                  <span>Submit request</span>
                )}
              </button>
            </form>
          </div>
        ) : (
          /* Confirmation Screen */
          <div className="max-w-2xl w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-10">
            {/* Green Success Badge */}
            <div className="flex flex-col items-center text-center pb-6 border-b border-slate-200">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-2xl font-bold mb-3">
                ✓
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Request submitted successfully</h2>
              <p className="text-sm text-slate-500 mt-1 max-w-md">
                We have received your support request and assigned it ticket ID:
              </p>
              <div className="mt-3 inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 font-mono font-bold text-base">
                #{submittedTicket.id}
              </div>
            </div>

            {/* Submitted Ticket Summary */}
            <div className="py-6 space-y-3 text-sm border-b border-slate-200">
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Subject:</span>
                <span className="font-semibold text-slate-900 text-right max-w-sm truncate">{submittedTicket.subject}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Priority:</span>
                <span className="font-semibold text-slate-900">{submittedTicket.priority}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Operating SLA:</span>
                <span className="text-slate-700 font-medium">Mon–Fri, 09:30–18:30 IST</span>
              </div>
            </div>

            {/* Actions: View status or submit another */}
            <div className="pt-6 space-y-3">
              <button
                type="button"
                onClick={() => fetchCustomerTicketStatus(submittedTicket.id)}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg shadow-xs transition cursor-pointer flex items-center justify-center gap-2"
              >
                <span>View ticket status (Zero-Leak View)</span>
              </button>

              <button
                type="button"
                onClick={handleResetForm}
                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-sm rounded-lg transition cursor-pointer"
              >
                Submit another request
              </button>
            </div>

            {/* Zero-Leak Ticket Inspector Modal / Section */}
            {inspectingStatus && (
              <div className="mt-8 pt-6 border-t border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900 text-base">
                      Customer Status: Ticket #{submittedTicket.id}
                    </h3>
                    {customerData && getStatusBadge(customerData.ticket.status)}
                  </div>
                  <button
                    onClick={() => fetchCustomerTicketStatus(submittedTicket.id)}
                    disabled={loadingStatus}
                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                  >
                    {loadingStatus ? 'Refreshing...' : '↻ Refresh'}
                  </button>
                </div>

                {/* Zero Leak Banner */}
                <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-center gap-2">
                  <span>🔒</span>
                  <span>
                    <strong>Zero-Leak Guarantee:</strong> Only public messages and ticket details are accessible via this customer endpoint. Internal agent notes are never exposed.
                  </span>
                </div>

                {loadingStatus && !customerData ? (
                  <div className="py-8 text-center text-slate-400 text-sm">
                    Fetching ticket status...
                  </div>
                ) : customerData ? (
                  <div className="space-y-4">
                    {/* Ticket Details Box */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                        Initial Request
                      </div>
                      <p className="text-sm text-slate-800 whitespace-pre-wrap">
                        {customerData.ticket.description}
                      </p>
                    </div>

                    {/* Messages Thread */}
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                        Message History ({customerData.public_messages.length})
                      </div>
                      {customerData.public_messages.length === 0 ? (
                        <div className="p-4 bg-slate-50 rounded-lg text-xs text-slate-500 text-center">
                          No replies yet. An agent will respond within working hours.
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {customerData.public_messages.map((msg) => {
                            const isAgent = msg.sender_role === 'agent';
                            return (
                              <div
                                key={msg.id}
                                className={`p-3.5 rounded-xl border text-sm ${
                                  isAgent
                                    ? 'bg-blue-50/60 border-blue-200 text-slate-900'
                                    : 'bg-white border-slate-200 text-slate-800'
                                }`}
                              >
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className="font-bold text-slate-900">
                                    {msg.sender_name || (isAgent ? 'Support Agent' : 'You')}
                                    {isAgent && (
                                      <span className="ml-1.5 px-1.5 py-0.2 rounded bg-blue-600 text-white text-[10px] uppercase font-bold">
                                        Agent
                                      </span>
                                    )}
                                  </span>
                                  <span className="text-slate-400 text-[11px]">
                                    {new Date(msg.created_at).toLocaleString()}
                                  </span>
                                </div>
                                <p className="whitespace-pre-wrap">{msg.body}</p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Customer Reply Composer */}
                    <form onSubmit={handleSendCustomerReply} className="mt-4">
                      {replySuccess && (
                        <div className="mb-2 p-2 bg-emerald-50 text-emerald-700 text-xs rounded border border-emerald-200">
                          {replySuccess}
                        </div>
                      )}
                      <textarea
                        rows={3}
                        value={customerReply}
                        onChange={(e) => setCustomerReply(e.target.value)}
                        placeholder="Add a reply or follow-up note..."
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-sans"
                      />
                      <div className="mt-2 flex justify-end">
                        <button
                          type="submit"
                          disabled={sendingReply || !customerReply.trim()}
                          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md shadow-2xs transition disabled:opacity-50 cursor-pointer"
                        >
                          {sendingReply ? 'Sending...' : 'Send Reply'}
                        </button>
                      </div>
                    </form>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

