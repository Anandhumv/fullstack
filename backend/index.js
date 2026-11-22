const express = require('express');
const cors = require('cors');
require('dotenv').config();

const db = require('./db');
const ticketsRouter = require('./routes/tickets');
const customerRouter = require('./routes/customer');
const usersRouter = require('./routes/users');
const holidaysRouter = require('./routes/holidays');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/tickets', ticketsRouter);
app.use('/api/customer', customerRouter);
app.use('/api/users', usersRouter);
app.use('/api/holidays', holidaysRouter);

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW()');
    res.json({ status: 'ok', timestamp: result.rows[0].now });
  } catch (err) {
    res.status(200).json({ status: 'ok', db: 'disconnected', error: err.message });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Frontdesk backend server running on port ${PORT}`);

    // Background process: Periodic auto-closure for tickets waiting > 5 working days
    const FIFTEEN_MINUTES = 15 * 60 * 1000;
    setInterval(() => {
      ticketsRouter.autoCloseStaleTickets()
        .then(() => console.log('[Background Job] Stale ticket auto-close evaluation completed.'))
        .catch((err) => console.error('[Background Job] Stale ticket check failed:', err.message));
    }, FIFTEEN_MINUTES);
  });
}

module.exports = app;


