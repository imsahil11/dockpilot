# DockPilot

Self-hosted, AI-powered Docker management platform with live topology, monitoring, security scanning, deployment history, and in-browser terminal access.

## Tech Stack

![React](https://img.shields.io/badge/Frontend-React_18-61dafb?style=for-the-badge&logo=react&logoColor=061a27)
![Vite](https://img.shields.io/badge/Build-Vite-646cff?style=for-the-badge&logo=vite&logoColor=ffffff)
![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178c6?style=for-the-badge&logo=typescript&logoColor=ffffff)
![Node.js](https://img.shields.io/badge/Backend-Node.js_20-339933?style=for-the-badge&logo=node.js&logoColor=ffffff)
![Express](https://img.shields.io/badge/API-Express-000000?style=for-the-badge&logo=express&logoColor=ffffff)
![Prisma](https://img.shields.io/badge/ORM-Prisma-2d3748?style=for-the-badge&logo=prisma&logoColor=ffffff)
![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL-336791?style=for-the-badge&logo=postgresql&logoColor=ffffff)
![FastAPI](https://img.shields.io/badge/AI_Service-FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=ffffff)
![Docker](https://img.shields.io/badge/Runtime-Docker-2496ed?style=for-the-badge&logo=docker&logoColor=ffffff)

## Features

- 🚀 Real-time Docker fleet dashboard with live status, CPU/memory, and activity feed
- 🕸️ Topology visualization for docker-compose and live daemon relationships
- 📈 Monitoring with rolling charts, log filtering, and per-container drill-downs
- 🤖 AI assistant with streaming chat, intent classification, and guarded command execution
- 🔐 Security scanner with scoring, critical/high/medium/low findings, and remediation hints
- 🧾 Deployment audit trail with filters and one-click rollback flow
- 🖥️ Browser terminal over WebSocket exec sessions
- 🔔 Socket.io-powered alerts and recoveries with toast notifications

## Quick Start

1. Clone the repository
2. Enter the project directory
3. Copy example environment file
4. Edit `.env` and set `CLAUDE_API_KEY`
5. Start all services

```bash
git clone https://github.com/imsahil11/DockPilot
cd DockPilot
cp .env.example .env
# Edit .env and add your CLAUDE_API_KEY
docker compose up --build
```

Open: `http://localhost:3000`

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `POSTGRES_USER` | Yes | `dockpilot` | PostgreSQL username |
| `POSTGRES_PASSWORD` | Yes | `dockpilot_secret` | PostgreSQL password |
| `POSTGRES_DB` | Yes | `dockpilot` | PostgreSQL database name |
| `DATABASE_URL` | Yes | `postgresql://dockpilot:dockpilot_secret@postgres:5432/dockpilot` | Prisma/Postgres connection URL |
| `JWT_SECRET` | Yes | `change_this_to_a_long_random_string_minimum_32_chars` | JWT signing secret |
| `JWT_EXPIRY` | Yes | `7d` | JWT expiry window |
| `CLAUDE_API_KEY` | Yes (AI) | - | Anthropic API key |
| `ALERT_CPU_THRESHOLD` | No | `80` | CPU alert threshold (percent) |
| `ALERT_MEMORY_THRESHOLD` | No | `90` | Memory alert threshold (MB in current implementation) |
| `SMTP_HOST` | No | - | SMTP host for alert emails |
| `SMTP_PORT` | No | `587` | SMTP port |
| `SMTP_USER` | No | - | SMTP username / recipient |
| `SMTP_PASS` | No | - | SMTP password |
| `SMTP_FROM` | No | - | SMTP sender address |
| `BACKEND_URL` | No | `http://backend:4000` | Internal backend service URL |
| `AI_SERVICE_URL` | No | `http://ai-service:8000` | Internal AI service URL |

## Architecture

```text
+-------------------+        +------------------------+
|  React Frontend   | <----> | Node/Express Backend   |
|  (Nginx served)   |  HTTP  | + Socket.io + Prisma   |
+---------+---------+        +-----------+------------+
          |                              |
          | /ai                          | Docker socket
          v                              v
+-------------------+            +--------------------+
| FastAPI AI Service|            | Docker Daemon      |
| Claude + Context  |            | containers/events  |
+---------+---------+            +--------------------+
          |
          | DB writes/reads via backend
          v
+-------------------+
| PostgreSQL        |
| users/logs/alerts |
+-------------------+
```

## Compose Files

- `docker-compose.yml`: local/dev self-hosted setup
- `docker-compose.prod.yml`: production-oriented variant with restart policies

## Security Considerations

- JWT is stored in `localStorage` for simplicity and persistent sessions.
- Trade-off: this is convenient but increases XSS impact if your frontend is compromised.
- Mitigations recommended in hardened deployments:
  - Strict CSP headers
  - Input sanitization and dependency audits
  - Reverse proxy WAF/rate limiting
  - Rotate JWT secrets and use shorter expiry windows
- Docker socket is mounted only into backend service, not exposed to frontend.
- Never commit `.env` or API keys.

## Verification Checklist

The repository includes implementations for:

- Register/login JWT flow
- Topology parse and live topology retrieval
- Live stats streaming and alerting pipeline
- AI chat SSE and guarded execute endpoint
- Security scan storage and issue reporting
- Deployment history and rollback endpoint
- Browser terminal WebSocket sessions

Run `docker compose up --build` and validate against your environment.
