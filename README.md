# CodeSync — M1 Foundation

This is the first real-application scaffold for CodeSync, separate from the original compatibility spike. It includes the `client/`, `api/`, and `collab/` workspaces; a React/Vite landing scaffold; the Hocuspocus server and the original Mongo document-store adapter; and a JWT authentication hook with automated hook tests.

**This is not the completed M1 vertical slice yet.** The Express registration/login endpoints and the Monaco/Yjs client integration are the next implementation steps. Do not deploy publicly while room-membership authorization is absent.

## Prerequisites

- Node.js `24.22.1` (see `.nvmrc`)
- npm 11 compatible with Node 24
- Docker Desktop with Docker Compose

## Local setup (Windows PowerShell)

Run from the extracted repository root:

```powershell
Copy-Item .env.example .env
notepad .env
```

In `.env`, set a unique local Mongo password in both `MONGO_ROOT_PASSWORD` and the password portion of `MONGODB_URI`. The sample uses host port `27019` so it does not reuse the spike's host port `27018`.

Generate a 32-byte random JWT secret in PowerShell:

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

Copy the printed value into `JWT_SECRET` in `.env`. Do not commit `.env`.

Install the workspace dependencies and generate the root lockfile:

```powershell
node --version
npm --version
npm install
```

The lockfile is intentionally not included in this generated scaffold because this authoring environment could not resolve `registry.npmjs.org`. Generate it locally with `npm install`, review `git status`, and commit `package-lock.json` so later installs can use `npm ci`.

Start MongoDB and run the collaboration tests:

```powershell
docker compose up -d --wait mongo
docker compose ps
npm test
```

The tests currently cover the existing persistence adapter contract and the JWT authentication hook. They do not replace the later two-browser integration and restart-recovery checks.

Start the collaboration service after tests pass:

```powershell
npm run start:collab
```

It listens at `ws://127.0.0.1:1234` by default. Press `Ctrl+C` for graceful shutdown; Hocuspocus is destroyed before MongoDB connection cleanup.

Start the minimal frontend in a second terminal if needed:

```powershell
npm run dev:client
```

The page is currently only a React/Vite scaffold; it is not yet a connected collaborative editor.

## Important security boundary

M1 verifies identity and document-name format but does not check room membership. Any valid user can open any well-formed room ID. Keep this build local; public deployment is blocked until M2 server-side membership and role authorization is implemented and verified.

## Source preservation

`collab/src/mongo-document-store.js` is copied byte-for-byte from `CodeSync-local-compatibility-spike`. The original spike directory itself has not been changed by this generated archive.
