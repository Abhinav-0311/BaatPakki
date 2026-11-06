# Gnani API integration reference

Original documentation review: 27 October 2026 (IST). Dashboard verification: 4 November 2026 (IST), through the signed-in in-app browser. No credentials were supplied, generated, or used for API execution. No application has been scaffolded.

## Live verification — 4 November 2026

- **Dashboard access:** signed-in speech dashboard opened successfully.
- **Balance:** billing explicitly shows **5,000 credits left**, **0 credits spent**, **₹0 purchase cost**, and no billing history.
- **API keys:** page permits **up to three keys** and shows an Add API Key button, with no existing key entries visible. No key was created or revealed.
- **Models:** the STT playground opens with **Gnani Prisma V3.0** selected. The TTS playground opens with **Timbre v3.0**, and its model selector also lists **v2.5**. Voice Cloning navigation is present. These observations establish UI availability, not a successful inference call.

| Service listed in Pricing | Price | Listed limit |
| --- | --- | --- |
| Prisma v3.0 / v2.5 REST STT | ₹20 per hour | 60 requests/minute |
| Prisma v3.0 / v2.5 Batch STT | ₹20 per hour | 60 requests/minute |
| Prisma v3.0 / v2.5 WebSocket STT | ₹20 per hour | 20 concurrent sessions |
| Timbre v3.0 / v2.5 TTS | ₹18 per 10,000 characters | 60 requests/minute |

Pricing states **one credit = ₹1**. Its FAQ says unused credits do not expire and insufficient credit causes API errors. The FAQ is general platform wording; no separate programme-credit expiry exception was visible. No separate cloning price, minimum billing increment, or tax treatment was established.

At the listed rates, 5,000 credits represent approximately **250 hours of STT OR 2.78 million TTS characters** if spent entirely on one service, before any unverified rounding/tax details. This agrees with billing's approximate 15,000 STT minutes / 27.8 lakh TTS characters. A mixed workflow shares the pool.

**Submission:** the official programme FAQ now explicitly says there is **no participant workspace**. Project details and the build go through a **submission form sent by email**. No public submission-form link was visible on the programme page. Whether this account has received that separate email remains unverified. The displayed deadline is **10 November 2026, 11:59 PM IST**.

**Version warning:** the API sections below are an October snapshot, chiefly Prisma v2.5. The live dashboard now advertises Prisma v3.0, including auto-detection and newer accuracy controls. Refresh the v3.0 endpoint/request contract before implementation; do not infer it from the v2.5 examples.

