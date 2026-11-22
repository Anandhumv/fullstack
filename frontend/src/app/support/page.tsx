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
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [impact, setImpact] = useState<ImpactLevel>('MEDIUM');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedTicket, setSubmittedTicket] = useState<SubmittedTicket | null>(null);

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
      setError('Please provide a valid work email address.');
      return;
    }
    if (!subject.trim()) {
      setError('Please provide a subject summary.');
      return;
    }
    if (!message.trim()) {
      setError('Please describe your issue or request.');
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
      setReplySuccess('Reply delivered to assigned support agent.');
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

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-800 border border-slate-200 tabular-nums">
            Open
          </span>
        );
      case 'WAITING_ON_CUSTOMER':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[#FFFBEB] text-[#B45309] border border-[#FDE68A] tabular-nums">
            Waiting on You
          </span>
        );
      case 'RESOLVED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0] tabular-nums">
            Resolved
          </span>
        );
      case 'CLOSED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200 tabular-nums">
            Closed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200 tabular-nums">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-slate-900 border border-slate-800 text-white font-bold text-xs flex items-center justify-center tracking-tight shadow-2xs">
            AS
          </div>
          <span className="font-semibold text-slate-900 text-sm tracking-[-0.02em]">
            Arvo Systems Support
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 font-medium hidden sm:inline">
            Public Support Desk
          </span>
          <Link
            href="/login"
            className="text-xs text-slate-600 hover:text-slate-900 font-medium px-2.5 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 transition shadow-2xs"
          >
            Agent Sign In
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex flex-col items-center justify-start px-4 py-10 sm:py-14">
        {!submittedTicket ? (
          /* Form Card */
          <div className="max-w-[620px] w-full bg-white rounded-xl border border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-7 sm:p-9">
            {/* Header */}
            <div className="mb-7 pb-5 border-b border-slate-100">
              <h1 className="text-xl font-bold tracking-[-0.02em] text-slate-900">
                Contact Support
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                We respond within working hours (Mon–Fri, 09:30–18:30 IST).
              </p>
            </div>

            {/* Error banner */}
            {error && (
              <div className="mb-5 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-start gap-2">
                <svg className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Name & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="user-name" className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500 mb-1.5">
                    Your Name
                  </label>
                  <input
                    id="user-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Alex Chen"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 text-sm placeholder-slate-400 focus:outline-hidden focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition shadow-2xs"
                  />
                </div>

                <div>
                  <label htmlFor="user-email" className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500 mb-1.5">
                    Work Email
                  </label>
                  <input
                    id="user-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="alex@company.com"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 text-sm placeholder-slate-400 focus:outline-hidden focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition shadow-2xs"
                  />
                </div>
              </div>

              {/* Company */}
              <div>
                <label htmlFor="user-company" className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500 mb-1.5">
                  Company Name <span className="font-normal text-slate-400 lowercase">(optional)</span>
                </label>
                <input
                  id="user-company"
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Acme Inc."
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 text-sm placeholder-slate-400 focus:outline-hidden focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition shadow-2xs"
                />
              </div>

              {/* Severity Selection Cards */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500 mb-2">
                  Impact Level
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Card 1: Urgent */}
                  <div
                    onClick={() => setImpact('URGENT')}
                    className={`p-3.5 rounded-lg border transition cursor-pointer flex flex-col justify-between ${
                      impact === 'URGENT'
                        ? 'border-slate-900 bg-slate-50/80 shadow-xs ring-1 ring-slate-900'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-slate-900">Critical</span>
                        <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                          impact === 'URGENT' ? 'border-slate-900 bg-slate-900' : 'border-slate-300 bg-white'
                        }`}>
                          {impact === 'URGENT' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-snug">
                        Completely down or blocking work
                      </p>
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-slate-100">
                      <span className="inline-block text-[10px] font-medium text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded tabular-nums">
                        Urgent SLA (2h)
                      </span>
                    </div>
                  </div>

                  {/* Card 2: Medium */}
                  <div
                    onClick={() => setImpact('MEDIUM')}
                    className={`p-3.5 rounded-lg border transition cursor-pointer flex flex-col justify-between ${
                      impact === 'MEDIUM'
                        ? 'border-slate-900 bg-slate-50/80 shadow-xs ring-1 ring-slate-900'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-slate-900">Standard</span>
                        <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                          impact === 'MEDIUM' ? 'border-slate-900 bg-slate-900' : 'border-slate-300 bg-white'
                        }`}>
                          {impact === 'MEDIUM' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-snug">
                        Partly affected with workaround
                      </p>
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-slate-100">
                      <span className="inline-block text-[10px] font-medium text-amber-800 bg-[#FFFBEB] border border-[#FDE68A] px-1.5 py-0.5 rounded tabular-nums">
                        Medium SLA (4.5h)
                      </span>
                    </div>
                  </div>

                  {/* Card 3: Low */}
                  <div
                    onClick={() => setImpact('LOW')}
                    className={`p-3.5 rounded-lg border transition cursor-pointer flex flex-col justify-between ${
                      impact === 'LOW'
                        ? 'border-slate-900 bg-slate-50/80 shadow-xs ring-1 ring-slate-900'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-slate-900">Inquiry</span>
                        <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                          impact === 'LOW' ? 'border-slate-900 bg-slate-900' : 'border-slate-300 bg-white'
                        }`}>
                          {impact === 'LOW' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-snug">
                        Question, billing, or general request
                      </p>
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-slate-100">
                      <span className="inline-block text-[10px] font-medium text-slate-700 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded tabular-nums">
                        Low SLA (9h)
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Subject */}
              <div>
                <label htmlFor="ticket-subject" className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500 mb-1.5">
                  Subject Summary
                </label>
                <input
                  id="ticket-subject"
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Production API returning 500 on auth token refresh"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 text-sm placeholder-slate-400 focus:outline-hidden focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition shadow-2xs"
                />
              </div>

              {/* Message */}
              <div>
                <label htmlFor="ticket-message" className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500 mb-1.5">
                  Detailed Description
                </label>
                <textarea
                  id="ticket-message"
                  required
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Provide context, reproduction steps, or relevant identifiers..."
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 text-sm placeholder-slate-400 focus:outline-hidden focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition shadow-2xs font-sans resize-y"
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white font-medium text-sm rounded-lg border border-slate-800 shadow-2xs transition duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    <span>Submitting Request...</span>
                  </>
                ) : (
                  <span>Submit Support Request</span>
                )}
              </button>
            </form>
          </div>
        ) : (
          /* Confirmation Screen */
          <div className="max-w-[620px] w-full bg-white rounded-xl border border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-7 sm:p-9">
            <div className="flex flex-col items-center text-center pb-6 border-b border-slate-100">
              <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center mb-3">
                <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <h2 className="text-xl font-bold tracking-[-0.02em] text-slate-900">
                Support Request Received
              </h2>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                Your ticket has been queued for our support team.
              </p>
              <div className="mt-3.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-slate-50 border border-slate-200 text-slate-800 font-mono text-xs font-semibold tabular-nums">
                Ticket #{submittedTicket.id}
              </div>
            </div>

            {/* Ticket details summary */}
            <div className="py-5 space-y-2 text-xs border-b border-slate-100">
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Subject:</span>
                <span className="font-medium text-slate-900 text-right max-w-[320px] truncate">{submittedTicket.subject}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Priority:</span>
                <span className="font-medium text-slate-900">{submittedTicket.priority}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">SLA Window:</span>
                <span className="text-slate-700 tabular-nums">Mon–Fri, 09:30–18:30 IST</span>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-5 space-y-2.5">
              <button
                type="button"
                onClick={() => fetchCustomerTicketStatus(submittedTicket.id)}
                className="w-full py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs rounded-lg border border-slate-800 shadow-2xs transition cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Inspect Public Ticket Status</span>
              </button>

              <button
                type="button"
                onClick={handleResetForm}
                className="w-full py-2 px-4 bg-white hover:bg-slate-50 text-slate-600 font-medium text-xs rounded-lg border border-slate-200 transition cursor-pointer"
              >
                Submit another request
              </button>
            </div>

            {/* Zero-Leak Status Inspector */}
            {inspectingStatus && (
              <div className="mt-7 pt-6 border-t border-slate-200">
                <div className="flex items-center justify-between mb-3.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-900">
                      Ticket #{submittedTicket.id}
                    </span>
                    {customerData && renderStatusBadge(customerData.ticket.status)}
                  </div>
                  <button
                    onClick={() => fetchCustomerTicketStatus(submittedTicket.id)}
                    disabled={loadingStatus}
                    className="text-[11px] text-slate-600 hover:text-slate-900 font-medium transition cursor-pointer flex items-center gap-1"
                  >
                    <span>{loadingStatus ? 'Refreshing...' : 'Refresh'}</span>
                  </button>
                </div>

                {/* Zero Leak Banner */}
                <div className="mb-4 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 text-xs flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-slate-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span>
                    <strong>Zero-Leak Guarantee:</strong> Only public messages are transmitted on this endpoint. Private team notes are excluded.
                  </span>
                </div>

                {loadingStatus && !customerData ? (
                  <div className="py-6 text-center text-slate-400 text-xs">
                    Loading status...
                  </div>
                ) : customerData ? (
                  <div className="space-y-3.5">
                    {/* Original Request description */}
                    <div className="bg-slate-50/70 p-3.5 rounded-lg border border-slate-200/80">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-slate-400 mb-1">
                        Original Request
                      </div>
                      <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                        {customerData.ticket.description}
                      </p>
                    </div>

                    {/* Messages Thread */}
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500 mb-2">
                        Message History ({customerData.public_messages.length})
                      </div>
                      {customerData.public_messages.length === 0 ? (
                        <div className="p-3 bg-white border border-slate-200 rounded-lg text-xs text-slate-500 text-center">
                          No replies yet. An agent will respond within working hours.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {customerData.public_messages.map((msg) => {
                            const isAgent = msg.sender_role === 'agent';
                            return (
                              <div
                                key={msg.id}
                                className={`p-3 rounded-lg border text-xs ${
                                  isAgent
                                    ? 'bg-slate-50 border-slate-200 text-slate-900'
                                    : 'bg-white border-slate-200 text-slate-800'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-1 text-[11px]">
                                  <span className="font-semibold text-slate-900">
                                    {msg.sender_name || (isAgent ? 'Support Agent' : 'You')}
                                    {isAgent && (
                                      <span className="ml-1.5 px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 text-[9px] uppercase font-bold">
                                        Staff
                                      </span>
                                    )}
                                  </span>
                                  <span className="text-slate-400 text-[10px] tabular-nums">
                                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                                <p className="whitespace-pre-wrap leading-relaxed text-slate-700">{msg.body}</p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Reply Form */}
                    <form onSubmit={handleSendCustomerReply} className="mt-3">
                      {replySuccess && (
                        <div className="mb-2 p-2 bg-emerald-50 text-emerald-700 text-xs rounded border border-emerald-200">
                          {replySuccess}
                        </div>
                      )}
                      <textarea
                        rows={2}
                        value={customerReply}
                        onChange={(e) => setCustomerReply(e.target.value)}
                        placeholder="Add a reply or extra information..."
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 text-xs focus:outline-hidden focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition font-sans"
                      />
                      <div className="mt-1.5 flex justify-end">
                        <button
                          type="submit"
                          disabled={sendingReply || !customerReply.trim()}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-md border border-slate-800 shadow-2xs transition disabled:opacity-50 cursor-pointer"
                        >
                          {sendingReply ? 'Sending...' : 'Send Message'}
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
