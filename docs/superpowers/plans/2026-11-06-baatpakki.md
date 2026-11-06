# BaatPakki Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Deliver the agreed local AC-service voice intake and confirmation workflow.

**Architecture:** React/TypeScript workspace, same-origin Node/Express server, shared Zod domain contracts, built-in Node SQLite. Direct Gnani STT/TTS HTTP and a local guided Hindi/Hinglish parser, with an explicitly labelled sample walkthrough when keys are absent.

**Tech Stack:** Node 24+, React, Vite, TypeScript, Express, Zod, node:sqlite; node:test via tsx.

**Spec:** ../specs/2026-11-06-baatpakki-design.md

## Global Constraints

- Prisma v3.0 recordings: mono 16-bit WAV at 16 kHz, no longer than 30 seconds; recorder stops below the cap.
- Timbre v3.0 with a matching Shivani voice. Backend-only credentials.
- Asia/Kolkata dates; money means maximum budget, not quoted price.
- Customer-confirmed requests await business acceptance.
- No live-provider success claims from offline or stubbed tests.

## Review Focus

- Unquoted or invented AI changes must not overwrite customer instructions.
- Concurrent edits and stale confirmations must not confirm a different version.
- A yes-but utterance must not pass as confirmation.
- Malformed WAV data must be rejected before a billable call.
- One browser session must not read another session's job card.

### Task 1: Domain and confirmation

Files: shared/domain.ts, tests/domain.test.ts. Produces Draft, Change, applyChanges, getMissing, readback, markReviewed, confirmDraft contracts consumed by server/UI.

- [x] Write regression assertions for correction evidence, preserved restrictions, ambiguous time, budget validation and stale confirmation; run and observe failure.
- [x] Implement validated field changes and versioned review/confirmation; run the domain tests.

### Task 2: API, speech and persistence

Files: server/app.ts, server/providers.ts, server/store.ts, server/index.ts, tests/api.test.ts, tests/providers.test.ts. Consumes Task 1 domain contracts. Produces session-owned JSON endpoints and validated WAV/binary speech responses.

- [x] Write tests for session isolation, stale updates, review/confirmation, persistence, missing credentials, audio validation and provider requests; observe missing-feature failures.
- [x] Implement bounded input, same-origin routes, rate limits and SQLite snapshots; verify the API tests without spending live credits.

### Task 3: Browser workspace and recorder

Files: src/App.tsx, src/audio.ts, src/styles.css, src/main.tsx, index.html, tests/audio.test.ts. Consumes domain contracts and Task 2 endpoints.

- [x] Write WAV/resampling assertions, run RED, implement the recorder and PCM encoder.
- [x] Implement conversation, editable job card, source quotes, review, audio retry, saved revisions and print; show loading/errors and sample/live state honestly.
- [x] Run typecheck/build, start locally and inspect desktop/mobile browser flows.

### Task 4: Delivery and review

Files: README.md, docs/SOLUTION_PITCH.md, docs/DEMO.md.

- [x] Document setup, required keys, supported workflow, one-page pitch, 2–3 minute demo outline and real verification limits.
- [x] Run the complete tests/build. Get one fresh review, fix significant issues and rerun affected checks.
- [x] Keep the work locally reviewable; no deployment, form submission or shared-branch push.


## User-approved scope update

The user chose Gnani only with narrower automatic extraction. The implementation uses a local guided parser, no Gemini/other text model or key. Unknown phrasing and ambiguous times require clarification/manual edits. Real provider smoke test succeeded on a synthetic 7.44-second Hindi TTS-to-STT round trip on 6 November. Physical microphone input remains to be verified.

## Verification ledger - 6 November 2026

- 25 automated tests pass; TypeScript and Vite production build pass.
- Fresh final review completed; fixed stale request identity checks, development-file exposure, parser ambiguity/budget handling, retained questions, WAV validation and audio cancellation. Regression checks pass.
- Desktop and 390px mobile browser checks: typed intake, time correction, ambiguity, manual edits, explicit acknowledgement, review, confirmation, immutable saved revisions and persistence. Mobile header controls retain accessible names.
- Real development HTTP checks deny database, journal, encoded data path, Vite filesystem path, environment file and artifacts (404), while the UI serves (200).
- Actual /api/voice with synthetic Timbre audio passed through Prisma and local parsing: 18:00, maximum budget 800, preserved approval instruction. Physical microphone and noisy human speech remain unchecked.
- Turning off spoken replies during pending synthesis cancels browser playback and restores input. No late audio appeared.
- Local-only delivery; no deployment, public posts, shared-branch push or submission.
