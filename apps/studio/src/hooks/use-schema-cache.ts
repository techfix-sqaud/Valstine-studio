import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "@valstine/core/store/app-store";
import * as api from "@valstine/core/lib/api";
import {
  SchemaCache,
  ColumnMeta,
  TableMeta,
  emptyCache,
} from "@/lib/sql-completion";

export function useSchemaCache() {
  const activeConnectionId = useAppStore((s) => s.activeConnectionId);
  const connections = useAppStore((s) => s.connections);

  const [cache, setCache] = useState<SchemaCache>(emptyCache);
  const cacheRef = useRef<SchemaCache>(cache);

  // Keep ref in sync without triggering re-renders on every keypress in Monaco
  const updateCache = useCallback((updater: (prev: SchemaCache) => SchemaCache) => {
    setCache((prev) => {
      const next = updater(prev);
      cacheRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    const conn = connections.find(
      (c) => c.id === activeConnectionId && c.status === "connected",
    );

    if (!conn) {
      const empty = emptyCache(activeConnectionId);
      cacheRef.current = empty;
      setCache(empty);
      return;
    }

    let cancelled = false;

    async function load() {
      if (!conn) return;

      // Start with an empty slate for this connection
      const fresh = emptyCache(conn.id);
      cacheRef.current = fresh;
      setCache(fresh);

      try {
        // 1. Fetch schemas
        const schemas = await api.fetchSchemas(conn);
        if (cancelled) return;

        updateCache((prev) => ({ ...prev, schemas }));

        // 2. Fetch all tables across all schemas in parallel
        const tableResults = await Promise.allSettled(
          schemas.map((schema) => api.fetchTables(conn, schema)),
        );
        if (cancelled) return;

        const tables: TableMeta[] = [];
        tableResults.forEach((result, i) => {
          if (result.status === "fulfilled") {
            result.value.forEach((t) => {
              tables.push({
                name: t.name,
                schema: schemas[i],
                fullName: `${schemas[i]}.${t.name}`,
                columns: null,
              });
            });
          }
        });

        updateCache((prev) => ({ ...prev, tables }));

        // 3. Fetch databases (best-effort — some DBs may not support this)
        try {
          const databases = await api.fetchDatabases(conn);
          if (!cancelled) {
            updateCache((prev) => ({ ...prev, databases }));
          }
        } catch {
          // Not all DB types support listing databases — ignore
        }

        // 4. Pre-fetch columns for tables in default/public schema so
        //    SELECT/WHERE completions work immediately without a dot trigger.
        const defaultSchema = schemas.includes("public")
          ? "public"
          : schemas.includes("dbo")
            ? "dbo"
            : schemas[0];

        if (defaultSchema) {
          const defaultTables = tables.filter(
            (t) => t.schema === defaultSchema,
          );
          // Batch column fetches, up to 20 tables — avoid hammering small DBs
          const batch = defaultTables.slice(0, 20);
          const colResults = await Promise.allSettled(
            batch.map((t) => api.fetchColumns(conn, t.name, t.schema)),
          );
          if (cancelled) return;

          const columnsByTable = new Map<string, ColumnMeta[]>(
            cacheRef.current.columnsByTable,
          );
          colResults.forEach((result, i) => {
            if (result.status === "fulfilled") {
              const t = batch[i];
              const cols: ColumnMeta[] = result.value.map((c) => ({
                name: c.name,
                type: c.type,
                primaryKey: c.primaryKey,
                nullable: c.nullable,
              }));
              columnsByTable.set(t.fullName, cols);
            }
          });

          updateCache((prev) => ({ ...prev, columnsByTable }));
        }
      } catch (err) {
        // Network/DB error — leave cache empty but don't crash
        console.warn("[useSchemaCache] load failed:", err);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [activeConnectionId, connections, updateCache]);

  /**
   * Lazily fetch columns for a specific table (called by the completion provider
   * when the user types "table." and columns aren't cached yet).
   */
  const fetchColumnsForTable = useCallback(
    async (tableName: string, schema: string): Promise<ColumnMeta[]> => {
      const conn = connections.find(
        (c) => c.id === activeConnectionId && c.status === "connected",
      );
      if (!conn) return [];

      const key = `${schema}.${tableName}`;

      // Already cached
      const cached = cacheRef.current.columnsByTable.get(key);
      if (cached) return cached;

      // Mark as fetching to prevent duplicate requests
      cacheRef.current.fetchingColumns.add(key);

      try {
        const raw = await api.fetchColumns(conn, tableName, schema);
        const cols: ColumnMeta[] = raw.map((c) => ({
          name: c.name,
          type: c.type,
          primaryKey: c.primaryKey,
          nullable: c.nullable,
        }));

        updateCache((prev) => {
          const next = new Map(prev.columnsByTable);
          next.set(key, cols);
          const fetching = new Set(prev.fetchingColumns);
          fetching.delete(key);
          return { ...prev, columnsByTable: next, fetchingColumns: fetching };
        });

        return cols;
      } catch {
        cacheRef.current.fetchingColumns.delete(key);
        return [];
      }
    },
    [activeConnectionId, connections, updateCache],
  );

  return { cache, cacheRef, fetchColumnsForTable };
}
