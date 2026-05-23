# StadiumPulse — Agentic Command Center

> **Google Cloud Build with AI — Agentic Premier League Hackathon**

StadiumPulse is a real-time, multi-agent AI command center for cricket stadium crowd safety. It ingests live simulated data across 10 stadium zones and 4 gates, runs a swarm of specialized agents with budget-aware AI assistance, and lets operators approve or auto-execute actions on a single live dashboard.

---

## Problem Statement

Massive crowds at cricket matches create dangerous bottlenecks, severe security vulnerabilities, and logistical chaos during pre- and post-match movements. Current stadium operations rely on fragmented, manual systems leaving security teams unable to adapt instantly to rapid crowd surges, unpredictable weather shifts, or emerging threats.

**StadiumPulse** solves this with an integrated, real-time agentic platform that unifies crowd monitoring, dynamic routing, and automated emergency response.

---

## Multi-Agent Architecture

```
Simulator (2s tick)
       │
       ▼
 eventBus / state store (in-memory)
       │
  ┌────┴─────────────────────────────┐
  │         runAgents()              │
  │  ┌─────────────────────────┐     │
  │  │  1. Sentinel            │ ← crowd density monitoring
  │  │  2. Meteorologist       │ ← weather risk assessment
  │  │  3. Incident Commander  │ ← emergency response logic
  │  │  4. Comms Officer       │ ← AI-assisted PA announcements
  │  │  5. Supervisor          │ ← oversight & approval queue
  │  └─────────────────────────┘     │
  └──────────────┬───────────────────┘
                 │
    ┌────────────▼────────────┐
    │  Human-in-the-Loop Gate │  (toggle-able)
    │  High-risk → queue      │
    │  Low-risk  → auto-exec  │
    └────────────┬────────────┘
                 │
          Socket.IO emit
                 │
          Live Dashboard
```

### Agent Responsibilities

| Agent | Trigger | Risk Level |
|---|---|---|
| **Sentinel** | Zone density ≥ 85% | Low — auto-reroutes gates |
| **Meteorologist** | Rain > 75% or Temp > 38°C | Low — auto-broadcasts advisory |
| **Incident Commander** | Fire / crowd surge incident | High — queued for approval |
| **Comms Officer** | Any incident | Low — AI/rule-based PA announcement |
| **Supervisor** | Always | Monitors pending approvals |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Language | TypeScript (strict mode) |
| Web framework | Express 5 |
| Real-time | Socket.IO |
| AI | Groq (`groq-sdk`) + deterministic fallback responses |
| Auth | JWT (`jsonwebtoken`) + bcrypt |
| Validation | Zod |
| HTTP security | Helmet (CSP, HSTS, XSS, frameguard) |
| Rate limiting | `express-rate-limit` |
| Logging | Pino (Cloud Logging compatible) |
| Hosting | Google Cloud Run |
| Data | In-memory (no database required) |

---

## Security Controls

| Control | Implementation | Mitigates |
|---|---|---|
| HTTP security headers | Helmet with full CSP | XSS, clickjacking, MIME sniff |
| CORS allowlist | `ALLOWED_ORIGINS` env var | Cross-origin abuse |
| Rate limiting (global) | 120 req / 15 min per IP | DDoS, brute-force |
| Rate limiting (auth) | 10 req / 1 min per IP | Credential stuffing |
| Authentication | JWT Bearer token, 8h expiry | Unauthorised mutation |
| Password hashing | bcrypt (saltRounds=10) | Credential leak |
| Input validation | Zod schemas on every POST | Injection, invalid payloads |
| Request size limit | `express.json({ limit: "16kb" })` | Body bomb / DoS |
| Human-in-the-loop | High-risk actions queued | Catastrophic autonomous decisions |
| Secret management | env vars / Cloud Secret Manager | Key exposure |
| HTTPS | Cloud Run provides free TLS | Transit interception |
| Startup guard | Server exits if `JWT_SECRET` unset | Misconfiguration |

---

## Local Development

### Prerequisites

