# Frontdesk — Support Ticket System

Frontdesk is a full-stack customer support ticketing system built for Arvo Systems to replace their shared spreadsheet and WhatsApp workflow. It enforces working-hours SLAs, atomic ticket claiming, zero-leak internal team notes, and an immutable audit trail.

- **Live Demo:** `<YOUR_LIVE_VERCEL_URL>`
- **API Base URL:** `<YOUR_LIVE_RENDER_URL>`
- **Repository:** https://github.com/Anandhumv/fullstack

---

## Tech Stack

- **Frontend:** Next.js (App Router), React, Tailwind CSS, TypeScript
- **Backend:** Node.js, Express.js
- **Database:** PostgreSQL (raw SQL via `pg` — no ORM, for explicit control over atomic locking and database triggers)

---

## Core Business Rules & Engineering Decisions

### 1. Working-Hours SLA Engine (`backend/utils/sla.js`)
- **Working Window:** Monday–Friday, 9:30 AM to 6:30 PM (9 working hours/day, 540 working minutes/day).
- **Exclusions:** Weekends (Saturday and Sunday) and festival dates stored in the `holidays` table do not count toward SLA clocks.
- **SLA Targets (Working Hours):**
  - **Urgent:** 2h first reply | 9h (1 working day) resolution
  - **Medium:** 4.5h (half day) first reply | 27h (3 working days) resolution
  - **Low:** 9h (1 working day) first reply | 45h (5 working days) resolution
- **SLA Pause (`WAITING_ON_CUSTOMER`):** When an agent replies and the ticket moves to `WAITING_ON_CUSTOMER`, the SLA clock pauses until the customer responds. Accumulated paused working duration is added to target deadlines so agents are never penalized for customer delay.
- **Auto-Close & Reopen Window:**
  - Tickets waiting on a customer for 5 working days (45 working hours) are automatically closed and logged in `audit_logs`.
  - Resolved tickets can be reopened within 7 days. Any reopen attempt after 7 days automatically creates a new linked follow-up ticket.

### 2. Mid-Ticket Priority Escalation (Design Assumption)
When a ticket's priority is upgraded (e.g., `MEDIUM` → `URGENT`) mid-way, the SLA engine **recalculates the deadline from the original `created_at` timestamp (minus any paused customer-wait time) using the new priority's targets**.
- *Why:* Starting a brand-new timer on escalation hides how long the customer has already been waiting. Recalculating from creation time ensures urgent issues surface immediately as overdue (`isLate: true`) if they have already exceeded the urgent SLA window.

### 3. Incident Prevention (Database-Level Guarantees)

#### No Double-Claiming (`INC-0291`)
- Claiming a ticket (`POST /api/tickets/:id/claim`) executes a single atomic PostgreSQL query:
  ```sql
  UPDATE tickets SET assigned_agent_id = $1 WHERE id = $2 AND assigned_agent_id IS NULL RETURNING *;
  ```
- If 0 rows are returned because another agent claimed it concurrently, the endpoint responds with `409 Conflict` (`"Ticket already claimed by another agent"`), preventing duplicate agent assignments.

#### Zero-Leak Private Notes (`INC-0292`)
- Internal notes are stored in a dedicated `internal_notes` table, physically separate from `public_messages`.
- The customer endpoint (`GET /api/customer/tickets/:id`) **only** queries `tickets` and `public_messages`. It never queries, joins, or serializes `internal_notes`.
- In the agent dashboard, private notes are rendered with a distinct high-contrast amber background and a prominent `🔒 PRIVATE TEAM NOTE — NOT VISIBLE TO CUSTOMER` badge.

#### Immutable Audit Trail (`INC-0293`)
- Every lifecycle action (created, claimed, public reply, internal note, status change, priority change, reopened, auto-closed) inserts an entry into `audit_logs`.
- Database-level immutability is guaranteed by a PostgreSQL `BEFORE UPDATE OR DELETE` trigger on `audit_logs`:
  ```sql
  CREATE OR REPLACE FUNCTION prevent_audit_logs_modification()
  RETURNS TRIGGER AS $$
  BEGIN
      RAISE EXCEPTION 'audit_logs records are strictly immutable and cannot be updated or deleted.';
  END;
  $$ LANGUAGE plpgsql;

  CREATE TRIGGER trg_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_logs_modification();
  ```
- No `PUT`, `PATCH`, or `DELETE` endpoints exist for audit logs in the REST API.

---

## REST API Specification

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/tickets` | List all tickets with calculated SLA metrics. Runs 5-day auto-close helper. |
| `POST` | `/api/tickets` | Create a new support ticket. |
| `GET` | `/api/tickets/:id` | Full ticket details for staff (messages, internal notes, audit trail, SLA). |
| `POST` | `/api/tickets/:id/claim` | Atomic claim with single SQL query (returns `409 Conflict` if claimed). |
| `POST` | `/api/tickets/:id/notes` | Post private agent internal note. |
| `POST` | `/api/tickets/:id/reply` | Post public reply (pauses SLA if agent, unpauses if customer). |
| `POST` | `/api/tickets/:id/resolve` | Resolve ticket and record server timestamp. |
| `POST` | `/api/tickets/:id/reopen` | Reopen ticket (creates new linked ticket if > 7 days since resolution). |
| `PATCH` | `/api/tickets/:id` | Update priority or status (logs audit entry). |
| `GET` | `/api/customer/tickets/:id`| Customer ticket view (**Zero-Leak:** tickets & public messages ONLY). |
| `GET` | `/api/users` | List users (`?role=agent` or `?role=customer`). |
| `GET` | `/api/holidays` | List configured holiday dates. |

---

## Local Setup & Quick Start

### 1. Prerequisites
- Node.js (v18+)
- PostgreSQL (e.g. Neon PostgreSQL, local Postgres, or Supabase)

### 2. Backend Setup
```bash
cd backend
npm install
cp .env.example .env
```
Configure your `DATABASE_URL` in `backend/.env`:
```env
PORT=5000
DATABASE_URL=postgresql://[user]:[password]@[endpoint].neon.tech/neondb?sslmode=require
```

Run schema migrations and seed realistic test data:
```bash
npm run seed
```

Run the backend server:
```bash
npm start
# or development with auto-reload:
npm run dev
```

Run the SLA test suite:
```bash
npm test
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Verification & Test Scenarios

The suite includes 4 verified automated test cases in `backend/utils/sla.test.js` (`npm test`):
1. **Weekend Exclusion**: Ticket created Friday at 6:00 PM checked Sunday morning has only 30 working minutes elapsed and is **NOT late**.
2. **Holiday Exclusion**: Ticket created Friday 6:00 PM checked Monday afternoon during a festival holiday has only 30 working minutes elapsed; deadline rolls over to Tuesday 11:00 AM.
3. **Paused Time**: A ticket moved to `WAITING_ON_CUSTOMER` freezes active elapsed working time and shifts its SLA deadline outward by the wait duration.
4. **Priority Escalation**: Upgrading an unresolved ticket from `MEDIUM` to `URGENT` recalculates the deadline from `created_at` and immediately surfaces breach status.

---

## Trade-offs & What Was Not Finished (And Why)

- **Dedicated Customer UI Portal:** We intentionally focused 100% of the UI effort on building a robust, single-screen Agent Dashboard. Customer interactions are supported via the zero-leak `/api/customer/tickets/:id` endpoint, proving private notes cannot leak at the API level while keeping within the project scope.
- **Containerization (Docker Compose):** Skipped in favor of direct cloud hosting (Neon PostgreSQL + Render backend + Vercel frontend), which avoids local container overhead and directly supports serverless database branching.

