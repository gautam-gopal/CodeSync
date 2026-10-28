# CodeSync Roadmap

Status: DRAFT v0.2.1, reconciled with ChatGPT's review (section 8). Items marked PENDING need owner approval before this is the approved plan. 2026-10-28. Planner: Claude. Reviewer/implementer: ChatGPT. Owner: Gautam.

How this file works
- It holds the plan and task status only. Decisions and verified state live in PROJECT.md.
- Detail is proportional to proximity: M1 (remaining) and M2 are full task cards; M3-M5 are one-line tasks that get expanded into cards when they become next; M6 is an evaluation list, not a commitment.
- Completed milestones collapse to one line. Keep this file under about 600 lines. No historical sections.
- Labels: [verified] seen in evidence; [assumption] not confirmed; [new] new recommendation; [revised] changes an earlier decision.

---

## 0. Where we are (from the owner's report; I have not inspected the repo)

Proven by the spike [verified]: Yjs state stored in MongoDB via Hocuspocus Database extension; recovery after collab restart; later edits persisted.

Done in the CodeSync repo [verified by owner]: scaffold (a2524c7), Mongo via Docker Compose (port 27019), collab server with JWT auth hook and Mongo persistence adapter, 14 unit tests passing (10 auth, 4 persistence), clean start and graceful shutdown.

Not yet proven anywhere: register/login API; real client; JWT-authenticated provider syncing two clients; persistence with auth in the loop; roles; execution; deployment; any measured number. Unit tests plus a server that starts are not an end-to-end result.

Retain everything built so far. No structural change to the scaffold is recommended.

---

## 1. Product scope

MVP user stories
- U1 Register, log in, log out.
- U2 Create a room (creator becomes owner) and see my rooms.
- U3 Owner adds a registered user to a room by email as editor or viewer; changes roles; removes members. Members can leave.
- U4 Open a room and edit one shared file together with live cursors/names; viewers see changes but cannot edit.
- U5 Work survives a collab-server restart and reload.
- U6 Editors/owner pick a language and run the code; the runner sees stdout/stderr/status.

MVP boundary: one file per room; five languages; add-by-email membership; output visible only to the person who ran it.

Non-goals (not built unless promoted later): multi-file projects/file tree, chat/voice, OAuth/social login, email verification, password reset, refresh-token rotation, invite links, shared run output, version history/replay, room deletion UI, mobile layout, Kubernetes, Nginx.

Earliest genuinely usable version (critical path): M1-B..E, then M2-1, M2-2 (add member), M2-3, M2-5. Result: register, log in, create/open a room, edit with another authenticated member, recover after restart. M2-4 (live revocation) is not on the critical path to the first usable local version, but it is a hard prerequisite for any public deployment (section 6).

---

## 2. Architecture

Components
| Component | Responsibility | Never does |
|---|---|---|
| client (React, Vite, Monaco, y-monaco, HocuspocusProvider) | UI, holds access token in memory, shows state | Decides authorization |
| api (Express, Zod) | register/login, rooms, membership, run endpoint, signs JWTs | Syncs documents |
| collab (Hocuspocus) | verifies JWT, checks room membership, applies role (read-only), persists Yjs state | Issues tokens, runs code |
| MongoDB | users, rooms, documents | n/a |
| Judge0 (external or self-hosted) | sandboxed execution | Receives traffic from the browser |

Data model [new]
- users: _id, email (unique, lowercased), passwordHash, displayName, createdAt.
- rooms: _id (ObjectId, also the Yjs documentName), name, members: [{userId, role: owner|editor|viewer}], createdAt. `members.userId` is an ObjectId (same type as `users._id`). The JWT `sub` and the Yjs documentName arrive as strings: validate with a strict 24-hex check (ObjectId.isValid also accepts any 12-character string) and convert once at the boundary; never compare a string to an ObjectId (it fails closed and denies everyone). Exactly one owner for the life of the room: no transfer; the owner cannot leave, be removed or demoted; the API never accepts `owner` as an input role (only editor|viewer). Room deletion is a non-goal, so an owner who wants out removes the other members. Roles live only here, never in the JWT.
- documents: documentName (unique), Yjs binary state (existing adapter, reused).
- Limits to bound abuse: rooms per user, members per room, name lengths (numbers chosen at M2).

