const db = require('../db');

/**
 * Insert an immutable record into audit_logs.
 * 
 * @param {Object} clientOrDb - pg Pool or Client (for transactions)
 * @param {Object} logEntry - The audit log details
 * @param {number} logEntry.ticket_id - Target ticket ID
 * @param {number|null} [logEntry.actor_id=null] - User ID performing the action
 * @param {string} logEntry.action - Action name (e.g., TICKET_CREATED, TICKET_CLAIMED)
 * @param {Object} [logEntry.metadata={}] - Additional structured JSON metadata
 * @returns {Promise<Object>} Inserted audit log row
 */
async function logAudit(clientOrDb, { ticket_id, actor_id = null, action, metadata = {} }) {
  const executor = clientOrDb || db;
  const res = await executor.query(
    `INSERT INTO audit_logs (ticket_id, actor_id, action, metadata, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     RETURNING *`,
    [ticket_id, actor_id, action, JSON.stringify(metadata)]
  );
  return res.rows[0];
}

module.exports = {
  logAudit,
};

