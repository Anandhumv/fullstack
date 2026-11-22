const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * GET /api/customer/tickets/:id - Customer-facing ticket view (Zero-Leak Private Notes, Rule 2)
 * Strictly queries ONLY `tickets` and `public_messages`.
 * NEVER queries or returns `internal_notes`.
 */
router.get('/tickets/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Query ONLY tickets table (joined with customer user info)
    const ticketRes = await db.query(
      `SELECT t.id, t.subject, t.description, t.priority, t.status,
              t.created_at, t.first_replied_at, t.resolved_at,
              c.name AS customer_name, c.email AS customer_email
       FROM tickets t
       JOIN users c ON t.customer_id = c.id
       WHERE t.id = $1`,
      [id]
    );

    if (ticketRes.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = ticketRes.rows[0];

    // 2. Query ONLY public_messages table
    const messagesRes = await db.query(
      `SELECT m.id, m.ticket_id, m.sender_id, m.body, m.created_at,
              u.name AS sender_name, u.role AS sender_role
       FROM public_messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.ticket_id = $1
       ORDER BY m.created_at ASC`,
      [id]
    );

    // ZERO-LEAK GUARANTEE: internal_notes is NEVER queried or returned in this response
    res.json({
      ticket,
      public_messages: messagesRes.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/customer/tickets - List tickets for a specific customer
 */
router.get('/tickets', async (req, res) => {
  const { customer_id } = req.query;

  if (!customer_id) {
    return res.status(400).json({ error: 'customer_id query parameter is required' });
  }

  try {
    const result = await db.query(
      `SELECT id, subject, priority, status, created_at, resolved_at
       FROM tickets
       WHERE customer_id = $1
       ORDER BY created_at DESC`,
      [customer_id]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

