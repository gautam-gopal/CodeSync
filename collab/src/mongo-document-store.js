/**
 * MongoDB adapter for Hocuspocus' official @hocuspocus/extension-database API.
 *
 * Hocuspocus supplies `state` as a binary Yjs update. We persist those bytes as
 * BSON binary through the MongoDB Node.js driver; we do not convert shared text
 * into JSON. A rejected MongoDB operation is intentionally allowed to reject
 * this callback so Hocuspocus can apply its documented store-failure behavior.
 */
export function createMongoDocumentStore(collection) {
  if (!collection || typeof collection.findOne !== 'function' || typeof collection.updateOne !== 'function') {
    throw new TypeError('A MongoDB collection with findOne() and updateOne() is required.');
  }

  return {
    async fetch({ documentName }) {
      const record = await collection.findOne(
        { documentName },
        { projection: { _id: 0, state: 1 } },
      );

      if (!record) {
        return null;
      }

      // MongoClient is configured with promoteBuffers:true in server.js. Fail
      // loudly if that binary contract is accidentally changed in the future.
      if (!Buffer.isBuffer(record.state) && !(record.state instanceof Uint8Array)) {
        throw new TypeError(`Stored Yjs state for "${documentName}" is not binary data.`);
      }

      // Return a fresh byte buffer, preserving the encoded Yjs update as-is.
      return Buffer.from(record.state);
    },

    async store({ documentName, state }) {
      if (!(state instanceof Uint8Array)) {
        throw new TypeError('Hocuspocus must provide Yjs state as a Uint8Array/Buffer.');
      }

      const result = await collection.updateOne(
        { documentName },
        {
          $set: {
            state: Buffer.from(state),
            formatVersion: 1,
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      );

      // Explicitly reject an unacknowledged write. Do not log or return a
      // successful-save signal before MongoDB confirms the operation.
      if (result?.acknowledged !== true) {
        throw new Error(`MongoDB did not acknowledge Yjs state persistence for "${documentName}".`);
      }
    },
  };
}
