# Build plan: booking service

**How to use this file.** Work through the tasks in order. Each task has a prompt to paste into Claude Code, a "Done when" list, a "Check before committing" list (the places AI output is most likely to be wrong; anything you catch there goes in the AI log at the bottom) and a commit message. Commit after every task. Run `/clear` between tasks. `CLAUDE.md` holds the stack, rules and conventions that every prompt assumes.

**Timebox: 2 hours.** Start a timer after the first commit.

| Phase | Tasks | Budget | Running total |
| --- | --- | --- | --- |
| 0. Setup | 0.1 | 10 min | 0:10 |
| 1. Domain | 1.1, 1.2, 1.3 | 40 min | 0:50 |
| 2. API | 2.1, 2.2 | 20 min | 1:10 |
| 3. UI | 3.1, 3.2, 3.3, 3.4 | 35 min | 1:45 |
| 4. Ship | 4.1, 4.2 | 15 min | 2:00 |

**If you're behind:** at 1:15, skip 3.4 entirely. At 1:30, also drop the staff filter and the sort control from 3.2. Phases 1 and 2 are never cut, and neither are their tests. Write down whatever you cut in `DECISIONS.md`.

**Models:** use Opus for 1.2 and 2.2 (time zones, overlap and concurrency, where a subtle bug is costly), and Sonnet for the rest. If Sonnet gets a task wrong twice, switch to Opus rather than retrying.

---

## Getting started

1. Work in the repo you were given (it already has `data.json` at the root), or run `git init` in a new folder and copy `data.json` in.
2. Put `CLAUDE.md` in the repo root and this file at `docs/PLAN.md`.
3. Commit: `docs: add build plan and AI working agreement`. Keep both files in the repo; they are part of the AI story you tell in `AI.md`.
4. Start the timer and run `claude`, then paste the prompt for task 0.1.
5. Loop: run the task, read the diff, go through "Check before committing", fill in the AI log if you changed anything, commit, `/clear`, next task.

---

## Decisions

These are the defaults. Change any of them before starting, not during. `DECISIONS.md` is condensed from this table and the quirks table below.

| # | Decision | Why |
| --- | --- | --- |
| D1 | HTTP JSON API (Fastify) plus a Vue client, in one npm package; Vite proxies `/api` in development. | HTTP is easy to test with `inject()` and curl. A single package avoids the friction of workspaces in a 2-hour task. |
| D2 | `data.json` is read-only and loaded into memory. New bookings go into memory and `.data/bookings.local.json`. | It counts as production data and the brief allows file storage. SQLite would need a native build, which risks "runs straight after clone". |
| D3 | Every venue uses `Europe/Stockholm`. The API returns ISO 8601 with an offset and no milliseconds. The UI always shows venue-local time. | The data has no zone field and every coordinate is in Stockholm. A customer cares about the time at the venue, not in their browser. |
| D4 | Slot starts sit on a 15-minute grid aligned to the quarter hour, and the full duration must fit. | This is how consumer booking UIs usually work. Stepping by duration would produce odd start times such as 08:50 and 09:40. |
| D5 | Bookable time = venue opening ∩ staff working hours − staff breaks − blocking bookings. A missing day and a `null` day both mean closed. | The staff and venue hours disagree (Q6). The venue is the outer limit. |
| D6 | Every booking blocks except those with status `cancelled`, and unknown statuses also block. | Failing safe: a phantom-blocked slot costs a little revenue, while a double booking costs a customer. |
| D7 | Slots that start at or before `now` are excluded. There is no minimum notice period. | The brief doesn't ask for one, so we keep it simple. |
| D8 | `from` and `to` are local calendar dates, inclusive, with a maximum span of 14 days. A `from` in the past is clamped to today, and a `to` in the past is a 400. | This limits the work per request and treats a stale URL kindly. |
| D9 | Matching uses service names only, lowercased with diacritics stripped (NFD). Every query token must be a substring of the name or of a synonym. The query must be at least 2 characters. There's a small synonym table: massage ↔ massör ↔ massös, klippning ↔ frisör ↔ haircut. | Swedish compounds ("Sportmassage", "Djupvävnadsmassage") need substring matching, and "Massör - 50 min" should come up for "massage". A real search index would replace the synonym table (see 100x). |
| D10 | Distance uses haversine with R = 6371 km. The default radius is 25 km and the maximum 100 km. Venues without a position are excluded and a warning is logged. | The brief requires distance in every result, so a venue without a position can't be ranked honestly. |
| D11 | Results are sorted by distance, then by service id. The client can re-sort by earliest time or price. | Distance is what "near me" means, and the result sets are small enough to sort on the client. |
| D12 | A result with no free slot in the range is still returned, with `nextAvailable: null`. | The customer learns the venue exists but is fully booked, rather than thinking there's nothing nearby. |
| D13 | Each slot lists the `staffIds` that can take it. With `staffId: null`, the service assigns whoever has the fewest bookings that day (lowest id on a tie). | "Any staff" is the most common choice. The assignment is deterministic, which makes it testable. |
| D14 | The booking body is `{ serviceId, staffId \| null, start, customerName }`, and the venue is derived from the service. | Fewer fields means fewer ways to send an inconsistent request. Service ids are unique across venues. |
| D15 | The check, insert and persist run synchronously in one Node process. | That is enough to prevent double booking here. At scale, a database constraint does this job (see 100x). |
| D16 | An optional `Idempotency-Key` header. The same key with the same body returns the original booking (200). The same key with a different body is a 422. | It protects against double-clicks and retries. |
| D17 | `customerName` is trimmed, 2 to 80 characters, any Unicode letters, no control characters. No other personal data is collected. | Names like "Åsa Öberg-Lind" or "O'Neil" must pass, and we collect only what the brief asks for. |
| D18 | The `NOW` env var pins the clock. The tests pin it to `2026-10-22T08:00:00+02:00`. | Every existing booking is in October 2026, which is already in the past. Without this, nobody could see them blocking slots. |
| D19 | The UI is in English, prices use Swedish formatting ("795 kr"), and dates look like "Fri 23 Oct, 09:00" in 24-hour time. | The brief and the reviewers are in English, while the data and the users are Swedish. |
| D20 | vee-validate is pinned to 5.0.0-beta.1, because the stable 4.15.1 cannot take a Zod 4 schema (its Zod adapter needs Zod 3). Fallback: 4.15.1 with a small hand-written adapter around `safeParse`. | v5 accepts Standard Schema libraries directly, so the client forms can reuse the shared Zod 4 schemas. The cost is depending on a beta release. |

