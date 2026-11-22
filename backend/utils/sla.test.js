const assert = require('assert');
const { calculateTicketSLA } = require('./sla');

console.log('Running SLA Engine test suite...\n');

// -----------------------------------------------------------------------------
// Test 1: Weekend exclusion rule
// A ticket created Friday at 6:00 PM checked on Sunday morning MUST NOT be late.
// -----------------------------------------------------------------------------
{
  // Friday, Nov 20, 2026 at 18:00 (6:00 PM)
  const createdAt = new Date(2026, 10, 20, 18, 0, 0);
  // Sunday, Nov 22, 2026 at 10:00 AM
  const checkTime = new Date(2026, 10, 22, 10, 0, 0);

  const ticket = {
    priority: 'URGENT', // 2h (120m) first reply, 9h (540m) resolution
    status: 'OPEN',
    created_at: createdAt,
    total_paused_seconds: 0,
    first_replied_at: null,
    resolved_at: null,
  };

  const sla = calculateTicketSLA(ticket, [], checkTime);

  // Only 30 working minutes elapsed on Friday (18:00 to 18:30). Saturday and Sunday are non-working.
  assert.strictEqual(sla.workingMinutesElapsed, 30, 'Working minutes elapsed should be 30');
  assert.strictEqual(sla.isFirstReplyBreached, false, 'First reply must not be breached on Sunday');
  assert.strictEqual(sla.isResolutionBreached, false, 'Resolution must not be breached on Sunday');
  assert.strictEqual(sla.isLate, false, 'Ticket must NOT be late on Sunday morning');

  // First reply is due Monday Nov 23 at 11:00 AM (90 minutes left from Monday 9:30 AM)
  const expectedFirstReply = new Date(2026, 10, 23, 11, 0, 0);
  assert.strictEqual(
    sla.firstReplyDueAt.getTime(),
    expectedFirstReply.getTime(),
    `First reply due at should be Monday 11:00 AM, got ${sla.firstReplyDueAt}`
  );

  console.log('✓ Test 1 Passed: Weekend exclusion (Friday 6:00 PM checked Sunday is not late)');
}

// -----------------------------------------------------------------------------
// Test 2: Holiday exclusion rule
// Ticket created Friday 6:00 PM, checked Monday 2:00 PM when Monday is a holiday.
// -----------------------------------------------------------------------------
{
  const createdAt = new Date(2026, 10, 20, 18, 0, 0); // Friday 18:00
  const checkTime = new Date(2026, 10, 23, 14, 0, 0); // Monday 14:00 (holiday)
  const holidays = ['2026-11-23'];

  const ticket = {
    priority: 'URGENT',
    status: 'OPEN',
    created_at: createdAt,
    total_paused_seconds: 0,
    first_replied_at: null,
    resolved_at: null,
  };

  const sla = calculateTicketSLA(ticket, holidays, checkTime);

  // Still only 30 working minutes elapsed because Monday is a holiday
  assert.strictEqual(sla.workingMinutesElapsed, 30, 'Elapsed minutes should remain 30 during holiday');
  assert.strictEqual(sla.isLate, false, 'Must not be late during holiday');

  // Deadline pushed to Tuesday Nov 24 at 11:00 AM
  const expectedFirstReply = new Date(2026, 10, 24, 11, 0, 0);
  assert.strictEqual(
    sla.firstReplyDueAt.getTime(),
    expectedFirstReply.getTime(),
    `First reply due should be Tuesday 11:00 AM due to holiday, got ${sla.firstReplyDueAt}`
  );

  console.log('✓ Test 2 Passed: Holiday exclusion skips declared holiday dates');
}

// -----------------------------------------------------------------------------
// Test 3: Paused time (WAITING_ON_CUSTOMER)
// Time spent waiting on customer must not count against the SLA.
// -----------------------------------------------------------------------------
{
  // Monday Nov 23, 2026 at 09:30 AM
  const createdAt = new Date(2026, 10, 23, 9, 30, 0);
  // Paused at 10:30 AM (1 hour worked)
  const pausedAt = new Date(2026, 10, 23, 10, 30, 0);
  // Checked at 12:30 PM (2 hours paused)
  const checkTime = new Date(2026, 10, 23, 12, 30, 0);

  const ticket = {
    priority: 'URGENT', // 2h target = 120m
    status: 'WAITING_ON_CUSTOMER',
    created_at: createdAt,
    paused_at: pausedAt,
    total_paused_seconds: 0,
    first_replied_at: null,
    resolved_at: null,
  };

  const sla = calculateTicketSLA(ticket, [], checkTime);

  // Active elapsed working time is only 60 minutes (09:30 to 10:30)
  assert.strictEqual(sla.workingMinutesElapsed, 60, 'Net elapsed working minutes should be 60');
  assert.strictEqual(sla.isFirstReplyBreached, false, 'First reply should not be breached while waiting on customer');
  assert.strictEqual(sla.isLate, false, 'Ticket should not be late');

  // Original deadline was 11:30 AM. With 2 hours paused, deadline shifts to 1:30 PM (13:30)
  const expectedFirstReply = new Date(2026, 10, 23, 13, 30, 0);
  assert.strictEqual(
    sla.firstReplyDueAt.getTime(),
    expectedFirstReply.getTime(),
    `First reply due at should be extended by paused duration to 13:30, got ${sla.firstReplyDueAt}`
  );

  console.log('✓ Test 3 Passed: Paused time (WAITING_ON_CUSTOMER) freezes elapsed time and extends deadline');
}

// -----------------------------------------------------------------------------
// Test 4: Priority escalation & Breach detection
// Upgrading priority recalculates deadline from created_at, properly detecting breach.
// -----------------------------------------------------------------------------
{
  // Monday Nov 23, 2026 at 09:30 AM
  const createdAt = new Date(2026, 10, 23, 9, 30, 0);
  // Checked at 12:00 PM (2.5 hours / 150 minutes elapsed)
  const checkTime = new Date(2026, 10, 23, 12, 0, 0);

  // If priority was MEDIUM (first reply target 4.5h = 270m), it would NOT be breached.
  const mediumTicket = {
    priority: 'MEDIUM',
    status: 'OPEN',
    created_at: createdAt,
    total_paused_seconds: 0,
    first_replied_at: null,
    resolved_at: null,
  };
  const mediumSla = calculateTicketSLA(mediumTicket, [], checkTime);
  assert.strictEqual(mediumSla.isFirstReplyBreached, false, 'Medium priority should not be breached at 150m');
  assert.strictEqual(mediumSla.isLate, false, 'Medium ticket is not late');

  // Escalated to URGENT (first reply target 2h = 120m, deadline was 11:30 AM)
  const urgentTicket = {
    ...mediumTicket,
    priority: 'URGENT',
  };
  const urgentSla = calculateTicketSLA(urgentTicket, [], checkTime);

  assert.strictEqual(urgentSla.workingMinutesElapsed, 150, 'Elapsed minutes should be 150');
  assert.strictEqual(urgentSla.isFirstReplyBreached, true, 'Urgent first reply should be breached after 150m');
  assert.strictEqual(urgentSla.isLate, true, 'Urgent ticket must be marked late');
  assert.strictEqual(urgentSla.isResolutionBreached, false, 'Resolution target (9h / 18:30) is not yet breached');

  console.log('✓ Test 4 Passed: Priority escalation recalculates deadlines from created_at and detects breach');
}

console.log('\nAll 4 SLA Engine tests passed successfully!');

