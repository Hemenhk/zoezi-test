# AI usage

## Tools

- **Claude (chat)** for framing the problem and for writing `CLAUDE.md`, `docs/PLAN.md` and `docs/REDESIGN.md`.
- **Claude Code** to implement, one task at a time.

## Workflow

- One task per Claude Code session, with the task prompt taken from `docs/PLAN.md` or `docs/REDESIGN.md`.
- The expected slots in the plan were computed by hand and used as test oracles. The chat model also ran an independent Python simulation to check them, so there AI checked AI. Tests were never written by running the code and copying its output.
- I read every report and every diff.
- The backend and client tasks were committed one by one, after review. The redesign (R0 to R4) was reviewed task by task but committed afterwards, as two commits plus the merge.

## Where I overrode the AI

### 1. Task 1.2: a test that could not fail

- **What it did:** wrote a test for service 102 at 09:30 that only asserted Anna was not in a 09:30 slot.
- **What I did:** had it assert the exact slot starts before 10:00 (09:00 and 09:15, both Anna) and that 09:30 and 09:45 do not exist.
- **Why:** the original passed even if the engine returned no morning slots at all.

### 2. R2, result cards: green checks, broken layout

- **What it did:** produced a result card that passed typecheck, tests and the build but had never been rendered. In the browser the day tabs, staff filter and time grid sat side by side in one row, the time buttons overlapped, and the selected day tab was white text on white.
- **What I did:** opened it in the browser, wrote a layout spec (one stacked column, a readable selected state) and sent it back to be fixed.
- **Why:** typecheck, tests and the build cannot see layout. Only looking at the page did.

### 3. R1, the "What" field: select behaviour in a free-text field

- **What it did:** built the free-text search field on Reka's Combobox, which has select semantics, so typed text snapped to a suggestion. Its report said free text could still be submitted, but it had not run that in a browser.
- **What I did:** found it by typing in the browser. I required that the typed text always wins: no auto-highlight, no reset on blur, Enter submits what was typed.
- **Why:** the field needs autocomplete semantics, not select semantics, and the claim in the report had not been tested.

## Verification

The concurrency test (two simultaneous bookings for the same slot) was mutation-checked. I inserted an `await` between the availability check and the insert, and the test failed with two 201 responses. Then I restored the file. `npm test` currently passes with 114 tests, and `npm run typecheck` passes.