---

## Data quirks found in data.json

Each quirk gets explicit handling and, where marked, a test. Claude Code must stop and report any quirk not listed here (rule 10 in CLAUDE.md).

| # | Quirk | Handling | Test |
| --- | --- | --- | --- |
| Q1 | Venue 4 "Studio Norr" has `position: null`. | It is excluded from search, with a startup warning (D10). | yes |
| Q2 | Sara (2001) has overlapping confirmed bookings: b4 08:00–08:50 and b5 08:30–09:20 on 25 Oct. That's an existing double booking. | Both block, giving one blocked stretch from 08:00 to 09:20, plus a startup warning. The data is not "fixed". | yes |
| Q3 | Anna's b2 (11:00–12:30, 23 Oct) runs into her 12:00–13:00 break. | Both the booking and the break block, and there's a warning. | yes |
| Q4 | b3 is `cancelled`. | It doesn't block (D6). | yes |
| Q5 | The offsets are mixed: `+02:00`, `+01:00`, and `Z` (b6). 25 Oct 2026 is the day summer time ends, which is when b4 and b5 happen. | Everything is parsed as an instant (`DateTime.fromISO(s, { setZone: true })`) and compared in milliseconds. b6 at 09:00Z is 10:00 local time. | yes |
| Q6 | Erik works Saturdays 10:00–18:00, but venue 1 closes at 15:00 on Saturdays. | The hours are intersected (D5). | yes |
| Q7 | Venues use `null` for closed days, while staff simply leave the day out of `workingHours`. | Both mean closed. | covered by the slot tests |
| Q8 | Bookings have no `venueId` and no customer name. | The venue comes from `staffId`. The display name is optional internally, and new bookings carry `customerName`. | – |
| Q9 | Service names are inconsistent: a generic "Massage" (102), "Massör - 50 min" (201) with its duration in the name, and compound words. | Substring matching plus synonyms (D9). | yes |
| Q10 | Every existing booking is in October 2026, before today. | The clock is injectable, with `NOW` for demos (D18). | – |
| Q11 | There's no time zone in the data. | `Europe/Stockholm` is assumed (D3). | – |

### Expected slots (worked out by hand; use these as test oracles)

These hold with the clock pinned at `2026-10-22T08:00:00+02:00`. Times are local; staff ids are in brackets.

**Venue 1, Fri 23 Oct (+02:00)**

Service 101 (Klassisk massage, 60 min):
- 09:00 [1001]
- No slots 09:15–09:45: Anna would run into b1 at 10:00, and Erik starts at 10:00
- 10:00–12:45 [1002]
- 13:00–16:00 [1001, 1002]
- 16:15–17:00 [1002]
- Nothing after 17:00

Service 102 (Massage, 45 min):
- 09:15 [1001] is offered, because it ends exactly when b1 starts (back-to-back allowed)
- 09:30 is not offered for Anna

Service 103 (90 min, Anna only):
- Nothing in the morning
- 13:00–15:30 [1001]

**Venue 1, Sat 24 Oct (+02:00)**

Service 101, Erik only:
- 10:00–14:00 [1002]
- Nothing at 14:15 or later, because the venue closes at 15:00 (Q6)
- 10:00 is free, because b3 is cancelled (Q4)

**Venue 1, Sun 25 Oct**
- No slots: the venue is closed

**Venue 2, Sun 25 Oct (+01:00: the DST change day)**

Service 201 (50 min):
- The first slot is 09:30, because b4 and b5 block 08:00–09:20 (Q2)
- The last slot is 19:00
- Every `start` string ends in `+01:00`

**Venue 3, Mon 26 Oct (+01:00)**

Service 301 (Herrklippning, 30 min):
- 09:00–09:30 [3001]
- No slots at 09:45, 10:00 or 10:15: b6 at 09:00Z is 10:00–10:30 local, and Lina starts at 11:00. If 10:00 shows up as free, the Z offset was parsed wrong.
- 10:30–10:45 [3001]
- 11:00–12:30 [3001, 3002]
- 12:45–13:45 [3001]: Lina's b7 runs 13:00–14:00
- 14:00–18:30 [3001, 3002]

Service 302 (Damklippning, 60 min, Lina only):
- 11:00–12:00 [3002]
- 14:00–18:00 [3002]

**Clock test.** With `now` at `2026-10-23T13:05:00+02:00`, the first slot for service 101 on Fri 23 Oct is 13:15. 13:00 has already started, so it is excluded.

