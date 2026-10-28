# CodeSync: Project Source of Truth

Last updated: 2026-10-28 | Current milestone: M1 (remaining: root test fix, M1-B to M1-E)
Plan and task cards: ROADMAP.md. This file holds decisions and verified state only.

## 1. Goal
Real-time collaborative code editor for SDE-1 portfolio and interviews. Priorities, in order:
a working app, understanding every core piece, honest resume claims. A smaller app I can
defend beats a larger one I can't.

## 2. Rules
- The repo is the truth. This file records decisions and verified state, nothing else.
- The spike repo (CodeSync-local-compatibility-spike) is a reference. It is never modified.
- Decisions below are not reopened without new evidence (failing test, measurement, concrete blocker).
- No new technology, service or abstraction without a concrete requirement recorded here.
- A resume claim is allowed only after: implemented, working, verified, understood.
- Update this file only for verified state or real decisions. Keep it short.
- Roles: Claude plans and reviews (D9, pending: focused review after M1, full after M2,
  focused after M3, plus a final mock interview). ChatGPT implements and reviews the plan.
  I run everything, approve trade-offs, and must be able to explain every core piece.

## 3. Verified baseline
Spike (verified by me, tests + local integration): Yjs binary document state stored in MongoDB
through the Hocuspocus Database extension; state recovered after a collab restart; later edits persisted.
Reusable from the spike: unique index on documentName; debounce 250 ms / max 1000 ms;
graceful shutdown (destroy server, then close Mongo); startServer(overrides) factory.

Main repo (verified by me): scaffold committed as a2524c7 with client/, api/, collab/ workspaces;
MongoDB via Docker Compose (local port 27019); local .env ignored by Git; collab server with
JWT auth hook and Mongo persistence adapter; 14 collab unit tests pass (10 auth, 4 persistence);
server starts and shuts down cleanly.

NOT verified: JWT-authenticated clients syncing end to end, persistence with auth in the loop,
register/login API (not implemented), functional client (still a starter scaffold), roles,
execution, deployment, any measured number. Known defect: root `npm test` currently runs only
the collab suite.
Versions are pinned as in each package.json / .nvmrc. Confirm library behavior against the
pinned versions, not memory.

## 4. Architecture and decisions
Three packages in one repo: client/ (React + Monaco), api/ (Express), collab/ (Hocuspocus).

| Area | Decision |
|---|---|
| Sync | Yjs (CRDT, not OT) via Hocuspocus; Monaco bound with y-monaco |
| Shared type | ydoc.getText('monaco'). Name is fixed because it is persisted |
| Document identity | documentName = room id, strict 24-hex ObjectId string; anything else rejected |
| Auth | email + password, bcrypt, access JWT (HS256, claims sub/iat/exp). api signs, collab only verifies, algorithm pinned. Secret from env; startup fails if missing or short |
| Token lifetime | 1 h, no refresh tokens in MVP (D5, PENDING approval). Collab closes expired open connections at its periodic re-check (M2-4) |
| Token on client | held in memory; passed through the provider's token option as a function so reconnects use the current token; never in a URL |
| Persistence | Hocuspocus Database extension, full Yjs state per document in MongoDB, upsert by documentName. Debounced, so durability is a target, not a deadline |
| Roles | owner/editor/viewer, stored only in rooms.members (never in the JWT) and enforced server-side in collab's auth hook (viewer = read-only connection). Exactly one owner for the life of a room; the owner cannot leave, be removed or demoted; no ownership transfer or room deletion in MVP; the api never accepts "owner" as an input role (D12, proposed) |
| Id types | rooms.members.userId is an ObjectId. JWT sub and documentName arrive as strings: validate strictly (24-hex) and convert once at the boundary |
| Membership lookup | collab reads MongoDB directly through one isolated module (D1, proposed; decide at M2-3) |
| Live revocation | collab re-checks open connections on an interval (default 30 s); effective within 2 x interval; gate for public deployment (see section 6) |
| Code execution (M3) | Only through the backend, never from the browser. Hosted Judge0 first behind an adapter (verify terms at M3-1). Auth, rate limit, input/time limits required. Viewers cannot run code, enforced in the backend (D7, PENDING approval) |
| Rate limiting | In-memory limiter for the single-instance api; Redis only if multi-instance is built (D4, PENDING approval; replaces the earlier "Redis rate limiting in M4"). Set Express trust proxy behind the platform proxy |
| Local connectivity | Explicit CORS allow-list from CLIENT_ORIGIN, no wildcard, no Vite proxy (D10, proposed) |
| Env templates | Root .env.example for api + collab (shared on purpose: same JWT secret and Mongo URI); client/.env.example with public VITE_ values only (D11, proposed) |
| Hosting | Vercel (client), Render (api, collab). AWS/Terraform: deferred, evaluate at M6 |
| Testing | Written inside each milestone, proportionate. Wait on events or bounded poll-until, never fixed sleeps. Playwright for one golden-path test only |