Trust boundary and authorization flow
client claims (token, roomId) -> collab/api verify signature, expiry, algorithm -> identity = token `sub` -> membership lookup in MongoDB -> role -> permission. The client never supplies a role. Authentication (who) and authorization (what on this room) are separate steps; M1 has the first only.

Authentication details
- Passwords: bcrypt, cost 12 (check timing on your machine); length 8-72 bytes because bcrypt truncates at 72 bytes; email normalized lowercase; unique index.
- Login: same generic error for unknown email and wrong password; compare against a dummy hash for unknown emails; rate limit on auth endpoints.
- JWT: HS256, claims `sub` (user id), `iat`, `exp`; default lifetime 1 hour, configurable [new]. Verify with the algorithm pinned. Secret from env, minimum length enforced at startup. No refresh tokens in MVP: ShopSphere already claims rotating refresh tokens, so CodeSync's time is better spent on authorization and real-time. On expiry the client sends the user to login. An established WebSocket is not ended by token expiry, so collab records `exp` at connect and closes expired connections at its periodic re-check (M2-4).
- Token transport: held in memory; passed through the provider's token option as a function so reconnects use the current token; never in a URL.

Synchronization and persistence guarantees
- Yjs CRDT merges concurrent edits; document persistence is debounced (250 ms, max 1000 ms) full-state upsert.
- Server up: persistence is debounced. The target is maxDebounce plus write time (about 1 s with current settings); it is a target, not a guaranteed deadline, and is measured before it is claimed. Provider `synced` events show handshake and convergence, not durable storage. Graceful shutdown flushes. Hard kill: edits inside the persistence window can be missing from the server, but any tab still open holds them and re-syncs on reconnect, so loss requires the server to die and every client to go away. Testable (M2-6) and a strong interview point.
- Resource lifecycle: Hocuspocus unloads a document from memory when its last client leaves [assumption: verify on the pinned version]. Enforce a maximum document size in the store path [new].
- Known property: awareness (cursor name/color) is client-asserted and can be spoofed by a member. Document it; do not build mitigation in MVP.

Code execution design (M3)
- Browser -> api `/rooms/:id/run` -> Judge0. Never browser -> Judge0.
- Server checks: valid JWT, membership with role owner/editor (viewers cannot run [new]), language in allow-list, source and stdin size caps, per-user rate limit, explicit Judge0 limits (CPU time, memory, output size), polling timeout, output truncation. Judge0 credentials only in server env.
- Provider code isolated in one adapter module so the provider can change without touching routes.
- Language is held in a Y.Map on the document so it syncs live; it is not authoritative, the server re-validates against the allow-list on every run [new].

WebSocket notes
- Token travels in the provider's auth message, not in cookies, so cross-site WebSocket hijacking does not apply the way it does for cookie auth. Still restrict allowed Origins in production (M4).

---

## 3. Milestones and tasks

### M1: Vertical slice (current)

M1-A Scaffold, collab server, auth hook, persistence adapter, 14 unit tests. DONE (unit-level only).

