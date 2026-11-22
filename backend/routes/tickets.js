const express = require('express');
const router = express.Router();
const db = require('../db');
const { logAudit } = require('../utils/audit');
const { calculateTicketSLA, calculateWorkingMinutes } = require('../utils/sla');

/**
 * Helper to auto-close WAITING_ON_CUSTOMER tickets idle for 5 working days (45 working hours).
 */
async function autoCloseStaleTickets() {
  try {
    const holidaysRes = await db.query('SELECT holiday_date FROM holidays');
    const holidayList = holidaysRes.rows.map(h => h.holiday_date);

    const staleRes = await db.query(
      `SELECT id, paused_at, total_paused_seconds
       FROM tickets
       WHERE status = 'WAITING_ON_CUSTOMER' AND paused_at IS NOT NULL`
    );

    const now = new Date();
    const FIVE_WORKING_DAYS_MINUTES = 5 * 9 * 60; // 45 working hours = 2700 minutes

    for (const ticket of staleRes.rows) {
      const workingMinutes = calculateWorkingMinutes(ticket.paused_at, now, holidayList);
      if (workingMinutes >= FIVE_WORKING_DAYS_MINUTES) {
        // Auto close ticket
        await db.query(
          `UPDATE tickets
           SET status = 'CLOSED',
               total_paused_seconds = total_paused_seconds + GREATEST(0, EXTRACT(EPOCH FROM (NOW() - paused_at))::int),
               paused_at = NULL
           WHERE id = $1`,
          [ticket.id]
        );

        // Record immutable audit log
        await logAudit(db, {
          ticket_id: ticket.id,
          actor_id: null, // System automated action
          action: 'TICKET_AUTO_CLOSED',
          metadata: {
            reason: 'Customer did not reply within 5 working days',
            paused_at: ticket.paused_at,
            working_minutes_idle: workingMinutes,
          },
        });
      }
    }
  } catch (err) {
    console.error('Error during auto-close evaluation:', err);
  }
}

/**
 * GET /api/tickets - List all tickets with SLA metrics
 */
