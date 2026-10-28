# CodeSync: Project Source of Truth

Last updated: 2026-10-28 | Current milestone: M1 — vertical slice

## 1. Goal

Build a real-time collaborative code editor for SDE-1 portfolio and interviews. Priorities, in order: a working app, understanding every core piece, honest resume claims. A smaller app I can defend beats a larger one I cannot.

## 2. Rules

- The repository is the truth. This file records decisions and verified state, not speculative progress.
- The original `CodeSync-local-compatibility-spike` remains unchanged and is a reference only.
- Settled decisions are not reopened without new evidence (a failing test, measurement, or concrete blocker).
- No new technology, service, or abstraction without a concrete requirement.
- A resume claim is allowed only after it is implemented, working, verified, and understood.
- Tests are written within each milestone and proportionate to the behavior being added.
- Report tests as passed only when they were actually run and passed.

## 3. Verified baseline: compatibility spike

The owner reported passing local adapter tests and a live integration check: Yjs binary document state was stored in MongoDB through Hocuspocus' Database extension, recovered after a collaboration-server restart, and later edits persisted.

Inspected and reused in this scaffold:
- `src/mongo-document-store.js` copied byte-for-byte to `collab/src/mongo-document-store.js`.
- Existing Hocuspocus startup, Mongo configuration, unique index on `documentName`, debounce settings (250 ms / 1,000 ms maximum), `startServer(overrides)` factory, cleanup on startup failure, and graceful shutdown form the porting baseline.
- Versions from the spike remain pinned for Hocuspocus 4.7.1 and MongoDB driver 7.7.0. A root npm lockfile has not yet been generated for the workspaces; run `npm install` in the real repo and commit the generated `package-lock.json`.

Not proven by the spike: JWT authentication, room authorization, Monaco/Yjs client integration, multi-instance behavior, deployment, load, or production durability guarantees.

## 4. Architecture and decisions

Three packages in one repository: `client/` (React; Monaco and Yjs binding are added in the client implementation step), `api/` (Express authentication API), and `collab/` (Hocuspocus).

| Area | Decision |
|---|---|
| Sync | Yjs CRDT, not OT; Hocuspocus WebSocket service |
| Shared text type | `ydoc.getText('monaco')`; this name is persisted and must remain stable |
| Document identity | `documentName` is the room ID; accept exactly 24 hexadecimal characters (Mongo ObjectId format) |
| Authentication | Email/password, bcrypt, short-lived access JWT using HS256. API signs; collaboration service verifies |
| JWT verification | Pin accepted algorithm to HS256; require a subject and expiration; secret from environment, at least 32 bytes; fail on missing/short secret |
| Client token transport | Hocuspocus provider `token` option, not a URL parameter; use a token function for future reconnect refresh behavior |
| Persistence | Hocuspocus Database extension; copy `mongo-document-store.js` unchanged initially; persist full binary Yjs state in MongoDB, upsert by `documentName` |
| Roles | Owner/editor/viewer enforced server-side in the collaboration auth path. Room membership and role checks are M2, not implemented in M1 |
| Code execution (M3) | Through the backend to a hosted Judge0-compatible API first; require authentication, rate limits, and input/time limits |
| Redis | Consider for M4 rate limiting; no output caching without measurement. Multi-instance synchronization is a stretch goal gated by tests |
| Hosting | Vercel client and Render API/collaboration are candidates, subject to later verification |
| AWS/Terraform | Deferred until the core application works; reassess after M4, not permanently removed |
| Local MongoDB | `compose.yaml`, localhost-only host port 27019; database `codesync_dev`, separate from `codesync_spike` |
| Environment | Root `.env.example` is the common template; all local Node services read the root `.env`. Do not duplicate environment templates across packages without a demonstrated need |

## 5. Milestone 1: vertical slice (current)

### M1 scope

1. Scaffold `client/`, `api/`, and `collab/`; keep the original spike unchanged.
2. Port the Hocuspocus server and persistence adapter into `collab/`.
3. Add the JWT authentication hook and automated hook tests.
4. Implement Express registration/login with bcrypt and JWT signing.
5. Implement the browser login/document flow with Monaco, Yjs, `y-monaco`, and Hocuspocus Provider.
6. Verify two different users editing one document and persistence across a graceful collaboration-server restart.

