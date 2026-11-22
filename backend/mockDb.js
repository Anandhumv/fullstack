/**
 * In-Memory Database Fallback for Frontdesk
 * Activates automatically when a live PostgreSQL instance is not connected.
 * Pre-populated with the exact Phase 3 seed data.
 */

const { calculateTicketSLA } = require('./utils/sla');

// Seed Users
const users = [
  { id: 1, name: 'Meera Sharma', email: 'meera@frontdesk.test', role: 'agent', created_at: new Date('2026-11-01T09:00:00Z') },
  { id: 2, name: 'Rahul Verma', email: 'rahul@frontdesk.test', role: 'agent', created_at: new Date('2026-11-01T09:00:00Z') },
  { id: 3, name: 'Priya Patel', email: 'priya@frontdesk.test', role: 'agent', created_at: new Date('2026-11-01T09:00:00Z') },
  { id: 4, name: 'Amit Kumar', email: 'amit@customer.test', role: 'customer', created_at: new Date('2026-11-01T09:00:00Z') },
  { id: 5, name: 'Sneha Roy', email: 'sneha@customer.test', role: 'customer', created_at: new Date('2026-11-01T09:00:00Z') },
  { id: 6, name: 'Vikram Singh', email: 'vikram@customer.test', role: 'customer', created_at: new Date('2026-11-01T09:00:00Z') },
];

// Seed Holidays
const holidays = [
  { holiday_date: '2026-11-08', name: 'Diwali' },
  { holiday_date: '2026-12-25', name: 'Christmas' },
  { holiday_date: '2027-01-01', name: 'New Year' },
];

const now = new Date();

// Seed Tickets
const tickets = [
  {
    id: 1,
    subject: 'Production database high CPU spike',
    description: 'Database CPU reached 98% on primary replica. Read queries timing out for multiple users.',
    priority: 'URGENT',
    status: 'OPEN',
    customer_id: 4,
    assigned_agent_id: 1,
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    first_replied_at: null,
    resolved_at: null,
    paused_at: null,
    total_paused_seconds: 0,
  },
  {
    id: 2,
    subject: 'Cannot export CSV billing reports',
    description: 'When clicking export on the monthly billing dashboard, the spinner hangs indefinitely.',
    priority: 'MEDIUM',
    status: 'OPEN',
    customer_id: 5,
    assigned_agent_id: null,
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    first_replied_at: null,
    resolved_at: null,
    paused_at: null,
    total_paused_seconds: 0,
  },
  {
    id: 3,
    subject: 'Webhook delivery failures on endpoint /orders',
    description: 'Receiving 502 Bad Gateway intermittently on order creation events.',
    priority: 'MEDIUM',
    status: 'WAITING_ON_CUSTOMER',
    customer_id: 6,
    assigned_agent_id: 2,
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    first_replied_at: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString(),
    resolved_at: null,
    paused_at: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString(),
    total_paused_seconds: 0,
  },
  {
    id: 4,
    subject: 'SSO configuration question for Okta',
    description: 'Need SAML metadata XML to finalize Okta SSO integration.',
    priority: 'LOW',
    status: 'OPEN',
    customer_id: 4,
    assigned_agent_id: 3,
    created_at: '2026-11-20T18:00:00+05:30',
    first_replied_at: null,
    resolved_at: null,
    paused_at: null,
    total_paused_seconds: 0,
  },
  {
    id: 5,
    subject: 'Password reset link expired immediately',
    description: 'Customer could not reset password due to time skew on auth server.',
    priority: 'LOW',
    status: 'RESOLVED',
    customer_id: 5,
    assigned_agent_id: 1,
    created_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    first_replied_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    resolved_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    paused_at: null,
    total_paused_seconds: 0,
  },
  {
    id: 6,
    subject: 'API rate limit increase request',
    description: 'Requesting tier upgrade to 500 requests/minute for peak season.',
    priority: 'LOW',
    status: 'RESOLVED',
    customer_id: 6,
    assigned_agent_id: 2,
    created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    first_replied_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    resolved_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    paused_at: null,
    total_paused_seconds: 0,
  },
];

