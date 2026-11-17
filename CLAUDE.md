# CLAUDE.md

## What this is

A small booking service, built as a timeboxed (2 hour) coding test. A consumer searches for a bookable service near them and books a time. It is an HTTP JSON API (Fastify) plus a Vue 3 client in one repo. The source data is `data.json` in the repo root. Treat it as real production data: it is read-only, and it is messy on purpose.

The reviewers judge **judgment**: how the problem is framed, which decisions are made, how AI output is verified, and what is deliberately not built. Small, correct and well tested beats large and half done. If a task starts growing, stop and tell me instead of expanding scope.

`docs/PLAN.md` holds the task list, the decisions (D1, D2, …), the known data quirks (Q1, Q2, …) and the API contract. It is the source of truth for behaviour. If this file and the plan disagree, ask.

## Hard rules

1. **It runs straight after cloning**, with `npm install` then `npm run dev`. No Docker, no database server, no external services at runtime, no dependencies that need a native build (for example `better-sqlite3`), and no postinstall downloads.
2. **Never write to `data.json`.** New bookings live in memory and are also saved to `.data/bookings.local.json`, which is gitignored.
3. **The server never trusts a slot sent by the client.** A booking is valid only if its slot is in the availability the engine computes at that moment, using the same function search uses.
4. **All time logic uses Luxon in the `Europe/Stockholm` zone.** Never use `new Date('YYYY-MM-DD')`, `Date#getDay()`, `getHours()` or anything else that depends on the machine's time zone, and never compare ISO strings: compare epoch milliseconds. Results must not depend on the machine's TZ (the tests run with `TZ=America/New_York` to prove it).
5. **Intervals are half-open, `[start, end)`.** Back-to-back bookings are allowed. Overlap means `a.start < b.end && b.start < a.end`.
6. **"Now" is injected.** Domain code takes a `now` argument (a Luxon `DateTime`) and never calls `Date.now()` or `DateTime.now()` itself. Only `src/server/config.ts` reads the real clock, or the `NOW` env override.
7. **Validate every input at the boundary** with Zod schemas from `src/shared/schemas.ts`. The client forms use the same schemas.
8. **Never log customer names, coordinates** or other personal data.
9. **Don't add dependencies** beyond the list below without asking.
10. **If you find a data quirk that isn't listed in `docs/PLAN.md`, stop and tell me.** Don't silently work around it.
11. **Colours come from design tokens only (see Design rules).** Never add a hex, rgb, hsl or oklch value, a Tailwind palette colour or an opacity-modifier colour to a component.

## Stack

- Node >= 20.19, npm. This is a single package: no workspaces, no monorepo tooling.
- TypeScript, strict mode, no `any`.
- Server: Fastify 5, run with `tsx` (no build step). Zod 4 for validation and Luxon for dates.
- Client: Vue 3 (`<script setup lang="ts">`, Composition API), Vite, vue-router, Tailwind CSS v4 (via `@tailwindcss/vite`), shadcn-vue components (added by the CLI into `src/client/components/ui`, built on Reka UI), TanStack Vue Query, and VeeValidate 5.0.0-beta.1 with the shared Zod 4 schemas.
- Tests: Vitest.
- Dev tooling: `concurrently` and `vue-tsc`.

Allowed dependencies: everything already installed, plus the packages that `npx shadcn-vue add` requires for the components listed in docs/REDESIGN.md: `reka-ui`, `@vueuse/core`, `@lucide/vue`, `cn`, `class-variance-authority`, `@internationalized/date`, `tw-animate-css`, `@fontsource-variable/figtree` and `@fontsource-variable/geist-mono`. List every new dependency in your report. There is still no other component library, no map library, no Pinia, no Axios and no ESLint.

## Commands

```
npm install
npm run dev          # API on :3001 and Vite on :5173 (proxies /api)
npm test             # vitest run (TZ forced to America/New_York)
npm run typecheck    # vue-tsc --noEmit
npm run build        # vite build of the client (a check only)
NOW=2026-10-22T08:00:00+02:00 npm run dev   # pin the clock so the existing Oct 2026 bookings are visible
```

## Layout

```
data.json                      source data (read-only)
.data/bookings.local.json      bookings created at runtime (gitignored)
src/shared/schemas.ts          Zod schemas and inferred types for the API contract (server and client)
src/server/
  index.ts                     starts the server
  app.ts                       buildApp({ now, dataPath, persistPath }) for tests via inject()
  config.ts                    port, NOW override, paths
  data/schema.ts               Zod schema for the raw data.json (lenient where the data is)
  data/load.ts                 parse, index, collect quirk warnings
  data/store.ts                BookingStore (in memory, plus synchronous file persistence)
  domain/time.ts               Luxon helpers, weekday keys, zone constant
  domain/availability.ts       computeSlots(): pure, the heart of the service
  domain/search.ts             matching, synonyms, ranking
  domain/geo.ts                haversine
  domain/booking.ts            createBooking(): validation, staff assignment, conflicts
  routes/                      meta.ts, search.ts, bookings.ts
src/client/
  index.html  main.ts  App.vue  router.ts  style.css
  pages/                       SearchPage.vue, BookingConfirmationPage.vue
  components/                  SearchForm, ResultCard, SlotPicker, BookingDialog, states
  components/ui/               generated by shadcn-vue; imports `cn` from the npm package `cn` (published by shadcn), so there is no local utils file
  lib/                         api.ts (typed fetch), format.ts (Intl helpers), locations.ts (presets)
  lib/ics.ts                   calendar file
docs/PLAN.md                   tasks, decisions, quirks, contract
docs/REDESIGN.md               redesign plan
docs/design/anviil/            design reference
DECISIONS.md  AI.md  readme.md
```

