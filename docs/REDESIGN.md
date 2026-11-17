# Redesign plan: shadcn-vue and the Anviil design language

**Scope.** Presentation only. The API, the shared schemas, the query keys, the URL state, the idempotency rules and the conflict recovery from tasks 2.x to 3.3 stay exactly as they are. At every commit, `git diff main --stat -- src/server src/shared` must print nothing.

**How to use this file.** Same loop as `docs/PLAN.md`: one task per Claude Code session, read the diff, go through "Check before committing", commit, `/clear`, next task. Work on the branch `ui/redesign` and merge to `main` only when R4 passes, so `main` always has the working, verified UI. Use Sonnet for all tasks; if it gets one wrong twice, switch to Opus.

| Task | What                                                    | Budget |
| ---- | ------------------------------------------------------- | ------ |
| R0   | shadcn-vue setup, Anviil tokens, vee-validate spike     | 15 min |
| R1   | App shell, landing, search form, responsive layout      | 20 min |
| R2   | Result cards, day tabs, slots, states                   | 20 min |
| R3   | Booking dialog/drawer, confirmation page, calendar file | 20 min |
| R4   | Cleanup, token audit, accessibility re-check            | 10 min |

---

## Before you start (you do this, about 5 minutes)

1. Create the branch:

```bash
git checkout -b ui/redesign
mkdir -p docs/design/anviil
```

2. Copy the Anviil design files from `training-web`. Find them first, because the paths depend on your layout:

```bash
find ../training-web -name globals.css -not -path "*/node_modules/*"
find ../training-web -name components.json -not -path "*/node_modules/*"
cp <path to globals.css> docs/design/anviil/globals.css
cp <path to components.json> docs/design/anviil/components.json
```

3. Save three light-theme screenshots of the Anviil web dashboard into `docs/design/anviil/` (for example `page.png` of a page with cards or a list, `dialog.png` with a dialog open, `form.png` of a form page). Add a mobile one if you have it. Claude Code reads images, and the screenshots show the things the tokens don't: density, spacing and how the dark brand surface is used.

