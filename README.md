# Frontdesk — Support Ticket System

Frontdesk is a full-stack customer support ticketing system built for Arvo Systems to replace their shared spreadsheet and WhatsApp workflow. It enforces working-hours SLAs, atomic ticket claiming, zero-leak internal team notes, and an immutable audit trail.

- **Live Demo:** [https://fullstack-frontdesk.vercel.app](https://fullstack-frontdesk.vercel.app)
- **API Base URL:** [https://fullstack-55ey.onrender.com](https://fullstack-55ey.onrender.com)
- **Repository:** https://github.com/Anandhumv/fullstack

### Demo Credentials (Instant Access)
For instant live review on [https://fullstack-frontdesk.vercel.app/login](https://fullstack-frontdesk.vercel.app/login):
- **Password:** `frontdesk-agent`
- **Seeded Agent Accounts:**
  - `meera@frontdesk.test` — Senior Support Engineer
  - `rahul@frontdesk.test` — Tier 2 Support Specialist
  - `priya@frontdesk.test` — Operations Lead
- *(Clickable quick-fill buttons are provided on the login card for one-click demo entry).*

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
| `GET` | `/api/agents` | List active support engineers for authentication and assignment. |
| `GET` | `/api/users` | List users (`?role=agent` or `?role=customer`). |
| `GET` | `/api/holidays` | List configured holiday dates. |
| `GET` | `/health` | Server and PostgreSQL connection health check. |

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

## Application Pages & Navigation

- **Agent Login (`/login`):** Default entry screen for support engineers with demo credential auto-fill (`frontdesk-agent`), authentication check against active agents, and immediate redirection to the dashboard. Intentionally styled in a clean, focused Light theme.
- **Agent Dashboard (`/`):** Full-featured 3-pane operations control center for support engineers:
  - **Left Queue:** High-density ticket queue with segmented filters (`All`, `Late`, `Waiting`, `Unassigned`), live breach counts, and active-ticket indicator bars.
  - **Centre Thread & Composer:** Visual separation between Customer Inquiries, Agent Public Replies, and Internal Team Notes (`#FEFCE8` / `#1E190C` warm amber surface with `🔒 PRIVATE TEAM NOTE` badge). Dual-mode reply/internal note toggle automatically re-themes the composer.
  - **Right Inspector Panel:** Real-time working-hours SLA countdowns (`tabular-nums`), atomic claim button (`409 Conflict` resilient), priority/status controls, and expandable audit drawer.
  - **Header Actions:** Instant theme switcher (Sun/Moon), ticket queue refresh button, online agent switcher, and high-visibility red **Log out** button.
- **Customer Support Portal (`/support`):** Public, zero-auth customer contact portal:
  - **Impact Mapping:** Selectable radio cards mapped directly to SLA priority:
    - *I can't work at all* (System down / complete blocker) &rarr; `URGENT` (2h reply / 9h resolution)
    - *Partly affected* (Broken feature with workaround) &rarr; `MEDIUM` (4.5h reply / 27h resolution)
    - *Just a question* (How-to, billing, or request) &rarr; `LOW` (9h reply / 45h resolution)
  - **Live Ticket Tracker:** Backed by the zero-leak customer endpoint (`GET /api/customer/tickets/:id`), allowing customers to track ticket progress and send public follow-up replies without seeing internal notes.

---

## Design System & Theme Architecture

Inspired by high-craft B2B developer tools (Linear, Stripe, and Help Scout):
- **Obsidian-Slate Dark Theme:** Canvas background `#0B0F19`, elevated cards `#111827`, hairline borders `#1E293B`, and low-glare semantic badges (`rgba(239, 68, 68, 0.14)` for Late/Urgent).
- **Crisp Neutral Light Theme:** Canvas background `#F8FAFC`, cards `#FFFFFF`, borders `#E2E8F0`, and subtle hairline elevation shadows (`0 1px 2px rgba(15, 23, 42, 0.04)`).
- **Tabular Alignment:** `font-variant-numeric: tabular-nums` applied across all ticket IDs (`#104`), timestamps, and countdown timers to prevent jitter.
- **Theme Persistence:** Seamless client-side theme synchronization using `localStorage` (`frontdesk-theme`) and pre-hydration inline script to eliminate flash-of-unstyled-theme (FOUC).

---

## Trade-offs & What Was Not Finished (And Why)

- **Containerization (Docker Compose):** Skipped in favor of direct production cloud hosting (Neon PostgreSQL + Render backend + Vercel frontend), which avoids local container overhead and allows immediate live review with zero local setup.

