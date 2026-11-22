'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

interface User {
  id: number;
  name: string;
  email: string;
  role: 'agent' | 'customer';
}

interface SLAData {
  firstReplyDueAt?: string;
  resolutionDueAt?: string;
  isFirstReplyBreached?: boolean;
  isResolutionBreached?: boolean;
  isLate?: boolean;
  workingMinutesElapsed?: number;
}

interface Ticket {
  id: number;
  subject: string;
  description: string;
  priority: 'URGENT' | 'MEDIUM' | 'LOW';
  status: 'OPEN' | 'WAITING_ON_CUSTOMER' | 'RESOLVED' | 'CLOSED';
  customer_id: number;
  assigned_agent_id: number | null;
  created_at: string;
  first_replied_at: string | null;
  resolved_at: string | null;
  paused_at: string | null;
  total_paused_seconds: number;
  customer_name?: string;
  customer_email?: string;
  assigned_agent_name?: string;
  assigned_agent_email?: string;
  sla?: SLAData;
}

interface PublicMessage {
  id: number;
  ticket_id: number;
  sender_id: number;
  body: string;
  created_at: string;
  sender_name?: string;
  sender_role?: string;
}

interface InternalNote {
  id: number;
  ticket_id: number;
  agent_id: number;
  body: string;
  created_at: string;
  agent_name?: string;
}

interface AuditLog {
  id: number;
  ticket_id: number;
  actor_id: number | null;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
  actor_name?: string;
  actor_role?: string;
}

interface DetailedTicketData {
  ticket: Ticket;
  public_messages: PublicMessage[];
  internal_notes: InternalNote[];
  audit_logs: AuditLog[];
  sla?: SLAData;
}

const DEFAULT_AGENTS: User[] = [
  { id: 1, name: 'Meera Sharma', email: 'meera@frontdesk.test', role: 'agent' },
  { id: 2, name: 'Rahul Verma', email: 'rahul@frontdesk.test', role: 'agent' },
  { id: 3, name: 'Priya Patel', email: 'priya@frontdesk.test', role: 'agent' },
];

