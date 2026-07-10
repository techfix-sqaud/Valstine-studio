// ============================================================================
// Valstine Studio — Time-Travel Query Log
// ============================================================================
// Every query execution captures:
//   1. The SQL text & result metadata
//   2. A Schema Snapshot (DDL) of the target database at that moment
// Schema snapshots are de-duplicated by checksum so unchanged schemas
// don't waste storage. Users can open any past query and see both the
// SQL AND the exact table shapes that existed when it ran.
// ============================================================================

import { idb } from './indexeddb';
import type { SchemaSnapshot, QuerySnapshot } from './types';

// ── Schema Snapshot Capture ──────────────────────────────────────────────

async function sha256(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Capture a schema snapshot. Returns the snapshot id.
 * If an identical snapshot (same checksum) already exists for this
 * connection+database, the existing id is returned (de-dup).
 */
export async function captureSchemaSnapshot(
  connectionId: string,
  databaseName: string,
  schemaJson: string,
): Promise<string> {
  const checksum = await sha256(schemaJson);

  // Check for existing snapshot with same checksum
  const existing = await idb.getAllSchemaSnapshots();
  const match = existing.find(
    (s) =>
      s.connectionId === connectionId &&
      s.databaseName === databaseName &&
      s.checksum === checksum,
  );
  if (match) return match.id;

  const snapshot: SchemaSnapshot = {
    id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    connectionId,
    databaseName,
    snapshotJson: schemaJson,
    checksum,
    capturedAt: new Date().toISOString(),
  };
  await idb.putSchemaSnapshot(snapshot);
  return snapshot.id;
}

// ── Query Snapshot Recording ─────────────────────────────────────────────

export interface RecordQueryInput {
  connectionId: string;
  connectionName: string;
  databaseName: string;
  sqlText: string;
  status: 'success' | 'error';
  errorMessage?: string;
  executionTimeMs: number;
  rowCount: number;
  /** First N rows serialised as JSON for quick preview */
  resultSample?: unknown[];
  /** Current schema of the database (JSON stringified DDL array) */
  currentSchemaJson?: string;
}

/**
 * Record a query execution with an optional schema snapshot.
 *
 * Flow:
 *  1. If `currentSchemaJson` provided → captureSchemaSnapshot (dedup)
 *  2. Create a QuerySnapshot referencing the schema snapshot id
 *  3. Store in IndexedDB
 */
export async function recordQuery(input: RecordQueryInput): Promise<QuerySnapshot> {
  let schemaSnapshotId: string | undefined;

  if (input.currentSchemaJson) {
    schemaSnapshotId = await captureSchemaSnapshot(
      input.connectionId,
      input.databaseName,
      input.currentSchemaJson,
    );
  }

  const entry: QuerySnapshot = {
    id: `qsnap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    connectionId: input.connectionId,
    connectionName: input.connectionName,
    databaseName: input.databaseName,
    sqlText: input.sqlText,
    status: input.status,
    errorMessage: input.errorMessage,
    executionTimeMs: input.executionTimeMs,
    rowCount: input.rowCount,
    resultSample: input.resultSample ? JSON.stringify(input.resultSample) : undefined,
    schemaSnapshotId,
    executedAt: new Date().toISOString(),
  };

  await idb.putQuerySnapshot(entry);
  return entry;
}

// ── Query Log Retrieval ──────────────────────────────────────────────────

/** Get all query snapshots, newest first. */
export async function getQueryLog(): Promise<QuerySnapshot[]> {
  const all = await idb.getAllQuerySnapshots();
  return all.sort((a, b) => b.executedAt.localeCompare(a.executedAt));
}

/** Get the schema that was active when a specific query ran. */
export async function getSchemaForQuery(
  querySnapshotId: string,
): Promise<SchemaSnapshot | undefined> {
  const q = await idb.getQuerySnapshot(querySnapshotId);
  if (!q?.schemaSnapshotId) return undefined;
  return idb.getSchemaSnapshot(q.schemaSnapshotId);
}

/** Search query log by SQL text (simple substring match). */
export async function searchQueryLog(term: string): Promise<QuerySnapshot[]> {
  const all = await getQueryLog();
  const lower = term.toLowerCase();
  return all.filter((q) => q.sqlText.toLowerCase().includes(lower));
}