**Search test.** From Medborgarplatsen (59.3143, 18.0736):
- "massage" returns 101, 102 and 103 (venue 1, about 1.0 km away), then 201 (venue 2, about 3.5 km), never 401 (Q1)
- With `radiusKm=2`, venue 2 drops out

---

## API contract

All errors share one shape:

```json
{ "error": { "code": "SLOT_TAKEN", "message": "Human-readable message", "details": {}, "alternatives": [] } }
```

| Code | HTTP status | When |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Input fails a Zod schema (`details` holds the flattened issues) |
| `RANGE_IN_PAST` | 400 | `to` is before today |
| `SERVICE_NOT_FOUND`, `STAFF_NOT_FOUND`, `BOOKING_NOT_FOUND` | 404 | Unknown id |
| `STAFF_CANNOT_PERFORM` | 422 | The staff member isn't at that venue or doesn't offer that service |
| `SLOT_IN_PAST` | 422 | `start` is at or before now |
| `SLOT_INVALID` | 422 | The time could never be booked: off the grid, outside hours, or during a break |
| `SLOT_TAKEN` | 409 | The time would be valid but is now blocked by a booking. `alternatives` holds up to 3 slots |
| `IDEMPOTENCY_KEY_REUSED` | 422 | The same key was sent with a different body |

### GET /api/meta

```json
{
  "now": "2026-10-22T08:00:00+02:00",
  "timezone": "Europe/Stockholm",
  "maxRangeDays": 14,
  "defaultRadiusKm": 25,
  "serviceNames": ["Damklippning", "Djupvävnadsmassage", "Herrklippning", "Klassisk massage", "Massage", "Massör - 50 min"]
}
```

`serviceNames` lists only services at venues that can appear in search, sorted with Swedish collation.

### GET /api/search?q=massage&lat=59.3143&lng=18.0736&from=2026-10-23&to=2026-10-26&radiusKm=25

```json
{
  "query": { "q": "massage", "lat": 59.3143, "lng": 18.0736, "from": "2026-10-23", "to": "2026-10-26", "radiusKm": 25 },
  "results": [
    {
      "venue": { "id": 1, "name": "Salongens Massage", "position": { "lat": 59.3166428, "lng": 18.0561183 } },
      "service": { "id": 101, "name": "Klassisk massage", "durationMinutes": 60, "priceSek": 795 },
      "distanceMeters": 1026,
      "staff": [{ "id": 1001, "name": "Anna" }, { "id": 1002, "name": "Erik" }],
      "nextAvailable": { "start": "2026-10-23T09:00:00+02:00", "end": "2026-10-23T10:00:00+02:00", "staffIds": [1001] },
      "days": [
        { "date": "2026-10-23", "slots": [{ "start": "2026-10-23T09:00:00+02:00", "end": "2026-10-23T10:00:00+02:00", "staffIds": [1001] }] },
        { "date": "2026-10-25", "slots": [] }
      ]
    }
  ]
}
```

The response echoes the `query` as actually applied (after clamping). Every day in the range appears, including days with no slots.

### POST /api/bookings

Headers: `Idempotency-Key: <uuid>` (optional).

```json
{ "serviceId": 101, "staffId": null, "start": "2026-10-23T13:00:00+02:00", "customerName": "Åsa Öberg" }
```

A 201 (or a 200 on an idempotent replay) returns:

```json
{
  "booking": {
    "id": "6f1c…",
    "status": "confirmed",
    "customerName": "Åsa Öberg",
    "start": "2026-10-23T13:00:00+02:00",
    "end": "2026-10-23T14:00:00+02:00",
    "venue": { "id": 1, "name": "Salongens Massage" },
    "service": { "id": 101, "name": "Klassisk massage", "durationMinutes": 60, "priceSek": 795 },
    "staff": { "id": 1001, "name": "Anna" },
    "createdAt": "2026-10-22T08:00:00+02:00"
  }
}
```

`start` is accepted with any offset (for example `Z`) and normalised to Stockholm time. Booking ids come from `crypto.randomUUID()`, so they can't be guessed.

### GET /api/bookings/:id

Returns `{ booking }` in the same shape, or a 404.

---

## Phase 0: Setup

### 0.1 Scaffold the project (Sonnet, 10 min)

```text
Read CLAUDE.md and docs/PLAN.md. Do task 0.1 only, and stop when it is done.

Scaffold a single npm package (no workspaces) in this repo. data.json is already in the root; do not touch it.

- package.json: "type": "module", "engines": { "node": ">=20.19" }. Scripts: dev (concurrently, running dev:server and dev:client with names and colours, killing the others if one fails), dev:server (tsx watch src/server/index.ts), dev:client (vite), test (vitest run), test:watch (vitest), typecheck (vue-tsc --noEmit), build (vite build).
- Install only the dependencies listed in CLAUDE.md, at their latest stable versions. Check whether the installed VeeValidate accepts a Zod 4 schema directly in useForm (Standard Schema support). If it does not, check that @vee-validate/zod supports Zod 4. Tell me what you found and which route you chose, and quote the docs or changelog line you relied on. Do not guess.
- tsconfig.json: strict, noUncheckedIndexedAccess, moduleResolution bundler, the path alias @shared/* to src/shared/*, and coverage of both server and client code (including .vue files via vue-tsc).
- vite.config.ts: root src/client, the vue and @tailwindcss/vite plugins, the @shared alias, server.proxy for /api to http://localhost:3001, build.outDir ../../dist/client.
- vitest.config.ts: environment node, include src/**/*.test.ts, the same alias, and process.env.TZ = 'America/New_York' set at the top of the file so the test workers inherit it. Add src/server/tz.sanity.test.ts, asserting that Intl.DateTimeFormat().resolvedOptions().timeZone is 'America/New_York'.
- Server: src/server/config.ts (PORT default 3001; NOW env var parsed with Luxon, otherwise the real clock; exposed as a getNow() function; data and persistence paths), src/server/app.ts exporting buildApp(options) that returns a Fastify instance with the logger configurable, and src/server/index.ts that starts it. Add GET /api/health returning { ok: true }.
- Client: index.html, main.ts (VueQueryPlugin, router), router.ts (routes "/" and "/bookings/:id" with placeholder pages), App.vue (a simple header and <RouterView>), style.css with @import "tailwindcss".
- src/shared/schemas.ts: an empty module with a TODO, to be filled in task 1.1.
- .gitignore: node_modules, dist, .data, .env*.
- A stub README.md with the run commands.

Run npm install, npm run typecheck and npm test. Then start npm run dev briefly and confirm that http://localhost:5173/api/health answers through the proxy. Tell me what changed. Do not commit.
```

