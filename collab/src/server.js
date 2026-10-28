import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Database } from '@hocuspocus/extension-database';
import { Server } from '@hocuspocus/server';
import { MongoClient } from 'mongodb';
import { createMongoDocumentStore } from './mongo-document-store.js';
import { assertJwtSecret, createOnAuthenticate } from './authenticate.js';

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

/** Start Hocuspocus with MongoDB-backed binary Yjs persistence. */
export async function startServer(overrides = {}) {
  const mongoUri = overrides.mongoUri ?? requiredEnv('MONGODB_URI');
  const databaseName = overrides.databaseName ?? process.env.MONGODB_DATABASE ?? 'codesync_dev';
  const collectionName = overrides.collectionName ?? process.env.MONGODB_COLLECTION ?? 'documents';
  const jwtSecret = assertJwtSecret(overrides.jwtSecret ?? requiredEnv('JWT_SECRET'));
  const address = overrides.address ?? process.env.HOST ?? '127.0.0.1';
  const port = positiveInteger(overrides.port ?? process.env.PORT ?? '1234', 'PORT');
  const debounce = positiveInteger(
    overrides.debounce ?? process.env.PERSISTENCE_DEBOUNCE_MS ?? '250',
    'PERSISTENCE_DEBOUNCE_MS',
  );
  const maxDebounce = positiveInteger(
    overrides.maxDebounce ?? process.env.PERSISTENCE_MAX_DEBOUNCE_MS ?? '1000',
    'PERSISTENCE_MAX_DEBOUNCE_MS',
  );

  if (maxDebounce < debounce) {
    throw new Error('PERSISTENCE_MAX_DEBOUNCE_MS must be greater than or equal to PERSISTENCE_DEBOUNCE_MS.');
  }

  const mongoClient = new MongoClient(mongoUri, {
    promoteBuffers: true,
    serverSelectionTimeoutMS: 5000,
  });

  await mongoClient.connect();

  let server;
  try {
    const collection = mongoClient.db(databaseName).collection(collectionName);
    await collection.createIndex({ documentName: 1 }, { unique: true });
    const documentStore = createMongoDocumentStore(collection);

    server = new Server({
      name: 'codesync-collab',
      address,
      port,
      quiet: true,
      debounce,
      maxDebounce,
      onAuthenticate: createOnAuthenticate({ jwtSecret }),
      extensions: [
        new Database({
          fetch: documentStore.fetch,
          store: documentStore.store,
        }),
      ],
    });

    // Hocuspocus v4 exposes listen(port, callback). Await the callback so a
    // successful return from startServer means the listener was initialized.
    await new Promise((resolveListen, rejectListen) => {
      try {
        server.listen(port, resolveListen);
      } catch (error) {
        rejectListen(error);
      }
    });

    return { server, mongoClient, collection, address, port };
  } catch (error) {
    if (server) {
      try {
        await server.destroy();
      } catch {
        // Preserve the original startup error; no listener was successfully returned.
      }
    }
    await mongoClient.close();
    throw error;
  }
}

async function main() {
  const runtime = await startServer();
  console.log(`Hocuspocus listening at ws://${runtime.address}:${runtime.port}`);
  console.log('MongoDB binary Yjs persistence is configured. No document is claimed saved until MongoDB acknowledges a write.');
  console.warn('Room-membership authorization is not implemented in M1. Keep this service local; do not deploy publicly.');

  let stopping = false;
  const shutdown = async (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(`Received ${signal}; flushing Hocuspocus stores and closing MongoDB.`);
    try {
      await runtime.server.destroy();
    } catch (error) {
      console.error('Hocuspocus shutdown failed:', error.message);
      process.exitCode = 1;
    }
    try {
      await runtime.mongoClient.close();
    } catch (error) {
      console.error('MongoDB shutdown failed:', error.message);
      process.exitCode = 1;
    }
  };

  process.once('SIGINT', () => { void shutdown('SIGINT'); });
  process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error('CodeSync spike failed to start:', error.message);
    process.exitCode = 1;
  });
}
