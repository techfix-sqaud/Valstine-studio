import type { SchemaSnapshot, SchemaDiffEntry } from './types.js';

export function diffSnapshots(source: SchemaSnapshot, target: SchemaSnapshot): SchemaDiffEntry[] {
  const diffs: SchemaDiffEntry[] = [];
  const srcMap = new Map(source.tables.map((t) => [`${t.schema}.${t.name}`, t]));
  const tgtMap = new Map(target.tables.map((t) => [`${t.schema}.${t.name}`, t]));

  for (const [key, t] of tgtMap) {
    if (!srcMap.has(key)) {
      const colDefs = t.columns
        .map((c) => `  "${c.name}" ${c.type}${c.primaryKey ? ' PRIMARY KEY' : ''}${c.nullable ? '' : ' NOT NULL'}`)
        .join(',\n');
      diffs.push({
        type: 'table_added',
        schema: t.schema,
        table: t.name,
        migrationUp: `CREATE TABLE "${t.schema}"."${t.name}" (\n${colDefs}\n);`,
        migrationDown: `DROP TABLE IF EXISTS "${t.schema}"."${t.name}";`,
      });
    }
  }

  for (const [key, t] of srcMap) {
    if (!tgtMap.has(key)) {
      const colDefs = t.columns
        .map((c) => `  "${c.name}" ${c.type}${c.primaryKey ? ' PRIMARY KEY' : ''}${c.nullable ? '' : ' NOT NULL'}`)
        .join(',\n');
      diffs.push({
        type: 'table_removed',
        schema: t.schema,
        table: t.name,
        migrationUp: `DROP TABLE IF EXISTS "${t.schema}"."${t.name}";`,
        migrationDown: `CREATE TABLE "${t.schema}"."${t.name}" (\n${colDefs}\n);`,
      });
    }
  }

  for (const [key, srcTable] of srcMap) {
    const tgtTable = tgtMap.get(key);
    if (!tgtTable) continue;
    const srcCols = new Map(srcTable.columns.map((c) => [c.name, c]));
    const tgtCols = new Map(tgtTable.columns.map((c) => [c.name, c]));
    const qualified = `"${srcTable.schema}"."${srcTable.name}"`;

    for (const [colName, col] of tgtCols) {
      if (!srcCols.has(colName)) {
        diffs.push({
          type: 'column_added',
          schema: srcTable.schema,
          table: srcTable.name,
          column: colName,
          details: `${col.type}${col.nullable ? ' NULL' : ' NOT NULL'}`,
          migrationUp: `ALTER TABLE ${qualified} ADD COLUMN "${colName}" ${col.type}${col.nullable ? '' : ' NOT NULL'};`,
          migrationDown: `ALTER TABLE ${qualified} DROP COLUMN "${colName}";`,
        });
      }
    }

    for (const [colName, col] of srcCols) {
      if (!tgtCols.has(colName)) {
        diffs.push({
          type: 'column_removed',
          schema: srcTable.schema,
          table: srcTable.name,
          column: colName,
          details: col.type,
          migrationUp: `ALTER TABLE ${qualified} DROP COLUMN "${colName}";`,
          migrationDown: `ALTER TABLE ${qualified} ADD COLUMN "${colName}" ${col.type}${col.nullable ? '' : ' NOT NULL'};`,
        });
      }
    }

    for (const [colName, srcCol] of srcCols) {
      const tgtCol = tgtCols.get(colName);
      if (!tgtCol) continue;
      const changes: string[] = [];
      if (srcCol.type !== tgtCol.type) changes.push(`type: ${srcCol.type} → ${tgtCol.type}`);
      if (srcCol.nullable !== tgtCol.nullable) changes.push(`nullable: ${srcCol.nullable} → ${tgtCol.nullable}`);
      if (changes.length > 0) {
        diffs.push({
          type: 'column_changed',
          schema: srcTable.schema,
          table: srcTable.name,
          column: colName,
          details: changes.join(', '),
          migrationUp: `ALTER TABLE ${qualified} ALTER COLUMN "${colName}" TYPE ${tgtCol.type}${tgtCol.nullable ? '' : `, ALTER COLUMN "${colName}" SET NOT NULL`};`,
          migrationDown: `ALTER TABLE ${qualified} ALTER COLUMN "${colName}" TYPE ${srcCol.type}${srcCol.nullable ? '' : `, ALTER COLUMN "${colName}" SET NOT NULL`};`,
        });
      }
    }
  }

  return diffs;
}