**Done when**
- `npm install && npm run dev` starts both processes, and `/api/health` works through `:5173`.
- `npm test` passes, including the TZ sanity test.
- `npm run typecheck` passes.

**Check before committing**
- `package.json` has no `workspaces` field and no postinstall script, and nothing in the install needs node-gyp (`npm ls` shows none of `better-sqlite3`, `sqlite3`, `bcrypt`).
- The TZ sanity test really runs under New York time. Temporarily change the expected zone to `UTC` and check that it fails.
- The VeeValidate and Zod finding cites a real source. If the AI just asserted compatibility, check the changelog yourself.

**Commit:** `chore: scaffold Fastify + Vue + Vitest project`

---

## Phase 1: Domain

### 1.1 Data loading, validation and booking store (Sonnet, 10 min)

```text
Read CLAUDE.md and docs/PLAN.md (especially the Decisions table, the Data quirks table and the API contract). Do task 1.1 only.

1. src/server/data/schema.ts: a Zod schema for the raw data.json. Be lenient exactly where the data is: position is nullable, opening-hours days may be null, staff workingHours may omit days, breaks default to []. Times are "HH:mm" strings. Booking start/end are ISO strings with an offset.
2. src/server/domain/time.ts: ZONE = 'Europe/Stockholm', WEEKDAY_KEYS mapping Luxon weekday 1..7 to mon..sun, parseHm(), parseInstant(iso) using DateTime.fromISO(iso, { setZone: true }) and then setZone(ZONE), toApiIso(dt) giving ISO without milliseconds and with the offset, and localDateTime(date "YYYY-MM-DD", "HH:mm") built with DateTime.fromObject(..., { zone: ZONE }). Never use JS Date methods that depend on the machine's zone.
3. src/server/data/load.ts: loadData(path) parses the file. If the file itself is not valid JSON, or does not match the top-level shape, throw a clear error. Validate individual venues, services, staff and bookings one at a time, skipping invalid ones and recording a warning, rather than failing the whole file. Build an in-memory model with indexes: venueById, serviceById (pointing to its venue), staffById (pointing to its venue), and bookings as parsed objects (start/end as epoch millis plus DateTime). Collect warnings for: venues without a position (Q1), overlapping non-cancelled bookings for the same staff member (Q2), bookings that overlap a break or fall outside working or opening hours (Q3), staff hours that extend past venue opening hours (Q6), bookings whose staffId or serviceId is unknown, and bookings whose length differs from the service duration. Warnings are { code, message, ids } and must not contain customer names.
4. src/server/data/store.ts: a BookingStore holding the bookings from data.json plus new ones. listForStaff(staffId) returns them sorted by start. add(booking) is synchronous. It optionally persists all runtime-created bookings (never the data.json ones) to persistPath with writeFileSync, creating the directory if needed, and loads them again at startup. persistPath: null means memory only (used by tests).
5. Wire it into buildApp: load the data, create the store, log the warnings once at startup (count plus codes), and decorate the Fastify instance with the model and store.
6. Tests (src/server/data/load.test.ts) against the real data.json: warnings include Q1 (venue 4), Q2 (b4/b5), Q3 (b2) and Q6 (Erik, Saturday). b3 loads as cancelled. b6's start equals 2026-10-26T10:00 in Europe/Stockholm. b4's start keeps its +01:00 offset after conversion to the zone. Also test the store: add() then listForStaff() returns the bookings sorted, and a temporary persistPath round-trips through a new store.

Run typecheck and tests. Report the files you changed and any assumption that isn't in the plan. Do not commit.
```

**Done when**
- The startup log lists the quirk warnings with their codes, and contains no personal data.
- The loader and store tests pass.

**Check before committing**
- Look for `new Date(`, `.getDay()`, `.getHours()` and `Date.parse` (grep for them) in `src/server`. Each one is suspect.
- Make sure bookings are compared as millis or `DateTime`, never as strings. String comparison would put `"…09:00:00Z"` before `"…09:30:00+01:00"`, which happens to be correct here, but only by luck.
- Check that `data.json` is unchanged (`git status`).

**Commit:** `feat: load and validate data.json, report data quirks, booking store`

### 1.2 Availability engine (Opus, 15 min)

