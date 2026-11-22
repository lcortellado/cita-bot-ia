# cita-bot-ia

WhatsApp AI agent that answers customers and books appointments, using OpenRouter, the WhatsApp Cloud API and Cal.com.

## Requirements

Node.js 22 or later.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill it in. The simulator only needs `OPENROUTER_API_KEY`.
3. Edit `business-profile.md` with the business data. The agent only answers with what this file says.

Without `CAL_API_KEY`, bookings go to an in-memory demo calendar.

## Scripts

| Command                      | What it does                                          |
| ---------------------------- | ----------------------------------------------------- |
| `npm run simulate`           | Chat with the agent in the terminal, without WhatsApp |
| `npm run eval`               | Live evaluation against the real model (costs tokens) |
| `npm run dev`                | Webhook server with reload on changes                 |
| `npm run build && npm start` | Compile to `dist/` and start the webhook server       |
| `npm test`                   | Unit tests (Vitest)                                   |
| `npm run typecheck`          | TypeScript type check                                 |
| `npm run lint`               | ESLint                                                |
| `npm run format:check`       | Prettier check (`npm run format` to fix)              |

## Structure

```text
src/
├── server.ts                      # HTTP server
├── modules/
│   ├── whatsapp/                  # webhook (verification, signature) and WhatsApp Cloud API
│   ├── agent/                     # prompt, tools, OpenRouter client, model ↔ tools loop
│   ├── conversations/             # memory per phone, per-phone queue, conversation log
│   └── bookings/                  # slot and booking rules, Cal.com and demo calendars
├── shared/                        # config (env) and date/timezone helpers
└── scripts/                       # terminal simulator and live evals
business-profile.md                # business profile injected in the prompt (Spanish)
```