M1-B Collab integration test
- Purpose: prove at server level what unit tests cannot: two authenticated clients converge; bad tokens/ids are rejected; persistence survives restart.
- Needs: M1-A. Touches: collab/test.
- Design: a permanent test (not a throwaway script) using @hocuspocus/provider in Node, real MongoDB, `startServer(overrides)` with an ephemeral port and a test database name, JWTs minted with the test secret.
- Tests/acceptance: (1) two tokens, same document: convergence is asserted from provider sync/update events; (2) no token, malformed, expired, wrong signature, different algorithm, invalid documentName each rejected AND no document row created for rejected attempts; (3) persistence is asserted separately by reading MongoDB directly (bounded poll-until with a timeout, no fixed sleeps) and decoding the stored state; then graceful stop, restart, a new client sees the content, and a post-restart edit is also confirmed in MongoDB; (4) isolated test database and ports, and every provider, server and Mongo client closed in teardown (no leaked handles).
- Security: rejection happens before any document is loaded or created.
- Learn: Hocuspocus connection lifecycle, Yjs sync handshake, deterministic async tests.
- Note: the integration patch you have not applied should be judged against this card. Apply it only if it matches, adapt it if close. Do not keep a separate harness alongside.

M1-C Register/login API
- Needs: M1-A config conventions. Touches: api.
- Design: `createApp({db, config})` factory for testability; Zod validation; users unique index; bcrypt; generic login error; JWT as in section 2; `GET /me`; helmet; JSON body limit (about 10 kb); central error handler without stack leaks; in-memory rate limit on register/login; CORS through an explicit allow-list from `CLIENT_ORIGIN` (Vite dev origin locally, the deployed client later; no wildcard; the token travels in the Authorization header, so credentialed CORS is not needed). Chosen over a Vite proxy so dev and production exercise the same code path. Api tests are added to the root `npm test`.
- Tests: register ok; duplicate email (case-insensitive) rejected; invalid email/password rejected; password >72 bytes rejected; login ok/wrong/unknown give the same status and body; response never contains the hash; token has expected claims; root `npm test` exits non-zero when an api test fails (prove once with a deliberately failing test, then remove it).
- Security: no secrets in logs; timing equalization for unknown users.
- Learn: password hashing trade-offs, JWT claims/expiry, input validation, rate limiting.

M1-D Client slice
- Needs: M1-B, M1-C. Touches: client.
- Design: login/register page; token in React context (lost on reload by design); `/doc/:id` page; "New document" generates a random 24-hex id client-side (temporary until M2); Monaco bound via y-monaco to `ydoc.getText('monaco')`; provider uses a token function; auth rejection returns user to login; effect cleanup destroys binding, provider and doc; api and collab URLs come from `VITE_` variables in a client-only env template.
- Tests: manual checklist (two browser profiles); no heavy UI test framework yet.
- Acceptance: M1 criteria 4 and 6 in PROJECT.md.
- Learn: React effect lifecycle with external resources (StrictMode double-invoke), the Yjs binding, the WebSocket auth handshake.

M1-E Verify and log
- Run PROJECT.md M1 criteria 1-10; write the milestone-log entry (what was verified, what was not, limitations). Answer the five explain-back questions (where implemented, how it works, why, failure cases, how tested).
- Claude focused review #0 (auth and token handling only: collab auth hook, JWT config, api auth code, client token handling, M1-B output; about five files).
- Optional M1.5: restricted deployment exercise per PROJECT.md section 6 (registration disabled, throwaway DB, no real content). Time-box it.

### M2: Rooms, membership, roles (gate for any public deployment)

M2-1 Rooms API
- Needs: M1. Touches: api, MongoDB.
- Design: rooms collection as in section 2; create room (creator = owner); list my rooms; get room (members only; non-members get 404, not 403, to avoid existence leaks); limits enforced.
- Tests: create/list/get; non-member sees nothing; limits.
- Security: authorization derived from the server-side members array, never from request data.

M2-2 Membership API
- Needs: M2-1.
- Design: add member by email (owner only; existing users only; role editor|viewer); change role (editor|viewer only; `owner` is never accepted as input); remove member; leave (non-owners only). The owner cannot leave, be removed or demoted: the api returns 409 with a clear message and the UI hides the action; transfer and room deletion are non-goals. Invariants (one owner; owner cannot be removed/demoted; no duplicates) are re-checked in the database write filter, not only in controller code, so concurrent requests cannot break them.
- Tests: each operation by owner, editor, viewer, non-member; concurrent add/remove; invariant violations rejected; owner leave/remove/demote rejected; assigning `owner` rejected; id handling (valid 24-hex converts, malformed and 12-character strings rejected, positive membership lookups succeed so a string/ObjectId mismatch cannot hide).
- Learn: conditional writes in MongoDB, authorization matrices (write the matrix as a test table).

