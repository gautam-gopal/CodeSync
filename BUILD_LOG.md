# CodeSync M1 Build Log

## Current status

Scaffold and first collaboration-service port have been generated in this archive. They have **not** been installed or run against MongoDB in the authoring environment. The environment could not resolve `registry.npmjs.org`, and its Node runtime is v22.16.0 rather than the project target v24.22.1.

## Files reused or created

- `collab/src/mongo-document-store.js`: copied byte-for-byte from the uploaded spike.
- `collab/test/mongo-document-store.test.js`: existing adapter contract tests copied from the spike.
- `collab/src/server.js`: ported from the spike; default DB changed to `codesync_dev`, service name updated, JWT hook added; existing config factory, unique index, debounce, startup cleanup, and shutdown flow retained.
- `collab/src/authenticate.js`: HS256 verifier, subject/expiration validation, 24-hex document-name validation, minimum 32-byte secret validation.
- `collab/test/authenticate.test.js`: tests authored for valid token, missing/malformed/expired token, wrong signature, wrong algorithm, invalid document name, missing claims, and short secret.
- `client/`: minimal React/Vite scaffold only; editor integration not implemented.
- `api/`: workspace and dependencies scaffolded; registration/login not implemented.
- `compose.yaml`: local MongoDB bound only to `127.0.0.1:27019`, separate from spike's configured port.

## Verification evidence in this environment

- Inspected the uploaded source archive. Its ZIP entries used backslash path separators; paths were normalized for inspection. Source contents were readable.
- `node --check` passed for `collab/src/server.js`, `collab/src/authenticate.js`, the copied persistence adapter, both test files, and `client/vite.config.js`. Node does not directly syntax-check `.jsx` files via `node --check`; a Vite build remains unverified.
- All four copied persistence-adapter contract tests passed using the built-in Node test runner (4 passed, 0 failed).
- All four workspace `package.json` files parsed as valid JSON.
- SHA-256 hashes confirm `collab/src/mongo-document-store.js` is byte-for-byte identical to the spike source.
- ZIP integrity test passed.
- Dependency installation and JWT test execution were not possible here because npm registry DNS resolution failed (`EAI_AGAIN`). No Hocuspocus/Mongo integration test or full app build has been run.

## Required owner verification

1. Confirm `node --version` outputs `v24.22.1`.
2. Copy `.env.example` to `.env`, set the Mongo password consistently in both variables, and generate a unique 32-byte `JWT_SECRET`.
3. Run `npm install` to generate and commit the root `package-lock.json`.
4. Run `docker compose up -d --wait mongo`.
5. Run `npm test`; fix any failing tests and report actual output.
6. Run `npm run start:collab`; confirm it starts, then use `Ctrl+C` and confirm graceful shutdown.

## Not yet completed

- Express register/login and JWT issuance.
- Full Hocuspocus WebSocket-level auth rejection tests (current auth tests call the hook function directly).
- Monaco + Yjs + `y-monaco` client integration.
- Two-user/two-browser live synchronization.
- End-to-end persistence/restart recovery in the real repository.
- Room membership and role authorization (M2).

No public deployment is allowed until M2 authorization has been implemented and verified.
