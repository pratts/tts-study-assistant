# CLAUDE.md — frontend

Web app for TTS Study Assistant. Read this before changing anything in `frontend/`.

## How the app is built

- **Stack:**
  - Vite, React 19, TypeScript `strict`, with project references (`tsconfig.app.json` for `src/`, `tsconfig.node.json` for config, `e2e/` and `scripts/`).
  - shadcn/ui on Tailwind v4 and Radix, radix-nova preset with Lucide icons.
  - React Router in library mode, TanStack Query, React Hook Form + Zod.
- **API types:** `src/types/api.ts` is generated from `../backend/openapi.json` by `openapi-typescript`. Never edit it and never hand-write API shapes; alias them in `src/api/types.ts`. When the spec lacks something (e.g. `required`), fix the spec in the backend.
- **API client (`src/api/client.ts`):**
  - The base URL comes from `VITE_API_BASE_URL`. The app throws at startup without it, and `vite.config.ts` fails the production build.
  - `Authorization` is sent only on authenticated requests, and `Content-Type` only with a body.
  - Every failure becomes `ApiError { status, message, code?, fields? }`, and `message` is always safe to show: generic for 5xx and network errors, a fixed text for 429.
  - 204 bodies are read to the end, never parsed.
  - Aborts propagate unchanged, so TanStack Query can cancel.
- **Session:**
  - `lib/auth.ts` keeps the access token in `sessionStorage`; expired or malformed tokens read as absent.
  - `lib/session.ts` arms a timer from the JWT `exp` and ends the session when it fires.
  - The session also ends on a 401 with `code: "TOKEN_EXPIRED"`, or when an authenticated request is attempted without a token; that request is never sent.
  - `app.ts` (`connectSession`) navigates to `/login?next=…` first, then clears the query cache.
- **Routing (`routes.tsx`):**
  - Guards are loaders (`requireSession`, `redirectIfSession`), and only same-site `next` paths are followed (`safeNextPath`).
  - Every page and the private layout are lazy-loaded; the main chunk holds only the runtime. Keep heavy providers (e.g. `TooltipProvider`) inside the lazy layout.
- **Data:**
  - One hooks file per area in `src/hooks/`.
  - The notes list is offset-paginated (prev/next plus page size), with `page`/`size`/`source` kept in the URL.
  - Create, edit and delete refetch the lists and restart at page 1.
  - Profile updates write the response into the cache.
- **Forms:** `lib/validation.ts` mirrors the backend rules exactly, measuring lengths the way Go does (bytes for `len`, code points for `RuneCountInString`). Server `fields` errors go on inputs, and everything else goes to `root.server` via `applyServerError`.
- **UI:**
  - The shadcn sidebar-07 block is the private layout; the login-02 block is the auth layout.
  - The theme comes from `components/theme-provider.tsx` plus `public/theme-init.js`, and toasts from shadcn `sonner`.
  - Every icon button has an `aria-label`, and every list has loading, empty and error-with-retry states.
- **Security:**
  - ESLint bans `dangerouslySetInnerHTML` and `innerHTML`/`outerHTML`.
  - User URLs become links only when they are `http:` or `https:` (`safeHttpUrl`).
  - `vercel.json` carries the strict CSP and the other security headers; it is the single source of truth for them, and `scripts/serve-dist.ts` reads it for `e2e:prod`.
  - Zod runs jitless, fonts are bundled, and there are no third-party scripts.

## Deliberate deviations

| Deviation | Reason |
| --------- | ------ |
| TypeScript pinned to 5.9 | typescript-eslint supports TS below 6.1, and openapi-typescript supports TS 5.x only. Revisit when both support TS 7. |
| msw 2.x, not 3.x | `@vitest/mocker` depends on msw 2; one copy avoids two interceptors. |
| No token refresh; the refresh token is discarded | Product decision: sessions are time-bound (15 minutes for web tokens). Keeping no refresh token means nothing long-lived sits in the browser, and there's nothing to revoke on logout, so logout is client-side only. |
| The session ends only on 401 + `TOKEN_EXPIRED`, not on every 401 | The login and refresh endpoints return 401 without that code for bad credentials. The backend guarantees that every 401 from an authenticated endpoint carries `TOKEN_EXPIRED`; a wrong old password is 403. |
| `sessionStorage` is per tab | The extension's links (e.g. "View all notes") open a new tab, which starts logged out. This follows from the storage rule. |
| Offset pagination with prev/next, not `useInfiniteQuery` | The API is offset-based (`page`, `page_size`) with no cursor and no total. |
| Summarize patches cached notes in place instead of restarting the list | It changes one field of one note; jumping to page 1 would lose the user's place. Create, edit and delete do restart. |
| `ApiError.fields` is never populated today | The backend's errors are `{error, message, code}` with no field map. The type and the form plumbing stay ready for it. |
| The email rule is a dot-atom regex, not `z.email()` | The backend uses Go's `net/mail` and requires the parsed address to equal the input: it accepts `a@b` (no TLD) and rejects display names and quoted forms. Zod's email check differs. The server remains the authority on edge cases. |
| Login validates only presence | The backend answers "Invalid credentials" for anything else. Validating more would tell people which part is wrong. |
| Summarize 503 shows the generic message | The rule is generic messages for all 5xx, even though the backend's 503 text ("not configured") would be safe. |
| No `E2E_RATE_LIMITS=off` backend exists | The backend has no switch to disable limits. The suite budgets 10 limited requests per 2 minutes across runs. |
| The frontend CI workflow lives in the repo-root `.github/workflows/` | GitHub only reads workflows there. Move it with the frontend if the repo is split. |
| The CI path filter is `frontend/**` only | As requested. A backend change to `openapi.json` shows up as stale types on the next frontend PR, not on the backend PR. |

## Commands

```sh
npm run dev          # :5173
npm run lint
npm run typecheck    # tsc -b --noEmit
npm test             # Vitest + MSW
npm run build        # needs VITE_API_BASE_URL
npm run api:types    # regenerate src/types/api.ts
npm run api:check    # fail if stale (CI)
npm run e2e          # real backend on :3000 required; see README
npm run e2e:prod
```

## Working agreements

- Work on a branch in small focused commits; one feature per PR unless the commits depend on each other, and then say so in the PR. Never merge the PR yourself.
- Before calling anything done, run lint, typecheck, unit tests, build, and both e2e targets. Report the results honestly, including anything skipped or failing.
- Don't restart or edit the backend, and don't clear shared caches or data stores. The e2e teardown deletes only `*@e2e.example.test` users.
- When the real backend and its docs disagree, stop and describe it; fix it in the backend (spec or code), don't work around it here.
- Keep the shadcn defaults unless asked. Components in `src/components/ui/` may be edited; note why in the commit.
- New pages get a `*.test.tsx` next to them. New MSW handlers must follow the OpenAPI spec and the backend's real behaviour.