```text
Read CLAUDE.md and docs/PLAN.md (Decisions D3–D7 and D13, Data quirks, and the "Expected slots" section). Do task 1.2 only.

Write src/server/domain/availability.ts with a pure function:

computeSlots({ venue, service, staff, bookingsByStaff, fromDate, toDate, now, stepMinutes = 15 })
  -> Array<{ date: "YYYY-MM-DD", slots: Array<{ start: DateTime, end: DateTime, staffIds: number[] }> }>

Rules:
- Iterate over local calendar dates from fromDate to toDate inclusive, in Europe/Stockholm. Every date appears in the output, even with no slots.
- For each staff member who offers the service: open window = venue openingHours[weekday] ∩ staff workingHours[weekday] (missing or null means closed). Subtract the staff member's breaks for that weekday. Subtract that staff member's bookings whose status is not "cancelled" (unknown statuses block), using half-open intervals.
- Candidate starts are on a 15-minute grid aligned to the quarter hour in local time, from each free segment's start (rounded up to the grid). A candidate is valid if [start, start + duration) lies completely inside one free segment and start > now.
- Build every local time with DateTime.fromObject(..., { zone: ZONE }). Do arithmetic with Luxon plus({ minutes }), and compare with toMillis().
- Merge across staff by start time. staffIds is sorted ascending.
- Also export isSlotAvailable(...) or an equivalent helper that the booking code will reuse in task 2.2 to check a single requested slot, so booking and search share one source of truth. Add an option to ignore bookings, so booking can tell "taken" (409) apart from "never valid" (422).

Tests (src/server/domain/availability.test.ts): encode every case in the "Expected slots" section of docs/PLAN.md exactly as written there, plus the clock test. Use the real data.json through loadData and pin now to 2026-10-22T08:00:00+02:00. Write the expected values from the plan; do not generate them by running the code. If a test disagrees with the plan, stop and tell me which one and why, rather than changing the expectation.

Run typecheck and tests. Report the files you changed and any assumptions. Do not commit.
```

**Done when**
- Every case in "Expected slots" is a passing test, under `TZ=America/New_York`.

**Check before committing**
- Check that the Herrklippning test really asserts that **10:00 is absent** on Mon 26 Oct. That is the test that catches a misread `Z` offset.
- Check that the 102-at-09:15 test exists. It catches an overlap check written with `<=`, which would wrongly reject back-to-back bookings.
- Check that the DST-day test asserts the `+01:00` suffix on the actual strings, not just the local hour.
- Check that if the AI changed any expected value "to make the test pass", you recompute it by hand. Either the plan or the code is wrong, and you need to know which. This is a strong candidate for an AI-log entry.
- Look for a `for` loop that adds minutes to a JS `Date`, or that treats every day as 24 hours.

**Commit:** `feat: availability engine with hours intersection, breaks and bookings`

### 1.3 Search: matching, distance and ranking (Sonnet, 15 min)

```text
Read CLAUDE.md and docs/PLAN.md (D8–D12, Q1, Q9, and the search test in "Expected slots"). Do task 1.3 only.

1. src/server/domain/geo.ts: haversineMeters(a, b) with R = 6371 km.
2. src/server/domain/search.ts:
   - normalize(s): lowercase, NFD, remove combining marks, collapse whitespace. "Djupvävnadsmassage" becomes "djupvavnadsmassage" and "Massör" becomes "massor".
   - The synonym groups from D9, applied to normalised tokens. A query token matches a service if the token, or any synonym of it, is a substring of the normalised service name. Every query token must match.
   - search({ q, lat, lng, from, to, radiusKm }, model, store, now) following D8–D12. Clamp from to today (local). Throw a typed RANGE_IN_PAST error if to is before today. Skip venues without a position. Filter by radius. Compute slots with computeSlots. Sort by distance and then service id. nextAvailable is the first slot in the range, or null. distanceMeters is rounded to whole metres.
   - Return plain data shaped to match the search response in the API contract, with times as API ISO strings.
3. Add the request and response Zod schemas for search and meta to src/shared/schemas.ts, matching the API contract exactly: searchQuerySchema (q trimmed, 2–60 chars; lat between -90 and 90; lng between -180 and 180; from and to as ISO dates; radiusKm coerced to a number from 1 to 100, default 25; a refinement that to >= from and the span is at most 14 days inclusive, computed from the YYYY-MM-DD parts with Date.UTC so it doesn't depend on the machine's zone). Also searchResultSchema and searchResponseSchema. Export the inferred types.
4. Tests:
   - geo: (0,0) to (1,0) is 111195 m ± 10, the same point gives 0, and the distance is symmetric.
   - matching: "massage" matches Klassisk massage, Massage, Djupvävnadsmassage, Sportmassage and "Massör - 50 min"; "djupvavnadsmassage" matches 103; "klassisk massage" matches only 101; "HERR" matches 301; "xyz" matches nothing.
   - The search test from the plan (Medborgarplatsen, the order, 401 never present, radius 2 km).
   - Schema: to < from gives a 15-day span error, and "a" is rejected as too short.
   - Clamping: from = 2026-10-01 with the pinned now clamps to 2026-10-22, and to = 2026-10-01 throws RANGE_IN_PAST.

Run typecheck and tests. Report the files you changed and any assumptions. Do not commit.
```

**Done when**
- The search tests pass, and the shared schemas match the contract.

**Check before committing**
- Check that synonym matching can't explode: "ma" should not match everything through some synonym. Decide whether that's acceptable, and write it down.
- Check that the 14-day span check counts inclusively (23 → 26 is 4 days), and that it gives the same answer in the client bundle and in the New York tests.
- Check that venue 4 is excluded in `search`, not in the loader. `/api/meta` should also leave out its service name.

**Commit:** `feat: service search with diacritic-insensitive matching, synonyms and distance`

---

## Phase 2: API

### 2.1 Meta and search routes (Sonnet, 8 min)

