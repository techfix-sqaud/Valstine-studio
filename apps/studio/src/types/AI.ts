export type QuickAction = {
  icon: React.ElementType;
  label: string;
  description: string;
  buildPrompt: (sql: string, connName: string, dbType: string) => string;
  requiresQuery?: boolean;
};
