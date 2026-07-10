import type { DbAdapter, DBType } from './types.js';
import { postgresAdapter } from './adapters/postgres.js';
import { mysqlAdapter } from './adapters/mysql.js';
import { mssqlAdapter } from './adapters/mssql.js';
import { cassandraAdapter } from './adapters/cassandra.js';

// sqlite is injected per-runtime (Electron: knex+better-sqlite3, web server:
// bun:sqlite) — see shared/db-core/adapters/sqlite.ts. Remaining NoSQL adapters
// get added to this record as they land (MongoDB/Firebase/Redis, Phases 2-4).
export function createRegistry(sqliteAdapter: DbAdapter): Partial<Record<DBType, DbAdapter>> {
  return {
    pg: postgresAdapter,
    mysql: mysqlAdapter,
    mssql: mssqlAdapter,
    sqlite: sqliteAdapter,
    cassandra: cassandraAdapter,
  };
}

export function getAdapter(registry: Partial<Record<DBType, DbAdapter>>, type: DBType): DbAdapter {
  const adapter = registry[type];
  if (!adapter) throw new Error(`Unsupported database type: ${type}`);
  return adapter;
}
