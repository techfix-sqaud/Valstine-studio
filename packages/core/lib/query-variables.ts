const VAR_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export function extractVariables(sql: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const match of sql.matchAll(VAR_RE)) {
    const name = match[1];
    if (!seen.has(name)) { seen.add(name); result.push(name); }
  }
  return result;
}

export function substituteVariables(sql: string, vars: Record<string, string>): string {
  return sql.replace(VAR_RE, (_, name) => {
    const val = vars[name] ?? '';
    // Wrap in single quotes if value looks like a string (not a number/boolean)
    if (val === '' || val === 'NULL' || val === 'null') return 'NULL';
    if (/^-?\d+(\.\d+)?$/.test(val)) return val;
    if (val === 'true' || val === 'false') return val.toUpperCase();
    return `'${val.replace(/'/g, "''")}'`;
  });
}
