# BaatPakki: customer-confirmed AC service requests

The user authorised implementation with “lets start then” after the detailed in-chat proposal. Implement one customer-facing Hindi/Hinglish AC-service intake flow. Customer confirmation records their instructions; the business still has to accept the visit.

## Product contract

- Short recording or typed turn -> transcript -> proposed field changes -> application validation -> clarification/readback -> explicit confirmation -> saved printable card.
- Preserve restrictions, corrections and budget limits. Never infer a technical diagnosis or quoted price.
- Capture name, callback number, address, problem, requested work and requested visit. Budget and restrictions are optional but all stated conditions must survive.
- Material edits invalidate review and confirmation. A stale review version cannot confirm. “Yes, but...” is a correction, not confirmation.
- Each AI field change carries an exact quote from a stored transcript. Invalid or missing evidence rejects the whole proposed update. Manual edits are labelled as manual.
- Guided questions and the final Hindi readback come from validated state. No generative summarisation of the final card.
- Dates are resolved in Asia/Kolkata. Ambiguous times and dates require clarification; budget is stored as integer rupees and labelled maximum, never a quote.
- Store confirmed revisions in SQLite. Drafts recover in the same browser session; source audio stays in that browser and is not persisted on the server.

## Approaches

Choose customer-facing intake over staff-only transcription because the customer can review and correct the resulting card. Choose short recorded WAV turns over continuous WebSocket streaming because confirmation correctness is the first release's main risk. Use direct speech HTTP calls and local rule-based extraction. Use a clearly labelled, opt-in saved example for offline walkthroughs; arbitrary real input never silently switches to sample extraction.

## Interface

Quiet ivory paper, ink typography, restrained vermilion accent. Conversation at left, paper job card at right. All essential information stays visible; a small step indicator communicates request -> review -> confirmation. Avoid charts, decorative metrics, and sidebar navigation. Include loading, empty, failed request, retry, focus, hover, reduced-motion and narrow viewport states. Typed input and manual editing remain available without microphone or credentials.

## Boundaries

Local single-business application, bound to loopback by default. No dispatch, payment, WhatsApp, real calls, calendars, voice cloning or public publishing. Server-side keys only. Session-isolated state, same-origin write checks, bounded JSON/audio input, request-rate limits, network timeouts, no secret logging. No external publication or push to main without a separate request.

## Evidence and acceptance

Test correction safety, restrictions, budget-vs-price, evidence failures, malformed model output, missing/ambiguous fields, stale review, yes-but, persistence, session isolation, malformed WAV and upstream failures. Build and typecheck. Check browser flow at desktop/mobile widths, manual corrections, confirmation reset, reload, print and offline disclosures. Real speech and extraction require locally supplied keys; do not claim live verification without it.


## User-approved scope update

The user chose Gnani only with narrower automatic extraction. The implementation uses a local guided parser, no Gemini/other text model or key. Unknown phrasing and ambiguous times require clarification/manual edits. Real provider smoke test succeeded on a synthetic 7.44-second Hindi TTS-to-STT round trip on 6 November. Physical microphone input remains to be verified.