router.get('/', async (req, res) => {
  try {
    // 1. Run auto-close helper for stale tickets
    await autoCloseStaleTickets();

    // 2. Fetch all holidays for SLA calculations
    const holidaysRes = await db.query('SELECT holiday_date FROM holidays');
    const holidayList = holidaysRes.rows.map(h => h.holiday_date);

    // 3. Optional filters
    const { status, priority, assigned_agent_id } = req.query;
    let query = `
      SELECT t.*,
             c.name AS customer_name, c.email AS customer_email,
             a.name AS assigned_agent_name, a.email AS assigned_agent_email
      FROM tickets t
      JOIN users c ON t.customer_id = c.id
      LEFT JOIN users a ON t.assigned_agent_id = a.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      params.push(status);
      query += ` AND t.status = $${params.length}`;
    }
    if (priority) {
      params.push(priority);
      query += ` AND t.priority = $${params.length}`;
    }
    if (assigned_agent_id) {
      params.push(assigned_agent_id);
      query += ` AND t.assigned_agent_id = $${params.length}`;
    }

    query += ' ORDER BY t.created_at DESC';

    const result = await db.query(query, params);
    const now = new Date();

    // Attach calculated SLA
    const ticketsWithSLA = result.rows.map(ticket => {
      const sla = calculateTicketSLA(ticket, holidayList, now);
      return {
        ...ticket,
        sla,
      };
    });

    res.json(ticketsWithSLA);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tickets - Create a new support ticket
 */
router.post('/', async (req, res) => {
  const { subject, description, priority = 'MEDIUM', customer_id } = req.body;

  if (!subject || !description || !customer_id) {
    return res.status(400).json({ error: 'subject, description, and customer_id are required' });
  }

  const validPriorities = ['URGENT', 'MEDIUM', 'LOW'];
  const normalizedPriority = priority.toUpperCase();
  if (!validPriorities.includes(normalizedPriority)) {
    return res.status(400).json({ error: `priority must be one of: ${validPriorities.join(', ')}` });
  }

  try {
    const insertRes = await db.query(
      `INSERT INTO tickets (subject, description, priority, status, customer_id, created_at)
       VALUES ($1, $2, $3, 'OPEN', $4, NOW())
       RETURNING *`,
      [subject, description, normalizedPriority, customer_id]
    );

    const ticket = insertRes.rows[0];

    // Audit log
    await logAudit(db, {
      ticket_id: ticket.id,
      actor_id: customer_id,
      action: 'TICKET_CREATED',
      metadata: { priority: normalizedPriority, subject },
    });

    res.status(201).json(ticket);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/tickets/:id - Full ticket details (Agent view including internal notes and audit trail)
 */
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const ticketRes = await db.query(
      `SELECT t.*,
              c.name AS customer_name, c.email AS customer_email,
              a.name AS assigned_agent_name, a.email AS assigned_agent_email
       FROM tickets t
       JOIN users c ON t.customer_id = c.id
       LEFT JOIN users a ON t.assigned_agent_id = a.id
       WHERE t.id = $1`,
      [id]
    );

    if (ticketRes.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = ticketRes.rows[0];

    // Public messages
    const messagesRes = await db.query(
      `SELECT m.*, u.name AS sender_name, u.role AS sender_role
       FROM public_messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.ticket_id = $1
       ORDER BY m.created_at ASC`,
      [id]
    );

    // Internal notes (Agent only)
    const notesRes = await db.query(
      `SELECT n.*, u.name AS agent_name
       FROM internal_notes n
       JOIN users u ON n.agent_id = u.id
       WHERE n.ticket_id = $1
       ORDER BY n.created_at ASC`,
      [id]
    );

    // Immutable audit logs
    const auditRes = await db.query(
      `SELECT al.*, u.name AS actor_name, u.role AS actor_role
       FROM audit_logs al
       LEFT JOIN users u ON al.actor_id = u.id
       WHERE al.ticket_id = $1
       ORDER BY al.created_at ASC`,
      [id]
    );

    // Calculate SLA
    const holidaysRes = await db.query('SELECT holiday_date FROM holidays');
    const holidayList = holidaysRes.rows.map(h => h.holiday_date);
    const sla = calculateTicketSLA(ticket, holidayList, new Date());

    res.json({
      ticket,
      public_messages: messagesRes.rows,
      internal_notes: notesRes.rows,
      audit_logs: auditRes.rows,
      sla,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tickets/:id/claim - Atomic ticket claiming (Rule 1)
 */
router.post('/:id/claim', async (req, res) => {
  const { id } = req.params;
  const { agent_id } = req.body;

  if (!agent_id) {
    return res.status(400).json({ error: 'agent_id is required to claim a ticket' });
  }

  try {
    // 1. Verify ticket existence
    const checkTicket = await db.query('SELECT id, assigned_agent_id FROM tickets WHERE id = $1', [id]);
    if (checkTicket.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // 2. Atomic claim update
    const claimRes = await db.query(
      'UPDATE tickets SET assigned_agent_id = $1 WHERE id = $2 AND assigned_agent_id IS NULL RETURNING *',
      [agent_id, id]
    );

    if (claimRes.rows.length === 0) {
      return res.status(409).json({ error: 'Ticket already claimed by another agent' });
    }

    const claimedTicket = claimRes.rows[0];

    // 3. Log audit trail
    await logAudit(db, {
      ticket_id: id,
      actor_id: agent_id,
      action: 'TICKET_CLAIMED',
      metadata: { assigned_agent_id: agent_id },
    });

    res.json({ message: 'Ticket claimed successfully', ticket: claimedTicket });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tickets/:id/notes - Private internal notes (Agent-only, Rule 2)
 */
router.post('/:id/notes', async (req, res) => {
  const { id } = req.params;
  const { agent_id, body } = req.body;

  if (!agent_id || !body) {
    return res.status(400).json({ error: 'agent_id and body are required' });
  }

  try {
    // Verify author is an agent
    const userRes = await db.query('SELECT id, role FROM users WHERE id = $1', [agent_id]);
    if (userRes.rows.length === 0 || userRes.rows[0].role !== 'agent') {
      return res.status(403).json({ error: 'Only agents are authorized to post internal notes' });
    }

    const noteRes = await db.query(
      `INSERT INTO internal_notes (ticket_id, agent_id, body, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING *`,
      [id, agent_id, body]
    );

    const note = noteRes.rows[0];

    // Log audit
    await logAudit(db, {
      ticket_id: id,
      actor_id: agent_id,
      action: 'INTERNAL_NOTE_ADDED',
      metadata: { note_id: note.id },
    });

    res.status(201).json(note);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tickets/:id/reply - Public message reply (Rule 4)
 */
router.post('/:id/reply', async (req, res) => {
  const { id } = req.params;
  const { sender_id, body } = req.body;

  if (!sender_id || !body) {
    return res.status(400).json({ error: 'sender_id and body are required' });
  }

  try {
    const userRes = await db.query('SELECT id, role FROM users WHERE id = $1', [sender_id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Sender user not found' });
    }
    const senderRole = userRes.rows[0].role;

    const ticketRes = await db.query('SELECT * FROM tickets WHERE id = $1', [id]);
    if (ticketRes.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    const ticket = ticketRes.rows[0];

    // Insert public message
    const msgRes = await db.query(
      `INSERT INTO public_messages (ticket_id, sender_id, body, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING *`,
      [id, sender_id, body]
    );
    const message = msgRes.rows[0];

    let updatedTicket;

    if (senderRole === 'agent') {
      // Agent reply:
      // - set first_replied_at if null
      // - set status = 'WAITING_ON_CUSTOMER'
      // - set paused_at = NOW()
      const updateRes = await db.query(
        `UPDATE tickets
         SET first_replied_at = COALESCE(first_replied_at, NOW()),
             status = 'WAITING_ON_CUSTOMER',
             paused_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id]
      );
      updatedTicket = updateRes.rows[0];

      await logAudit(db, {
        ticket_id: id,
        actor_id: sender_id,
        action: 'PUBLIC_REPLY_ADDED',
        metadata: {
          message_id: message.id,
          role: 'agent',
          new_status: 'WAITING_ON_CUSTOMER',
          first_reply_recorded: !ticket.first_replied_at,
        },
      });
    } else {
      // Customer reply:
      // - calculate paused duration since paused_at (if set)
      // - add to total_paused_seconds
      // - clear paused_at
      // - set status = 'OPEN'
      const updateRes = await db.query(
        `UPDATE tickets
         SET total_paused_seconds = total_paused_seconds + CASE
               WHEN paused_at IS NOT NULL THEN GREATEST(0, EXTRACT(EPOCH FROM (NOW() - paused_at))::int)
               ELSE 0
             END,
             paused_at = NULL,
             status = 'OPEN'
         WHERE id = $1
         RETURNING *`,
        [id]
      );
      updatedTicket = updateRes.rows[0];

      await logAudit(db, {
        ticket_id: id,
        actor_id: sender_id,
        action: 'PUBLIC_REPLY_ADDED',
        metadata: {
          message_id: message.id,
          role: 'customer',
          new_status: 'OPEN',
        },
      });
    }

    res.status(201).json({
      message,
      ticket: updatedTicket,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tickets/:id/resolve - Resolve ticket (Rule 4)
 */
router.post('/:id/resolve', async (req, res) => {
  const { id } = req.params;
  const { actor_id } = req.body;

  try {
    const updateRes = await db.query(
      `UPDATE tickets
       SET status = 'RESOLVED',
           resolved_at = NOW(),
           total_paused_seconds = total_paused_seconds + CASE
             WHEN paused_at IS NOT NULL THEN GREATEST(0, EXTRACT(EPOCH FROM (NOW() - paused_at))::int)
             ELSE 0
           END,
           paused_at = NULL
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = updateRes.rows[0];

    await logAudit(db, {
      ticket_id: id,
      actor_id: actor_id || null,
      action: 'TICKET_RESOLVED',
      metadata: { resolved_at: ticket.resolved_at },
    });

    res.json({ message: 'Ticket resolved successfully', ticket });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tickets/:id/reopen - Reopen ticket with 7-day rule (Rule 4)
 */
router.post('/:id/reopen', async (req, res) => {
  const { id } = req.params;
  const { actor_id, reason } = req.body;

  try {
    const ticketRes = await db.query('SELECT * FROM tickets WHERE id = $1', [id]);
    if (ticketRes.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const oldTicket = ticketRes.rows[0];
    const now = new Date();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

    const isOlderThan7Days = oldTicket.resolved_at &&
      (now.getTime() - new Date(oldTicket.resolved_at).getTime() > SEVEN_DAYS_MS);

    if (isOlderThan7Days) {
      // Resolution window expired (> 7 days). Create a NEW ticket linked to the old one.
      const newSubject = oldTicket.subject.startsWith('Re: ')
        ? oldTicket.subject
        : `Re: ${oldTicket.subject}`;

      const newDesc = reason
        ? `[Follow-up to Ticket #${oldTicket.id}]\n\nReason: ${reason}\n\nOriginal Description:\n${oldTicket.description}`
        : `[Follow-up to Ticket #${oldTicket.id}]\n\nOriginal Description:\n${oldTicket.description}`;

      const newTicketRes = await db.query(
        `INSERT INTO tickets (subject, description, priority, status, customer_id, assigned_agent_id, created_at)
         VALUES ($1, $2, $3, 'OPEN', $4, $5, NOW())
         RETURNING *`,
        [newSubject, newDesc, oldTicket.priority, oldTicket.customer_id, oldTicket.assigned_agent_id]
      );

      const newTicket = newTicketRes.rows[0];

      // Audit log on new ticket
      await logAudit(db, {
        ticket_id: newTicket.id,
        actor_id: actor_id || null,
        action: 'TICKET_CREATED',
        metadata: {
          linked_from_ticket_id: oldTicket.id,
          reason: 'Created as new ticket because original ticket was resolved > 7 days ago',
        },
      });

      // Audit log on old ticket
      await logAudit(db, {
        ticket_id: oldTicket.id,
        actor_id: actor_id || null,
        action: 'TICKET_REOPENED_AS_NEW',
        metadata: {
          new_ticket_id: newTicket.id,
          reason,
        },
      });

      return res.status(201).json({
        message: 'Resolution window expired (> 7 days). Created new follow-up ticket.',
        isNewTicket: true,
        ticket: newTicket,
      });
    }

    // Reopen existing ticket (within 7 days)
    const reopenRes = await db.query(
      `UPDATE tickets
       SET status = 'OPEN',
           resolved_at = NULL
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    const updatedTicket = reopenRes.rows[0];

    await logAudit(db, {
      ticket_id: id,
      actor_id: actor_id || null,
      action: 'TICKET_REOPENED',
      metadata: {
        reason: reason || 'Reopened within 7-day window',
        previous_resolved_at: oldTicket.resolved_at,
      },
    });

    res.json({
      message: 'Ticket reopened successfully',
      isNewTicket: false,
      ticket: updatedTicket,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/tickets/:id - Update ticket priority, status, or assignment
 */
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { actor_id, priority, status, assigned_agent_id } = req.body;

  try {
    const ticketRes = await db.query('SELECT * FROM tickets WHERE id = $1', [id]);
    if (ticketRes.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    const currentTicket = ticketRes.rows[0];

    const updates = [];
    const params = [id];

    if (priority && priority !== currentTicket.priority) {
      const normalizedPriority = priority.toUpperCase();
      params.push(normalizedPriority);
      updates.push(`priority = $${params.length}`);

      await logAudit(db, {
        ticket_id: id,
        actor_id: actor_id || null,
        action: 'PRIORITY_CHANGED',
        metadata: { old_priority: currentTicket.priority, new_priority: normalizedPriority },
      });
    }

    if (status && status !== currentTicket.status) {
      params.push(status);
      updates.push(`status = $${params.length}`);

      await logAudit(db, {
        ticket_id: id,
        actor_id: actor_id || null,
        action: 'STATUS_CHANGED',
        metadata: { old_status: currentTicket.status, new_status: status },
      });
    }

    if (assigned_agent_id !== undefined && assigned_agent_id !== currentTicket.assigned_agent_id) {
      params.push(assigned_agent_id);
      updates.push(`assigned_agent_id = $${params.length}`);

      await logAudit(db, {
        ticket_id: id,
        actor_id: actor_id || null,
        action: 'AGENT_ASSIGNED',
        metadata: { old_agent_id: currentTicket.assigned_agent_id, new_agent_id: assigned_agent_id },
      });
    }

    if (updates.length === 0) {
      return res.json({ message: 'No changes requested', ticket: currentTicket });
    }

    const updateSql = `UPDATE tickets SET ${updates.join(', ')} WHERE id = $1 RETURNING *`;
    const result = await db.query(updateSql, params);

    res.json({ message: 'Ticket updated successfully', ticket: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.autoCloseStaleTickets = autoCloseStaleTickets;
module.exports = router;

