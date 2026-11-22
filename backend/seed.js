const fs = require('fs');
const path = require('path');
const db = require('./db');

async function seedDatabase() {
  console.log('--- Starting Frontdesk Database Seed ---');

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Run schema.sql to ensure all tables & triggers exist
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    console.log('Applying schema.sql...');
    await client.query(schemaSql);

    // 2. Clear previous data (TRUNCATE bypasses row-level update/delete triggers)
    console.log('Truncating existing tables...');
    await client.query(`
      TRUNCATE TABLE audit_logs, internal_notes, public_messages, tickets, holidays, users
      RESTART IDENTITY CASCADE
    `);

    // 3. Seed 3 Agents
    console.log('Seeding agents...');
    const agentsRes = await client.query(`
      INSERT INTO users (name, email, role) VALUES
      ('Meera Sharma', 'meera@frontdesk.test', 'agent'),
      ('Rahul Verma', 'rahul@frontdesk.test', 'agent'),
      ('Priya Patel', 'priya@frontdesk.test', 'agent')
      RETURNING id, name, email;
    `);
    const [agentMeera, agentRahul, agentPriya] = agentsRes.rows;

    // 4. Seed 3 Customers
    console.log('Seeding customers...');
    const customersRes = await client.query(`
      INSERT INTO users (name, email, role) VALUES
      ('Amit Kumar', 'amit@customer.test', 'customer'),
      ('Sneha Roy', 'sneha@customer.test', 'customer'),
      ('Vikram Singh', 'vikram@customer.test', 'customer')
      RETURNING id, name, email;
    `);
    const [custAmit, custSneha, custVikram] = customersRes.rows;

    // 5. Seed 3 Festival Holidays
    console.log('Seeding festival holidays...');
    await client.query(`
      INSERT INTO holidays (holiday_date, name) VALUES
      ('2026-11-08', 'Diwali'),
      ('2026-12-25', 'Christmas'),
      ('2027-01-01', 'New Year')
      ON CONFLICT (holiday_date) DO UPDATE SET name = EXCLUDED.name;
    `);

    // 6. Seed 6 Realistic Tickets
    console.log('Seeding 6 realistic tickets...');

    // Ticket 1: Overdue URGENT (Created 3 days ago, no reply yet -> 2h SLA breached)
    const t1Res = await client.query(`
      INSERT INTO tickets (
        subject, description, priority, status, customer_id, assigned_agent_id,
        created_at, first_replied_at, resolved_at, paused_at, total_paused_seconds
      ) VALUES (
        'Production database high CPU spike',
        'Database CPU reached 98% on primary replica. Read queries timing out for multiple users.',
        'URGENT', 'OPEN', $1, $2,
        NOW() - INTERVAL '3 days', NULL, NULL, NULL, 0
      ) RETURNING id;
    `, [custAmit.id, agentMeera.id]);
    const t1Id = t1Res.rows[0].id;

    await client.query(`
      INSERT INTO audit_logs (ticket_id, actor_id, action, metadata, created_at) VALUES
      ($1, $2, 'TICKET_CREATED', '{"priority": "URGENT", "source": "portal"}', NOW() - INTERVAL '3 days'),
      ($1, $3, 'TICKET_CLAIMED', '{"assigned_agent_id": ' || $3 || '}', NOW() - INTERVAL '2 days 23 hours');
    `, [t1Id, custAmit.id, agentMeera.id]);

    // Ticket 2: Unassigned (Created 2 hours ago, status OPEN, no agent)
    const t2Res = await client.query(`
      INSERT INTO tickets (
        subject, description, priority, status, customer_id, assigned_agent_id,
        created_at, first_replied_at, resolved_at, paused_at, total_paused_seconds
      ) VALUES (
        'Cannot export CSV billing reports',
        'When clicking export on the monthly billing dashboard, the spinner hangs indefinitely.',
        'MEDIUM', 'OPEN', $1, NULL,
        NOW() - INTERVAL '2 hours', NULL, NULL, NULL, 0
      ) RETURNING id;
    `, [custSneha.id]);
    const t2Id = t2Res.rows[0].id;

    await client.query(`
      INSERT INTO audit_logs (ticket_id, actor_id, action, metadata, created_at) VALUES
      ($1, $2, 'TICKET_CREATED', '{"priority": "MEDIUM", "source": "portal"}', NOW() - INTERVAL '2 hours');
    `, [t2Id, custSneha.id]);

    // Ticket 3: Waiting on Customer (Created 1 day ago, agent replied 18 hours ago, paused)
    const t3Res = await client.query(`
      INSERT INTO tickets (
        subject, description, priority, status, customer_id, assigned_agent_id,
        created_at, first_replied_at, resolved_at, paused_at, total_paused_seconds
      ) VALUES (
        'Webhook delivery failures on endpoint /orders',
        'Receiving 502 Bad Gateway intermittently on order creation events.',
        'MEDIUM', 'WAITING_ON_CUSTOMER', $1, $2,
        NOW() - INTERVAL '24 hours', NOW() - INTERVAL '18 hours', NULL, NOW() - INTERVAL '18 hours', 0
      ) RETURNING id;
    `, [custVikram.id, agentRahul.id]);
    const t3Id = t3Res.rows[0].id;

    // Public messages for Ticket 3
    await client.query(`
      INSERT INTO public_messages (ticket_id, sender_id, body, created_at) VALUES
      ($1, $2, 'Intermittent 502 Bad Gateway responses received on our staging receiver endpoint.', NOW() - INTERVAL '24 hours'),
      ($1, $3, 'Could you please check your server timeout settings and share sample failure response headers?', NOW() - INTERVAL '18 hours');
    `, [t3Id, custVikram.id, agentRahul.id]);

    // Internal note for Ticket 3 (Agent-only)
    await client.query(`
      INSERT INTO internal_notes (ticket_id, agent_id, body, created_at) VALUES
      ($1, $2, 'Checked our Cloudflare gateway logs. The customer staging receiver took >30s before dropping the socket.', NOW() - INTERVAL '18 hours');
    `, [t3Id, agentRahul.id]);

    await client.query(`
      INSERT INTO audit_logs (ticket_id, actor_id, action, metadata, created_at) VALUES
      ($1, $2, 'TICKET_CREATED', '{"priority": "MEDIUM"}', NOW() - INTERVAL '24 hours'),
      ($1, $3, 'TICKET_CLAIMED', '{"assigned_agent_id": ' || $3 || '}', NOW() - INTERVAL '20 hours'),
      ($1, $3, 'PUBLIC_REPLY_ADDED', '{"role": "agent", "new_status": "WAITING_ON_CUSTOMER"}', NOW() - INTERVAL '18 hours'),
      ($1, $3, 'INTERNAL_NOTE_ADDED', '{"author": "agent"}', NOW() - INTERVAL '18 hours');
    `, [t3Id, custVikram.id, agentRahul.id]);

    // Ticket 4: Created Friday 6 PM (e.g. 2026-11-20 18:00:00 local time)
    const t4Res = await client.query(`
      INSERT INTO tickets (
        subject, description, priority, status, customer_id, assigned_agent_id,
        created_at, first_replied_at, resolved_at, paused_at, total_paused_seconds
      ) VALUES (
        'SSO configuration question for Okta',
        'Need SAML metadata XML to finalize Okta SSO integration.',
        'LOW', 'OPEN', $1, $2,
        '2026-11-20 18:00:00+05:30', NULL, NULL, NULL, 0
      ) RETURNING id;
    `, [custAmit.id, agentPriya.id]);
    const t4Id = t4Res.rows[0].id;

    await client.query(`
      INSERT INTO audit_logs (ticket_id, actor_id, action, metadata, created_at) VALUES
      ($1, $2, 'TICKET_CREATED', '{"priority": "LOW"}', '2026-11-20 18:00:00+05:30'),
      ($1, $3, 'TICKET_CLAIMED', '{"assigned_agent_id": ' || $3 || '}', '2026-11-20 18:15:00+05:30');
    `, [t4Id, custAmit.id, agentPriya.id]);

    // Ticket 5: Resolved within 7 days (Resolved 2 days ago -> eligible for direct reopen)
    const t5Res = await client.query(`
      INSERT INTO tickets (
        subject, description, priority, status, customer_id, assigned_agent_id,
        created_at, first_replied_at, resolved_at, paused_at, total_paused_seconds
      ) VALUES (
        'Password reset link expired immediately',
        'Customer could not reset password due to time skew on auth server.',
        'LOW', 'RESOLVED', $1, $2,
        NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days', NOW() - INTERVAL '2 days', NULL, 0
      ) RETURNING id;
    `, [custSneha.id, agentMeera.id]);
    const t5Id = t5Res.rows[0].id;

    await client.query(`
      INSERT INTO public_messages (ticket_id, sender_id, body, created_at) VALUES
      ($1, $2, 'Password reset links say expired immediately upon opening.', NOW() - INTERVAL '4 days'),
      ($1, $3, 'Auth node NTP drift corrected. Token expiration is verified working.', NOW() - INTERVAL '2 days');
    `, [t5Id, custSneha.id, agentMeera.id]);

    await client.query(`
      INSERT INTO audit_logs (ticket_id, actor_id, action, metadata, created_at) VALUES
      ($1, $2, 'TICKET_CREATED', '{"priority": "LOW"}', NOW() - INTERVAL '4 days'),
      ($1, $3, 'TICKET_CLAIMED', '{"assigned_agent_id": ' || $3 || '}', NOW() - INTERVAL '4 days'),
      ($1, $3, 'PUBLIC_REPLY_ADDED', '{"role": "agent"}', NOW() - INTERVAL '2 days'),
      ($1, $3, 'TICKET_RESOLVED', '{"resolved_at": "within_7_days"}', NOW() - INTERVAL '2 days');
    `, [t5Id, custSneha.id, agentMeera.id]);

    // Ticket 6: Resolved > 7 days ago (Resolved 10 days ago -> reopen creates NEW linked ticket)
    const t6Res = await client.query(`
      INSERT INTO tickets (
        subject, description, priority, status, customer_id, assigned_agent_id,
        created_at, first_replied_at, resolved_at, paused_at, total_paused_seconds
      ) VALUES (
        'API rate limit increase request',
        'Requesting tier upgrade to 500 requests/minute for peak season.',
        'LOW', 'RESOLVED', $1, $2,
        NOW() - INTERVAL '14 days', NOW() - INTERVAL '14 days', NOW() - INTERVAL '10 days', NULL, 0
      ) RETURNING id;
    `, [custVikram.id, agentRahul.id]);
    const t6Id = t6Res.rows[0].id;

    await client.query(`
      INSERT INTO public_messages (ticket_id, sender_id, body, created_at) VALUES
      ($1, $2, 'Requesting tier upgrade to 500 requests/minute for peak season.', NOW() - INTERVAL '14 days'),
      ($1, $3, 'Rate limit has been increased to 500 req/min for your tenant.', NOW() - INTERVAL '10 days');
    `, [t6Id, custVikram.id, agentRahul.id]);

    await client.query(`
      INSERT INTO audit_logs (ticket_id, actor_id, action, metadata, created_at) VALUES
      ($1, $2, 'TICKET_CREATED', '{"priority": "LOW"}', NOW() - INTERVAL '14 days'),
      ($1, $3, 'TICKET_CLAIMED', '{"assigned_agent_id": ' || $3 || '}', NOW() - INTERVAL '14 days'),
      ($1, $3, 'PUBLIC_REPLY_ADDED', '{"role": "agent"}', NOW() - INTERVAL '10 days'),
      ($1, $3, 'TICKET_RESOLVED', '{"resolved_at": "10_days_ago"}', NOW() - INTERVAL '10 days');
    `, [t6Id, custVikram.id, agentRahul.id]);

    await client.query('COMMIT');
    console.log('✓ Successfully seeded Frontdesk database:');
    console.log('  - 3 Agents (Meera, Rahul, Priya)');
    console.log('  - 3 Customers (Amit, Sneha, Vikram)');
    console.log('  - 3 Festival Holidays (Diwali, Christmas, New Year)');
    console.log('  - 6 Realistic Tickets (overdue, unassigned, waiting on customer, Friday 6 PM, resolved < 7d, resolved > 7d)');
    console.log('  - Public messages, internal notes, and immutable audit logs');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed script failed:', err.message);
    throw err;
  } finally {
    client.release();
    await db.pool.end();
  }
}

if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = seedDatabase;

