const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * GET /api/holidays - List all holiday dates
 */
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT holiday_date, name FROM holidays ORDER BY holiday_date ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/holidays - Add a new holiday
 */
router.post('/', async (req, res) => {
  const { holiday_date, name } = req.body;
  if (!holiday_date || !name) {
    return res.status(400).json({ error: 'holiday_date (YYYY-MM-DD) and name are required' });
  }

  try {
    const result = await db.query(
      `INSERT INTO holidays (holiday_date, name)
       VALUES ($1, $2)
       ON CONFLICT (holiday_date) DO UPDATE SET name = EXCLUDED.name
       RETURNING *`,
      [holiday_date, name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