Live sources: [Billing](https://app.gnani.ai/voice/billing), [Pricing](https://app.gnani.ai/voice/pricing), [API Keys](https://app.gnani.ai/voice/api-keys), [STT playground](https://app.gnani.ai/voice/speech-to-text), [TTS playground](https://app.gnani.ai/voice/text-to-speech), [Programme FAQ](https://www.gnani.ai/internship#faq).

## Account and credits

The welcome email pasted by the user says the account is live with **₹5,000 complimentary credit**, shared across STT, TTS, and voice cloning. The balance was subsequently verified in the console on 4 November as recorded above. It is not 5,000 requests or 5,000 audio minutes.

The October documentation alone did not establish prices, expiry, or numerical rate limits; the November dashboard findings above now cover those points. Minimum billing increments and account-level successful inference remain unverified. Do not assume the speech credit pool includes hosted Evon or Agent Builder usage.

## API key and authentication

- Generate the speech API key in the [Gnani console](https://app.gnani.ai/voice), using the account that received the credits.
- Speech API origin: `https://api.vachana.ai`.
- Send `X-API-Key-ID: <key>` on authenticated speech requests. This is a custom header, not an `Authorization: Bearer` scheme.
- The current SDK uses one key for STT/TTS and does not require `organization_id` or `user_id`.
- SDK environment variable: `GNANI_API_KEY`. Direct HTTP code must read the variable and attach the header itself.
- The dashboard permits up to three speech keys. Key format, lifetime, rotation/revocation behavior, and permission controls remain unverified.

Implementation rules: keep the key in server-side environment variables or a secrets manager; exclude local secret files from Git. Never put it in browser bundles, public environment variables, URLs, screenshots, or logs. Authenticate and bound access to our backend so a public demo cannot spend the entire account balance.

Sources: [Speech introduction](https://docs.gnani.ai/api/introduction/introduction), [SDK introduction](https://docs.gnani.ai/python-sdk/introduction).

## Speech endpoint map

All paths below use `api.vachana.ai`; WebSockets use `wss://`.

| Function | Method and path | Input / output |
| --- | --- | --- |
| Short-clip STT | `POST /stt/v3` | Multipart audio → JSON transcript |
| Live STT | `WSS /stt/v3/stream` | Binary PCM → JSON speech-segment events |
| Create batch | `POST /stt/v3/batch/jobs` | Uploaded files/ZIP or public URLs → job ID |
| Start batch | `POST /stt/v3/batch/jobs/{job_id}/start` | Starts a created job |
| Batch status | `GET /stt/v3/batch/jobs/{job_id}` | Progress and status |
| Batch results | `GET /stt/v3/batch/jobs/{job_id}/files` | Per-file result URLs |
| List batches | `GET /stt/v3/batch/jobs` | Cursor-paginated jobs |
| Cancel batch | `POST /stt/v3/batch/jobs/{job_id}/cancel` | Cancellation request |
| Full-response TTS | `POST /api/v1/tts/inference` | JSON → binary audio |
| Streaming TTS | `POST /api/v1/tts/sse` | JSON → SSE with base64 audio |
| Realtime TTS | `WSS /api/v1/tts` | JSON request → JSON/base64 audio events |
| Voice embedding | `POST /api/v1/tts/voice-clone/embeddings` | Multipart reference audio → embedding |

Voice-cloned synthesis reuses the three TTS routes with a different model and a speaker embedding.

Sources: [Quick start](https://docs.gnani.ai/api/introduction/quick-start), [Batch endpoints](https://docs.gnani.ai/api/STTBatch/Introduction).

## Prisma: speech to text

### REST

Send `audio_file` and `language_code` as multipart fields. Supported uploads: WAV, MP3, OGG, FLAC, AAC, M4A. Maximum duration is **60 seconds**, ideally at most 30 seconds. The quick start specifies 8–44.1 kHz for REST test audio; do not assume live-stream rate support applies identically to file uploads.

Response: `success`, `request_id`, `timestamp`, `transcript`. This is transcription, not a documented general-purpose translation endpoint.

Useful controls:

- `format=verbatim`: spoken-form text; `format=transcribe`: inverse text normalization for numbers, money, dates, and similar entities.
- `itn_native_numerals=true`: native-script digits when normalization is enabled.
- `enable_substitution` + JSON-encoded `substitution_map`: up to ten post-recognition replacement rules. This changes returned text, not the recognizer.
- `bias_list` + positive `bias_score`: recognition-time word boosting. Up to 100 single words, letters only; allowed scores `0`, `0.5`, `1`, `1.5`, `2`.

Malformed boosting may be silently ignored even with HTTP 200. Excessive boosting can introduce words that were never spoken. Substitution is not evidence that recognition improved.

Source: [STT REST](https://docs.gnani.ai/api/STT/speech-to-text).

### Languages

The REST/realtime tables list ten codes total, including English:

| Language | Code | Language | Code |
| --- | --- | --- | --- |
| Hindi | `hi-IN` | English | `en-IN` |
| Bengali | `bn-IN` | Gujarati | `gu-IN` |
| Kannada | `kn-IN` | Malayalam | `ml-IN` |
| Marathi | `mr-IN` | Punjabi | `pa-IN` |
| Tamil | `ta-IN` | Telugu | `te-IN` |

The REST page documents English–Hindi mixed audio under `en-IN` with Latin-script output. Test actual Hindi/Hinglish recordings and the desired output script; do not infer every code-mixed pair from marketing language. A live session has one configured locale.

Sources: [STT SDK language/session behavior](https://docs.gnani.ai/python-sdk/speech-to-text), [STT REST](https://docs.gnani.ai/api/STT/speech-to-text).

### Realtime protocol

Upgrade headers include `x-api-key-id`, `lang_code`, and optionally `x-sample-rate`. Supported source rates: 8,000, 16,000, 44,100, 48,000 Hz.

Audio must be mono signed 16-bit little-endian PCM, sent in **1,024-byte frames** at real-time cadence: 32 ms at 16 kHz, 64 ms at 8 kHz. WAV headers and compressed MP3/WebM chunks are unsuitable. Higher-rate sources are resampled by the server, but their frame pacing must match the source rate.

Events: `connected` → `processing` → `transcript`; also `error` and `settings_updated`. Transcripts arrive per completed speech segment, not as a documented continuous partial-word feed. Preserve segment IDs/indexes to order and deduplicate results.

The documented session cap is **15 minutes**. VAD controls include speech threshold, minimum silence/speech/segment length, and maximum uninterrupted speech length. Most connection settings require reconnecting; substitution and word boosting can change through `update_settings`.

Browser WebSockets cannot attach the required custom headers. Use a backend proxy. The docs also say the Python SDK does not expose VAD tuning; use the raw protocol if tuning is necessary.

Source: [STT realtime](https://docs.gnani.ai/api/STT/stt-websocket).

## Batch transcription

### Submission and configuration

Create → start → poll → list results → download transcripts. Raw REST creation alone leaves the job in `CREATED`; the Python SDK starts automatically unless `start=False`.

Use `config.model="gnani-prisma-v2.5"`, `language_code`, and optional `mode`, `with_diarization`, `num_speakers`, `is_multi_channel`, `with_denoise`, `bias_list`, `bias_score`. Upload `config` as a JSON form field alongside `files`, or send JSON with `source.type="cloud_storage"`, `source.auth.mode="public"`, and `source.paths`.

Public HTTPS/presigned URLs work; authenticated private-bucket access is not documented as supported. URL validation occurs when starting, so a successful create does not establish that the audio is reachable. Folder-like paths can expand into many billable recordings.

The create reference specifies speaker upper limits of 1–8, default 5; older use-case guides say two speakers. Treat more than two as unverified. Batch word boosting is documented in the batch reference despite contrary wording on the REST page.

Source: [Create Job](https://docs.gnani.ai/api/STTBatch/Create_Job).

### Limits and results

Per file: 0.1 seconds–4 hours, at most 5,000 speech segments. Direct upload: 100 files/job, 10 MB/file; ZIP caps are 50 MB compressed and 200 MB expanded, with a 50:1 ratio ceiling. Cloud-source documentation lists no byte/file-count cap, but a 30-minute download timeout and the same audio-duration limit.

Batch supports more containers than short-clip REST, including MP4, Opus, WebM, and AMR. Verify decoding on our real samples.

Language identification can choose one language per file from up to three supplied codes; it is not per-segment language switching. The batch language table includes Gujarati/Punjabi while an adjacent note excludes them. Verify those locales before using batch.

Optional denoising runs before transcription and diarization, adds processing time, and may fall back to the original audio if unavailable. Poll at least ten seconds apart, preferably thirty for large jobs. Webhooks are best-effort; status polling remains authoritative.

Source: [Batch introduction](https://docs.gnani.ai/api/STTBatch/Introduction).

Status and `/files` responses do not contain the transcript text. Download each `transcript_url` and read `full_transcript` and timestamped `segments`. These URLs expire after **one hour**; refresh them via `/files`. They are presigned and do not require the API key: do not forward that key to the storage host. Handle cursor pagination and individual failed/skipped files.

Terminal statuses include `COMPLETED`, `PARTIAL_FAILURE`, `FAILED`, `START_FAILED`, `CANCELLED`. A partial failure can still contain useful successful files. Cancelling a running job is asynchronous; it is not a documented refund mechanism.

Sources: [Get Job Files](https://docs.gnani.ai/api/STTBatch/Get_Job_Files), [Status](https://docs.gnani.ai/api/STTBatch/Get_Job), [List](https://docs.gnani.ai/api/STTBatch/List_Jobs), [Cancel](https://docs.gnani.ai/api/STTBatch/Cancel_Job).

## Timbre: text to speech

### Models, voices, and controls

Detailed endpoint references support **`timbre-v3.0` and `timbre-v2.5`**. Always send an explicit model and matching voice. The older introduction's v2.5 recommendation does not mean v3.0 is unavailable.

- v3.0: 13 voices, each documented to speak all ten listed languages; examples `Shivani`, `Avinash`, `Lakshmi`.
- v2.5: 42 voices with preferred locales; examples `Nalini` for Hindi, `Kaveri` for English, `Poorvi` for Hinglish.

Voices cannot be exchanged between model versions. Select by listening to real outputs rather than trusting the persona descriptions.

Core request fields: `text`, `model`, `voice`, `language`, `speed`, `audio_config`. Speed range: 0.85–1.15. TTS references list BCP-47 locales, `auto`, and `hi-en`; the normalization guide uses short codes, so locale handling needs a smoke test.

REST success returns binary audio, not JSON. Some generated JavaScript snippets incorrectly use `res.json()`; consume bytes/ArrayBuffer and validate the HTTP response first.

Sources: [TTS REST](https://docs.gnani.ai/api/TTS/tts-inference), [Voice catalog](https://docs.gnani.ai/api/TTS/available-voices).

### Expressive audio tags

v3.0 supports `<laugh>`, `<giggle>`, `<sigh>`, `<exhales>`, `<sniffles>`, `<yawns>`, `<coughs>`, `<clears throat>`, `<whispers>`, `<shouting>`, `<excited>`, `<slow>`, `<pauses>`.

Tags are case-sensitive and inline, without closing tags. Unknown tags are silently stripped; v2.5 strips audio tags. Tag-only requests are rejected. These are expressive generation controls, not a documented emotion-recognition API or proof of general SSML compatibility.

Source: [Audio Tags](https://docs.gnani.ai/api/TTS/tts-audio-tags).

### Text normalization

The dedicated normalization guide says numbers, currencies, dates, IDs, abbreviations, and common initialisms are normalized automatically. Older synthesis prose still asks for preformatted spoken words. Test amounts, phone numbers, dates, and identifiers before deciding whether any application formatting is necessary.

`auto` relies on script: Latin-only digits/text select English; Devanagari defaults to Hindi, so Marathi needs an explicit hint. The guide rejects literal `hinglish` as a language value even though the synthesis reference documents `hi-en`.

Source: [Text Normalization Guide](https://docs.gnani.ai/api/TTS/tts-input-formating).

### Streaming and output formats

SSE is a **POST**, with `start`, `chunk`, `complete`, and possible `error` events. Decode each chunk's base64 `audio` in order. Use a streaming HTTP reader/SDK; browser `EventSource` is not the documented POST interface. Network read boundaries are not necessarily complete SSE events.

Formats include WAV, raw PCM, MP3, OGG Opus, and G.711 µ-law/A-law. G.711 forces 8 kHz. **OGG is delivered only after synthesis completes**, even on the streaming routes, so it does not provide progressive playback.

Source: [TTS SSE](https://docs.gnani.ai/api/TTS/tts-sse).

TTS WebSocket accepts a synthesis JSON message, then emits `start`, `audio`, `complete`. Audio is in **`data.audio` as base64**, not bare binary frames. Consume one request fully before sending another. Configure mono/16-bit audio explicitly and match the playback rate to the returned audio. Supported TTS rates: 8,000, 16,000, 22,050, 24,000, 44,100, 48,000 Hz.

Source: [TTS realtime](https://docs.gnani.ai/api/TTS/tts-websocket).

## Voice cloning

Upload approximately 5–30 seconds of clear reference speech under `audio_file` to the embedding endpoint. Cache the resulting embedding for reuse. The schema nests it at `data.voice_clone_embedding`, whereas the quick start shows an unwrapped example: inspect the actual response before extracting it.

Source: [Voice Clone Embeddings](https://docs.gnani.ai/api/VC/voice-clone-embeddings).

Synthesis uses `model="vachana-vc-v1"`, `text`, `audio_config`, and `speaker_embedding` containing `embedding`, `shape`, `dtype`. Example shape: `[1,768]`; preserve returned metadata rather than manufacturing it. Start with the documented 44.1 kHz mono WAV configuration; do not assume every Timbre output setting transfers unchanged to cloning.

Source: [Cloned TTS REST](https://docs.gnani.ai/api/VC/vc-inference).

Cloned SSE follows the TTS SSE event structure. Cloned WebSocket follows JSON/base64 `data.audio` framing. The old quick-start binary-WebSocket comment conflicts with the dedicated reference. Use a consenting reference speaker and keep reference recordings and embeddings private.

Sources: [Cloned SSE](https://docs.gnani.ai/api/VC/vc-sse), [Cloned realtime](https://docs.gnani.ai/api/VC/vc-websocket).

## SDKs and integrations

Official Python package: `gnani-vachana`; imports use `gnani.stt` / `gnani.tts`. Clients cover REST/live STT, sync/async batch, and REST/SSE/WebSocket TTS. The docs disagree on Python 3.9 versus 3.10; Python 3.10+ satisfies both stated minimums.

The SDK TTS guide warns its default may still be retired `timbre-v2.0`. Set the model explicitly, and verify the installed SDK accepts v3.0 and its voices before choosing it over direct HTTP. No SDK was installed during this review.

Sources: [SDK introduction](https://docs.gnani.ai/python-sdk/introduction), [TTS SDK](https://docs.gnani.ai/python-sdk/text-to-speech).

Batch SDK docs require version **0.8.1+** for rate-limit retries. They document retries for 429 using `Retry-After`, or exponential waits; selected read operations also retry 502/503/504. Do not assume all clients/mutations have identical retries. A client-side timeout can leave a batch running; retain its ID and inspect status before creating another.

Source: [Batch SDK](https://docs.gnani.ai/python-sdk/speech-to-text-batch).

Optional integrations: `livekit-plugins-gnani` implements Gnani speech transports directly; `pipecat-gnani` adapts the Python SDK. Both document Python 3.10+. These help if our selected product needs a voice-agent framework; they are not mandatory for ordinary HTTP/WebSocket integration.

Sources: [LiveKit](https://docs.gnani.ai/livekit/introduction), [Pipecat](https://docs.gnani.ai/pipecat/introduction).

## Reasoning and Agent Builder are separate concerns

Prisma transcribes; Timbre synthesizes. Summaries, intent extraction, reasoning, application actions, and sentiment require our logic and/or an LLM. Batch result examples contain nullable sentiment/emotion/confidence fields; do not present them as populated native analytics. The call-analytics guide explicitly places sentiment in its LLM step.

Sources: [Call analytics](https://docs.gnani.ai/api/use-cases/call-analytics), [Podcast guide](https://docs.gnani.ai/api/use-cases/podcast-transcription), [Realtime monitoring guide](https://docs.gnani.ai/api/use-cases/real-time-compliance).

**Evon v3.3:** the official hosted-API page advertises a selected closed beta, with general availability still to be announced. The speech welcome email does not establish access. Open weights are a separate deployment option; do not invent a public hosted endpoint or assume this key works with OpenAI-style chat completions.

Sources: [Evon API access](https://www.gnani.ai/evon-waitlist), [Gnani model card](https://huggingface.co/gnani/gnani-evon-v3.3-30B-A3B).

**Agent Builder Platform API:** separate origin `https://api.inya.ai/platform`, header `x-api-key`, and `agents`/`conversations` permission scopes. It manages agents, FAQ knowledge, configuration, calls, logs, statistics, and widget configuration. Do not substitute this header/key contract for the speech API. Its LLM-model listing is agent configuration discovery, not a direct reasoning inference endpoint.

Sources: [Platform introduction](https://docs.gnani.ai/Platform/platform-introduction), [Get LLM Models](https://docs.gnani.ai/Platform/Get_LLM_Models).

## Checks before implementation depends on the API

1. Confirm dashboard balance, model access, prices, credit expiry, and quotas; generate a speech key and store it server-side.
2. Run one short Hindi/Hinglish transcription and inspect the returned script and normalized numbers.
3. Run one matching Timbre v3.0 voice request; verify playback and inspect the credit deduction.
4. If live interaction is needed, test PCM conversion, pacing, VAD, final-segment delivery, reconnects, and latency on the actual microphone/browser.
5. If batch is needed, check per-file failures, signed-link expiry, target languages, diarization limits, and word boosting against the contradictory docs.
6. Verify the cloning response envelope only if cloning is part of the chosen project.

Handle 400/401/403 as input/auth/access problems; 403 may include insufficient credits. Back off on 429 and transient server failures. Do not blindly replay billable synthesis or job creation after an ambiguous timeout. Log request IDs without secrets or sensitive audio content. Treat quoted latency as a vendor claim until measured end to end.

The next step is to choose a use case around the documented capabilities, then run the smallest relevant live checks. No application stack, feature set, dependency installation, or paid API execution was selected here.