// Seed Public Messages
const public_messages = [
  {
    id: 1,
    ticket_id: 3,
    sender_id: 6,
    body: 'Intermittent 502 Bad Gateway responses received on our staging receiver endpoint.',
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 2,
    ticket_id: 3,
    sender_id: 2,
    body: 'Could you please check your server timeout settings and share sample failure response headers?',
    created_at: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 3,
    ticket_id: 5,
    sender_id: 5,
    body: 'Password reset links say expired immediately upon opening.',
    created_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 4,
    ticket_id: 5,
    sender_id: 1,
    body: 'Auth node NTP drift corrected. Token expiration is verified working.',
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 5,
    ticket_id: 6,
    sender_id: 6,
    body: 'Requesting tier upgrade to 500 requests/minute for peak season.',
    created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 6,
    ticket_id: 6,
    sender_id: 2,
    body: 'Rate limit has been increased to 500 req/min for your tenant.',
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

// Seed Internal Notes
const internal_notes = [
  {
    id: 1,
    ticket_id: 3,
    agent_id: 2,
    body: 'Checked our Cloudflare gateway logs. The customer staging receiver took >30s before dropping the socket.',
    created_at: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString(),
  },
];

// Seed Audit Logs
const audit_logs = [
  { id: 1, ticket_id: 1, actor_id: 4, action: 'TICKET_CREATED', metadata: { priority: 'URGENT' }, created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 2, ticket_id: 1, actor_id: 1, action: 'TICKET_CLAIMED', metadata: { assigned_agent_id: 1 }, created_at: new Date(Date.now() - 71 * 60 * 60 * 1000).toISOString() },
  { id: 3, ticket_id: 2, actor_id: 5, action: 'TICKET_CREATED', metadata: { priority: 'MEDIUM' }, created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
  { id: 4, ticket_id: 3, actor_id: 6, action: 'TICKET_CREATED', metadata: { priority: 'MEDIUM' }, created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
  { id: 5, ticket_id: 3, actor_id: 2, action: 'TICKET_CLAIMED', metadata: { assigned_agent_id: 2 }, created_at: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString() },
  { id: 6, ticket_id: 3, actor_id: 2, action: 'PUBLIC_REPLY_ADDED', metadata: { role: 'agent', new_status: 'WAITING_ON_CUSTOMER' }, created_at: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString() },
  { id: 7, ticket_id: 3, actor_id: 2, action: 'INTERNAL_NOTE_ADDED', metadata: { author: 'agent' }, created_at: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString() },
  { id: 8, ticket_id: 4, actor_id: 4, action: 'TICKET_CREATED', metadata: { priority: 'LOW' }, created_at: '2026-11-20T18:00:00+05:30' },
  { id: 9, ticket_id: 4, actor_id: 3, action: 'TICKET_CLAIMED', metadata: { assigned_agent_id: 3 }, created_at: '2026-11-20T18:15:00+05:30' },
  { id: 10, ticket_id: 5, actor_id: 5, action: 'TICKET_CREATED', metadata: { priority: 'LOW' }, created_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 11, ticket_id: 5, actor_id: 1, action: 'TICKET_CLAIMED', metadata: { assigned_agent_id: 1 }, created_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 12, ticket_id: 5, actor_id: 1, action: 'TICKET_RESOLVED', metadata: { resolved_at: 'within_7_days' }, created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 13, ticket_id: 6, actor_id: 6, action: 'TICKET_CREATED', metadata: { priority: 'LOW' }, created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 14, ticket_id: 6, actor_id: 2, action: 'TICKET_CLAIMED', metadata: { assigned_agent_id: 2 }, created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 15, ticket_id: 6, actor_id: 2, action: 'TICKET_RESOLVED', metadata: { resolved_at: '10_days_ago' }, created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() },
];

let nextMsgId = 7;
let nextNoteId = 2;
let nextAuditId = 16;
let nextTicketId = 7;

function query(text, params = []) {
  const sql = text.trim();

  // SELECT NOW()
  if (/^SELECT NOW\(\)/i.test(sql)) {
    return Promise.resolve({ rows: [{ now: new Date().toISOString() }] });
  }

  // SELECT holiday_date FROM holidays
  if (/FROM holidays/i.test(sql)) {
    return Promise.resolve({ rows: [...holidays] });
  }

  // SELECT ... FROM users
  if (/FROM users/i.test(sql)) {
    if (params.length > 0 && /role = \$1/i.test(sql)) {
      return Promise.resolve({ rows: users.filter(u => u.role === params[0]) });
    }
    if (params.length > 0 && /id = \$1/i.test(sql)) {
      return Promise.resolve({ rows: users.filter(u => u.id === Number(params[0])) });
    }
    return Promise.resolve({ rows: [...users] });
  }

  // SELECT ... FROM tickets WHERE id = $1
  if (/FROM tickets/i.test(sql) && /WHERE (t\.)?id = \$1/i.test(sql)) {
    const id = Number(params[0]);
    const t = tickets.find(x => x.id === id);
    if (!t) return Promise.resolve({ rows: [] });

    const cust = users.find(u => u.id === t.customer_id);
    const agent = users.find(u => u.id === t.assigned_agent_id);

    return Promise.resolve({
      rows: [{
        ...t,
        customer_name: cust ? cust.name : undefined,
        customer_email: cust ? cust.email : undefined,
        assigned_agent_name: agent ? agent.name : undefined,
        assigned_agent_email: agent ? agent.email : undefined,
      }],
    });
  }

  // SELECT ... FROM tickets
  if (/FROM tickets/i.test(sql) && !/UPDATE/i.test(sql) && !/INSERT/i.test(sql)) {
    let result = tickets.map(t => {
      const cust = users.find(u => u.id === t.customer_id);
      const agent = users.find(u => u.id === t.assigned_agent_id);
      return {
        ...t,
        customer_name: cust ? cust.name : undefined,
        customer_email: cust ? cust.email : undefined,
        assigned_agent_name: agent ? agent.name : undefined,
        assigned_agent_email: agent ? agent.email : undefined,
      };
    });

    // Check filters
    if (/status = 'WAITING_ON_CUSTOMER'/i.test(sql)) {
      result = result.filter(t => t.status === 'WAITING_ON_CUSTOMER' && t.paused_at);
    }

    return Promise.resolve({ rows: result });
  }

  // SELECT ... FROM public_messages
  if (/FROM public_messages/i.test(sql)) {
    const ticketId = Number(params[0]);
    const msgs = public_messages
      .filter(m => m.ticket_id === ticketId)
      .map(m => {
        const u = users.find(x => x.id === m.sender_id);
        return {
          ...m,
          sender_name: u ? u.name : 'Unknown',
          sender_role: u ? u.role : 'user',
        };
      });
    return Promise.resolve({ rows: msgs });
  }

  // SELECT ... FROM internal_notes
  if (/FROM internal_notes/i.test(sql)) {
    const ticketId = Number(params[0]);
    const notes = internal_notes
      .filter(n => n.ticket_id === ticketId)
      .map(n => {
        const u = users.find(x => x.id === n.agent_id);
        return {
          ...n,
          agent_name: u ? u.name : 'Agent',
        };
      });
    return Promise.resolve({ rows: notes });
  }

  // SELECT ... FROM audit_logs
  if (/FROM audit_logs/i.test(sql)) {
    const ticketId = Number(params[0]);
    const logs = audit_logs
      .filter(l => l.ticket_id === ticketId)
      .map(l => {
        const u = users.find(x => x.id === l.actor_id);
        return {
          ...l,
          actor_name: u ? u.name : null,
          actor_role: u ? u.role : null,
        };
      });
    return Promise.resolve({ rows: logs });
  }

  // Atomic Claim: UPDATE tickets SET assigned_agent_id = $1 WHERE id = $2 AND assigned_agent_id IS NULL RETURNING *
  if (/UPDATE tickets SET assigned_agent_id = \$1 WHERE id = \$2 AND assigned_agent_id IS NULL/i.test(sql)) {
    const agentId = Number(params[0]);
    const ticketId = Number(params[1]);
    const t = tickets.find(x => x.id === ticketId);

    if (t && (t.assigned_agent_id === null || t.assigned_agent_id === undefined)) {
      t.assigned_agent_id = agentId;
      return Promise.resolve({ rows: [t] });
    }
    return Promise.resolve({ rows: [] }); // 0 rows -> 409 Conflict!
  }

  // INSERT INTO internal_notes
  if (/INSERT INTO internal_notes/i.test(sql)) {
    const [ticket_id, agent_id, body] = params;
    const note = {
      id: nextNoteId++,
      ticket_id: Number(ticket_id),
      agent_id: Number(agent_id),
      body,
      created_at: new Date().toISOString(),
    };
    internal_notes.push(note);
    return Promise.resolve({ rows: [note] });
  }

  // INSERT INTO public_messages
  if (/INSERT INTO public_messages/i.test(sql)) {
    const [ticket_id, sender_id, body] = params;
    const msg = {
      id: nextMsgId++,
      ticket_id: Number(ticket_id),
      sender_id: Number(sender_id),
      body,
      created_at: new Date().toISOString(),
    };
    public_messages.push(msg);
    return Promise.resolve({ rows: [msg] });
  }

  // INSERT INTO audit_logs
  if (/INSERT INTO audit_logs/i.test(sql)) {
    const [ticket_id, actor_id, action, metadata] = params;
    const log = {
      id: nextAuditId++,
      ticket_id: Number(ticket_id),
      actor_id: actor_id ? Number(actor_id) : null,
      action,
      metadata: typeof metadata === 'string' ? JSON.parse(metadata) : metadata,
      created_at: new Date().toISOString(),
    };
    audit_logs.push(log);
    return Promise.resolve({ rows: [log] });
  }

  // INSERT INTO tickets
  if (/INSERT INTO tickets/i.test(sql)) {
    const [subject, description, priority, customer_id, assigned_agent_id] = params;
    const t = {
      id: nextTicketId++,
      subject,
      description,
      priority,
      status: 'OPEN',
      customer_id: Number(customer_id),
      assigned_agent_id: assigned_agent_id ? Number(assigned_agent_id) : null,
      created_at: new Date().toISOString(),
      first_replied_at: null,
      resolved_at: null,
      paused_at: null,
      total_paused_seconds: 0,
    };
    tickets.unshift(t);
    return Promise.resolve({ rows: [t] });
  }

  // UPDATE tickets (Reply by Agent or Customer, Resolve, Reopen, Patch)
  if (/UPDATE tickets/i.test(sql)) {
    const idMatch = sql.match(/WHERE id = \$(\d+)/i);
    const idParamIndex = idMatch ? Number(idMatch[1]) - 1 : params.length - 1;
    const ticketId = Number(params[idParamIndex]);
    const t = tickets.find(x => x.id === ticketId);

    if (t) {
      if (/status = 'WAITING_ON_CUSTOMER'/i.test(sql)) {
        if (!t.first_replied_at) t.first_replied_at = new Date().toISOString();
        t.status = 'WAITING_ON_CUSTOMER';
        t.paused_at = new Date().toISOString();
      } else if (/status = 'OPEN'/i.test(sql)) {
        t.status = 'OPEN';
        if (t.paused_at) {
          const pausedSecs = Math.max(0, Math.round((Date.now() - new Date(t.paused_at).getTime()) / 1000));
          t.total_paused_seconds = (t.total_paused_seconds || 0) + pausedSecs;
          t.paused_at = null;
        }
        t.resolved_at = null;
      } else if (/status = 'RESOLVED'/i.test(sql)) {
        t.status = 'RESOLVED';
        t.resolved_at = new Date().toISOString();
        t.paused_at = null;
      } else if (/status = 'CLOSED'/i.test(sql)) {
        t.status = 'CLOSED';
        t.paused_at = null;
      }

      // Priority change
      if (params.includes('URGENT')) t.priority = 'URGENT';
      if (params.includes('MEDIUM')) t.priority = 'MEDIUM';
      if (params.includes('LOW')) t.priority = 'LOW';

      return Promise.resolve({ rows: [t] });
    }
  }

  return Promise.resolve({ rows: [] });
}

module.exports = {
  query,
  pool: {
    query,
    connect: () => Promise.resolve({ query, release: () => {} }),
    end: () => Promise.resolve(),
  },
};