```text
Read CLAUDE.md and docs/PLAN.md (the API contract). Do task 2.1 only.

- src/server/routes/meta.ts: GET /api/meta, exactly as in the contract. serviceNames are unique, only from searchable venues, and sorted with Intl.Collator('sv').
- src/server/routes/search.ts: GET /api/search. Parse the query string with searchQuerySchema. On failure, reply 400 with VALIDATION_ERROR and the flattened issues in details. Map RANGE_IN_PAST to 400. Call search() with the injected clock.
- Request logs must not contain query strings, because lat and lng are a precise location. Configure the Fastify request serializer to log the method and the path only.
- A small shared helper for the error envelope ({ error: { code, message, details?, alternatives? } }) and a Fastify error handler, so unexpected errors become a 500 INTERNAL_ERROR without leaking stack traces.
- Tests through app.inject() with now pinned and persistPath null: meta shape; a successful search that matches the contract (parse the response body with searchResponseSchema); 400 for q="a", for lat=200, for to<from and for a 15-day span, each with the VALIDATION_ERROR code; and 400 RANGE_IN_PAST.

Run typecheck and tests. Report changes and assumptions. Do not commit.
```

**Done when**
- `curl "localhost:3001/api/search?q=massage&lat=59.3143&lng=18.0736&from=2026-10-23&to=2026-10-26"` works when started with `NOW=2026-10-22T08:00:00+02:00`.

**Check before committing**
- Check that responses are parsed with the shared schema in the tests. If the AI only checked the status code, the contract isn't really tested.
- Check that the 500 handler doesn't echo `err.message` from unexpected errors.
- Run a search and read the server output: no coordinates may appear.

**Commit:** `feat: meta and search HTTP endpoints with consistent error envelope`

### 2.2 Booking endpoint (Opus, 12 min)

```text
Read CLAUDE.md and docs/PLAN.md (D13–D17, the API contract and the error codes). Do task 2.2 only.

1. Add createBookingSchema and bookingSchema to src/shared/schemas.ts. customerName follows D17: trimmed, 2–80 chars, letters from any script plus spaces, hyphens, apostrophes and periods, no control characters. start is z.iso.datetime({ offset: true }).
2. src/server/domain/booking.ts: createBooking(input, { model, store, now, idempotencyKey? }). In order:
   a. Idempotency: if the key has been seen and the body is identical, return { booking, replayed: true }. If the body differs, throw IDEMPOTENCY_KEY_REUSED.
   b. The service must exist, otherwise SERVICE_NOT_FOUND. If staffId is set, the staff member must exist (STAFF_NOT_FOUND), belong to the service's venue and offer the service (STAFF_CANNOT_PERFORM).
   c. Normalise start to Stockholm time. If start <= now, throw SLOT_IN_PAST.
   d. Use the availability engine (the shared helper from task 1.2) to check the requested start for that local date. With a staffId, that staff member must be in the slot's staffIds. With staffId null, pick from the slot's staffIds following D13.
   e. If it isn't available: check again while ignoring bookings. If it would be valid then, throw SLOT_TAKEN with alternatives (up to 3 slots for the same service at or after the requested start, any staff, looking up to 7 days ahead). Otherwise throw SLOT_INVALID.
   f. Create the booking (crypto.randomUUID(), status confirmed, end = start + duration, createdAt = now) and store.add() it. Record the idempotency key.
   There must be NO await anywhere between step d and step f. Add a comment saying why.
3. src/server/routes/bookings.ts: POST /api/bookings (201, or 200 on replay; read the optional Idempotency-Key header) and GET /api/bookings/:id (200 or 404). Map the domain errors to the statuses in the contract.
4. Tests through app.inject() (now pinned, persistPath null):
   - Happy path: 101 on Fri 23 Oct at 13:00 with staffId null returns 201, staff assigned per D13, and end = 14:00+02:00. A GET by id returns the same booking.
   - start given as "2026-10-23T09:00:00Z" (11:00 local) for Erik returns 201, with start normalised to +02:00.
   - Booking Anna for 101 at 13:00 twice: the second returns 409 SLOT_TAKEN, and its alternatives include 13:00 with Erik.
   - Two simultaneous POSTs (Promise.all) for 101 on Sat 24 Oct at 10:00 with staffId null (only Erik works): exactly one 201 and one 409.
   - An off-grid time (13:07) returns 422 SLOT_INVALID. Venue 1 on Sunday returns 422 SLOT_INVALID. Johan for 302 returns 422 STAFF_CANNOT_PERFORM. Sara for 101 returns 422 STAFF_CANNOT_PERFORM. Service 999 returns 404. 21 Oct returns 422 SLOT_IN_PAST. customerName "  " returns 400. "Åsa Öberg-Lind" and "O'Neil" are accepted.
   - Idempotency: the same key and body twice gives 201 then 200 with the same id, and only one booking exists. The same key with a different start gives 422.
   - After a successful booking, search no longer offers that slot for that staff member.

Run typecheck and tests. Report changes and assumptions. Do not commit.
```