M2-3 Collab authorization
- Needs: M2-1; M1-B test harness. Touches: collab.
- Decision [new]: collab reads membership directly from MongoDB through one small module (alternative: call the api per connection). Trade-off: simpler and one less network hop, but collab is coupled to the rooms schema; isolating the lookup in one module limits the coupling.
- Design: in the auth hook, after JWT verification: look up the member by `sub`; reject non-members with a generic error; set `connection.readOnly = true` for viewers (documented Hocuspocus mechanism [verified in docs]); return `{userId, role}` as context. The store path writes only for documents whose room exists, so a stale connection cannot recreate a document for a deleted/missing room.
- Tests (integration): non-member rejected; viewer's update is not applied (second client does not receive it and the database state does not change); editor works; removed member's new connection rejected.
- Security: the server is the authority; Monaco's readOnly option is UX only.

M2-4 Live revocation and connection expiry (public-deployment gate; not on the local critical path)
- Problem: authorization is checked at connect; an established WebSocket keeps working after removal, demotion or token expiry. Token expiry does not close it.
- Decision [new]: bounded staleness over cross-service messaging. Collab re-checks every open connection on an interval (`REVALIDATE_INTERVAL_MS`, default 30000). Hocuspocus documents `requestToken()` / `onTokenSync` for re-evaluating a connection's permissions [verified in docs; confirm on the pinned version when this task starts]. Fallback if absent: a timer that walks connected documents and connections and calls the same membership lookup.
- Behavior: removed member -> connection closed; demoted editor -> `readOnly` set; role raised -> `readOnly` cleared; token past its `exp` (recorded at connect) -> connection closed. The client shows "session expired" and returns to login (or resumes after re-login). New connections are checked immediately, so staleness applies only to already-open ones.
- Acceptable latency: effective within 2 x interval worst case (60 s with the default), asserted in tests; documented as a limit, not instant.
- Inherent limit: updates a revoked user sent before the next check are applied and persisted (CRDT updates cannot be retracted), and content they already saw stays seen.
- Tests: demote -> edits stop applying within the bound; remove -> connection closes within the bound; expired token -> connection closed; short interval in tests and bounded poll-until, no fixed sleeps.

M2-5 Client: rooms, members, role-aware editor
- Design: dashboard (my rooms, create room); room page at `/rooms/:id`; owner member-management panel; Monaco readOnly for viewers (UX only); presence names/colors from awareness; clear UX for auth failure, expired token, removed-from-room.
- Tests: manual checklist with three users and three roles.

M2-6 Golden-path E2E and review
- One Playwright test with two browser contexts: register two users, owner creates room and adds the other, both edit, restart-free assertion that content converges. (Persistence/restart stays covered by M1-B.)
- Add a kill-9 crash-recovery test: hard-kill collab, restart, confirm a still-open client re-syncs lost updates.
- Claude review #1 (authorization focus: membership checks, role enforcement, M2-4 revocation; M1's auth already had focused review #0).

### M3: Code execution

- M3-1 Provider decision. Verify current terms before choosing. Findings so far [unverified secondary sources]: the public ce.judge0.com instance throttles per IP without documented limits; the RapidAPI tier publishes limits (one March 2026 comparison page lists a free tier around 2,000 requests/day); at least one public alternative reportedly ended its free API in Feb 2026; self-hosting is free but heavier to run. Recommendation [new]: use the hosted RapidAPI free tier with your own key behind the adapter; consider self-hosting later (see M6).
- M3-2 Adapter plus `POST /rooms/:id/run`: validation, role check, language allow-list (choose five, e.g. JavaScript, Python, Java, C, C++), size caps, explicit limits, rate limit, timeout, error mapping, no provider secrets in responses. Tests with a mocked adapter; one manual real-provider smoke test.
- M3-3 Client: language selector (Y.Map), Run button, output panel (status, stdout, stderr, time), loading/error states.
- M3-4 Logging of executions: user, room, language, duration, status. Never log source code or tokens.
- M3-5 Claude review #2 (execution boundary: authorization, limits, secret handling).

