export type DBType = 'pg' | 'mysql' | 'sqlite' | 'mssql' | 'cassandra';

export interface DBConnection {
  id: string;
  name: string;
  type: DBType;
  host: string;
  port: number;
  database: string;
  user?: string;
  password?: string;
  filename?: string; // for SQLite
  ssl?: boolean;
  sslRejectUnauthorized?: boolean;
  status: 'connected' | 'disconnected';
  color?: string; // hex color for visual environment distinction
  isProduction?: boolean; // enables destructive-query safety guard
  contactPoints?: string[]; // Cassandra: comma-separated host list
  localDataCenter?: string; // Cassandra: e.g. "datacenter1"
}

export interface DBTable {
  name: string;
  schema: string;
  columns: DBColumn[];
  rowCount: number;
}

export interface DBColumn {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  defaultValue?: string;
}

export interface QueryTab {
  id: string;
  title: string;
  content: string;
  connectionId: string;
  isDirty: boolean;
  type?: 'query' | 'dashboard' | 'schema' | 'schema-diff' | 'api-generator' | 'api-tester';
  diffData?: import('@/components/SchemaDiffView').SchemaDiffData;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTime: number;
  status: 'success' | 'error';
  message?: string;
}

export const mockConnections: DBConnection[] = [
  { id: 'conn-1', name: 'Production DB', type: 'pg', host: 'prod.db.example.com', port: 5432, database: 'app_production', user: 'postgres', status: 'connected' },
  { id: 'conn-2', name: 'Staging DB', type: 'mysql', host: 'staging.db.example.com', port: 3306, database: 'app_staging', user: 'root', status: 'connected' },
  { id: 'conn-3', name: 'Local Dev', type: 'pg', host: 'localhost', port: 5432, database: 'app_dev', user: 'postgres', status: 'disconnected' },
];

export const mockTables: Record<string, DBTable[]> = {
  'conn-1': [
    {
      name: 'users', schema: 'public', rowCount: 15420,
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true, defaultValue: 'gen_random_uuid()' },
        { name: 'email', type: 'varchar(255)', nullable: false, primaryKey: false },
        { name: 'full_name', type: 'varchar(255)', nullable: true, primaryKey: false },
        { name: 'created_at', type: 'timestamptz', nullable: false, primaryKey: false, defaultValue: 'now()' },
        { name: 'updated_at', type: 'timestamptz', nullable: false, primaryKey: false, defaultValue: 'now()' },
        { name: 'is_active', type: 'boolean', nullable: false, primaryKey: false, defaultValue: 'true' },
      ],
    },
    {
      name: 'orders', schema: 'public', rowCount: 89230,
      columns: [
        { name: 'id', type: 'bigserial', nullable: false, primaryKey: true },
        { name: 'user_id', type: 'uuid', nullable: false, primaryKey: false },
        { name: 'total_amount', type: 'decimal(10,2)', nullable: false, primaryKey: false },
        { name: 'status', type: 'varchar(50)', nullable: false, primaryKey: false, defaultValue: "'pending'" },
        { name: 'created_at', type: 'timestamptz', nullable: false, primaryKey: false, defaultValue: 'now()' },
      ],
    },
    {
      name: 'products', schema: 'public', rowCount: 2340,
      columns: [
        { name: 'id', type: 'serial', nullable: false, primaryKey: true },
        { name: 'name', type: 'varchar(255)', nullable: false, primaryKey: false },
        { name: 'price', type: 'decimal(10,2)', nullable: false, primaryKey: false },
        { name: 'category', type: 'varchar(100)', nullable: true, primaryKey: false },
        { name: 'stock', type: 'integer', nullable: false, primaryKey: false, defaultValue: '0' },
      ],
    },
    {
      name: 'sessions', schema: 'auth', rowCount: 45000,
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'user_id', type: 'uuid', nullable: false, primaryKey: false },
        { name: 'token', type: 'text', nullable: false, primaryKey: false },
        { name: 'expires_at', type: 'timestamptz', nullable: false, primaryKey: false },
      ],
    },
  ],
  'conn-2': [
    {
      name: 'users', schema: 'public', rowCount: 500,
      columns: [
        { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
        { name: 'email', type: 'varchar(255)', nullable: false, primaryKey: false },
        { name: 'created_at', type: 'timestamptz', nullable: false, primaryKey: false },
      ],
    },
  ],
};

export const mockQueryResult: QueryResult = {
  columns: ['id', 'email', 'full_name', 'created_at', 'is_active'],
  rows: [
    { id: 'a1b2c3d4', email: 'alice@example.com', full_name: 'Alice Johnson', created_at: '2024-01-15 09:30:00', is_active: true },
    { id: 'e5f6g7h8', email: 'bob@example.com', full_name: 'Bob Smith', created_at: '2024-02-20 14:15:00', is_active: true },
    { id: 'i9j0k1l2', email: 'carol@example.com', full_name: 'Carol Davis', created_at: '2024-03-10 11:00:00', is_active: false },
    { id: 'm3n4o5p6', email: 'dave@example.com', full_name: 'Dave Wilson', created_at: '2024-04-05 16:45:00', is_active: true },
    { id: 'q7r8s9t0', email: 'eve@example.com', full_name: 'Eve Martinez', created_at: '2024-05-22 08:20:00', is_active: true },
    { id: 'u1v2w3x4', email: 'frank@example.com', full_name: 'Frank Brown', created_at: '2024-06-18 13:10:00', is_active: false },
    { id: 'y5z6a7b8', email: 'grace@example.com', full_name: 'Grace Lee', created_at: '2024-07-30 10:55:00', is_active: true },
    { id: 'c9d0e1f2', email: 'hank@example.com', full_name: 'Hank Taylor', created_at: '2024-08-12 15:30:00', is_active: true },
  ],
  rowCount: 8,
  executionTime: 23,
  status: 'success',
};

export const defaultQueryContent = `-- Query all active users
SELECT 
  u.id,
  u.email,
  u.full_name,
  u.created_at,
  u.is_active
FROM public.users u
WHERE u.is_active = true
ORDER BY u.created_at DESC
LIMIT 100;`;

export const defaultTabs: QueryTab[] = [
  {
    id: 'dashboard-1',
    title: 'fleet_usage.vdash',
    content: '',
    connectionId: '',
    isDirty: false,
    type: 'dashboard',
  },
];