4. Create `docs/design/anviil/NOTES.md` with three lines: the font family Anviil uses (and whether it's a Google font), anything you'd call a rule of the design (for example "no gradients", "icons use the foreground token"), and anything that should _not_ be copied.

You can delete `docs/design/anviil/` before you submit if you'd rather not ship it; the tokens live in `src/client/style.css` after R0.

---

## Design brief

The source of truth is `docs/design/anviil/`: the token file, the screenshots and the notes. Where this brief and the screenshots disagree, follow the screenshots and tell me.

Rules (taken from how you've worked on Anviil in earlier chats; correct anything that isn't true):

1. **Tokens only.** Every colour comes from the CSS variable system (`bg-background`, `text-foreground`, `bg-card`, `bg-primary`, `text-muted-foreground`, `border-border`, `bg-accent`, `bg-sidebar` and so on). No hex, rgb, hsl or oklch values in components, and no Tailwind palette colours (`bg-slate-100`, `text-blue-700`).
2. **No Tailwind opacity modifiers on colours** (`bg-primary/10`). When a translucent shade is needed, add a named token to `style.css` (for example `--primary-soft`) and map it in `@theme inline`.
3. **Restraint.** No gradients, glows or decorative shadows. Cards are a hairline border on the background, buttons are flat. Hierarchy comes from size, weight and spacing.
4. **Light theme only.** Port the `.dark` tokens so the file stays identical to Anviil's, but there's no toggle and no dark-mode testing.
5. **No Anviil name or logo anywhere in the UI.** The header says "Book a time".
6. **The dark brand surface** (`--brand` with `--brand-foreground`) may be used for the header only, if the screenshots show it as part of the look. The `--sidebar` tokens in Anviil's file are light, so they are not that surface. `--accent-ember` is an accent for icons, indicators and small marks, not a text or button fill: white text on it is under 4.5:1. Content stays on `background` and `card`.
7. **Type, radius and spacing** come from the tokens and from `NOTES.md`. If the font is a Google font, use its `@fontsource-variable` package; otherwise a system font stack.
8. Icons come from `@lucide/vue`, are sized with classes, and take their colour from the text colour around them.

---

## Which look, and what to port

Anviil's `globals.css` holds two looks:

- **Base** (`:root` and `.dark`): neutral white, near-black primary, `--radius: 0.875rem`, plus `--brand`, `--brand-foreground`, `--accent-ember` and `--tint`. The public site and the auth pages use it, and it is what the screenshots in `docs/design/anviil/` show.
- **Warm area** (`html[data-area="warm"]`, the theme picker, meal builder, plan setup dialog, sidebar collapse and the button-state rules): the dashboard's oat-and-sage look, scoped by an attribute.

The booking app is a public, consumer-facing page, so it uses the **base** look. The warm area is not ported. If you'd rather have the dashboard look, say so: the sage block is attribute-scoped, so it's a small change (port that one block and set `data-area="warm"` on `<html>`).

**Port exactly this, and nothing else:**

- `@import "tailwindcss"` and `@import "tw-animate-css"`. Not `@import "shadcn/tailwind.css"`, which belongs to the React package.
- `@custom-variant dark (&:is(.dark *));`, so the operating system's dark mode never leaks in (we ship light only).
- The `@theme inline` mappings for the standard shadcn tokens (background to ring, chart, sidebar, and the radius scale). Skip the meal-builder, macro, allergen, diet, board, soft, pill and overlay mappings.
- New mappings for `--brand`, `--brand-foreground`, `--accent-ember` and `--tint` (`--color-brand`, `--color-brand-foreground`, `--color-ember`, `--color-tint`). The original defines them as variables but not as Tailwind colours, and components may only use tokens.
- The `:root` and `.dark` blocks, minus the meal-builder variables (board, macro, allergen, diet).
- The `@layer base` block (border and outline defaults, body colours, pointer cursor on enabled buttons, `font-sans` on html).
- Fonts. The original's `--font-sans` is set by Next. Define `--font-sans` as Geist Mono and `--font-heading` as Figtree, each with a system fallback, and apply `font-heading` to h1 to h3 and to the titles of Card, Dialog, Drawer and Sheet.

**Do not port:** the view transitions, the offer-card animation, the app-banner rule, `thin-scroll`, the warm area, and everything after it.

**Two deviations**, because the base tokens miss the 3:1 contrast that WCAG 1.4.11 requires for non-text elements on white. Anviil's warm area already fixes the same problem for field edges ("a field's edge needs 3:1"):

- `--input` (field and outline-button edges): `oklch(0.922 0 0)` is about 1.2:1. Use about `oklch(0.6 0 0)`, which is about 4:1.
- `--ring` (the focus ring): `oklch(0.708 0 0)` is about 2.6:1. Use about `oklch(0.45 0 0)`.

Calculate the contrast instead of trusting these figures. List both deviations in the R0 report and in "Notes for DECISIONS.md". Also check where `text-muted-foreground` sits on `bg-muted` (about 4.3:1) and avoid that pairing for small text.

---

## What changes

| Today                                 | After                                                      |
| ------------------------------------- | ---------------------------------------------------------- |
| `<input list>` with a `<datalist>`    | Combobox (Command in a Popover) fed by `meta.serviceNames` |
| Two native date inputs and chips      | A Popover with a RangeCalendar and preset buttons          |
| Preset select and a locate button     | Select, and a Button with an icon and a Spinner            |
| Radius `<select>`                     | Select                                                     |
| Hand-built result `<article>`s        | Card, Badge, Separator, Button                             |
| Hand-built tablist                    | Tabs inside a ScrollArea                                   |
| Staff chips                           | ToggleGroup                                                |
| Skeleton divs, empty and error blocks | Skeleton, Empty, Alert                                     |
| Native `<dialog>`                     | Dialog on 768 px and up, Drawer below                      |
| Mobile search form on the page        | The same form inside a Sheet, opened from a summary bar    |

Components to add with the CLI: `button input label field select popover command combobox calendar range-calendar card badge tabs toggle-group dialog drawer sheet skeleton alert separator scroll-area empty`. If a name doesn't exist in the registry, report it and use the closest one. There are no toasts: errors stay inline, so `sonner` is not needed.

---

## UX flow

**1. Landing (no search in the URL).** A centred card: the heading "Find and book a service near you", one line of copy, the search form, and underneath a row of suggestion buttons built from the real service names (`meta.serviceNames`). Clicking one fills the service field and moves focus on. A first-time visitor sees what they can search for without guessing.

**2. Results, desktop (1024 px and up).** Two columns. The left column is sticky and holds the search form, so refining a search never means scrolling up. The right column has the results header (count, sort) and the cards.

**3. Results, mobile and tablet.** The form is hidden behind a summary bar at the top: "massage · Medborgarplatsen · 23–29 Oct" with an Edit button. Edit opens the same form in a Sheet, and submitting closes it. Results are a single column below.

**4. A result card.** Service and venue at the top, with price and duration. A distance badge. A prominent "Next: Fri 23 Oct, 09:00" button for the one-tap path. Underneath, days as tabs in a horizontally scrollable strip (days without slots are disabled), a staff filter, then times grouped into morning, afternoon and evening as a grid of buttons.

**5. Booking.** Tapping a time opens a Dialog on desktop and a bottom Drawer on mobile, with the same content: a summary, the name field, Cancel and Confirm. If someone else took the slot, an Alert says so and offers nearby times as buttons, keeping the typed name.

**6. Confirmation.** A page with a check icon, "You're booked", the reference, the details, "Add to calendar" (downloads an `.ics` file generated in the browser) and "Book another time".

Things to protect throughout: the date defaults and the calendar's "today" come from `meta.now`, not the browser clock; every time shown is Stockholm time; the 44 px tap targets and focus rings from the accessibility pass still hold.

---

## CLAUDE.md changes (apply exactly, in R0)

1. **Stack, Client bullet.** Replace it with: "Client: Vue 3 (`<script setup lang="ts">`, Composition API), Vite, vue-router, Tailwind CSS v4 (via `@tailwindcss/vite`), shadcn-vue components (added by the CLI into `src/client/components/ui`, built on Reka UI), TanStack Vue Query, and VeeValidate 5.0.0-beta.1 with the shared Zod 4 schemas."
2. **Allowed dependencies and the "deliberately no UI component library" paragraph.** Replace both with: "Allowed dependencies: everything already installed, plus the packages that `npx shadcn-vue add` requires for the components listed in docs/REDESIGN.md (expected: reka-ui, class-variance-authority, clsx, tailwind-merge, @lucide/vue, tw-animate-css, vaul-vue, @vueuse/core, @internationalized/date, and a font package if Anviil's font is a Google font). List every new dependency in your report. There is still no other component library, no map library, no Pinia, no Axios and no ESLint."
3. **Frontend conventions.** Remove the line about styling with Tailwind utility classes only and the mention of native `<dialog>`, `<input type="date">` and `<datalist>`. Add: "UI primitives come from shadcn-vue. Add components with `npx shadcn-vue@latest add`, and don't hand-edit files in `src/client/components/ui` except to fix a bug. Forms use shadcn-vue's `Field`, `FieldLabel` and `FieldError` with vee-validate's `Field as VeeField` and `useForm({ validationSchema })` taking the raw shared Zod schema; don't use the older `FormField`/`FormItem` wrappers or `toTypedSchema`."
4. **Hard rules.** Add rule 11: "Colours come from design tokens only (see Design rules). Never add a hex, rgb, hsl or oklch value, a Tailwind palette colour or an opacity-modifier colour to a component."
5. **Layout.** Add `src/client/components/ui/` (generated by shadcn-vue), `src/client/lib/utils.ts` (the `cn` helper), `src/client/lib/ics.ts` (calendar file), and `docs/design/anviil/` (design reference) and `docs/REDESIGN.md`.
6. **New section "Design rules".** Copy rules 1 to 8 of the Design brief in docs/REDESIGN.md.

---

## R0: Setup (15 min)

```text
Read CLAUDE.md, docs/PLAN.md and docs/REDESIGN.md. Do task R0 only, and stop when it is done.

1. Confirm the current branch is ui/redesign. If it isn't, stop and tell me.
2. Apply the "CLAUDE.md changes" section of docs/REDESIGN.md to CLAUDE.md exactly. Do not touch docs/PLAN.md.
3. Read everything in docs/design/anviil/ (globals.css, components.json, NOTES.md and the screenshots). In your report, summarise the font, the radius, the primary, brand and accent tokens, and whether the screenshots show a dark brand surface and where.
4. Set up shadcn-vue on the existing Vite project (root src/client, Tailwind v4 through @tailwindcss/vite, already installed). Add the "@" alias pointing to src/client in tsconfig.json, vite.config.ts and vitest.config.ts, and keep @shared/*. Create components.json with `npx shadcn-vue@latest init` if the CLI copes with this layout; if it can't (our Vite root is src/client), write components.json by hand with the aliases @/components, @/components/ui, @/lib, @/lib/utils and @/composables, the CSS file src/client/style.css, and the baseColor and iconLibrary values from docs/design/anviil/components.json. Anviil's style is "radix-nova"; if shadcn-vue doesn't offer that style, use the nearest one it offers and tell me which styles exist and which you chose (the tokens carry the look, not the style). Don't fight the CLI for more than a few minutes.
5. Port the Anviil tokens into src/client/style.css exactly as the section "Which look, and what to port" in docs/REDESIGN.md says: the base look only, the listed exclusions, the extra brand, ember and tint mappings, the fonts, and the two contrast deviations (calculate the contrast yourself). Keep our existing @import "tailwindcss". Keep the reduced-motion block and the focus-visible rule from the accessibility pass, but rewrite the focus rule to use var(--ring) instead of a palette colour. Keep every token name. Fonts: Figtree for headings and Geist Mono for body text, using their @fontsource-variable packages (verify the exact package names on npm before installing). Say in your report how you mapped headings and body to the tokens, and list anything from globals.css that you left out.
6. Add the components with the CLI: button input label field select popover command combobox calendar range-calendar card badge tabs toggle-group dialog drawer sheet skeleton alert separator scroll-area empty. If a name doesn't exist in the registry, tell me and use the closest one. Do not hand-write what the CLI provides. List every new dependency in your report.
7. Spike, before touching any app code: in a throwaway file, check that shadcn-vue's Field components work with vee-validate 5.0.0-beta.1 and the shared Zod 4 schema. Use the pattern from shadcn-vue's "Forms: VeeValidate" guide, except with the raw Zod schema: useForm({ validationSchema }) (no toTypedSchema, no @vee-validate/zod), vee-validate's Field as VeeField with a scoped slot, and shadcn-vue's Field, FieldLabel and FieldError. Show me that a one-character customerName puts the shared schema's message into FieldError. Do not use the older FormField/FormItem wrappers. If it doesn't work, stop and report exactly what failed. Do not change the vee-validate version or add @vee-validate/zod on your own. Delete the throwaway file afterwards.
8. Add a temporary page at /kit (not linked anywhere) showing a Button in each variant, an Input, a Select, a Card, a Badge, Tabs and a Calendar, so I can check that the tokens look like Anviil. It is removed in R1.

Run typecheck, tests (they must pass unchanged) and build. `git diff main --stat -- src/server src/shared` must print nothing. You have no browser in this session, so do not claim anything is verified visually. Report what changed, the dependencies added and the spike result. Do not commit.
```

**Done when**

- `localhost:5173/kit` renders with Anviil's colours, radius and font. Compare it with the screenshots side by side.
- The spike result shows the shared schema's message inside `FieldError`.

**Check before committing**

- `git diff main --stat -- src/server src/shared` is empty, and `npm test` is still 100+ passing.
- The new dependency list matches CLAUDE.md's expected list. Anything else needs a reason.
- The old client styles didn't leave the app unstyled: open `/` and make sure it still works, even if it looks mixed.
- The spike really used vee-validate 5.0.0-beta.1 (`npm ls vee-validate`) and no `@vee-validate/zod` is installed.

**Commit:** `chore(client): set up shadcn-vue with Anviil design tokens`

---

## R1: Shell, landing and search (20 min)

```text
Read CLAUDE.md, docs/PLAN.md and docs/REDESIGN.md (the "Design brief" and the "UX flow"). Do task R1 only. Presentation only: do not change src/server, src/shared, lib/api.ts, the query keys, or how search state is kept in the URL.

1. Centrally restyle components/ui: button h-10 default and h-11 lg, rounded-full; input and select/combobox trigger h-11, rounded-full; replace focus-visible:ring-ring/50 with focus-visible:ring-ring across components/ui.
2. Remove the /kit route and file.
3. App.vue: an AppHeader.vue (slim, using the brand surface only if the brief and the screenshots say so; the text "Book a time"; no navigation) and a centred main container (max-w-6xl, responsive horizontal padding).
4. Landing (no valid search in the URL): a centred Card with the heading "Find and book a service near you", one line of copy, the search form, and below it a row of Buttons (variant outline, size sm) built from meta.serviceNames that fill the service field and move focus to the next field. This replaces the old hint line.
5. Rebuild SearchForm.vue with shadcn-vue, keeping the existing VeeValidate setup, the shared searchQuerySchema, the initialisation from the URL, and the "unchanged search emits unchanged and refetches" behaviour:
   - What: Combobox (Command in a Popover) with meta.serviceNames as suggestions. Free text must still be allowed: a user can submit text that isn't in the list. Use Field, FieldLabel and FieldError.
   - Where: Select with the presets, and a Button (variant outline) with the LocateFixed icon and a Spinner while locating. Keep the geolocation error messages (role="alert") and the 3-decimal rounding.
   - When: a Popover containing a RangeCalendar and preset Buttons (Today, Next 3 days, Next 7 days, Next 14 days). The trigger shows "23 Oct – 29 Oct". Dates in the URL stay "YYYY-MM-DD" strings (convert with CalendarDate from @internationalized/date). Disable days before today, and once a start day is chosen disable days after start + 13. "Today" and the default range come from meta.now, not the browser clock. The Calendar highlights the browser's today by default, so override it, and check it with NOW pinned to 22 Oct.
   - Distance: Select (5, 10, 25, 50 km).
   - Submit: Button "Search".
6. SearchPage.vue layout (the card contents come in R2):
   - Desktop (lg and up): two columns. A sticky left column (w-80) holds the search form in a Card; the right column holds the results.
   - Below lg: the form is hidden. A summary bar at the top shows "massage · Medborgarplatsen · 23–29 Oct" with an Edit Button that opens the same form in a Sheet. Submitting closes the Sheet.
   - The results header (the aria-live region and the count) and the sort Select keep their behaviour; restyle only.
7. Don't change the card contents yet. It's fine for the old cards to look out of place for now.

You have no browser in this session, so do not claim anything is verified visually. Run typecheck, tests and build. End with a numbered list of what I must check by hand on desktop and at 375 px. `git diff main --stat -- src/server src/shared` must print nothing. Do not commit.
```

**Done when**

- With `NOW=2026-10-22T08:00:00+02:00`, the date trigger defaults to "22 Oct – 28 Oct", the calendar marks 22 Oct as today, and days before it are disabled.
- Typing a service that isn't in the list still searches. Picking a suggestion fills the field.
- Reload, back button and URL sharing still work. A search for "massage" near Medborgarplatsen puts the same query parameters in the URL as before.
- At 375 px: summary bar, Edit opens the Sheet, submitting closes it. At 1280 px: the form is a sticky left column.

**Check before committing**

- `grep -rn "type=\"date\"\|<datalist" src/client` prints nothing.
- Open the calendar in a non-Stockholm browser zone (DevTools Sensors) and check that "today" is still 22 Oct.
- Tab through the form: Combobox opens with Enter or arrows, Escape closes it, focus comes back to the field.

**Commit:** `feat(client): shadcn-vue shell, landing and search form`

---

## R2: Results (20 min)

```text
Read CLAUDE.md, docs/PLAN.md and docs/REDESIGN.md. Do task R2 only. Presentation only, with the same rules as R1.

1. ResultCard.vue becomes a Card. CardHeader: the service name as the title and the venue name as the description, with the price (Intl SEK through lib/format.ts) and the duration on the right. A Badge (variant secondary) with the MapPin icon and the distance. A primary Button "Next: Fri 23 Oct, 09:00" with the Clock icon that opens booking with staffId null. If nextAvailable is null, the card is muted, shows a Badge "Fully booked" and the existing "No free times in these dates." copy.
2. SlotPicker.vue:
   - Day selection with shadcn-vue Tabs: the TabsList inside a horizontal ScrollArea, one TabsTrigger per day showing the weekday above the date. Days without slots are disabled, with "Closed / full" in their accessible name. Keep the existing behaviour: the first day with slots is selected and arrow keys skip disabled days.
   - Staff filter: ToggleGroup type="single" with "Any" plus one per staff member. "Any" is the default and the group can't end up empty.
   - Times grouped as Morning, Afternoon and Evening with small headings. Each time is an outline Button (size sm, at least 44 px tall on touch), in a grid of 4 columns on mobile and 6 on desktop. Show the first 8 per group, then a ghost Button "Show all (N)".
   - Keep the aria-labels (day, time, service and staff) on the slot buttons and the Next button; if they don't exist yet, add them now.
3. States: ResultSkeleton.vue with Skeleton shaped like a card (aria-hidden, as now); ResultsEmpty.vue with the Empty component and the two action Buttons ("Widen to 50 km", "Try the next 7 days"); ResultsError.vue with an Alert (destructive variant) and a Retry Button. Keep the copy patterns: "Loading X…", "We couldn't X.", "No X."
4. The sort control is a Select (Distance, Earliest available, Price), shown only when there is more than one result, in the results header.
5. The list is a single column with gap-4. On large screens cards are at most max-w-3xl, so the slot grids don't stretch.
6. Results still dim while a changed search loads, now with opacity-80 (the earlier 60% failed contrast), and aria-busy stays.

You have no browser in this session, so do not claim anything is verified visually. Run typecheck, tests and build. End with a numbered list of what I must check by hand. `git diff main --stat -- src/server src/shared` must print nothing. Do not commit.
```

**Done when** (with `NOW=2026-10-22T08:00:00+02:00`)

- "massage" near Medborgarplatsen for 23–26 Oct: Salongens Massage first (about 1.0 km), then Massör Kungsholmen (about 3.5 km), never Studio Norr.
- Klassisk massage on Fri 23 Oct, Any: the morning starts 09:00, then 10:00. No 09:15, 09:30 or 09:45. With the "Anna" chip, the morning shows only 09:00.
- Herrklippning on Mon 26 Oct has no 10:00.
- Sun 25 Oct is a disabled day tab for venue 1.

**Check before committing**

- Times don't change with the DevTools timezone set to `America/New_York`.
- Day tabs work with the keyboard: arrows, Home, End, disabled days skipped, visible focus.
- 375 px: no sideways scroll on the page; only the day strip scrolls inside its own box.
- `grep -rn "slate-\|blue-\|#[0-9a-fA-F]\{3,6\}" src/client --include=*.vue` outside `components/ui` prints nothing.

**Commit:** `feat(client): shadcn-vue result cards, day tabs and slot grid`

---

## R3: Booking and confirmation (20 min)

```text
Read CLAUDE.md, docs/PLAN.md and docs/REDESIGN.md. Do task R3 only. Presentation only, plus the calendar file in item 4.

1. BookingDialog.vue becomes a responsive wrapper: Dialog when useMediaQuery('(min-width: 768px)') (from @vueuse/core) is true, Drawer otherwise. Put the content (summary, form, states) in one shared component, so there is one implementation of the form and its states. Keep ALL existing behaviour:
   - useMutation defined INLINE in the component that calls it, not in a hook file;
   - the idempotency key rules (a new key per opening, a new key when the body changes, the same key on an identical retry);
   - the synchronous double-click guard;
   - SLOT_TAKEN with the alternatives and the typed name kept; SLOT_IN_PAST and SLOT_INVALID with "Back to times"; a network error with "Try again";
   - focus: Reka UI traps and restores focus, so check that none of our own code fights it.
2. Content: the title "Confirm your booking"; a summary block (venue, service, staff or "First available", day and time, duration, price); the customer name in a Field with FieldLabel and FieldError, following the pattern proven in the R0 spike; a footer with Cancel (outline) and Confirm (primary, with a Spinner and "Booking…" while pending, disabled). Errors appear as an Alert. SLOT_TAKEN appears as an Alert with the alternative times as Buttons (outline, size sm).
3. BookingConfirmationPage.vue: a centred Card with the CheckCircle icon, the heading "You're booked", the reference (first 8 characters of the id, uppercase), the details, and two Buttons: "Add to calendar" (outline) and "Book another time" (primary, keeping ?back=). Not found: the Empty component with a link back. Other errors: an Alert with Retry.
4. src/client/lib/ics.ts: buildIcs(booking) returns a valid iCalendar string (VCALENDAR 2.0 with one VEVENT; UID {id}@booking.local; DTSTAMP; DTSTART and DTEND in UTC as YYYYMMDDTHHMMSSZ; SUMMARY "{service} at {venue}"; LOCATION the venue name; text escaped; CRLF line endings). "Add to calendar" downloads it as booking-{reference}.ics using a Blob and a temporary link. Add a unit test with hand-computed values: start 2026-10-23T13:00:00+02:00 gives DTSTART:20261023T110000Z, and a 60-minute service gives DTEND:20261023T120000Z. Write the expected values from this prompt, not from running the code.

You have no browser in this session, so do not claim anything is verified visually. Run typecheck, tests and build. End with a numbered list of what I must check by hand (the list from task 3.3 in docs/PLAN.md, plus: the Drawer at 375 px, the Dialog at 1280 px, and the downloaded .ics opening in a calendar app at the right time). `git diff main --stat -- src/server src/shared` must print nothing. Do not commit.
```

**Done when**

- Every check from task 3.3 in `docs/PLAN.md` still passes: book from "Next" and from the grid, reload the confirmation, double-click Confirm gives one entry in `.data/bookings.local.json`, and the two-tab conflict offers alternatives and completes.
- Below 768 px the booking appears as a bottom Drawer; at 768 px and up as a Dialog. Same content in both.
- The downloaded calendar file for a 13:00 Stockholm booking opens in your calendar at 13:00 Stockholm time.

**Check before committing**

- `grep -rn "useMutation" src/client` still finds it only in the booking component.
- Rotate or resize across 768 px with the dialog open: nothing breaks and the typed name isn't lost (if it is, report it; don't fix by guessing).
- Esc closes it, focus returns to the button you used, and the Drawer can be dismissed by dragging down.

