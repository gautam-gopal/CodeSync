import test from 'node:test';
import assert from 'node:assert/strict';
import { createMongoDocumentStore } from '../src/mongo-document-store.js';

function createFakeCollection({ failWrites = false, acknowledgeWrites = true } = {}) {
  const records = new Map();
  return {
    records,
    async findOne({ documentName }) {
      const stored = records.get(documentName);
      return stored ? { state: Buffer.from(stored.state) } : null;
    },
    async updateOne({ documentName }, update) {
      if (failWrites) {
        throw new Error('simulated MongoDB write failure');
      }
      records.set(documentName, {
        state: Buffer.from(update.$set.state),
        updatedAt: update.$set.updatedAt,
      });
      return { acknowledged: acknowledgeWrites, matchedCount: 0, upsertedCount: 1 };
    },
  };
}

test('the store preserves binary bytes through store/fetch', async () => {
  const store = createMongoDocumentStore(createFakeCollection());
  // These bytes stand in for a Yjs-encoded update. The live integration test
  // verifies actual Y.encodeStateAsUpdate() bytes against real MongoDB.
  const expectedBytes = Buffer.from([0x00, 0x01, 0x7f, 0x80, 0xff]);
  await store.store({ documentName: 'binary-round-trip', state: expectedBytes });
  const recoveredBytes = await store.fetch({ documentName: 'binary-round-trip' });

  assert.ok(Buffer.isBuffer(recoveredBytes), 'fetch should return binary bytes');
  assert.deepEqual(recoveredBytes, expectedBytes);
});

test('fetch returns null for a document that has not been stored', async () => {
  const store = createMongoDocumentStore(createFakeCollection());
  assert.equal(await store.fetch({ documentName: 'not-present' }), null);
});

test('write failure rejects instead of being converted into success', async () => {
  const store = createMongoDocumentStore(createFakeCollection({ failWrites: true }));

  await assert.rejects(
    store.store({ documentName: 'failed-write', state: Buffer.from([1, 2, 3]) }),
    /simulated MongoDB write failure/,
  );
});

test('an unacknowledged write is treated as failure', async () => {
  const store = createMongoDocumentStore(createFakeCollection({ acknowledgeWrites: false }));

  await assert.rejects(
    store.store({ documentName: 'unacknowledged-write', state: Buffer.from([1, 2, 3]) }),
    /did not acknowledge Yjs state persistence/,
  );
});