### M4: Production readiness, deployment, measurement

- M4-1 Hardening: CORS allow-list for api, Origin allow-list for collab, startup validation for all env, body/payload limits, api graceful shutdown, idle/unauthenticated connection handling; set Express `trust proxy` for the platform's proxy hop so per-IP limits see client IPs instead of the proxy's; key the run limiter by user id.
- M4-2 Dockerfiles for api and collab (multi-stage, non-root), `.dockerignore`; verify locally.
- M4-3 CI (GitHub Actions): install, lint if present, unit + integration tests with a MongoDB service container. E2E optional in CI.
- M4-4 Deploy: MongoDB Atlas, api and collab on Render, client on Vercel [assumption: verify free-tier terms and spin-down behavior at deploy time]. Bind to 0.0.0.0 and the platform PORT, use wss, set env vars, smoke-test the golden path. Public gate must be satisfied first (PROJECT.md section 6).
- M4-5 Structured logging (JSON, request id), `/healthz`, and a short operations note in the README.
- M4-6 Measurements per section 5; record real numbers.
- Rate limiting stays in-memory [PENDING D4; see section 6].

### M5: Documentation, interview readiness, resume

- M5-1 README: what it is, run locally, architecture. Diagrams (Mermaid is enough, drawn from the real code): components, auth + sync sequence, data model.
- M5-2 Short demo recording or GIF.
- M5-3 Resume wording from the PROJECT.md ledger; only measured and verified claims.
- M5-4 Question bank from your own code (auth, CRDT vs OT, persistence window, authorization, execution boundary, limitations), then a Claude mock interview.

### M6: Evaluate only after M5 (not committed)

- AWS + Terraform. Best-justified use [new]: self-host Judge0 (needs a Docker host with sandbox privileges) on a small EC2 instance provisioned with Terraform, optionally the collab/api as well. Evaluate against: cost under free-tier terms (verify), time left, and whether it adds a real capability (own execution service, no third-party quota) instead of decoration.
- Redis + multi-instance collab: Hocuspocus Redis extension, two collab instances behind a local proxy, demonstrate cross-instance sync. Claim Redis/Nginx only if built.
- Other optional: refresh-token rotation, password reset, invite links, shared run output, snapshots/history.

---

## 4. Testing strategy

- Unit: pure logic (validators, JWT verify, role-to-permission mapping, limits).
- Integration (most valuable): api with a real MongoDB; collab with real providers and JWTs (M1-B pattern). Authorization matrices written as table-driven tests.
- E2E: one Playwright golden-path test with two browser contexts (M2-6). Do not add more until a regression justifies it.
- Manual: a short checklist per milestone, run before updating the milestone log.
- Rules: wait on events, not sleeps; every security claim gets a negative test; use the test runner already in the repo; no new framework without a recorded reason.

## 5. Measurement plan (all numbers reported with environment and sample size)

1. Sync latency: two Node providers, client A writes a timestamped edit, client B observes it; at least 200 samples; report p50/p95 locally and against the deployed system (network included).
2. Persistence: measure time-to-durable against the debounce settings; restart recovery time; crash-loss window from the kill-9 test.
3. Scale: N clients (for example 10/25/50/100) on one document and across several; record CPU/memory and where latency degrades.
4. Run endpoint: end-to-end latency, dominated by the provider; report separately.
Anything unmeasured is not claimed. "Sub-100 ms" survives only if the numbers support it.

---

## 6. Decisions pending, and changes to earlier decisions