**Commit:** `feat(client): responsive booking dialog and drawer, confirmation page, calendar file`

---

## R4: Cleanup and verification (10 min)

```text
Read CLAUDE.md, docs/PLAN.md and docs/REDESIGN.md. Do task R4 only: cleanup and consistency, no new features.

1. Remove dead code: components, classes and CSS from the old design that nothing imports any more (grep before deleting), any leftover /kit files, unused dependencies in package.json (check imports before removing), and shadcn-vue components added in R0 that nothing uses.
2. Token audit: grep src/client outside components/ui for raw colour values (#hex, rgb(, hsl(, oklch() and for Tailwind palette colours and opacity-modifier colours (for example bg-slate-, text-blue-, bg-primary/10), and replace each with a token, adding a named token to style.css where a translucent shade is really needed. Report anything you could not replace.
3. Re-check the accessibility points against the new components: visible focus on every interactive element, a label on every field, the aria-live results count, 44 px tap targets at 375 px, prefers-reduced-motion for the animations that come from tw-animate-css, and the Dialog and Drawer fitting the screen.
4. In docs/REDESIGN.md, fill in the section "Notes for DECISIONS.md" at the bottom with the actual new dependencies and anything that surprised you. Do not edit DECISIONS.md.

Run typecheck, tests and build. `git diff main --stat -- src/server src/shared` must print nothing. Do not commit.
```