- Node.js 18+
- A Groq API key (free tier available): [console.groq.com](https://console.groq.com)

### Setup

```bash
git clone <repo>
cd AgenticPLFinale
npm install
cp .env.example .env
```

Edit `.env`:

```env
PORT=8080
JWT_SECRET=<run: openssl rand -hex 48>
DEMO_USERNAME=security
DEMO_PASSWORD=admin123
GROQ_API_KEY=<your-key>
GROQ_MODEL=llama-3.1-8b-instant
AI_MAX_CALLS_PER_HOUR=40
AI_MIN_INTERVAL_MS=15000
AI_ENABLE_INCIDENT_ANNOUNCEMENTS=false
LOG_LEVEL=info
```

### Run

```bash
# Development (hot reload)
npm run dev

# Production build
npm run build
npm start
```

Open `http://localhost:8080`

**Demo login** (used automatically by dashboard):
- Username: `security`
- Password: `admin123`

---

## Google Cloud Run Deployment

```bash
# Authenticate
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable run.googleapis.com secretmanager.googleapis.com

# Deploy (builds image from source)
gcloud run deploy stadiumpulse \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --set-env-vars JWT_SECRET=YOUR_SECRET,DEMO_USERNAME=security,DEMO_PASSWORD=admin123,GROQ_API_KEY=YOUR_GROQ_KEY,GROQ_MODEL=llama-3.1-8b-instant,AI_MAX_CALLS_PER_HOUR=40,AI_MIN_INTERVAL_MS=15000,AI_ENABLE_INCIDENT_ANNOUNCEMENTS=false,LOG_LEVEL=info
```

Cloud Run provides:
- Auto HTTPS (free TLS)
- Autoscale 0 → N instances (handles IPL-scale traffic)
- Structured log ingestion via Cloud Logging

---

## API Reference

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | None | System health + feature flags |
| `GET` | `/api/state` | None | Full state snapshot |
| `POST` | `/api/auth/login` | None | Returns JWT token |
| `POST` | `/api/incident` | JWT | Trigger an incident + run agents |
| `POST` | `/api/incidents/:id/review` | JWT | Control-room accept/reject authorization |
| `POST` | `/api/toggle-review` | JWT | Toggle human-in-the-loop mode |
| `POST` | `/api/pending-actions/:id/approve` | JWT | Approve a high-risk queued action |
| `POST` | `/api/pending-actions/approve-all` | JWT | Approve all queued high-risk actions |
| `POST` | `/api/agents/:name/query` | JWT | Direct chat/query with a specific agent |

---

## Interactive Agent Modals

Operators can now click on any **Multi-Agent Status** badge to open a dedicated command interface for that agent.

- **Detailed Bio**: Understand the agent's specific role and capabilities.
- **Live Status Cards**: See role-specific telemetry for the selected agent.
- **Suggested Questions**: One-click prompts for faster operator interaction.
- **Direct Query Interface**: Ask the agent specific questions about the stadium state (e.g., "Sentinel, what's the risk in the North Stand?").
- **Agent Reasoning Filter**: Automatically filters the live trace to show only that agent's thoughts and actions.
- **AI-Powered Responses**: Uses Groq with strict budget controls; falls back to deterministic responses when conserving usage.

---

## Demo Script (90 seconds)

1. **(10s)** Open dashboard. Point to KPI bar, match phase, agent badges.
2. **(15s)** "10 zones, 4 gates, 5 AI agents — all live."
3. **(30s)** Use **Zone Interaction Console** to trigger a Fire scenario on a specific gate/concourse → Incident Commander action appears → camera focus shifts to the impacted gate.
4. **(15s)** After 1 minute, control-room authorization popup appears → click **Accept / Handled** and show incident lifecycle closure.
5. **(10s)** Click **Run Full Demo** for one-click weather + surge + medical sequence.
6. **(10s)** "Hosted on Cloud Run, secured with Helmet + JWT + human-in-the-loop oversight + budget-aware AI fallback."

---

## Q&A Cheat Sheet (for judges)

**"How does this scale to a real IPL match?"**
Cloud Run autoscales to thousands of instances. Replace in-memory state with Redis (Memorystore) for shared state across instances. Use Cloud Pub/Sub as the event bus between agents.

**"What if the AI provider is down or quota-limited?"**
Every agent has a deterministic fallback (alerts, traces, and actions still execute with rule-based responses). The system degrades gracefully — crowd safety decisions are never blocked on AI availability.

**"Why multi-agent vs one big prompt?"**
Each agent has a narrow responsibility and minimal tool surface, which reduces hallucination risk. Agents run in parallel, improving latency. The architecture mirrors how real incident management works — different specialists, one coordinator.

**"How do you prevent the AI from making catastrophic decisions?"**
The `humanReviewEnabled` flag forces all `high`-risk actions (evacuations, gate closures) into a human approval queue. Low-risk actions (PA announcements, gate reroutes) execute automatically. The risk level is hard-coded per action type, not decided by the AI.

**"What about data privacy?"**
No PII is processed. The system works exclusively on aggregated crowd counts, gate throughput, and weather data. No ticket IDs, names, or biometrics.

**"How do you test agent behavior?"**
Agent decision logic is deterministic on in-memory state and can be tested with stubbed AI responses. The `runAgents` orchestration remains predictable for the same input state and incident stream.