Tests sit next to the code as `*.test.ts`.

## Domain rules (summary; details in docs/PLAN.md)

- The time zone is `Europe/Stockholm` for every venue. The API returns ISO 8601 strings with an offset.
- Bookable time = venue opening hours ∩ staff working hours − staff breaks − blocking bookings. A missing day and a `null` day both mean closed.
- Every booking blocks unless its status is `"cancelled"`. Unknown statuses block.
- Slot starts sit on a 15-minute grid aligned to the quarter hour. The whole service duration must fit. Slots that start at or before `now` are excluded.
- Each slot lists the `staffIds` that can take it. A booking with `staffId: null` is assigned to the qualified staff member with the fewest bookings that day (lowest id on a tie).
- Search matches service names only, ignoring case and diacritics, with every query token required, plus a small synonym table. Venues without a position are excluded and logged. Results are sorted by distance.
- The booking check, insert and persist run synchronously, with no `await` in between.

## API (summary; full contract in docs/PLAN.md)

- `GET /api/meta`: current time, time zone, maximum range in days, service names (for autocomplete)
- `GET /api/search?q=&lat=&lng=&from=&to=&radiusKm=`
- `POST /api/bookings`: body `{ serviceId, staffId | null, start, customerName }`, with an optional `Idempotency-Key` header
- `GET /api/bookings/:id`
- Every error has the shape `{ "error": { "code": "...", "message": "...", "details"?: ..., "alternatives"?: [...] } }`

## Frontend conventions

- `<script setup lang="ts">` everywhere. Components stay small and props are typed.
- `useMutation` is defined inline in the component that calls it, never in a separate hook file. `useQuery` lives in the page that owns the data.
- Search state lives in the URL query (vue-router). The URL is parsed with the shared Zod schema before use, so there is no global store.
- Forms use VeeValidate `useForm` with the shared Zod schemas. Errors show under the field, and fields have `aria-invalid` and `aria-describedby`.
- Build mobile-first, keep everything keyboard accessible, and give every control a visible label.
- UI primitives come from shadcn-vue. Add components with `npx shadcn-vue@latest add`, and don't hand-edit files in `src/client/components/ui` except to fix a bug. Forms use shadcn-vue's `Field`, `FieldLabel` and `FieldError` with vee-validate's `Field as VeeField` and `useForm({ validationSchema })` taking the raw shared Zod schema; don't use the older `FormField`/`FormItem` wrappers or `toTypedSchema`.
- Calendar and RangeCalendar v-models must be `shallowRef`, not `ref` (`@internationalized/date` has private class fields).
- The calendar's "today" comes from `meta.now`, never from the browser.
- The UI is in English. Times are always shown in `Europe/Stockholm` (the venue's time), whatever the browser's zone, using `Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Stockholm', hourCycle: 'h23', … })`. Prices use `Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 })`.
- The client does not use Luxon. It uses `Intl` only.

## Design rules

1. **Tokens only.** Every colour comes from the CSS variable system (`bg-background`, `text-foreground`, `bg-card`, `bg-primary`, `text-muted-foreground`, `border-border`, `bg-accent`, `bg-sidebar` and so on). No hex, rgb, hsl or oklch values in components, and no Tailwind palette colours (`bg-slate-100`, `text-blue-700`).
2. **No Tailwind opacity modifiers on colours** (`bg-primary/10`). When a translucent shade is needed, add a named token to `style.css` (for example `--primary-soft`) and map it in `@theme inline`.
3. **Restraint.** No gradients, glows or decorative shadows. Cards are a hairline border on the background, buttons are flat. Hierarchy comes from size, weight and spacing.
4. **Light theme only.** Port the `.dark` tokens so the file stays identical to Anviil's, but there's no toggle and no dark-mode testing.
5. **No Anviil name or logo anywhere in the UI.** The header says "Book a time".
6. **The dark brand surface** (`--brand` with `--brand-foreground`) may be used for the header only, if the screenshots show it as part of the look. The `--sidebar` tokens in Anviil's file are light, so they are not that surface. `--accent-ember` is an accent for icons, indicators and small marks, not a text or button fill: white text on it is under 4.5:1. Content stays on `background` and `card`.
7. **Type, radius and spacing** come from the tokens and from `NOTES.md`. If the font is a Google font, use its `@fontsource-variable` package; otherwise a system font stack.
8. Icons come from `@lucide/vue`, are sized with classes, and take their colour from the text colour around them.

## Testing

- Vitest, in the node environment. The tests use the real `data.json` and pin `now` (usually `2026-10-22T08:00:00+02:00`).
- The test processes run with `TZ=America/New_York`, set in `vitest.config.ts`, and a sanity test asserts that it took effect.
- Test the domain functions directly and the HTTP routes through `app.inject()`. There are no UI component tests and no end-to-end tests (this is a deliberate cut).
- Expected values in tests come from `docs/PLAN.md` or from hand calculation, never from running the code and copying its output.

## Working agreement

- Do one task from `docs/PLAN.md` per session, and stop when it is done.
- Before saying a task is done, run `npm run typecheck` and `npm test`, and both must pass.
- When reporting, say which files changed, every assumption or decision you made that isn't in the plan, and anything you were unsure of.
- Don't commit. I review and commit myself.
- Don't edit `DECISIONS.md` or `AI.md` unless the task says to.

## Not building (deliberate cuts)

Authentication, payments, cancelling or rescheduling, email or SMS, geocoding and maps, translations, admin views, a "my bookings" history, rate limiting, Docker, a real database, end-to-end and UI component tests, and ESLint or Prettier setup.
