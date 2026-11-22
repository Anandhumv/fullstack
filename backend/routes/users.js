const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * GET /api/users - List users (optional ?role=agent or ?role=customer)
 */
router.get('/', async (req, res) => {
  const { role } = req.query;
  try {
    let query = 'SELECT id, name, email, role, created_at FROM users';
    const params = [];

    if (role) {
      params.push(role);
      query += ' WHERE role = $1';
    }

    query += ' ORDER BY id ASC';
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/users/:id - Get user by ID
 */
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(
      'SELECT id, name, email, role, created_at FROM users WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