### Acceptance criteria

- [x] Fresh application scaffold includes `client/`, `api/`, and `collab/`.
- [x] The spike's Mongo document-store source is copied unchanged into `collab/`.
- [x] Hocuspocus server retains the config factory, unique document-name index, debounce settings, startup cleanup, and graceful shutdown; default DB is no longer `codesync_spike`.
- [x] Auth hook verifies HS256 JWTs, requires a subject and expiry, validates document-name format, and returns verified user context.
- [x] Automated auth-hook tests are authored for valid token, missing token, malformed token, expired token, wrong signature, wrong algorithm, invalid document name, missing required claims, and short secret.
- [ ] Dependencies install reproducibly from a root lockfile generated on the developer machine.
- [ ] Owner runs the collaboration tests in the selected Node.js 24.22.1 environment.
- [ ] API register/login returns JWT; duplicate email and wrong password are rejected.
- [ ] Two different users in two browser sessions can edit the same document and see each other's changes.
- [ ] Persistence check: edit, gracefully stop, restart collaboration service, reload, verify content remains; subsequent edits also persist.
- [ ] React StrictMode produces no duplicated text or double bindings; cleanup destroys provider, Y.Doc, and Monaco binding.
- [ ] No `.env` file is tracked; `.env.example` is present.
- [ ] No public deployment while the M1 room-membership authorization gap remains.

The `[x]` items describe files prepared or statically inspected, not a fully running integration. The four copied persistence-adapter contract tests passed in the authoring environment. JWT tests and server/Mongo/client integration tests have not been executed because npm dependencies could not be installed here (npm registry DNS resolution failed). Recheck on the developer machine.

## 6. Security and deployment gate

- M1 authenticates users but does not check room membership. Any valid user can open any well-formed room ID. Keep this application local; do not deploy it publicly.
- Public deployment requires M2 room membership and role authorization to be implemented and verified. If code execution is deployed, endpoint authentication, rate limits, and input/time limits are also required.
- An isolated M1.5 deployment exercise is optional only with registration disabled or seeded/allow-listed accounts, a separate throwaway database, no real content, and no public promotion. Do not do it unless there is a clear learning benefit.

## 7. Known gaps and limitations

- JWT is checked at connection time only; expiration is not rechecked during a long-lived session yet.
- Mongo persistence uses a debounced full-state store. Abrupt termination can lose updates not yet persisted.
- Room membership/authorization is intentionally absent until M2.
- No API registration/login implementation, Monaco binding, end-to-end two-user test, Redis, code execution, or deployment is included in this first scaffold.

## 8. Resume ledger (target specification, not evidence)

| Claim | Status | Action |
|---|---|---|
| OT-based conflict resolution | Incorrect for this stack | Reword as CRDT-based synchronization with Yjs |
| Sub-100 ms synchronization latency | Unmeasured | Measure and report actual method/results, or remove |
| Monaco / 10+ language highlighting | Not implemented | Verify actual language support when editor is built |
| Judge0 execution / five languages | Not implemented | M3; claim only configured and tested languages |
| JWT authentication | Hook authored, API not implemented | Claim only after end-to-end tests |
| Owner/editor/viewer roles | Not implemented | M2 |
| Persistence, history, snapshots, replay | Spike proves current-state persistence/recovery only | Do not claim replay or historical snapshots unless implemented |
| Redis output caching / 40% faster | Not implemented or measured | Replace plan with rate limiting unless a cache is justified and benchmarked |
| Nginx SSL / load distribution | Not planned | Remove unless actually implemented |
| Vercel / Render deployment | Not deployed | Verify in later deployment milestone |

## 9. Milestone log

- Compatibility spike: owner-reported local adapter and persistence/restart integration checks passed. It remains an unchanged reference.
- M1 scaffold: files prepared in `CodeSync-M1-foundation.zip`; dependency installation and application tests still need to be run by the owner on Node.js 24.22.1.

## 10. Next step

Extract the scaffold into the real repository, create `.env` from `.env.example`, generate a safe local Mongo password and a 32-byte JWT secret, run `npm install`, then run `npm test`. Address failures based on actual output before implementing the Express auth API and client.
