'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import ThemeToggle from './components/ThemeToggle';

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

interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  text: string;
}

const DEFAULT_AGENTS: User[] = [
  { id: 1, name: 'Meera Sharma', email: 'meera@frontdesk.test', role: 'agent' },
  { id: 2, name: 'Rahul Verma', email: 'rahul@frontdesk.test', role: 'agent' },
  { id: 3, name: 'Priya Patel', email: 'priya@frontdesk.test', role: 'agent' },
];

export default function AgentDashboard() {
  const router = useRouter();
  const [isAuthChecked, setIsAuthChecked] = useState<boolean>(false);

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

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // New ticket modal
  const [showNewModal, setShowNewModal] = useState<boolean>(false);
  const [newSubject, setNewSubject] = useState<string>('');
  const [newDescription, setNewDescription] = useState<string>('');
  const [newPriority, setNewPriority] = useState<'URGENT' | 'MEDIUM' | 'LOW'>('URGENT');
  const [newCustomerId, setNewCustomerId] = useState<number>(4);

  const addToast = useCallback((type: 'success' | 'error' | 'warning' | 'info', text: string, title?: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { id, type, text, title }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Re-fetch ticket queue
  const refreshTickets = useCallback(async (preserveSelectedId = true) => {
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
      }
    } catch {
      addToast('error', `Cannot connect to backend API at ${API_BASE}. Ensure server is running.`, 'Connection Failed');
    } finally {
      setLoadingTickets(false);
    }
  }, [addToast]);

  // Re-fetch single ticket details
  const refreshTicketDetails = useCallback(async (id: number) => {
    setLoadingDetails(true);
    try {
      const res = await fetch(`${API_BASE}/api/tickets/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedDetails(data);
      }
    } catch {
      addToast('error', 'Error fetching ticket details', 'Network Error');
    } finally {
      setLoadingDetails(false);
    }
  }, [addToast]);

  // Initial data load effect
  useEffect(() => {
    let active = true;

    async function initialize() {
      await Promise.resolve();
      if (!active) return;

      const stored = typeof window !== 'undefined' ? localStorage.getItem('frontdesk_agent') : null;
      if (!stored) {
        router.push('/login');
        return;
      }

      // Restore saved theme on dashboard
      const savedTheme = typeof window !== 'undefined' ? localStorage.getItem('frontdesk-theme') : null;
      if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }

      try {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.id) {
          setCurrentAgent(parsed);
          setIsAuthChecked(true);
        } else {
          router.push('/login');
          return;
        }
      } catch {
        router.push('/login');
        return;
      }

      try {
        const agentsRes = await fetch(`${API_BASE}/api/users?role=agent`);
        if (agentsRes.ok && active) {
          const agentData = await agentsRes.json();
          if (Array.isArray(agentData) && agentData.length > 0) {
            setAgents(agentData);
            const currentStored = localStorage.getItem('frontdesk_agent');
            if (currentStored) {
              try {
                const parsedStored = JSON.parse(currentStored);
                const matched = agentData.find((a: User) => a.id === parsedStored.id || a.email === parsedStored.email);
                if (matched) setCurrentAgent(matched);
              } catch {
                // keep current
              }
            }
          }
        }
      } catch {
        // Fallback default agents
      }

      try {
        const ticketsRes = await fetch(`${API_BASE}/api/tickets`);
        if (ticketsRes.ok && active) {
          const ticketData = await ticketsRes.json();
          setTickets(ticketData);
          if (ticketData.length > 0) {
            setSelectedTicketId(ticketData[0].id);
          }
        }
      } catch {
        if (active) {
          addToast('error', `Cannot connect to API at ${API_BASE}.`, 'Connection Error');
        }
      } finally {
        if (active) setLoadingTickets(false);
      }
    }

    initialize();

    return () => {
      active = false;
    };
  }, [router, addToast]);

  // Load details when selected ticket changes
  useEffect(() => {
    let active = true;

    if (!selectedTicketId) {
      return;
    }

    async function loadDetails() {
      setLoadingDetails(true);
      try {
        const res = await fetch(`${API_BASE}/api/tickets/${selectedTicketId}`);
        if (res.ok && active) {
          const data = await res.json();
          setSelectedDetails(data);
        }
      } catch {
        // details fetch failure handled gracefully
      } finally {
        if (active) setLoadingDetails(false);
      }
    }

    loadDetails();

    return () => {
      active = false;
    };
  }, [selectedTicketId]);

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (queueFilter === 'LATE') return t.sla?.isLate === true;
      if (queueFilter === 'WAITING') return t.status === 'WAITING_ON_CUSTOMER';
      if (queueFilter === 'UNASSIGNED') return t.assigned_agent_id === null;
      return true;
    });
  }, [tickets, queueFilter]);

  // Tab counts
  const tabCounts = useMemo(() => {
    return {
      all: tickets.length,
      late: tickets.filter((t) => t.sla?.isLate === true).length,
      waiting: tickets.filter((t) => t.status === 'WAITING_ON_CUSTOMER').length,
      unassigned: tickets.filter((t) => t.assigned_agent_id === null).length,
    };
  }, [tickets]);

  // Atomic Claim Handler
  const handleClaimTicket = async () => {
    if (!selectedTicketId) return;
    setSubmittingAction(true);

    try {
      const res = await fetch(`${API_BASE}/api/tickets/${selectedTicketId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: currentAgent.id }),
      });

      if (res.status === 409) {
        const err = await res.json();
        addToast('warning', err.error || 'This ticket was already claimed by another agent.', 'Claim Conflict (409)');
        await refreshTicketDetails(selectedTicketId);
        await refreshTickets();
        return;
      }

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to claim ticket');
      }

      addToast('success', `Ticket #${selectedTicketId} assigned to ${currentAgent.name}.`, 'Ticket Claimed');
      await refreshTicketDetails(selectedTicketId);
      await refreshTickets();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error claiming ticket';
      addToast('error', msg);
    } finally {
      setSubmittingAction(false);
    }
  };

  // Change Priority Handler
  const handleChangePriority = async (newP: 'URGENT' | 'MEDIUM' | 'LOW') => {
    if (!selectedTicketId) return;
    setSubmittingAction(true);
    try {
      const res = await fetch(`${API_BASE}/api/tickets/${selectedTicketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: newP, actor_id: currentAgent.id }),
      });

      if (!res.ok) throw new Error('Failed to update priority');

      addToast('info', `Priority changed to ${newP}. SLA deadlines recalculated.`, 'Priority Updated');
      await refreshTicketDetails(selectedTicketId);
      await refreshTickets();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating priority';
      addToast('error', msg);
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

      addToast('success', `Ticket #${selectedTicketId} marked as Resolved.`, 'Ticket Resolved');
      await refreshTicketDetails(selectedTicketId);
      await refreshTickets();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error resolving ticket';
      addToast('error', msg);
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
        addToast('info', `Original resolved > 7 days ago. Created new follow-up #${data.ticket.id}.`, 'Linked Follow-Up Created');
        await refreshTickets();
        setSelectedTicketId(data.ticket.id);
      } else {
        addToast('success', `Ticket #${selectedTicketId} reopened.`, 'Ticket Reopened');
        await refreshTicketDetails(selectedTicketId);
        await refreshTickets();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error reopening ticket';
      addToast('error', msg);
    } finally {
      setSubmittingAction(false);
    }
  };

  // Create New Ticket Handler
  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.trim() || !newDescription.trim()) return;

    setSubmittingAction(true);
    try {
      const res = await fetch(`${API_BASE}/api/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: newSubject.trim(),
          description: newDescription.trim(),
          priority: newPriority,
          customer_id: newCustomerId,
        }),
      });

      if (!res.ok) throw new Error('Failed to create ticket');
      const created = await res.json();

      addToast('success', `Ticket #${created.id} created successfully.`, 'Ticket Created');
      setShowNewModal(false);
      setNewSubject('');
      setNewDescription('');
      await refreshTickets();
      setSelectedTicketId(created.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error creating ticket';
      addToast('error', msg);
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
        const res = await fetch(`${API_BASE}/api/tickets/${selectedTicketId}/reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sender_id: currentAgent.id, body: composerText.trim() }),
        });

        if (!res.ok) throw new Error('Failed to send public reply');
        addToast('success', 'Public reply sent. Ticket set to WAITING_ON_CUSTOMER and SLA paused.', 'Reply Sent');
      } else {
        const res = await fetch(`${API_BASE}/api/tickets/${selectedTicketId}/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_id: currentAgent.id, body: composerText.trim() }),
        });

        if (!res.ok) throw new Error('Failed to save internal note');
        addToast('success', 'Private team note recorded (Zero-leak verified).', 'Internal Note Saved');
      }

      setComposerText('');
      await refreshTicketDetails(selectedTicketId);
      await refreshTickets();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error submitting message';
      addToast('error', msg);
    } finally {
      setSubmittingAction(false);
    }
  };

  // Combined conversation timeline
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

  // Semantic Muted Badges (Low-Glare in Dark Mode)
  const renderPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'URGENT':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-[rgba(239,68,68,0.14)] dark:text-[#FCA5A5] dark:border-[rgba(239,68,68,0.3)] tabular-nums">
            URGENT
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#FFFBEB] text-[#B45309] border border-[#FDE68A] dark:bg-[rgba(245,158,11,0.14)] dark:text-[#FCD34D] dark:border-[rgba(245,158,11,0.3)] tabular-nums">
            MEDIUM
          </span>
        );
      case 'LOW':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 dark:bg-[rgba(16,185,129,0.14)] dark:text-[#6EE7B7] dark:border-[rgba(16,185,129,0.3)] tabular-nums">
            LOW
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 tabular-nums">
            {priority}
          </span>
        );
    }
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-50 text-sky-800 border border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30 tabular-nums">
            OPEN
          </span>
        );
      case 'WAITING_ON_CUSTOMER':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#FFFBEB] text-[#B45309] border border-[#FDE68A] dark:bg-[rgba(245,158,11,0.14)] dark:text-[#FCD34D] dark:border-[rgba(245,158,11,0.3)] tabular-nums">
            WAITING ON CUSTOMER
          </span>
        );
      case 'RESOLVED':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0] dark:bg-[rgba(16,185,129,0.14)] dark:text-[#6EE7B7] dark:border-[rgba(16,185,129,0.3)] tabular-nums">
            RESOLVED
          </span>
        );
      case 'CLOSED':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 tabular-nums">
            CLOSED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 tabular-nums">
            {status}
          </span>
        );
    }
  };

  const formatDateTime = (dateStr?: string | null) => {
    if (!dateStr) return '—';
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

  if (!isAuthChecked) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0B0F19] flex items-center justify-center">
        <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 text-white font-bold text-xs flex items-center justify-center animate-pulse">
          FD
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#F8FAFC] dark:bg-[#0B0F19] text-slate-900 dark:text-[#F8FAFC] font-sans overflow-hidden transition-colors">
      {/* 1. TOP NAVBAR */}
      <header className="h-13 bg-white dark:bg-[#111827] border-b border-slate-200 dark:border-[#1E293B] px-5 flex items-center justify-between shrink-0 z-20 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-md bg-slate-900 dark:bg-[#0F172A] border border-slate-800 dark:border-[#334155] flex items-center justify-center text-white font-bold text-xs shadow-2xs">
            FD
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold tracking-[-0.02em] text-slate-900 dark:text-[#F8FAFC]">Frontdesk</h1>
            <span className="text-slate-300 dark:text-[#334155] text-xs">/</span>
            <span className="text-xs text-slate-500 dark:text-[#94A3B8] font-medium hidden sm:inline">Operations</span>
          </div>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#0F172A] border border-slate-200 dark:border-[#1E293B] rounded-md px-2 py-1 shadow-2xs">
            <span className="text-[11px] font-medium text-slate-500 dark:text-[#64748B] pl-1">Agent:</span>
            <select
              value={currentAgent.id}
              onChange={(e) => {
                const ag = agents.find((a) => a.id === Number(e.target.value));
                if (ag) {
                  setCurrentAgent(ag);
                  localStorage.setItem('frontdesk_agent', JSON.stringify(ag));
                }
              }}
              className="bg-transparent text-slate-900 dark:text-[#F8FAFC] text-xs font-semibold focus:outline-hidden cursor-pointer"
            >
              {agents.map((ag) => (
                <option key={ag.id} value={ag.id} className="dark:bg-[#111827] dark:text-[#F8FAFC]">
                  {ag.name}
                </option>
              ))}
            </select>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1" title="Online" />
          </div>

          <ThemeToggle />

          <button
            onClick={() => refreshTickets()}
            title="Refresh Queue"
            className="p-1.5 text-slate-500 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F8FAFC] hover:bg-slate-100 dark:hover:bg-[#1E293B] rounded-md border border-slate-200 dark:border-[#1E293B] transition cursor-pointer"
          >
            <svg className={`w-3.5 h-3.5 ${loadingTickets ? 'animate-spin text-slate-900 dark:text-[#F8FAFC]' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>

          <button
            onClick={() => {
              localStorage.removeItem('frontdesk_agent');
              document.documentElement.classList.remove('dark');
              router.push('/login');
            }}
            title="Log out"
            className="text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-900/60 px-2.5 py-1.5 rounded-md transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
          >
            <svg className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Log out</span>
          </button>
        </div>
      </header>

      {/* 2. THREE-PANE OPS LAYOUT */}
      <div className="flex flex-1 overflow-hidden">
        {/* PANE 1: LEFT QUEUE */}
        <section className="w-80 lg:w-[350px] bg-white dark:bg-[#111827] border-r border-slate-200 dark:border-[#1E293B] flex flex-col shrink-0 transition-colors">
          {/* Queue Filter Bar */}
          <div className="p-3 border-b border-slate-200 dark:border-[#1E293B] bg-slate-50/60 dark:bg-[#111827]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500 dark:text-[#64748B]">
                Ticket Queue
              </span>
              <button
                onClick={() => setShowNewModal(true)}
                className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#F8FAFC] dark:hover:bg-[#E2E8F0] dark:text-[#0F172A] text-[11px] font-medium rounded-md shadow-2xs transition flex items-center gap-1 cursor-pointer"
              >
                <span>+</span> New Ticket
              </button>
            </div>

            {/* Segmented Filter Control */}
            <div className="grid grid-cols-4 gap-1 bg-slate-200/60 dark:bg-[#0F172A] dark:border dark:border-[#1E293B] p-0.5 rounded-lg text-xs font-medium">
              <button
                onClick={() => setQueueFilter('ALL')}
                className={`py-1 px-1.5 rounded-md transition text-center cursor-pointer flex items-center justify-center gap-1 ${
                  queueFilter === 'ALL'
                    ? 'bg-white dark:bg-[#1E293B] text-slate-900 dark:text-[#F8FAFC] shadow-2xs font-semibold'
                    : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F8FAFC]'
                }`}
              >
                <span>All</span>
                <span className="text-[10px] text-slate-400 dark:text-[#64748B] tabular-nums">({tabCounts.all})</span>
              </button>

              <button
                onClick={() => setQueueFilter('LATE')}
                className={`py-1 px-1.5 rounded-md transition text-center flex items-center justify-center gap-1 cursor-pointer ${
                  queueFilter === 'LATE'
                    ? 'bg-white dark:bg-[#1E293B] text-rose-700 dark:text-[#FCA5A5] shadow-2xs font-semibold'
                    : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F8FAFC]'
                }`}
              >
                <span>Late</span>
                <span className={`text-[10px] tabular-nums ${tabCounts.late > 0 ? 'text-rose-600 dark:text-[#FCA5A5] font-bold' : 'text-slate-400 dark:text-[#64748B]'}`}>
                  ({tabCounts.late})
                </span>
              </button>

              <button
                onClick={() => setQueueFilter('WAITING')}
                className={`py-1 px-1.5 rounded-md transition text-center cursor-pointer flex items-center justify-center gap-1 ${
                  queueFilter === 'WAITING'
                    ? 'bg-white dark:bg-[#1E293B] text-amber-800 dark:text-[#FCD34D] shadow-2xs font-semibold'
                    : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F8FAFC]'
                }`}
              >
                <span>Wait</span>
                <span className="text-[10px] text-slate-400 dark:text-[#64748B] tabular-nums">({tabCounts.waiting})</span>
              </button>

              <button
                onClick={() => setQueueFilter('UNASSIGNED')}
                className={`py-1 px-1.5 rounded-md transition text-center cursor-pointer flex items-center justify-center gap-1 ${
                  queueFilter === 'UNASSIGNED'
                    ? 'bg-white dark:bg-[#1E293B] text-slate-900 dark:text-[#F8FAFC] shadow-2xs font-semibold'
                    : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F8FAFC]'
                }`}
              >
                <span>Open</span>
                <span className="text-[10px] text-slate-400 dark:text-[#64748B] tabular-nums">({tabCounts.unassigned})</span>
              </button>
            </div>
          </div>

          {/* Ticket Card List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-[#1E293B]">
            {loadingTickets && tickets.length === 0 ? (
              /* Skeleton Loader */
              <div className="p-4 space-y-4">
                {[1, 2, 3, 4, 5].map((idx) => (
                  <div key={idx} className="animate-pulse space-y-2">
                    <div className="flex justify-between">
                      <div className="h-3 w-16 bg-slate-200 dark:bg-[#1E293B] rounded" />
                      <div className="h-3 w-12 bg-slate-200 dark:bg-[#1E293B] rounded" />
                    </div>
                    <div className="h-4 w-3/4 bg-slate-200 dark:bg-[#1E293B] rounded" />
                    <div className="h-3 w-1/2 bg-slate-100 dark:bg-[#1E293B]/60 rounded" />
                  </div>
                ))}
              </div>
            ) : filteredTickets.length === 0 ? (
              /* Minimal Empty State */
              <div className="p-8 text-center text-slate-400 dark:text-[#64748B] flex flex-col items-center">
                <svg className="w-8 h-8 text-slate-300 dark:text-[#334155] mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-xs font-medium text-slate-600 dark:text-[#94A3B8]">No tickets in this view</span>
                <span className="text-[11px] text-slate-400 dark:text-[#64748B] mt-0.5">Try choosing another filter tab</span>
              </div>
            ) : (
              filteredTickets.map((ticket) => {
                const isSelected = ticket.id === selectedTicketId;
                const isLate = ticket.sla?.isLate === true;

                return (
                  <div
                    key={ticket.id}
                    onClick={() => setSelectedTicketId(ticket.id)}
                    className={`p-3.5 cursor-pointer transition-colors relative ${
                      isSelected
                        ? 'bg-slate-100/90 dark:bg-[#1E293B] border-l-[3px] border-slate-900 dark:border-l-[#F8FAFC] shadow-2xs'
                        : 'border-l-[3px] border-transparent hover:bg-slate-50/80 dark:hover:bg-[#1E293B]/50'
                    }`}
                  >
                    {/* Top Row: ID, Badges, LATE flag */}
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-[11px] font-semibold text-slate-500 dark:text-[#64748B] tabular-nums">
                          #{ticket.id}
                        </span>
                        {renderPriorityBadge(ticket.priority)}
                        {renderStatusBadge(ticket.status)}
                      </div>

                      {/* Crisp Muted LATE Badge */}
                      {isLate && (
                        <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-[rgba(239,68,68,0.14)] dark:text-[#FCA5A5] dark:border-[rgba(239,68,68,0.3)] tabular-nums shrink-0">
                          LATE
                        </span>
                      )}
                    </div>

                    {/* Subject */}
                    <h3 className="font-medium text-slate-900 dark:text-[#F8FAFC] text-xs line-clamp-1 mb-1 leading-snug">
                      {ticket.subject}
                    </h3>

                    {/* Customer & Timestamp */}
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-[#94A3B8] mt-1.5">
                      <span className="truncate max-w-[170px] text-slate-600 dark:text-[#94A3B8]">
                        {ticket.customer_name || 'Customer'}
                      </span>
                      <span className="shrink-0 text-slate-400 dark:text-[#64748B] tabular-nums">
                        {formatDateTime(ticket.created_at)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* PANE 2: CENTER THREAD & COMPOSER */}
        <main className="flex-1 min-w-0 bg-[#F8FAFC] dark:bg-[#0B0F19] flex flex-col overflow-y-auto border-r border-slate-200 dark:border-[#1E293B] transition-colors">
          {loadingDetails && !selectedDetails ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 dark:text-[#64748B] text-xs">
              <svg className="animate-spin h-5 w-5 text-slate-400 dark:text-[#64748B] mr-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Loading conversation...
            </div>
          ) : !selectedDetails ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-[#64748B] p-8 text-center">
              <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-[#111827] border border-slate-200 dark:border-[#1E293B] flex items-center justify-center text-slate-400 dark:text-[#64748B] mb-2.5">
                <svg className="w-5 h-5 text-slate-400 dark:text-[#64748B]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
              </div>
              <h3 className="text-xs font-semibold text-slate-700 dark:text-[#94A3B8]">No ticket selected</h3>
              <p className="text-xs max-w-xs mt-0.5 text-slate-400 dark:text-[#64748B]">
                Choose an item from the queue to view messages, post notes, and check SLA timers.
              </p>
            </div>
          ) : (
            <div className="flex flex-col flex-1">
              {/* Ticket Top Header Bar */}
              <div className="bg-white dark:bg-[#111827] border-b border-slate-200 dark:border-[#1E293B] px-6 py-4 shadow-2xs transition-colors">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs font-semibold text-slate-500 dark:text-[#64748B] tabular-nums">
                    Ticket #{selectedDetails.ticket.id}
                  </span>
                  {renderStatusBadge(selectedDetails.ticket.status)}
                  {renderPriorityBadge(selectedDetails.ticket.priority)}
                  {selectedDetails.sla?.isLate && (
                    <span className="bg-rose-50 text-rose-700 border border-rose-200 dark:bg-[rgba(239,68,68,0.14)] dark:text-[#FCA5A5] dark:border-[rgba(239,68,68,0.3)] font-semibold text-[10px] px-1.5 py-0.5 rounded tabular-nums">
                      SLA BREACHED
                    </span>
                  )}
                </div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-[#F8FAFC] tracking-[-0.02em]">
                  {selectedDetails.ticket.subject}
                </h2>
                <div className="text-[11px] text-slate-500 dark:text-[#94A3B8] mt-1">
                  Opened by <span className="font-medium text-slate-700 dark:text-[#F8FAFC]">{selectedDetails.ticket.customer_name || 'Customer'}</span> ({selectedDetails.ticket.customer_email}) &bull; <span className="tabular-nums">{formatDateTime(selectedDetails.ticket.created_at)}</span>
                </div>
              </div>

              {/* Conversation Thread Feed */}
              <div className="flex-1 p-6 space-y-4 overflow-y-auto">
                {/* Original Description Card */}
                <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-[#1E293B] rounded-lg p-4 shadow-2xs transition-colors">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-[#94A3B8] mb-2 pb-2 border-b border-slate-100 dark:border-[#1E293B]">
                    <span className="font-medium text-slate-800 dark:text-[#F8FAFC]">
                      Initial Request &bull; {selectedDetails.ticket.customer_name}
                    </span>
                    <span className="tabular-nums text-[11px] text-slate-400 dark:text-[#64748B]">{formatDateTime(selectedDetails.ticket.created_at)}</span>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-[#94A3B8] whitespace-pre-wrap leading-relaxed">
                    {selectedDetails.ticket.description}
                  </p>
                </div>

                {/* Timeline Messages & Internal Notes */}
                {conversationFeed.map((item) => {
                  if (item.type === 'note') {
                    // ZERO-LEAK INTERNAL NOTE (WARM DARK AMBER IN DARK MODE, CREAM IN LIGHT MODE)
                    return (
                      <div
                        key={`note-${item.id}`}
                        className="bg-[#FEFCE8] dark:bg-[#1E190C] border-l-[3px] border-[#EAB308] border-y border-r border-amber-200/60 dark:border-y-[#EAB308]/20 dark:border-r-[#EAB308]/20 rounded-lg p-4 text-amber-950 dark:text-[#FDE047] shadow-2xs transition-colors"
                      >
                        <div className="flex items-center justify-between mb-2 pb-2 border-b border-amber-200/60 dark:border-[#EAB308]/20">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-amber-100 dark:bg-[#2A1E07] text-amber-900 dark:text-[#FDE047] border border-amber-200 dark:border-[#EAB308]/40">
                            <svg className="w-3 h-3 text-amber-800 dark:text-[#FDE047]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            <span>Internal Note &mdash; Team Only</span>
                          </span>
                          <span className="text-[11px] text-amber-900/80 dark:text-[#FDE047]/80 font-medium tabular-nums">
                            {item.agent_name || 'Agent'} &bull; {formatDateTime(item.created_at)}
                          </span>
                        </div>
                        <p className="text-xs text-amber-950 dark:text-[#FDE047] whitespace-pre-wrap leading-relaxed">{item.body}</p>
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
                        className={`max-w-2xl rounded-lg p-4 shadow-2xs border text-xs leading-relaxed transition-colors ${
                          isAgent
                            ? 'bg-[#F8FAFC] dark:bg-[#0F172A] border-slate-200/90 dark:border-[#1E293B] text-slate-900 dark:text-[#F8FAFC]'
                            : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-[#1E293B] text-slate-800 dark:text-[#F8FAFC]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4 text-[11px] text-slate-500 dark:text-[#94A3B8] mb-1.5 pb-1 border-b border-slate-100 dark:border-[#1E293B]">
                          <span className="font-semibold text-slate-900 dark:text-[#F8FAFC]">
                            {item.sender_name || 'User'}
                            {isAgent ? (
                              <span className="ml-1.5 text-[9px] bg-slate-200 dark:bg-[#1E293B] text-slate-700 dark:text-[#94A3B8] px-1.5 py-0.2 rounded font-bold uppercase">
                                Staff
                              </span>
                            ) : (
                              <span className="ml-1.5 text-[9px] bg-slate-100 dark:bg-[#0F172A] text-slate-600 dark:text-[#94A3B8] px-1.5 py-0.2 rounded font-semibold uppercase">
                                Customer
                              </span>
                            )}
                          </span>
                          <span className="tabular-nums text-slate-400 dark:text-[#64748B]">{formatDateTime(item.created_at)}</span>
                        </div>
                        <p className="whitespace-pre-wrap">{item.body}</p>
                      </div>
                    </div>
                  );
                })}

                {conversationFeed.length === 0 && (
                  <div className="text-center py-6 text-xs text-slate-400 dark:text-[#64748B]">
                    No replies or notes recorded yet.
                  </div>
                )}
              </div>

              {/* REPLY & NOTE COMPOSER (STICKY AT BOTTOM) */}
              <div className="bg-white dark:bg-[#111827] border-t border-slate-200 dark:border-[#1E293B] p-4 sticky bottom-0 z-10 shadow-[0_-2px_6px_rgba(15,23,42,0.03)] transition-colors">
                <form onSubmit={handleSubmitMessage}>
                  {/* Clean Segmented Tab Toggle */}
                  <div className="inline-flex p-0.5 bg-slate-100 dark:bg-[#0F172A] rounded-lg border border-slate-200 dark:border-[#1E293B] mb-2.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setComposerMode('reply')}
                      className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer flex items-center gap-1.5 ${
                        composerMode === 'reply'
                          ? 'bg-white dark:bg-[#1E293B] text-slate-900 dark:text-[#F8FAFC] shadow-2xs font-semibold'
                          : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F8FAFC]'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      <span>Public Reply</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setComposerMode('note')}
                      className={`px-3 py-1.5 rounded-md font-medium transition cursor-pointer flex items-center gap-1.5 ${
                        composerMode === 'note'
                          ? 'bg-[#FEFCE8] dark:bg-[#1E190C] text-[#854D0E] dark:text-[#FDE047] shadow-2xs border border-[#FDE68A] dark:border-[#EAB308]/50 font-semibold'
                          : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F8FAFC]'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5 text-amber-700 dark:text-[#FDE047]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <span>Internal Note</span>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-amber-100 dark:bg-[#2A1E07] text-amber-800 dark:text-[#FDE047] font-bold uppercase tracking-wider">
                        Team Only
                      </span>
                    </button>
                  </div>

                  {/* Textarea with Distinct Note Tint */}
                  <div>
                    <textarea
                      rows={3}
                      value={composerText}
                      onChange={(e) => setComposerText(e.target.value)}
                      placeholder={
                        composerMode === 'reply'
                          ? `Send a public response to ${selectedDetails.ticket.customer_name || 'the customer'} (moves to WAITING_ON_CUSTOMER, pauses SLA)...`
                          : 'Write an internal team note (strictly private to support agents, never shown to customer)...'
                      }
                      className={`w-full rounded-lg p-2.5 text-xs border focus:outline-hidden transition-all resize-none font-sans ${
                        composerMode === 'reply'
                          ? 'border-slate-200 dark:border-[#334155] bg-white dark:bg-[#0F172A] focus:border-slate-900 dark:focus:border-[#F8FAFC] focus:ring-1 focus:ring-slate-900 dark:focus:ring-[#F8FAFC]/20 text-slate-900 dark:text-[#F8FAFC] placeholder-slate-400 dark:placeholder-slate-500'
                          : 'border-[#EAB308]/60 dark:border-[#EAB308]/50 bg-[#FEFCE8] dark:bg-[#1E190C] focus:border-[#EAB308] focus:ring-1 focus:ring-[#EAB308] text-amber-950 dark:text-[#FDE047] placeholder-amber-800/50 dark:placeholder-[#FDE047]/40'
                      }`}
                    />
                  </div>

                  {/* Submit Button Bar */}
                  <div className="flex items-center justify-between mt-2.5">
                    <span className="text-[11px] text-slate-400 dark:text-[#64748B]">
                      Author: <span className="font-medium text-slate-700 dark:text-[#F8FAFC]">{currentAgent.name}</span>
                    </span>

                    {composerMode === 'reply' ? (
                      <button
                        type="submit"
                        disabled={submittingAction || !composerText.trim()}
                        className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-[#F8FAFC] dark:hover:bg-[#E2E8F0] dark:text-[#0F172A] disabled:opacity-40 text-white rounded-md text-xs font-medium border border-slate-800 dark:border-[#F8FAFC] shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
                      >
                        {submittingAction ? 'Sending...' : 'Send Public Reply'}
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={submittingAction || !composerText.trim()}
                        className="px-3.5 py-1.5 bg-[#B45309] hover:bg-[#92400E] dark:bg-[#EAB308] dark:hover:bg-[#CA8A04] dark:text-slate-950 disabled:opacity-40 text-white rounded-md text-xs font-medium border border-[#B45309] dark:border-[#EAB308] shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5 text-amber-100 dark:text-slate-950" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        <span>{submittingAction ? 'Saving...' : 'Add Internal Note'}</span>
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </div>
          )}
        </main>

        {/* PANE 3: RIGHT INSPECTOR PANEL (TICKET CONTROLS, SLA, AUDIT LOG) */}
        {selectedDetails && (
          <aside className="w-72 xl:w-80 shrink-0 bg-white dark:bg-[#111827] border-l border-slate-200 dark:border-[#1E293B] flex flex-col overflow-y-auto divide-y divide-slate-100 dark:divide-[#1E293B] transition-colors">
            {/* 1. Ticket Controls Section */}
            <div className="p-4 space-y-3.5">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500 dark:text-[#64748B]">
                Ticket Controls
              </span>

              {/* Priority Selector */}
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-[#64748B] mb-1">Priority</label>
                <select
                  value={selectedDetails.ticket.priority}
                  disabled={submittingAction}
                  onChange={(e) =>
                    handleChangePriority(e.target.value as 'URGENT' | 'MEDIUM' | 'LOW')
                  }
                  className="w-full bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-[#334155] text-xs font-semibold text-slate-800 dark:text-[#F8FAFC] rounded-md px-2.5 py-1.5 focus:border-slate-900 dark:focus:border-[#F8FAFC] focus:outline-hidden cursor-pointer"
                >
                  <option value="URGENT" className="dark:bg-[#111827]">URGENT (2h / 9h)</option>
                  <option value="MEDIUM" className="dark:bg-[#111827]">MEDIUM (4.5h / 27h)</option>
                  <option value="LOW" className="dark:bg-[#111827]">LOW (9h / 45h)</option>
                </select>
              </div>

              {/* Claim Action */}
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-[#64748B] mb-1">Assigned Agent</label>
                {selectedDetails.ticket.assigned_agent_id === currentAgent.id ? (
                  <div className="w-full py-1.5 px-2.5 rounded-md bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-[#6EE7B7] text-xs font-medium flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-emerald-600 dark:text-[#6EE7B7]" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span>Claimed by you</span>
                  </div>
                ) : selectedDetails.ticket.assigned_agent_id ? (
                  <div className="space-y-1.5">
                    <div className="text-xs text-slate-700 dark:text-[#F8FAFC] font-medium">
                      {selectedDetails.ticket.assigned_agent_name || `Agent #${selectedDetails.ticket.assigned_agent_id}`}
                    </div>
                    <button
                      onClick={handleClaimTicket}
                      disabled={submittingAction}
                      className="w-full py-1.5 px-2.5 bg-white dark:bg-[#0F172A] hover:bg-slate-50 dark:hover:bg-[#1E293B] text-slate-700 dark:text-[#F8FAFC] text-xs font-medium rounded-md border border-slate-200 dark:border-[#334155] transition cursor-pointer"
                    >
                      Take Over Ticket
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleClaimTicket}
                    disabled={submittingAction}
                    className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 dark:bg-[#F8FAFC] dark:hover:bg-[#E2E8F0] dark:text-[#0F172A] text-white text-xs font-medium rounded-md border border-slate-800 dark:border-[#F8FAFC] shadow-2xs transition cursor-pointer"
                  >
                    Claim Ticket
                  </button>
                )}
              </div>

              {/* Resolve / Reopen Action */}
              <div className="pt-1">
                {selectedDetails.ticket.status !== 'RESOLVED' && selectedDetails.ticket.status !== 'CLOSED' ? (
                  <button
                    onClick={handleResolveTicket}
                    disabled={submittingAction}
                    className="w-full py-1.5 px-3 bg-white dark:bg-emerald-500/15 hover:bg-emerald-50 dark:hover:bg-emerald-500/25 text-emerald-700 dark:text-[#6EE7B7] rounded-md text-xs font-medium border border-emerald-200 dark:border-emerald-500/30 transition shadow-2xs cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5 text-emerald-600 dark:text-[#6EE7B7]" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span>Mark as Resolved</span>
                  </button>
                ) : (
                  <button
                    onClick={handleReopenTicket}
                    disabled={submittingAction}
                    className="w-full py-1.5 px-3 bg-white dark:bg-[#0F172A] hover:bg-slate-50 dark:hover:bg-[#1E293B] text-slate-700 dark:text-[#F8FAFC] rounded-md text-xs font-medium border border-slate-200 dark:border-[#334155] transition shadow-2xs cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <span>Reopen Ticket</span>
                  </button>
                )}
              </div>
            </div>

            {/* 2. SLA Status Section */}
            {selectedDetails.sla && (
              <div className="p-4 space-y-3">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500 dark:text-[#64748B]">
                  SLA Operations
                </span>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-[#1E293B]">
                    <span className="text-slate-500 dark:text-[#64748B]">Clock:</span>
                    {selectedDetails.ticket.status === 'WAITING_ON_CUSTOMER' ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#FFFBEB] text-[#B45309] border border-[#FDE68A] dark:bg-[rgba(245,158,11,0.14)] dark:text-[#FCD34D] dark:border-[rgba(245,158,11,0.3)]">
                        Paused
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0] dark:bg-[rgba(16,185,129,0.14)] dark:text-[#6EE7B7] dark:border-[rgba(16,185,129,0.3)]">
                        Active
                      </span>
                    )}
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-[#1E293B]">
                    <span className="text-slate-500 dark:text-[#64748B]">Elapsed Working Time:</span>
                    <span className="font-semibold text-slate-800 dark:text-[#F8FAFC] tabular-nums">
                      {selectedDetails.sla.workingMinutesElapsed ?? 0}m ({((selectedDetails.sla.workingMinutesElapsed ?? 0) / 60).toFixed(1)}h)
                    </span>
                  </div>

                  <div className="py-1 border-b border-slate-100 dark:border-[#1E293B]">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-slate-500 dark:text-[#64748B]">First Reply Due:</span>
                      {selectedDetails.sla.isFirstReplyBreached && (
                        <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 px-1 py-0.2 rounded border border-rose-200 dark:bg-[rgba(239,68,68,0.14)] dark:text-[#FCA5A5] dark:border-[rgba(239,68,68,0.3)]">
                          Breached
                        </span>
                      )}
                    </div>
                    <span className="font-medium text-slate-800 dark:text-[#F8FAFC] tabular-nums">
                      {formatDateTime(selectedDetails.sla.firstReplyDueAt)}
                    </span>
                  </div>

                  <div className="py-1">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-slate-500 dark:text-[#64748B]">Resolution Due:</span>
                      {selectedDetails.sla.isResolutionBreached && (
                        <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 px-1 py-0.2 rounded border border-rose-200 dark:bg-[rgba(239,68,68,0.14)] dark:text-[#FCA5A5] dark:border-[rgba(239,68,68,0.3)]">
                          Breached
                        </span>
                      )}
                    </div>
                    <span className="font-medium text-slate-800 dark:text-[#F8FAFC] tabular-nums">
                      {formatDateTime(selectedDetails.sla.resolutionDueAt)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 3. Immutable Audit Trail Section */}
            <div className="p-4 flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500 dark:text-[#64748B]">
                  Audit Trail
                </span>
                <span className="text-[10px] font-mono text-slate-400 dark:text-[#64748B] tabular-nums">
                  {selectedDetails.audit_logs?.length || 0} events
                </span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {(!selectedDetails.audit_logs || selectedDetails.audit_logs.length === 0) ? (
                  <div className="text-[11px] text-slate-400 dark:text-[#64748B] py-3 text-center">No audit entries.</div>
                ) : (
                  <div className="border-l border-slate-200 dark:border-[#1E293B] pl-3 space-y-3.5">
                    {selectedDetails.audit_logs.map((log) => (
                      <div key={log.id} className="relative text-xs">
                        <div className="absolute -left-[17px] top-1 w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-600 border border-white dark:border-[#111827]" />
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className="font-mono text-[10px] font-semibold text-slate-700 dark:text-[#F8FAFC] bg-slate-100 dark:bg-[#0F172A] px-1.5 py-0.2 rounded border border-slate-200 dark:border-[#1E293B]">
                            {log.action}
                          </span>
                          <span className="text-[10px] text-slate-400 dark:text-[#64748B] tabular-nums">
                            {formatDateTime(log.created_at)}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-[#94A3B8]">
                          by <strong className="text-slate-800 dark:text-[#F8FAFC]">{log.actor_name || 'System'}</strong>
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* 3. INLINE TOAST NOTIFICATIONS (Crisp Bottom-Right Stack) */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto p-3 rounded-lg border text-xs shadow-md flex items-start justify-between gap-3 transition-all ${
              t.type === 'error'
                ? 'bg-rose-50 dark:bg-[#1A0C0E] border-rose-200 dark:border-rose-500/30 text-rose-800 dark:text-[#FCA5A5]'
                : t.type === 'warning'
                ? 'bg-amber-50 dark:bg-[#1E190C] border-amber-200 dark:border-amber-500/30 text-amber-900 dark:text-[#FCD34D]'
                : t.type === 'success'
                ? 'bg-white dark:bg-[#111827] border-slate-200 dark:border-[#1E293B] text-slate-900 dark:text-[#F8FAFC] shadow-sm'
                : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-[#1E293B] text-slate-800 dark:text-[#F8FAFC] shadow-sm'
            }`}
          >
            <div className="flex items-start gap-2">
              {t.type === 'success' && (
                <svg className="w-4 h-4 text-emerald-600 dark:text-[#6EE7B7] shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
              {t.type === 'warning' && (
                <svg className="w-4 h-4 text-amber-600 dark:text-[#FCD34D] shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              )}
              {t.type === 'error' && (
                <svg className="w-4 h-4 text-rose-600 dark:text-[#FCA5A5] shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              )}
              <div>
                {t.title && <div className="font-semibold">{t.title}</div>}
                <div className="leading-snug">{t.text}</div>
              </div>
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="text-slate-400 dark:text-[#64748B] hover:text-slate-700 dark:hover:text-[#F8FAFC] text-xs font-bold cursor-pointer"
            >
              &times;
            </button>
          </div>
        ))}
      </div>

      {/* 4. NEW TICKET MODAL */}
      {showNewModal && (
        <div className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-[#111827] rounded-xl shadow-lg max-w-md w-full p-6 border border-slate-200 dark:border-[#1E293B]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#1E293B] mb-4">
              <h3 className="font-semibold text-slate-900 dark:text-[#F8FAFC] text-sm tracking-[-0.02em]">Create New Ticket</h3>
              <button
                onClick={() => setShowNewModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:text-[#64748B] dark:hover:text-[#F8FAFC] font-bold text-xs cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateTicket} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500 dark:text-[#64748B] mb-1">
                  Subject Summary
                </label>
                <input
                  type="text"
                  required
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder="e.g. Production API timeout error"
                  className="w-full text-xs border border-slate-200 dark:border-[#334155] bg-white dark:bg-[#0F172A] rounded-lg p-2 text-slate-900 dark:text-[#F8FAFC] placeholder-slate-400 dark:placeholder-slate-500 focus:border-slate-900 dark:focus:border-[#F8FAFC] focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500 dark:text-[#64748B] mb-1">
                    Priority
                  </label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as 'URGENT' | 'MEDIUM' | 'LOW')}
                    className="w-full text-xs border border-slate-200 dark:border-[#334155] rounded-lg p-2 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-[#F8FAFC] focus:border-slate-900 dark:focus:border-[#F8FAFC] focus:outline-hidden cursor-pointer"
                  >
                    <option value="URGENT" className="dark:bg-[#111827]">URGENT (2h / 9h)</option>
                    <option value="MEDIUM" className="dark:bg-[#111827]">MEDIUM (4.5h / 27h)</option>
                    <option value="LOW" className="dark:bg-[#111827]">LOW (9h / 45h)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500 dark:text-[#64748B] mb-1">
                    Customer Account
                  </label>
                  <select
                    value={newCustomerId}
                    onChange={(e) => setNewCustomerId(Number(e.target.value))}
                    className="w-full text-xs border border-slate-200 dark:border-[#334155] rounded-lg p-2 bg-white dark:bg-[#0F172A] text-slate-900 dark:text-[#F8FAFC] focus:border-slate-900 dark:focus:border-[#F8FAFC] focus:outline-hidden cursor-pointer"
                  >
                    <option value={4} className="dark:bg-[#111827]">Alex Chen (Acme)</option>
                    <option value={5} className="dark:bg-[#111827]">Sara Khan (Globex)</option>
                    <option value={6} className="dark:bg-[#111827]">Vikram Singh (Initech)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500 dark:text-[#64748B] mb-1">
                  Description
                </label>
                <textarea
                  required
                  rows={4}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Describe the issue in detail..."
                  className="w-full text-xs border border-slate-200 dark:border-[#334155] bg-white dark:bg-[#0F172A] rounded-lg p-2 text-slate-900 dark:text-[#F8FAFC] placeholder-slate-400 dark:placeholder-slate-500 focus:border-slate-900 dark:focus:border-[#F8FAFC] focus:outline-hidden resize-none font-sans"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-[#1E293B]">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-3 py-1.5 rounded-md text-xs font-medium text-slate-600 dark:text-[#94A3B8] hover:bg-slate-100 dark:hover:bg-[#1E293B] transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-[#F8FAFC] dark:hover:bg-[#E2E8F0] dark:text-[#0F172A] disabled:opacity-50 text-white rounded-md text-xs font-medium border border-slate-800 dark:border-[#F8FAFC] shadow-2xs transition cursor-pointer"
                >
                  {submittingAction ? 'Creating...' : 'Create Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
