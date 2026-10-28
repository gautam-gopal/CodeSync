import jwt from 'jsonwebtoken';

const DOCUMENT_NAME_PATTERN = /^[a-f\d]{24}$/i;

/** Fail during startup, not at the first client connection, if the secret is weak. */
export function assertJwtSecret(secret) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes of secret material.');
  }
  return secret;
}

export function isValidDocumentName(documentName) {
  return typeof documentName === 'string' && DOCUMENT_NAME_PATTERN.test(documentName);
}

/**
 * Hocuspocus authentication hook for Milestone 1.
 * Authentication proves the token's subject; room membership authorization is intentionally deferred to M2.
 */
export function createOnAuthenticate({ jwtSecret }) {
  const secret = assertJwtSecret(jwtSecret);

  return async function onAuthenticate({ token, documentName }) {
    if (!isValidDocumentName(documentName)) {
      throw new Error('Document name must be a 24-character hexadecimal ObjectId string.');
    }

    if (typeof token !== 'string' || token.length === 0) {
      throw new Error('Missing authentication token.');
    }

    let claims;
    try {
      claims = jwt.verify(token, secret, { algorithms: ['HS256'] });
    } catch {
      // Keep details generic: do not leak whether a token is expired, malformed, or incorrectly signed.
      throw new Error('Invalid or expired authentication token.');
    }

    // jsonwebtoken verifies exp when present. Require it explicitly so a signed token cannot live forever.
    if (
      !claims ||
      typeof claims !== 'object' ||
      typeof claims.sub !== 'string' ||
      claims.sub.trim().length === 0 ||
      !Number.isFinite(claims.exp)
    ) {
      throw new Error('Authentication token must contain a non-empty subject and an expiration.');
    }

    // Hocuspocus merges the returned object into the connection context for later hooks.
    return { user: { id: claims.sub } };
  };
}
