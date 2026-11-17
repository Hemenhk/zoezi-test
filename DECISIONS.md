# Decisions

## Assumptions

Quirks:
- Venue 4 has no position: excluded from search and `/api/meta`, with a warning.
- Sara's bookings overlap and one of Anna's runs into her break. Left as is: all block, with warnings.
- Cancelled doesn't block; unknown statuses do.
- Mixed offsets (including `Z`), summer time ending 25 Oct: times compared as epoch ms.
- Erik works past closing on Saturday; closed is `null` for venues, missing for staff. Hours are intersected; both mean closed.
- Inconsistent service names: substring match, no diacritics, synonym table.
- No time zone; all existing bookings are in October 2026: I assume `Europe/Stockholm`, inject the clock.

Also: 15-minute slots, whole service must fit; at most 14 days per search; results by distance, fully booked included; "any staff" gets whoever has fewest bookings that day; booking reuses search's availability function.

## Trade-offs

- vee-validate is pinned to 5.0.0-beta.1: 4.15.1 can't take a Zod 4 schema. Fallback: 4.15.1 plus a hand adapter.
- Idempotency keys: memory only. Names are plain text in `.data/bookings.local.json` (gitignored), never logged.
- "Use my location" rounds to 3 decimals in the browser, not the server.
- The UI depends on shadcn-vue (copied-in Reka UI components), edited in place: `rounded-full` and `h-11` on button, input and select; focus ring `ring-ring`, not `ring-ring/50`; `RangeCalendarCellTrigger.vue` takes "today" from `meta.now`, with 44 px day cells on small screens.
- `--input` and `--ring` (`src/client/style.css`) are darker than the design source, so edges and focus ring reach 3:1 on white. The calendar file is built in the browser: no endpoint.

## At 100x data or traffic

- Postgres exclusion constraint on `(staff_id, tstzrange) WHERE status <> 'cancelled'`, not the in-process check; idempotency keys in the database.
- PostGIS or a bounding-box prefilter before haversine; a Swedish-analyser search index, not synonyms.
- Availability cached per staff and day, invalidated on booking; paginated search; stateless servers behind a load balancer; per-venue time zones; rate limiting; code splitting (bundle over 500 kB).

## What I cut

Nothing from "If you're behind".

- Authentication, payments, cancelling, email/SMS, "my bookings", admin: not asked.
- Geocoding, maps: presets and browser position suffice.
- Docker, database: must run after cloning.
- ESLint, Prettier, end-to-end, visual and component tests: time; layout checked by hand.
- Dark mode (tokens ported, no toggle), translations: English only.
