# cita-bot-ia

WhatsApp AI agent that answers customers and books appointments, using OpenRouter, the WhatsApp Cloud API and Cal.com.

## Requirements

Node.js 22 or later (`nvm use` reads `.nvmrc`) and [Yarn](https://classic.yarnpkg.com/).

## Setup

1. `yarn install`
2. Copy `.env.example` to `.env` and fill it in. The simulator only needs `OPENROUTER_API_KEY`.
3. Edit `business-profile.md` with the business data. The agent only answers with what this file says.

Without `CAL_API_KEY`, bookings go to an in-memory demo calendar.

## Scripts

| Command                    | What it does                                          |
| -------------------------- | ----------------------------------------------------- |
| `yarn simulate`            | Chat with the agent in the terminal, without WhatsApp |
| `yarn eval`                | Live evaluation against the real model (costs tokens) |
| `yarn dev`                 | Webhook server with reload on changes                 |
| `yarn build && yarn start` | Compile to `dist/` and start the webhook server       |
| `yarn test`                | Unit tests (Vitest)                                   |
| `yarn typecheck`           | TypeScript type check                                 |
| `yarn lint`                | ESLint                                                |
| `yarn format:check`        | Prettier check (`yarn format` to fix)                 |

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