| # | Item | Recommendation | Status |
|---|---|---|---|
| D1 | Membership check: direct Mongo read vs api call | Direct read, one isolated module [new] | Proposed; decide at M2-3 |
| D2 | Live revocation | Periodic re-check; now a public-deployment gate (M2-4) | Proposed |
| D3 | Execution provider | Verify terms, then hosted free tier behind adapter [new] | Open until M3-1 |
| D4 | Rate limiting | In-memory for the single-instance api; Redis only if multi-instance is built [revised] | PENDING owner approval |
| D5 | Token lifetime | 1 h access token, no refresh in MVP; expired open connections closed by collab (M2-4) | PENDING owner approval |
| D6 | Invitations | Add by email; links are a non-goal | Assumed; object if wrong |
| D7 | Viewers may run code | No; enforced in the backend, not only the UI | PENDING owner approval |
| D8 | AWS/Terraform | Preserved; evaluate at M6 | Kept |
| D9 | Claude review cadence | Focused review after M1, full after M2, focused after M3, plus mock interview | PENDING owner approval |
| D10 | Local connectivity | Explicit CORS allow-list via `CLIENT_ORIGIN`, not a Vite proxy | Proposed |
| D11 | Env templates | Root template for api + collab; separate client-only template for `VITE_` values | Proposed |
| D12 | Owner exit | Owner cannot leave; no transfer, no room deletion in MVP | Proposed |

Contradictions found
- Redis for rate limiting conflicts with the rule "no infrastructure without a concrete requirement": a single-instance api does not need shared counters. Redis returns only if multi-instance is built (M6). PROJECT.md still lists Redis rate limiting; a patch is proposed in the reconciliation and applied only after D4 is approved. Implications of in-memory counters if the api ever runs several instances: each instance counts separately (the effective limit multiplies by the instance count and depends on load balancing), counters reset on every restart or deploy, and the platform proxy hides client IPs unless `trust proxy` is set. Fine for one instance; at two or more, move the limiter to a shared store such as Redis (the limiter library supports pluggable stores [verify]).
- PROJECT.md leaves the membership-lookup method open for M2; D1 closes it.
- M1 deliberately lacks membership authorization; any "document opened by id" is reachable by any authenticated user. This is why M1/M1.5 must not be public.

## 7. Risks

- Scope creep from reviews: any reviewer finding is must-fix, should-fix, or scope-add; scope-add is rejected unless it replaces something.
- Over-planning: expand task cards only when a milestone is next.
- Execution abuse or cost: role check, rate limit, size and time limits before any public exposure.
- Provider terms change: adapter isolates the change.
- Free-tier hosting behavior (spin-down, sleep, quotas): verify at deploy time; do not build the demo around cold starts.
- Unverified Hocuspocus behaviors (unload timing, `requestToken`): confirm on the pinned version when the task starts.
- Resume drift: re-read the ledger before every resume edit.

## 8. Review log

2026-10-28, ChatGPT review #1 (reconciled by Claude).
- Accepted: MF1 (owner cannot leave), MF2 (revocation is a public-deployment gate, with latency bound), MF3 (root npm test must run all suites), MF4 (reconcile Redis in PROJECT.md; D4 stays pending), SF2 (separate sync from persistence), SF5 (ObjectId membership ids).
- Partially accepted: SF1 (CORS allow-list from env, not a Vite proxy); SF3 (root template for api + collab, plus a client-only template); SF4 (focused review after M1 added and M3 kept; M2 review also kept because M2 holds the authorization logic).
- Rejected outright: none. Rejected parts: Vite proxy; dropping the M2 review.
- v0.2.1: M1-E checklist now covers PROJECT.md criteria 1-10 (ChatGPT context-load finding; criterion 10 had been omitted).
- Net scope change: small M1 additions (root test script, CORS config, env template split, M1 review); M2 adds id-type tests and owner rules; M2-4 promoted from should-have to public gate. No new infrastructure or features.