**Done when**
- All the booking tests pass, and a booking made over curl survives a server restart (it's in `.data/bookings.local.json`).

**Check before committing**
- Read `createBooking` yourself, line by line, looking for an `await` between the availability check and `store.add`. If the file write is async, a second request can slip in. This is a likely AI-log entry.
- Check that the booking check reuses the engine. If the AI wrote a separate overlap check for booking, search and booking can disagree.
- Check that the concurrency test actually runs the two requests concurrently (`Promise.all`), not one after the other.
- Check that customer names don't appear in the logs. Make one booking and read the server output.

**Commit:** `feat: booking endpoint with server-side slot verification, conflicts and idempotency`

---

## Phase 3: UI

### 3.1 Search form and URL state (Sonnet, 10 min)

```text
Read CLAUDE.md and docs/PLAN.md. Do task 3.1 only. This is the frontend. Follow the frontend conventions in CLAUDE.md exactly.

- Before building the form, check that useForm accepts the shared Zod 4 schema: a too-short customer name must produce a field error. If it doesn't, stop and tell me. Do not switch libraries on your own.
- src/client/lib/api.ts: a typed fetch wrapper. It parses successful responses with the shared Zod schemas, and on non-2xx responses throws an ApiError carrying code, message and alternatives.
- src/client/lib/locations.ts: presets for Medborgarplatsen (59.3143, 18.0736), T-Centralen (59.3313, 18.0597), Fridhemsplan (59.3322, 18.0296) and Östermalmstorg (59.3349, 18.0790). All the venues are in Stockholm, so these give useful results for reviewers anywhere.
- SearchPage.vue: load /api/meta with useQuery, and use meta.now (not the browser clock) for date defaults: today to today + 6. Read the search params from route.query and parse them with searchQuerySchema. When they're valid, run useQuery(['search', params]) with keepPreviousData-style behaviour, so results don't flash empty while the user changes the search.
- SearchForm.vue with VeeValidate useForm and a form schema built from the shared schema:
  - service: a text input with a <datalist> of meta.serviceNames
  - location: a "Use my location" button (navigator.geolocation, showing "Locating…" while it works, plus clear messages for "permission denied" and "unavailable", falling back to the preset select) or the preset select. Show which location is active.
  - dates: two native date inputs, with min set to today and max set to from + 13, plus quick chips (Today, Next 3 days, Next 7 days, Next 14 days)
  - radius: a select with 5, 10, 25 and 50 km
  - submit: push the values to the URL query (router.push). The form initialises from the URL, so reloading and the back button work.
- Field errors appear under each field, with aria-invalid and aria-describedby set.
- Show nothing below the form until a search has run. Put a short hint before the first search, for example: "Try 'massage' near Medborgarplatsen".

Run typecheck and tests, and start the dev server to check the form works in the browser. Report changes. Do not commit.
```

**Done when**
- Submitting puts the search in the URL, and reloading the page restores both the form and the query.
- Denying geolocation shows a helpful message and the preset select still works.

**Check before committing**
- Make sure the date defaults come from `meta.now`. Run with `NOW=2026-10-22T08:00:00+02:00` and check that the form defaults to 22 Oct.
- Check that geolocation errors are handled and don't crash the page or get silently swallowed.

**Commit:** `feat(client): search form with geolocation, presets, date chips and URL state`

### 3.2 Results and slot picker (Sonnet, 10 min)

```text
Read CLAUDE.md and docs/PLAN.md. Do task 3.2 only.

- A results header that says what was searched, for example "4 results for 'massage' within 25 km of Medborgarplatsen", inside an aria-live="polite" region.
- A sort control (Distance, the default / Earliest available / Price) that sorts on the client.
- ResultCard.vue: venue name, service name, duration, price (Intl SEK), distance ("850 m" below 1 km, otherwise "1.2 km"), and a prominent "Next: Fri 23 Oct, 09:00" button that opens booking for that slot directly. If nextAvailable is null, the card is muted and says "No free times in these dates".
- SlotPicker.vue inside each card:
  - Day tabs (role="tablist", arrow-key navigation) showing the weekday and date. Days without slots appear disabled and are labelled "Closed / full".
  - Times grouped into Morning (<12), Afternoon (12–17) and Evening (≥17). Show the first 8 per group, then a "Show all" button.
  - Staff chips: "Any" (the default) plus one per staff member, filtering slots by staffIds.
  - Each time is a <button>. Clicking it emits a select event with { result, slot, staffId | null }.
- States: a skeleton loader while loading (three card placeholders); an empty state with "Widen to 50 km" and "Try the next 7 days" actions that update the URL; an error state with a Retry button.
- src/client/lib/format.ts: Intl helpers for the day label, time, price and distance, all using timeZone Europe/Stockholm.

For now, the select event just logs to the console. Booking comes in task 3.3. Run typecheck and tests and check in the browser at 375 px and on desktop. Report changes. Do not commit.
```

**Done when**
- With `NOW` pinned, searching "massage" near Medborgarplatsen for 23–26 Oct shows Anna's 09:00 on Friday, and nothing for 09:15–09:45 on 101.
- The "Herrklippning" search for Monday 26 Oct shows no 10:00 slot.

**Check before committing**
- Compare one card's times with "Expected slots". This end-to-end check confirms that the UI formats times in Stockholm time, not in your browser's zone. Set your OS zone to something else, or use Chrome DevTools sensor overrides, and check again.
- The tabs must be usable with the keyboard alone.

**Commit:** `feat(client): result cards, day tabs, grouped slots, staff filter, empty and error states`

### 3.3 Booking dialog, conflict handling and confirmation page (Sonnet, 10 min)

```text
Read CLAUDE.md and docs/PLAN.md. Do task 3.3 only.

- BookingDialog.vue using a native <dialog> opened with showModal(). Focus moves to the name field when it opens and returns to the slot button that opened it when it closes. Esc closes it.
  - Summary: venue, service, staff (the chosen staff member or "First available"), day and time, duration and price.
  - Name field: VeeValidate with the shared customerName rule.
  - Generate an idempotency key with crypto.randomUUID() each time the dialog opens.
  - Define useMutation INLINE in this component (not in a hook file). Disable the submit button while the request is pending and show "Booking…".
  - On success: queryClient.setQueryData(['booking', id], booking), invalidate ['search'], and router.push(`/bookings/${id}`).
  - On SLOT_TAKEN: keep the dialog open and show "Sorry, 13:00 was just taken." with the alternatives as buttons. Clicking one switches the dialog to that slot, keeping the typed name. Invalidate ['search'] so the list behind refreshes.
  - On SLOT_IN_PAST or SLOT_INVALID: show the message and a "Back to times" button. On a network error: show a message and let the user retry with the same idempotency key.
- BookingConfirmationPage.vue: useQuery(['booking', id]) against GET /api/bookings/:id, so a reload works. Show a success heading, a short reference (the first 8 characters of the id, uppercased), venue, service, staff, date and time, duration and price, and a "Book another time" link back to the previous search (keep the search query in history.state or a query param). A 404 shows a friendly "Booking not found".

Run typecheck and tests. In the browser: book a slot, reload the confirmation page, and go back. To trigger a conflict, open the same slot in two tabs and book in both. Report changes. Do not commit.
```

**Done when**
- Booking works from both the "Next" button and the slot grid.
- The two-tab conflict shows the alternatives, and picking one completes the booking.
- The confirmation page survives a reload.

**Check before committing**
- Check that `useMutation` is inline in `BookingDialog.vue`.
- Double-click "Confirm" quickly and check that only one booking is created (look in `.data/bookings.local.json`).
- Check that the idempotency key stays the same on retry, and that a new key is made only when the dialog is reopened.

**Commit:** `feat(client): booking dialog with conflict recovery and confirmation page`

### 3.4 UX polish (Sonnet, 5 min; the first thing to cut)

```text
Read CLAUDE.md. Do task 3.4 only: a focused polish pass, with no new features.
- An accessibility pass: every control has a label, focus rings are visible, colour contrast is AA, and the results count and errors are announced through aria-live.
- Respect prefers-reduced-motion for any transitions.
- At 375 px: no horizontal scroll, tap targets at least 44 px, and the dialog fits the screen.
- Make the empty, loading and error copy consistent.
List what you changed. Do not commit.
```

**Commit:** `chore(client): accessibility and mobile polish`

---

## Phase 4: Ship

### 4.1 DECISIONS.md, AI.md and README (Sonnet, 10 min)

```text
Read CLAUDE.md and docs/PLAN.md, and the AI log section at the bottom of docs/PLAN.md. Do task 4.1 only.

1. DECISIONS.md, at most one printed page (around 450 words). Use these sections:
   - Assumptions: condensed from the Decisions table and the Data quirks table. Lead with the quirks and how each was handled.
   - Trade-offs, including D20 (vee-validate pinned to a beta, and the fallback).
   - At 100x data or traffic: Postgres with an exclusion constraint on (staff_id, tstzrange) WHERE status <> 'cancelled' instead of the in-process check; idempotency keys in the database; PostGIS or a geohash/bounding-box prefilter before haversine; a search index with a Swedish analyser (compound words) replacing the synonym table; caching availability per staff and day, invalidated on booking; paginated search; stateless API servers behind a load balancer; a time zone per venue; rate limiting.
   - What I cut: the list from "If you're behind" and from CLAUDE.md "Not building", with one reason each.
   Write it in the first person, plainly, with no marketing tone.
2. AI.md, built from the AI log. Tools: Claude (chat) for framing and for writing CLAUDE.md and docs/PLAN.md, and Claude Code (Opus/Sonnet) to implement task by task. Explain the workflow: one task per session, hand-computed expected slots used as test oracles, review before every commit. Then write up the 2–3 strongest entries from the AI log as "what it did / what I did / why". Do not invent entries; use only what is in the log.
3. readme.md (lowercase): it keeps the original brief intact and gets a "Running this implementation" section above or below it (task 0.1 already added a first version). The section has the requirements (Node >= 20.19), how to run and test, NOW for demos, curl examples for search and booking, and links to DECISIONS.md, AI.md and docs/PLAN.md.

Do not commit.
```

**Check before committing**
- Read `DECISIONS.md` and `AI.md` out loud. Every sentence must be true of the code that exists. Delete anything the AI claims that you didn't do.
- `DECISIONS.md` must fit on one page.

**Commit:** `docs: decisions, AI usage and README`

### 4.2 Fresh-clone check (5 min, done by you)

```bash
cd /tmp && rm -rf booking-check && git clone <your-repo> booking-check && cd booking-check
npm install && npm test && npm run typecheck
NOW=2026-10-22T08:00:00+02:00 npm run dev
```

Click through search, booking and conflict once. Check that `data.json` is unchanged and `.data/` isn't committed. If anything fails, fix it, commit as `fix: …`, and run the check again.

---

## AI log (fill in as you go; feeds AI.md)

Add an entry whenever you corrected, rejected or overrode something. Your best 2–3 go into `AI.md`. The "Check before committing" lists are where most of these come from.

| # | Task | What the AI produced | What I did instead | Why |
| --- | --- | --- | --- | --- |
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |

Likely candidates, judging by where models usually slip:
- Parsing the `Z` booking as local time, or comparing ISO strings
- An `<=` in the overlap check that rejects back-to-back slots
- Not intersecting staff hours with venue hours
- An `await` between the availability check and the insert
- Writing a separate overlap check for booking instead of reusing the engine
- "Fixing" a failing test by changing the expected value
- Claiming that VeeValidate and Zod 4 are compatible without a source
