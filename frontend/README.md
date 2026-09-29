# Frontend — TTS Study Assistant

[![Frontend CI](https://github.com/pratts/tts-study-assistant/actions/workflows/frontend-ci.yml/badge.svg)](https://github.com/pratts/tts-study-assistant/actions/workflows/frontend-ci.yml)

Web app for saving, organizing, summarizing and listening to notes. Talks to the Go API in [`../backend`](../backend).

**Stack:** Vite, React 19, TypeScript (strict, project references), shadcn/ui (Tailwind CSS v4, Radix, Lucide), React Router (library mode), TanStack Query, React Hook Form + Zod, Vitest + Testing Library + MSW, Playwright.

## Setup

Requires Node.js 24 and a running backend (see the backend README).

```sh
cd frontend
npm install
cp .env.example .env.local   # set VITE_API_BASE_URL
npm run dev                  # http://localhost:5173
```

The backend's `CORS_ORIGINS` must include every origin the app is served from: `http://localhost:5173` (dev), `http://localhost:4173` (preview and `e2e:prod`), and the production origin.

## Environment variables

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `VITE_API_BASE_URL` | yes | API base including the version prefix, e.g. `http://localhost:3000/api/v1`. The production build fails without it, and the app throws at startup. |

`VITE_*` values are baked into the bundle at build time and are **public**. Never put secrets in them.

## Scripts

| Script | What it does |
| ------ | ------------ |
| `npm run dev` | Vite dev server on `:5173` |
| `npm run build` | Typecheck (`tsc -b --noEmit`) and production build into `dist/` |
| `npm run preview` | Serve `dist/` on `:4173` (Vite's server; no production headers) |
| `npm run lint` | ESLint (includes the ban on `dangerouslySetInnerHTML`) |
| `npm run typecheck` | `tsc -b --noEmit` (plain `tsc --noEmit` checks nothing with project references) |
| `npm test` | Unit and component tests (Vitest + MSW) |
| `npm run api:types` | Regenerate `src/types/api.ts` from `../backend/openapi.json` |
| `npm run api:check` | Fail if `src/types/api.ts` is stale |
| `npm run e2e` | Playwright against the dev server and a real backend |
| `npm run e2e:prod` | Build, serve `dist/` with the production headers, run the same suite |

## API types

`src/types/api.ts` is generated from the backend's OpenAPI spec and committed. Never edit it or hand-write API types; alias them in `src/api/types.ts`. After a spec change, run `npm run api:types`. CI fails when the file is stale.

## Testing

**Unit and component tests** (`npm test`) run the real routes, guards and session wiring against an in-memory MSW backend (`src/test/handlers.ts`). That fake follows the OpenAPI spec and the backend's actual behaviour.

**End-to-end tests** run against a real backend and are not part of CI.

```sh
# 1. Start the backend (from backend/, with CORS_ORIGINS including :5173 and :4173)
# 2. Then, from frontend/:
npm run e2e          # dev server on :5173
npm run e2e:prod     # production build on :4173 with vercel.json headers
```

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `E2E_API_BASE_URL` | `http://localhost:3000/api/v1` | Backend under test |
| `E2E_DATABASE_URL` | — | Lets teardown count and delete the e2e users it created (emails `*@e2e.example.test` only). Without it, notes are still deleted through the API, but users remain because the API can't delete users. |
| `E2E_RATE_LIMITS` | on | Set to `off` only for a backend with rate limits disabled |

What the suite enforces:
- Every test fails on console errors, page errors, CORS or failed requests, and undeclared 4xx/5xx responses. In the production run it also fails on any CSP violation. Violations are reported as they happen through an exposed binding.
- Only aborted `fetch` GETs to the API count as cancellations (they come from TanStack Query or StrictMode).
- The backend allows 10 login or register requests per minute per IP (fixed window) and has no off switch. The suite budgets at most 10 of these per 2 minutes across runs, waits rather than exceeding the budget, and stops at the first 429. Running `e2e` then `e2e:prod` back to back can take a couple of extra minutes.
- Summarize runs against a backend without `OPENAI_API_KEY` and expects the generic error for its 503.

## Deployment (Vercel)

1. Create a Vercel project with **Root Directory** `frontend`. The framework preset is Vite: build `npm run build`, output `dist`.
2. Set `VITE_API_BASE_URL` (e.g. `https://tts-study-assistant-production.up.railway.app/api/v1`). This replaces the old `VITE_API_URL`.
3. Add the Vercel origin to the backend's `CORS_ORIGINS`.

`vercel.json` holds the SPA rewrite and the security headers:
- A strict CSP: `script-src 'self'` with no `'unsafe-inline'` or `'unsafe-eval'`, and `connect-src 'self'` plus the API origin.
- `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy`.
- Immutable caching for hashed assets.

**If the API origin changes, update `connect-src` in `vercel.json`.**

## Project layout

```
src/
├── api/          client.ts (fetch wrapper, ApiError) + one module per API area
├── components/   ui/ (shadcn), app-layout, app-sidebar, theme-provider, feature components
├── hooks/        TanStack Query hooks per area, speech
├── lib/          auth (token storage), session, validation, forms, query-client, utils
├── pages/        one file per route, each with a *.test.tsx
├── test/         MSW fake backend, fixtures, renderApp harness
├── types/api.ts  generated from backend/openapi.json
├── routes.tsx    routes and loader-based guards
├── app.ts        session end → router + query cache
└── main.tsx
e2e/              Playwright suite
scripts/          serve-dist.ts (production-like static server for e2e:prod)
```

See [`CLAUDE.md`](./CLAUDE.md) for architecture rules and deliberate deviations.