**Done when**

- Typecheck, tests and build pass, and the token audit prints nothing outside `components/ui`.
- You've done one full pass on desktop and at 375 px: search, refine, book, conflict, confirmation, calendar file.

**Merge**

```bash
git checkout main
git merge --no-ff ui/redesign -m "feat(client): redesign with shadcn-vue and Anviil design tokens"
git push
```

---

## Notes for DECISIONS.md

Filled in during R4.

- **Trade-off:** the UI depends on shadcn-vue (copied-in components over Reka UI) in exchange for accessible, consistent primitives (focus traps, combobox, calendar, drawer) that would otherwise be hand-written and hand-tested.
- **New dependencies** (all in `package.json`, none removed in R4 because all are imported): `reka-ui`, `@vueuse/core`, `@lucide/vue`, `cn`, `class-variance-authority`, `@internationalized/date`, `tw-animate-css`, `@fontsource-variable/figtree`, `@fontsource-variable/geist-mono`. No `vaul-vue`, `clsx`, `tailwind-merge` or `sonner`.
- **Trade-off:** forms use shadcn-vue's `Field` components with vee-validate 5.0.0-beta.1 and the raw Zod schema, not the documented `FormField` wrappers with `toTypedSchema`, because the wrappers target vee-validate 4.
- **Cut:** dark mode (tokens ported, no toggle), translations, visual-regression and component tests.
- **Decision:** the calendar file is generated in the browser (`lib/ics.ts`), so the server has no new endpoint.
- **Deviation from Anviil's tokens:** `--input` is `oklch(0.6 0 0)` (Anviil 0.922, about 1.26:1 on white; now about 3.95:1) and `--ring` is `oklch(0.45 0 0)` (Anviil 0.708, about 2.59:1; now about 7.4:1), so field edges and the focus ring reach 3:1 (WCAG 1.4.11).
- **Surprises:**
  - `--brand`, `--brand-foreground`, `--accent-ember` and `--tint` are hex values in `style.css` (as in Anviil's file). That is the only place raw colours remain; components use the mapped tokens.
  - R0 added `calendar`, `command`, `native-select` and `textarea`, which nothing used; R4 deleted them, plus `InputGroupTextarea` (it imported `textarea`).
  - The base layer had `outline-ring/50`, an opacity modifier; changed to `outline-ring`.
  - shadcn's default sizes are under 44 px (`h-10`, `h-8` calendar cells, `h-7` sm buttons), so tap targets are raised at call sites with `h-11 md:h-…`. The calendar day cell in `ui/` was edited for the same reason.
  - The production bundle is over 500 kB (Vite warning); not split, as it is a test-sized app.
