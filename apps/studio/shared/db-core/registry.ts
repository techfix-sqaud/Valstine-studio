import type { DbAdapter, DBType } from './types.js';
import { postgresAdapter } from './adapters/postgres.js';
import { mysqlAdapter } from './adapters/mysql.js';
import { mssqlAdapter } from './adapters/mssql.js';
import { cassandraAdapter } from './adapters/cassandra.js';
import { mongodbAdapter } from './adapters/mongodb.js';
import { redisAdapter } from './adapters/redis.js';
import { firebaseAdapter } from './adapters/firebase.js';

// sqlite is injected per-runtime (Electron: knex+better-sqlite3, web server:
// bun:sqlite) — see shared/db-core/adapters/sqlite.ts. Every other adapter,
// SQL or NoSQL, is a pure network client and can be wired directly here.
export function createRegistry(sqliteAdapter: DbAdapter): Partial<Record<DBType, DbAdapter>> {
  return {
    pg: postgresAdapter,
    mysql: mysqlAdapter,
    mssql: mssqlAdapter,
    sqlite: sqliteAdapter,
    cassandra: cassandraAdapter,
    mongodb: mongodbAdapter,
    redis: redisAdapter,
    firebase: firebaseAdapter,
  };
}

export function getAdapter(registry: Partial<Record<DBType, DbAdapter>>, type: DBType): DbAdapter {
  const adapter = registry[type];
  if (!adapter) throw new Error(`Unsupported database type: ${type}`);
  return adapter;
}