Pending owner approval: D4, D5, D7, D9. Proposed (stand unless I object): D10, D11, D12.

## 5. Milestones
Only the current one is detailed. Task cards are in ROADMAP.md.

M1: Vertical slice (current)
Two logged-in users edit one document in two browser sessions over a JWT-authenticated
Hocuspocus connection; content persists across a collab restart.
Acceptance criteria:
1. New repo has client/, api/, collab/; the spike is untouched; root npm test runs the api and
   collab suites and exits non-zero if either fails (proved once with a deliberately failing test).
2. api: register and login return a JWT; wrong password and duplicate email are rejected.
3. collab rejects: no token, malformed token, expired token, wrong signature, token with a
   different algorithm, and an invalid documentName. Rejections are tested automatically, and
   rejected attempts create no document in MongoDB.
4. Two tabs, two different users, same document: edits appear in both.
5. Persistence: edit, restart collab, reload, content is present, and the stored state is
   confirmed by reading MongoDB directly (not inferred from provider sync); edits made after
   the restart also persist.
6. React StrictMode in dev causes no duplicated text or double bindings (cleanup destroys
   provider, doc and binding).
7. .env files are not committed. Root .env.example covers api + collab; client/.env.example
   holds only public VITE_ values.
8. Known gaps below are recorded; the milestone log is updated with what was verified.
9. Nothing is deployed publicly.
10. The api accepts browser requests only from the configured CLIENT_ORIGIN.
M1 is complete after Claude focused review #0 (auth and token handling only).

M1.5 (optional): restricted deployment exercise, see section 6.
M2: Rooms, membership and roles; server-side authorization; live revocation (M2-4).
M3: Code execution through the backend (Judge0), limits and rate limit on the endpoint.
M4: Hardening, CI, measurements, public deployment.
M5: README, diagrams, resume wording, mock interview.
M6: Evaluate only: AWS/Terraform (best case: self-hosted Judge0 on EC2), Redis multi-instance demo.

## 6. Deployment gate
- No public deployment of M1. Until M2, any logged-in user can open any well-formed room id.
- Public deployment requires ALL of: (1) M2 authorization verified (non-member rejected, viewer
  read-only enforced server-side, removed member rejected on reconnect); (2) M2-4 live revocation
  verified: removal or demotion takes effect on open connections within 2 x REVALIDATE_INTERVAL_MS
  (60 s default) and expired tokens close open connections; (3) if code execution is deployed:
  role check, rate limit and size/time limits; (4) M4-1 hardening: CORS and WebSocket Origin
  allow-lists, trust proxy set.
- M1.5 is allowed only as an isolated exercise: registration disabled (accounts seeded or
  allow-listed by me), a separate throwaway database, no real content, not linked from the
  resume or GitHub README. Purpose: learn deployment problems (host/port binding, wss, CORS,
  env vars, cold starts).

## 7. Known gaps
- M1: authentication only; no membership check (see section 6).
- Until M2-4, JWT, membership and role are checked only at connect. After M2-4, staleness is
  bounded to 2 x interval, and updates a revoked user sent before the next check remain applied.
- Persistence is debounced; the roughly 1 s window is a target, not a guarantee; measure before
  claiming. A hard kill can lose edits inside that window (open clients re-sync them).
- Awareness (cursor name/color) is client-asserted and can be spoofed by a member.

## 8. Resume ledger (target specification, not evidence)
| Claim | Status | Action |
|---|---|---|
| OT-based conflict resolution | Wrong for this stack | Reword to CRDT (Yjs) |
| Sub-100 ms sync latency | Unmeasured | Measure, report the real number, or cut |
| Monaco, 10+ language highlighting | Not built | Verify when built |
| Judge0 execution, 5 languages | Not built | M3 |
| JWT auth, owner/editor/viewer roles | Not built | M1 (JWT), M2 (roles) |
| Persisted history, snapshots, replay | Persistence only (spike) | Claim only what is built; replay not planned |
| Redis output caching, 40% faster | Not built, unmeasured | Cut; rate limiting is in-memory unless D4 changes |
| Nginx SSL / load distribution | Not planned | Cut unless built |
| Vercel + Render deployment | Not deployed | M4 |
Also fix: "Final-year B.Tech student" (graduated), location on the header.

## 9. Milestone log
- Spike: verified as in section 3.
- M1-A (scaffold, collab server, auth hook, persistence adapter): done, verified at unit level only
  (14 tests). Not an end-to-end result. Root npm test runs only collab (to fix).

## 10. Next step
1. Fix root npm test so every workspace runs and any failure exits non-zero.
2. M1-B: collab integration test (ROADMAP.md).
