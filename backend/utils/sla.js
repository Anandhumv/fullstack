/**
 * Working-Hours SLA Engine for Frontdesk
 * 
 * Working hours: Monday to Friday, 9:30 AM to 6:30 PM (9 working hours/day).
 * Weekends and holidays do not count.
 */

const SLA_TARGETS = {
  URGENT: {
    firstReplyMinutes: 2 * 60,      // 2h = 120 minutes
    resolutionMinutes: 9 * 60,      // 9h = 540 minutes (1 working day)
  },
  MEDIUM: {
    firstReplyMinutes: 4.5 * 60,    // 4.5h = 270 minutes (half day)
    resolutionMinutes: 27 * 60,     // 27h = 1620 minutes (3 working days)
  },
  LOW: {
    firstReplyMinutes: 9 * 60,      // 9h = 540 minutes (1 working day)
    resolutionMinutes: 45 * 60,     // 45h = 2700 minutes (5 working days)
  },
};

/**
 * Format date to 'YYYY-MM-DD' string in local time
 */
function toDateStr(date) {
  if (!date) return '';
  if (typeof date === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    const d = new Date(date);
    return formatDate(d);
  }
  if (date instanceof Date) {
    return formatDate(date);
  }
  if (typeof date === 'object' && date.holiday_date) {
    return toDateStr(date.holiday_date);
  }
  return String(date);
}

function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Check if a date is a working day (Mon-Fri and not a holiday)
 */
function isWorkingDay(d, holidaySet) {
  const day = d.getDay(); // 0 = Sun, 6 = Sat
  if (day === 0 || day === 6) return false;
  const str = toDateStr(d);
  if (holidaySet && holidaySet.has(str)) return false;
  return true;
}

/**
 * Return the working window (09:30 to 18:30) for a given date
 */
function getWorkWindowForDate(d) {
  const start = new Date(d);
  start.setHours(9, 30, 0, 0);
  const end = new Date(d);
  end.setHours(18, 30, 0, 0);
  return { start, end };
}

/**
 * Move timestamp forward to the nearest active working window
 */
function adjustToWorkingTime(d, holidaySet) {
  let curr = new Date(d);
  while (true) {
    if (!isWorkingDay(curr, holidaySet)) {
      curr.setDate(curr.getDate() + 1);
      curr.setHours(9, 30, 0, 0);
      continue;
    }

    const { start, end } = getWorkWindowForDate(curr);

    // If before 09:30 on a working day
    if (curr.getTime() < start.getTime()) {
      curr = new Date(start);
      return curr;
    }

    // If at or after 18:30 on a working day
    if (curr.getTime() >= end.getTime()) {
      curr.setDate(curr.getDate() + 1);
      curr.setHours(9, 30, 0, 0);
      continue;
    }

    // Within active working hours
    return curr;
  }
}

/**
 * Add specified working minutes to a start date
 */
function addWorkingMinutes(startDate, minutesToAdd, holidaySet) {
  if (minutesToAdd <= 0) {
    return new Date(startDate);
  }

  let curr = adjustToWorkingTime(startDate, holidaySet);
  let remainingMs = Math.round(minutesToAdd * 60 * 1000);

  while (remainingMs > 0) {
    const { end } = getWorkWindowForDate(curr);
    const msAvailableToday = end.getTime() - curr.getTime();

    if (remainingMs <= msAvailableToday) {
      curr = new Date(curr.getTime() + remainingMs);
      remainingMs = 0;
    } else {
      remainingMs -= msAvailableToday;
      curr.setDate(curr.getDate() + 1);
      curr.setHours(9, 30, 0, 0);
      curr = adjustToWorkingTime(curr, holidaySet);
    }
  }

  return curr;
}

/**
 * Calculate working minutes between two dates
 */
function calculateWorkingMinutes(startDate, endDate, holidaySet) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (end.getTime() <= start.getTime()) {
    return 0;
  }

  let totalMs = 0;
  let curr = new Date(start);
  curr.setHours(0, 0, 0, 0);

  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);

  while (curr.getTime() <= endDay.getTime()) {
    if (isWorkingDay(curr, holidaySet)) {
      const { start: workStart, end: workEnd } = getWorkWindowForDate(curr);

      const effectiveStart = Math.max(start.getTime(), workStart.getTime());
      const effectiveEnd = Math.min(end.getTime(), workEnd.getTime());

      if (effectiveEnd > effectiveStart) {
        totalMs += (effectiveEnd - effectiveStart);
      }
    }

    curr.setDate(curr.getDate() + 1);
  }

  return totalMs / (1000 * 60);
}

/**
 * Calculate working hours SLA for a ticket.
 *
 * @param {Object} ticket - Ticket data
 * @param {Array} holidays - Array of holiday date strings or objects
 * @param {Date|string} [now=new Date()] - Reference current date
 * @returns {Object} SLA status
 */
function calculateTicketSLA(ticket, holidays = [], now = new Date()) {
  const currentDate = new Date(now);
  const holidaySet = new Set(Array.isArray(holidays) ? holidays.map(toDateStr) : []);

  const priority = (ticket.priority || 'MEDIUM').toUpperCase();
  const targets = SLA_TARGETS[priority] || SLA_TARGETS.MEDIUM;

  const totalPausedSeconds = Number(ticket.total_paused_seconds) || 0;
  let currentPausedWorkingMinutes = 0;

  if (ticket.status === 'WAITING_ON_CUSTOMER') {
    const pauseStart = ticket.paused_at ? new Date(ticket.paused_at) : new Date(ticket.created_at);
    currentPausedWorkingMinutes = calculateWorkingMinutes(pauseStart, currentDate, holidaySet);
  }

  const totalPausedWorkingMinutes = (totalPausedSeconds / 60) + currentPausedWorkingMinutes;

  const referenceEndTime = ticket.resolved_at ? new Date(ticket.resolved_at) : currentDate;
  const grossWorkingMinutes = calculateWorkingMinutes(ticket.created_at, referenceEndTime, holidaySet);
  const workingMinutesElapsed = Math.round(Math.max(0, grossWorkingMinutes - totalPausedWorkingMinutes) * 100) / 100;

  const firstReplyDueAt = addWorkingMinutes(
    ticket.created_at,
    targets.firstReplyMinutes + totalPausedWorkingMinutes,
    holidaySet
  );

  const resolutionDueAt = addWorkingMinutes(
    ticket.created_at,
    targets.resolutionMinutes + totalPausedWorkingMinutes,
    holidaySet
  );

  let isFirstReplyBreached = false;
  if (ticket.first_replied_at) {
    isFirstReplyBreached = new Date(ticket.first_replied_at).getTime() > firstReplyDueAt.getTime();
  } else {
    isFirstReplyBreached = currentDate.getTime() > firstReplyDueAt.getTime();
  }

  let isResolutionBreached = false;
  if (ticket.resolved_at) {
    isResolutionBreached = new Date(ticket.resolved_at).getTime() > resolutionDueAt.getTime();
  } else {
    isResolutionBreached = currentDate.getTime() > resolutionDueAt.getTime();
  }

  const isLate = Boolean(isFirstReplyBreached || isResolutionBreached);

  return {
    firstReplyDueAt,
    resolutionDueAt,
    isFirstReplyBreached,
    isResolutionBreached,
    isLate,
    workingMinutesElapsed,
  };
}

module.exports = {
  calculateTicketSLA,
  calculateWorkingMinutes,
  addWorkingMinutes,
  isWorkingDay,
  SLA_TARGETS,
};

