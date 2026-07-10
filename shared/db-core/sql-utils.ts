// DDL statements cannot use parameterised bindings for identifiers (table/schema/db names).
// Validate strictly: only letters, digits, underscores, dollar signs (all major SQL engines allow these).
const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_$]*$/;

export function validateIdentifier(name: string, label = 'identifier'): void {
  if (!name || !IDENT_RE.test(name)) {
    throw new Error(
      `Invalid ${label} "${name}". Only letters, digits, underscores and dollar signs are allowed.`
    );
  }
}
