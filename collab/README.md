# CodeSync collaboration service

This service is the ported Hocuspocus + MongoDB persistence baseline with a JWT `onAuthenticate` hook.

- Default database: `codesync_dev` (kept separate from the spike's `codesync_spike`).
- Document names: exactly 24 hexadecimal characters.
- JWT algorithm: HS256 only; `sub` and `exp` are required.
- The returned Hocuspocus context contains `user.id` from the verified JWT subject.
- Room membership/roles are not implemented in M1. Keep the service local until M2 authorization is verified.

Run from the repository root after creating `.env` and installing dependencies: `npm run start:collab`.