export default function AgentDashboard() {
  // Current logged in agent selector
  const [agents, setAgents] = useState<User[]>(DEFAULT_AGENTS);
  const [currentAgent, setCurrentAgent] = useState<User>(DEFAULT_AGENTS[0]);

  // Queue state
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState<boolean>(true);
  const [queueFilter, setQueueFilter] = useState<'ALL' | 'LATE' | 'WAITING' | 'UNASSIGNED'>('ALL');
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);

  // Selected ticket details
  const [selectedDetails, setSelectedDetails] = useState<DetailedTicketData | null>(null);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);

  // Composer state
  const [composerMode, setComposerMode] = useState<'reply' | 'note'>('reply');
  const [composerText, setComposerText] = useState<string>('');
  const [submittingAction, setSubmittingAction] = useState<boolean>(false);

  // Alerts and modals
  const [conflictAlert, setConflictAlert] = useState<string | null>(null);
  const [generalAlert, setGeneralAlert] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Audit tab/collapse
  const [showAuditLogs, setShowAuditLogs] = useState<boolean>(false);

  // Fetch agents list
  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/users?role=agent`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setAgents(data);
          // Preserve currently selected agent ID if possible
          setCurrentAgent((prev) => data.find((a: User) => a.id === prev.id) || data[0]);
        }
      }
    } catch {
      // Use DEFAULT_AGENTS fallback
    }
  }, []);

  // Fetch ticket queue
  const fetchTickets = useCallback(async (preserveSelectedId = true) => {
    setLoadingTickets(true);
    try {
      const res = await fetch(`${API_BASE}/api/tickets`);
      if (res.ok) {
        const data = await res.json();
        setTickets(data);
        if (data.length > 0) {
          setSelectedTicketId((prev) => {
            if (preserveSelectedId && prev && data.some((t: Ticket) => t.id === prev)) {
              return prev;
            }
            return data[0].id;
          });
        } else {
          setSelectedTicketId(null);
        }
      } else {
        setGeneralAlert({ type: 'error', text: `Failed to load tickets (Status: ${res.status})` });
      }
    } catch {
      setGeneralAlert({
        type: 'error',
        text: `Cannot connect to backend API at ${API_BASE}. Make sure the backend server is running.`,
      });
    } finally {
      setLoadingTickets(false);
    }
  }, []);

  // Fetch single ticket details
  const fetchTicketDetails = useCallback(async (id: number) => {
    setLoadingDetails(true);
    setConflictAlert(null);
    try {
      const res = await fetch(`${API_BASE}/api/tickets/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedDetails(data);
      } else {
        setGeneralAlert({ type: 'error', text: `Error fetching ticket #${id} details` });
      }
    } catch {
      setGeneralAlert({ type: 'error', text: 'Network error while fetching ticket details' });
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchAgents();
    fetchTickets();
  }, [fetchAgents, fetchTickets]);

  // Load details when selected ticket changes
  useEffect(() => {
    if (selectedTicketId) {
      fetchTicketDetails(selectedTicketId);
    } else {
      setSelectedDetails(null);
    }
  }, [selectedTicketId, fetchTicketDetails]);

  // Filtered queue
  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      if (queueFilter === 'LATE') {
        return ticket.sla?.isLate === true;
      }
      if (queueFilter === 'WAITING') {
        return ticket.status === 'WAITING_ON_CUSTOMER';
      }
      if (queueFilter === 'UNASSIGNED') {
        return ticket.assigned_agent_id === null || ticket.assigned_agent_id === undefined;
      }
      return true;
    });
  }, [tickets, queueFilter]);

  // Claim Ticket Handler (Atomic test with 409 Conflict check)
  const handleClaimTicket = async () => {
    if (!selectedTicketId || !currentAgent) return;
    setConflictAlert(null);
    setSubmittingAction(true);
    try {
      const res = await fetch(`${API_BASE}/api/tickets/${selectedTicketId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: currentAgent.id }),
      });

      if (res.status === 409) {
        const errorData = await res.json();
        setConflictAlert(errorData.error || 'Ticket already claimed by another agent');
        // Refresh ticket details to see current owner
        fetchTicketDetails(selectedTicketId);
        fetchTickets();
        return;
      }

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to claim ticket');
      }

      setGeneralAlert({ type: 'success', text: `Ticket #${selectedTicketId} successfully claimed by ${currentAgent.name}!` });
      await fetchTicketDetails(selectedTicketId);
      await fetchTickets();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error claiming ticket';
      setGeneralAlert({ type: 'error', text: msg });
    } finally {
      setSubmittingAction(false);
    }
  };

  // Change Priority Handler
  const handleChangePriority = async (newPriority: 'URGENT' | 'MEDIUM' | 'LOW') => {
    if (!selectedTicketId) return;
    setSubmittingAction(true);
    try {
      const res = await fetch(`${API_BASE}/api/tickets/${selectedTicketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: newPriority, actor_id: currentAgent.id }),
      });

      if (!res.ok) throw new Error('Failed to update priority');

      setGeneralAlert({ type: 'success', text: `Priority changed to ${newPriority}` });
      await fetchTicketDetails(selectedTicketId);
      await fetchTickets();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating priority';
      setGeneralAlert({ type: 'error', text: msg });
    } finally {
      setSubmittingAction(false);
    }
  };

  // Resolve Ticket Handler
  const handleResolveTicket = async () => {
    if (!selectedTicketId) return;
    setSubmittingAction(true);
    try {
      const res = await fetch(`${API_BASE}/api/tickets/${selectedTicketId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor_id: currentAgent.id }),
      });

      if (!res.ok) throw new Error('Failed to resolve ticket');

      setGeneralAlert({ type: 'success', text: `Ticket #${selectedTicketId} resolved` });
      await fetchTicketDetails(selectedTicketId);
      await fetchTickets();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error resolving ticket';
      setGeneralAlert({ type: 'error', text: msg });
    } finally {
      setSubmittingAction(false);
    }
  };

  // Reopen Ticket Handler
  const handleReopenTicket = async () => {
    if (!selectedTicketId) return;
    setSubmittingAction(true);
    try {
      const res = await fetch(`${API_BASE}/api/tickets/${selectedTicketId}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor_id: currentAgent.id, reason: 'Customer requested update on resolved case' }),
      });

      if (!res.ok) throw new Error('Failed to reopen ticket');
      const data = await res.json();

      if (data.isNewTicket) {
        setGeneralAlert({
          type: 'info',
          text: `Original ticket was resolved > 7 days ago. Automatically created new linked ticket #${data.ticket.id}.`,
        });
        await fetchTickets();
        setSelectedTicketId(data.ticket.id);
      } else {
        setGeneralAlert({ type: 'success', text: `Ticket #${selectedTicketId} reopened successfully.` });
        await fetchTicketDetails(selectedTicketId);
        await fetchTickets();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error reopening ticket';
      setGeneralAlert({ type: 'error', text: msg });
    } finally {
      setSubmittingAction(false);
    }
  };

  // Submit Reply / Note Handler
  const handleSubmitMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicketId || !composerText.trim()) return;

    setSubmittingAction(true);
    try {
      if (composerMode === 'reply') {
        // Public Reply to Customer
        const res = await fetch(`${API_BASE}/api/tickets/${selectedTicketId}/reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sender_id: currentAgent.id, body: composerText.trim() }),
        });

        if (!res.ok) throw new Error('Failed to send public reply');
        setGeneralAlert({ type: 'success', text: 'Public reply sent to customer (Ticket set to WAITING_ON_CUSTOMER)' });
      } else {
        // Private Internal Note
        const res = await fetch(`${API_BASE}/api/tickets/${selectedTicketId}/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_id: currentAgent.id, body: composerText.trim() }),
        });

        if (!res.ok) throw new Error('Failed to save internal note');
        setGeneralAlert({ type: 'success', text: 'Private team note recorded (Zero-leak verified)' });
      }

      setComposerText('');
      await fetchTicketDetails(selectedTicketId);
      await fetchTickets();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error submitting message';
      setGeneralAlert({ type: 'error', text: msg });
    } finally {
      setSubmittingAction(false);
    }
  };

  // Combined conversation timeline (sorted chronologically)
  const conversationFeed = useMemo(() => {
    if (!selectedDetails) return [];
    const publicMsgs = (selectedDetails.public_messages || []).map((m) => ({
      ...m,
      type: 'public' as const,
      timestamp: new Date(m.created_at).getTime(),
    }));
    const internalNotes = (selectedDetails.internal_notes || []).map((n) => ({
      ...n,
      type: 'note' as const,
      timestamp: new Date(n.created_at).getTime(),
    }));

    return [...publicMsgs, ...internalNotes].sort((a, b) => a.timestamp - b.timestamp);
  }, [selectedDetails]);

  // Helpers for Badges
  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'URGENT':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-red-100 text-red-800 border border-red-200">URGENT</span>;
      case 'MEDIUM':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-100 text-amber-800 border border-amber-200">MEDIUM</span>;
      case 'LOW':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-slate-100 text-slate-700 border border-slate-200">LOW</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-gray-100 text-gray-700">{priority}</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-100 text-emerald-800 border border-emerald-200">OPEN</span>;
      case 'WAITING_ON_CUSTOMER':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-purple-100 text-purple-800 border border-purple-200">WAITING ON CUSTOMER</span>;
      case 'RESOLVED':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-blue-100 text-blue-800 border border-blue-200">RESOLVED</span>;
      case 'CLOSED':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-gray-200 text-gray-800 border border-gray-300">CLOSED</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-gray-100 text-gray-700">{status}</span>;
    }
  };

  const formatDateTime = (dateStr?: string | null) => {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-100 text-slate-900 font-sans">
      {/* 1. TOP BAR */}
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shadow-xs shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
            F
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Frontdesk</h1>
            <p className="text-xs text-slate-500 hidden sm:block">Support Operations & SLA Control Center</p>
          </div>
        </div>

        {/* Acting As Agent Selector */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-1.5 shadow-2xs">
            <span className="text-xs font-medium text-slate-600 pl-2">Acting as Agent:</span>
            <select
              value={currentAgent.id}
              onChange={(e) => {
                const ag = agents.find((a) => a.id === Number(e.target.value));
                if (ag) {
                  setCurrentAgent(ag);
                  setConflictAlert(null);
                }
              }}
              className="bg-white border border-slate-300 text-slate-900 text-sm font-semibold rounded-md px-3 py-1 focus:ring-2 focus:ring-blue-500 focus:outline-hidden cursor-pointer"
            >
              {agents.map((ag) => (
                <option key={ag.id} value={ag.id}>
                  {ag.name} (Agent #{ag.id})
                </option>
              ))}
            </select>
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 mr-2" title="Online" />
          </div>

          <button
            onClick={() => fetchTickets()}
            title="Refresh Queue"
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
          >
            <svg className={`w-5 h-5 ${loadingTickets ? 'animate-spin text-blue-600' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </header>

      {/* Global Alerts Banner */}
      {generalAlert && (
        <div
          className={`px-6 py-2.5 text-sm flex items-center justify-between transition-all ${
            generalAlert.type === 'error'
              ? 'bg-red-500 text-white'
              : generalAlert.type === 'success'
              ? 'bg-emerald-600 text-white'
              : 'bg-blue-600 text-white'
          }`}
        >
          <span>{generalAlert.text}</span>
          <button
            onClick={() => setGeneralAlert(null)}
            className="text-white hover:text-slate-200 font-bold ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* MAIN TWO-PANEL LAYOUT */}
      <div className="flex flex-1 overflow-hidden">
        {/* 2. LEFT PANEL: TICKET QUEUE */}
        <section className="w-full md:w-96 lg:w-[420px] bg-white border-r border-slate-200 flex flex-col shrink-0">
          {/* Queue Filter Tabs */}
          <div className="p-3 border-b border-slate-200 bg-slate-50/70">
            <div className="grid grid-cols-4 gap-1 bg-slate-200/80 p-1 rounded-lg text-xs font-semibold">
              <button
                onClick={() => setQueueFilter('ALL')}
                className={`py-1.5 px-2 rounded-md transition text-center ${
                  queueFilter === 'ALL' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setQueueFilter('LATE')}
                className={`py-1.5 px-2 rounded-md transition text-center flex items-center justify-center gap-1 ${
                  queueFilter === 'LATE' ? 'bg-white text-red-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Late</span>
                <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
              </button>
              <button
                onClick={() => setQueueFilter('WAITING')}
                className={`py-1.5 px-2 rounded-md transition text-center truncate ${
                  queueFilter === 'WAITING' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Waiting on Customer"
              >
                Waiting
              </button>
              <button
                onClick={() => setQueueFilter('UNASSIGNED')}
                className={`py-1.5 px-2 rounded-md transition text-center truncate ${
                  queueFilter === 'UNASSIGNED' ? 'bg-white text-amber-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Unassigned
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500 px-1">
              <span>Showing {filteredTickets.length} tickets</span>
              <span>Sorted by newest</span>
            </div>
          </div>

          {/* Ticket Card List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loadingTickets && tickets.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">Loading tickets...</div>
            ) : filteredTickets.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                No tickets match the selected filter.
              </div>
            ) : (
              filteredTickets.map((ticket) => {
                const isSelected = ticket.id === selectedTicketId;
                const isLate = ticket.sla?.isLate === true;

                return (
                  <div
                    key={ticket.id}
                    onClick={() => setSelectedTicketId(ticket.id)}
                    className={`p-4 cursor-pointer transition-colors relative hover:bg-slate-50 ${
                      isSelected
                        ? 'bg-blue-50/70 border-l-4 border-l-blue-600'
                        : 'border-l-4 border-l-transparent'
                    }`}
                  >
                    {/* Top Row: ID, Badges, LATE flag */}
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono font-bold text-slate-500">#{ticket.id}</span>
                        {getPriorityBadge(ticket.priority)}
                        {getStatusBadge(ticket.status)}
                      </div>

                      {/* CLEAR RED LATE BADGE */}
                      {isLate && (
                        <span className="inline-flex items-center gap-1 bg-red-600 text-white font-extrabold text-[10px] tracking-wider uppercase px-2 py-0.5 rounded shadow-xs animate-pulse">
                          <span>●</span> LATE
                        </span>
                      )}
                    </div>

                    {/* Subject */}
                    <h3 className="font-semibold text-slate-900 text-sm line-clamp-1 mb-1">
                      {ticket.subject}
                    </h3>

                    {/* Assigned Agent & Customer */}
                    <div className="flex items-center justify-between text-xs text-slate-500 mt-2">
                      <div className="flex items-center gap-1 truncate">
                        <span>👤</span>
                        {ticket.assigned_agent_id ? (
                          <span className="text-slate-700 font-medium truncate">
                            {ticket.assigned_agent_name || `Agent #${ticket.assigned_agent_id}`}
                          </span>
                        ) : (
                          <span className="text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            Unassigned
                          </span>
                        )}
                      </div>
                      <span className="shrink-0 text-slate-400 text-[11px]">
                        {formatDateTime(ticket.created_at)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* 3. RIGHT PANEL: SELECTED TICKET DETAIL */}
        <main className="flex-1 bg-slate-50 flex flex-col overflow-y-auto">
          {loadingDetails && !selectedDetails ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
              Loading ticket details...
            </div>
          ) : !selectedDetails ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center text-slate-400 text-2xl mb-3">
                📋
              </div>
              <h3 className="text-base font-semibold text-slate-700">No ticket selected</h3>
              <p className="text-sm max-w-sm mt-1 text-slate-500">
                Choose a ticket from the left panel to inspect details, send replies, post internal notes, and view immutable audit history.
              </p>
            </div>
          ) : (
            <div className="flex flex-col flex-1">
              {/* Conflict Alert Banner (409 Conflict) */}
              {conflictAlert && (
                <div className="m-4 mb-0 bg-red-100 border-l-4 border-red-600 p-4 rounded-r-lg shadow-sm flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <span className="text-xl">⚠️</span>
                    <div>
                      <h4 className="font-bold text-red-900 text-sm">Claim Conflict Detected (409)</h4>
                      <p className="text-sm text-red-800 mt-0.5">{conflictAlert}</p>
                      <p className="text-xs text-red-700 mt-1">
                        Another agent has already claimed this ticket. Please refresh or select an unassigned ticket.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setConflictAlert(null)}
                    className="text-red-700 hover:text-red-900 font-bold text-sm"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* TICKET DETAIL HEADER */}
              <div className="bg-white border-b border-slate-200 p-6 shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  {/* Title & Metadata */}
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs font-bold text-slate-500">
                        Ticket #{selectedDetails.ticket.id}
                      </span>
                      {getStatusBadge(selectedDetails.ticket.status)}
                      {selectedDetails.sla?.isLate && (
                        <span className="bg-red-600 text-white font-bold text-xs px-2 py-0.5 rounded shadow-2xs">
                          SLA BREACHED
                        </span>
                      )}
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                      {selectedDetails.ticket.subject}
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                      Reported by{' '}
                      <span className="font-medium text-slate-700">
                        {selectedDetails.ticket.customer_name || 'Customer'}
                      </span>{' '}
                      ({selectedDetails.ticket.customer_email || 'No email'}) • Created{' '}
                      {formatDateTime(selectedDetails.ticket.created_at)}
                    </p>
                  </div>

                  {/* Header Actions: Priority Dropdown, Claim Button, Resolve Button */}
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Priority Selector */}
                    <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
                      <span className="text-xs text-slate-500 font-medium">Priority:</span>
                      <select
                        value={selectedDetails.ticket.priority}
                        disabled={submittingAction}
                        onChange={(e) =>
                          handleChangePriority(e.target.value as 'URGENT' | 'MEDIUM' | 'LOW')
                        }
                        className="bg-transparent text-xs font-bold text-slate-800 focus:outline-hidden cursor-pointer"
                      >
                        <option value="URGENT">URGENT (2h / 9h)</option>
                        <option value="MEDIUM">MEDIUM (4.5h / 27h)</option>
                        <option value="LOW">LOW (9h / 45h)</option>
                      </select>
                    </div>

                    {/* Atomic "Take Ticket" Button */}
                    <button
                      onClick={handleClaimTicket}
                      disabled={
                        submittingAction ||
                        selectedDetails.ticket.assigned_agent_id === currentAgent.id
                      }
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 shadow-2xs ${
                        selectedDetails.ticket.assigned_agent_id === currentAgent.id
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default'
                          : selectedDetails.ticket.assigned_agent_id
                          ? 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      {selectedDetails.ticket.assigned_agent_id === currentAgent.id ? (
                        <>✓ Claimed by you</>
                      ) : selectedDetails.ticket.assigned_agent_id ? (
                        <>Take Over Ticket</>
                      ) : (
                        <>✋ Take Ticket</>
                      )}
                    </button>

                    {/* "Resolve Ticket" Button */}
                    {selectedDetails.ticket.status !== 'RESOLVED' && selectedDetails.ticket.status !== 'CLOSED' ? (
                      <button
                        onClick={handleResolveTicket}
                        disabled={submittingAction}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition shadow-2xs"
                      >
                        ✓ Resolve Ticket
                      </button>
                    ) : (
                      <button
                        onClick={handleReopenTicket}
                        disabled={submittingAction}
                        className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold transition shadow-2xs"
                      >
                        ↻ Reopen Ticket
                      </button>
                    )}
                  </div>
                </div>

                {/* SLA Control Information Banner */}
                {selectedDetails.sla && (
                  <div className="mt-4 p-3 rounded-lg bg-slate-50 border border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-slate-500 block">Working Time Elapsed</span>
                      <span className="font-semibold text-slate-800">
                        {selectedDetails.sla.workingMinutesElapsed ?? 0} mins ({((selectedDetails.sla.workingMinutesElapsed ?? 0) / 60).toFixed(1)}h)
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">First Reply SLA</span>
                      <span
                        className={`font-semibold ${
                          selectedDetails.sla.isFirstReplyBreached
                            ? 'text-red-600 font-bold'
                            : 'text-slate-800'
                        }`}
                      >
                        Due: {formatDateTime(selectedDetails.sla.firstReplyDueAt)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Resolution SLA</span>
                      <span
                        className={`font-semibold ${
                          selectedDetails.sla.isResolutionBreached
                            ? 'text-red-600 font-bold'
                            : 'text-slate-800'
                        }`}
                      >
                        Due: {formatDateTime(selectedDetails.sla.resolutionDueAt)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Clock Status</span>
                      {selectedDetails.ticket.status === 'WAITING_ON_CUSTOMER' ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-purple-700">
                          ⏸ Paused (Waiting)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                          ▶ Active
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* CONVERSATION THREAD */}
              <div className="flex-1 p-6 space-y-4">
                {/* Original Description Card */}
                <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-2 pb-2 border-b border-slate-100">
                    <span className="font-bold text-slate-800">
                      Original Ticket Description • {selectedDetails.ticket.customer_name}
                    </span>
                    <span>{formatDateTime(selectedDetails.ticket.created_at)}</span>
                  </div>
                  <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                    {selectedDetails.ticket.description}
                  </p>
                </div>

                {/* Timeline Messages & Internal Notes */}
                {conversationFeed.map((item) => {
                  if (item.type === 'note') {
                    // ZERO-LEAK INTERNAL NOTE (DISTINCT AMBER BACKGROUND)
                    return (
                      <div
                        key={`note-${item.id}`}
                        className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4 shadow-xs text-amber-950 transition"
                      >
                        <div className="flex items-center justify-between mb-2 pb-2 border-b border-amber-200">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-amber-200 text-amber-900 border border-amber-300">
                            🔒 PRIVATE TEAM NOTE — NOT VISIBLE TO CUSTOMER
                          </span>
                          <span className="text-xs text-amber-800 font-medium">
                            {item.agent_name || 'Agent'} • {formatDateTime(item.created_at)}
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{item.body}</p>
                      </div>
                    );
                  }

                  // PUBLIC MESSAGE
                  const isAgent = item.sender_role === 'agent';
                  return (
                    <div
                      key={`msg-${item.id}`}
                      className={`flex flex-col ${isAgent ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-2xl rounded-lg p-4 shadow-2xs border ${
                          isAgent
                            ? 'bg-blue-50/80 border-blue-200 text-slate-900'
                            : 'bg-white border-slate-200 text-slate-900'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4 text-xs text-slate-500 mb-1.5 pb-1 border-b border-slate-100">
                          <span className="font-bold">
                            {item.sender_name || 'User'}
                            {isAgent ? (
                              <span className="ml-1.5 text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded font-semibold">
                                Staff Agent
                              </span>
                            ) : (
                              <span className="ml-1.5 text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded font-semibold">
                                Customer
                              </span>
                            )}
                          </span>
                          <span>{formatDateTime(item.created_at)}</span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{item.body}</p>
                      </div>
                    </div>
                  );
                })}

                {conversationFeed.length === 0 && (
                  <div className="text-center py-6 text-xs text-slate-400">
                    No replies or internal notes on this ticket yet.
                  </div>
                )}
              </div>

              {/* READ-ONLY COLLAPSIBLE AUDIT LOG TRAIL */}
              <div className="mx-6 mb-4 border border-slate-200 rounded-lg bg-white overflow-hidden shadow-2xs">
                <button
                  type="button"
                  onClick={() => setShowAuditLogs(!showAuditLogs)}
                  className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/80 text-left flex items-center justify-between text-xs font-bold text-slate-700 transition"
                >
                  <div className="flex items-center gap-2">
                    <span>🛡️</span>
                    <span>Immutable Audit Log Trail</span>
                    <span className="bg-slate-200 text-slate-700 text-[10px] px-2 py-0.5 rounded-full font-mono">
                      {selectedDetails.audit_logs?.length || 0} events
                    </span>
                  </div>
                  <span className="text-slate-400 font-mono text-sm">
                    {showAuditLogs ? '▲ Collapse' : '▼ Expand'}
                  </span>
                </button>

                {showAuditLogs && (
                  <div className="p-4 border-t border-slate-200 max-h-60 overflow-y-auto divide-y divide-slate-100 text-xs">
                    {selectedDetails.audit_logs?.length === 0 ? (
                      <div className="text-slate-400 text-center py-3">No audit logs recorded.</div>
                    ) : (
                      selectedDetails.audit_logs?.map((log) => (
                        <div key={log.id} className="py-2.5 flex items-start justify-between gap-4">
                          <div>
                            <span className="font-mono font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded text-[11px] border border-blue-200">
                              {log.action}
                            </span>
                            <span className="ml-2 text-slate-700">
                              by{' '}
                              <strong className="text-slate-900">
                                {log.actor_name ? `${log.actor_name} (${log.actor_role})` : 'System (Automated)'}
                              </strong>
                            </span>
                            {log.metadata && Object.keys(log.metadata).length > 0 && (
                              <p className="mt-1 font-mono text-[11px] text-slate-500 bg-slate-50 p-1.5 rounded border border-slate-100">
                                {JSON.stringify(log.metadata)}
                              </p>
                            )}
                          </div>
                          <span className="shrink-0 text-slate-400 text-[11px]">
                            {formatDateTime(log.created_at)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* REPLY COMPOSER (TWO TABS) */}
              <div className="bg-white border-t border-slate-200 p-6 sticky bottom-0 z-10 shadow-lg">
                <form onSubmit={handleSubmitMessage}>
                  {/* Composer Mode Tabs */}
                  <div className="flex items-center gap-2 mb-3">
                    <button
                      type="button"
                      onClick={() => setComposerMode('reply')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                        composerMode === 'reply'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      <span>💬</span> Reply to Customer
                    </button>
                    <button
                      type="button"
                      onClick={() => setComposerMode('note')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                        composerMode === 'note'
                          ? 'bg-amber-500 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      <span>🔒</span> Internal Team Note
                    </button>
                  </div>

                  {/* Textarea */}
                  <div className="relative">
                    <textarea
                      rows={3}
                      value={composerText}
                      onChange={(e) => setComposerText(e.target.value)}
                      placeholder={
                        composerMode === 'reply'
                          ? `Draft a public reply to ${selectedDetails.ticket.customer_name || 'the customer'} (will set ticket to WAITING_ON_CUSTOMER and pause the SLA clock)...`
                          : 'Write an internal team note (strictly private to staff agents, never sent or visible to customer)...'
                      }
                      className={`w-full rounded-lg p-3 text-sm border focus:outline-hidden transition-all resize-none ${
                        composerMode === 'reply'
                          ? 'border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
                          : 'border-amber-300 bg-amber-50/30 focus:border-amber-500 focus:ring-2 focus:ring-amber-100'
                      }`}
                    />
                  </div>

                  {/* Submit Button Bar */}
                  <div className="flex items-center justify-between mt-3">
                    <div className="text-xs text-slate-400">
                      Posting as <span className="font-semibold text-slate-700">{currentAgent.name}</span>
                    </div>

                    {composerMode === 'reply' ? (
                      <button
                        type="submit"
                        disabled={submittingAction || !composerText.trim()}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center gap-2 cursor-pointer"
                      >
                        {submittingAction ? 'Sending...' : 'Send Reply to Customer'}
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={submittingAction || !composerText.trim()}
                        className="px-5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center gap-2 cursor-pointer"
                      >
                        {submittingAction ? 'Saving...' : 'Post Private Note'}
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
