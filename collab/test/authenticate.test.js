import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { assertJwtSecret, createOnAuthenticate } from '../src/authenticate.js';

const secret = 'codesync-test-secret-at-least-32-bytes-long';
const documentName = '0123456789abcdef01234567';
const hook = createOnAuthenticate({ jwtSecret: secret });

function signToken(payload = { sub: 'user-123' }, signingSecret = secret, algorithm = 'HS256') {
  return jwt.sign(payload, signingSecret, { algorithm, expiresIn: '5m' });
}

test('accepts a valid HS256 token and returns verified user context', async () => {
  const result = await hook({ token: signToken(), documentName });
  assert.deepEqual(result, { user: { id: 'user-123' } });
});

test('rejects a missing token', async () => {
  await assert.rejects(hook({ token: '', documentName }), /missing authentication token/i);
});

test('rejects a malformed token', async () => {
  await assert.rejects(hook({ token: 'not-a-jwt', documentName }), /invalid or expired authentication token/i);
});

test('rejects an expired token', async () => {
  const token = jwt.sign(
    { sub: 'user-123', exp: Math.floor(Date.now() / 1000) - 60 },
    secret,
    { algorithm: 'HS256' },
  );
  await assert.rejects(hook({ token, documentName }), /invalid or expired authentication token/i);
});

test('rejects a token signed with a different secret', async () => {
  await assert.rejects(
    hook({ token: signToken({ sub: 'user-123' }, 'a-different-test-secret-that-is-long-enough'), documentName }),
    /invalid or expired authentication token/i,
  );
});

test('rejects a token whose algorithm is not HS256', async () => {
  await assert.rejects(
    hook({ token: signToken({ sub: 'user-123' }, secret, 'HS384'), documentName }),
    /invalid or expired authentication token/i,
  );
});

test('rejects an invalid document name', async () => {
  await assert.rejects(
    hook({ token: signToken(), documentName: 'codesync-room-1' }),
    /24-character hexadecimal ObjectId/i,
  );
});

test('rejects a validly signed token without an expiration', async () => {
  const token = jwt.sign({ sub: 'user-123' }, secret, { algorithm: 'HS256' });
  await assert.rejects(hook({ token, documentName }), /subject and an expiration/i);
});

test('rejects a validly signed token without a subject', async () => {
  const token = jwt.sign({ exp: Math.floor(Date.now() / 1000) + 300 }, secret, { algorithm: 'HS256' });
  await assert.rejects(hook({ token, documentName }), /subject and an expiration/i);
});

test('rejects a missing or short JWT secret at configuration time', () => {
  assert.throws(() => assertJwtSecret(''), /at least 32 bytes/i);
  assert.throws(() => createOnAuthenticate({ jwtSecret: 'too-short' }), /at least 32 bytes/i);
  assert.equal(assertJwtSecret(secret), secret);
});
