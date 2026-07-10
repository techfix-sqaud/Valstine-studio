import { useState, useRef, useCallback, useEffect } from 'react';
import { Key, Columns3, ZoomIn, ZoomOut, Maximize2, Loader2, RefreshCw } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { DBTable, DBColumn } from '@/lib/mock-data';
import * as api from '@/lib/api';

interface TablePosition {
  x: number;
  y: number;
}

interface Relationship {
  from: string;
  fromCol: string;
  to: string;
  toCol: string;
}

const TABLE_WIDTH = 220;
const HEADER_HEIGHT = 32;
const ROW_HEIGHT = 24;

function getRelationships(tables: DBTable[]): Relationship[] {
  const rels: Relationship[] = [];
  const tableNames = new Set(tables.map(t => t.name));
  tables.forEach(table => {
    table.columns.forEach(col => {
      if (col.name.endsWith('_id') && !col.primaryKey) {
        const ref = col.name.replace('_id', '') + 's';
        if (tableNames.has(ref)) {
          rels.push({ from: table.name, fromCol: col.name, to: ref, toCol: 'id' });
        }
        const refSingular = col.name.replace('_id', '');
        if (!tableNames.has(ref) && tableNames.has(refSingular)) {
          rels.push({ from: table.name, fromCol: col.name, to: refSingular, toCol: 'id' });
        }
      }
    });
  });
  return rels;
}

function getInitialPositions(tables: DBTable[]): Record<string, TablePosition> {
  const positions: Record<string, TablePosition> = {};
  const cols = Math.ceil(Math.sqrt(tables.length));
  tables.forEach((t, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions[t.name] = { x: 40 + col * 280, y: 40 + row * 240 };
  });
  return positions;
}

async function loadRealSchema(conn: import('@/lib/mock-data').DBConnection): Promise<DBTable[]> {
  const schemas = await api.fetchSchemas(conn);

  const tableResults = await Promise.allSettled(
    schemas.map(schema => api.fetchTables(conn, schema).then(ts => ts.map(t => ({ ...t, schema }))))
  );

  const allTables: { name: string; schema: string }[] = [];
  tableResults.forEach(result => {
    if (result.status === 'fulfilled') allTables.push(...result.value.map(t => ({ name: t.name, schema: t.schema })));
  });

  const colResults = await Promise.allSettled(
    allTables.map(t => api.fetchColumns(conn, t.name, t.schema))
  );

  const dbTables: DBTable[] = [];
  allTables.forEach((t, i) => {
    const result = colResults[i];
    const columns: DBColumn[] = result.status === 'fulfilled'
      ? result.value.map(c => ({ name: c.name, type: c.type, nullable: c.nullable, primaryKey: c.primaryKey }))
      : [];
    dbTables.push({ name: t.name, schema: t.schema, rowCount: 0, columns });
  });

  return dbTables;
}

export function SchemaVisualization() {
  const activeConnectionId = useAppStore((s) => s.activeConnectionId);
  const connections = useAppStore((s) => s.connections);
  const conn = connections.find(c => c.id === activeConnectionId && c.status === 'connected');

  const [tables, setTables] = useState<DBTable[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [positions, setPositions] = useState<Record<string, TablePosition>>({});
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState<string | null>(null);
  const [panning, setPanning] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  const load = useCallback(async () => {
    if (!conn) { setTables([]); setError(''); return; }
    setLoading(true);
    setError('');
    try {
      const result = await loadRealSchema(conn);
      setTables(result);
      setPositions(getInitialPositions(result));
      setZoom(1);
      setPan({ x: 0, y: 0 });
    } catch (err: any) {
      setError(err.message ?? 'Failed to load schema');
    } finally {
      setLoading(false);
    }
  }, [conn?.id, conn?.status]);

  useEffect(() => { load(); }, [load]);

  const relationships = getRelationships(tables);

  const handleMouseDown = useCallback((tableName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const pos = positions[tableName];
    dragOffset.current = { x: e.clientX / zoom - pos.x, y: e.clientY / zoom - pos.y };
    setDragging(tableName);
  }, [positions, zoom]);

  const handleSvgMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === svgRef.current || (e.target as SVGElement).tagName === 'rect' && !(e.target as SVGElement).closest('.table-node')) {
      setPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragging) {
      setPositions(prev => ({
        ...prev,
        [dragging]: {
          x: e.clientX / zoom - dragOffset.current.x,
          y: e.clientY / zoom - dragOffset.current.y,
        }
      }));
    }
    if (panning) {
      setPan({
        x: panStart.current.panX + (e.clientX - panStart.current.x),
        y: panStart.current.panY + (e.clientY - panStart.current.y),
      });
    }
  }, [dragging, panning, zoom]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
    setPanning(false);
  }, []);

  const getTableHeight = (table: DBTable) => HEADER_HEIGHT + table.columns.length * ROW_HEIGHT + 4;

  const getConnectionPoints = (rel: Relationship) => {
    const fromPos = positions[rel.from];
    const toPos = positions[rel.to];
    if (!fromPos || !toPos) return null;

    const fromTable = tables.find(t => t.name === rel.from);
    const toTable = tables.find(t => t.name === rel.to);
    if (!fromTable || !toTable) return null;

    const fromColIdx = fromTable.columns.findIndex(c => c.name === rel.fromCol);
    const toColIdx = toTable.columns.findIndex(c => c.name === rel.toCol);

    const fromY = fromPos.y + HEADER_HEIGHT + fromColIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
    const toY = toPos.y + HEADER_HEIGHT + toColIdx * ROW_HEIGHT + ROW_HEIGHT / 2;

    const fromRight = fromPos.x + TABLE_WIDTH;
    const toRight = toPos.x + TABLE_WIDTH;

    let fromX: number, toX: number;
    if (fromRight < toPos.x) {
      fromX = fromRight; toX = toPos.x;
    } else if (toRight < fromPos.x) {
      fromX = fromPos.x; toX = toRight;
    } else {
      fromX = fromRight; toX = toRight;
    }

    const midX = (fromX + toX) / 2;
    return `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`;
  };

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  if (!conn) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-muted-foreground text-sm gap-2">
        <Columns3 className="w-8 h-8 opacity-30" />
        <span>Connect to a database to view the schema diagram</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-muted-foreground text-sm gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Loading schema…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-sm gap-3">
        <span className="text-destructive">{error}</span>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-secondary text-foreground text-xs hover:bg-secondary/70">
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }

  if (tables.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-muted-foreground text-sm gap-2">
        <Columns3 className="w-8 h-8 opacity-30" />
        <span>No tables found in this database</span>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-secondary text-foreground text-xs hover:bg-secondary/70">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between px-3 py-2 border-b border-panel-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground">Schema Diagram</span>
          <span className="text-[10px] text-muted-foreground">{tables.length} tables</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={load} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Refresh schema">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-4 bg-border mx-0.5" />
          <button onClick={() => setZoom(z => Math.min(z + 0.15, 2))} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] text-muted-foreground w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.max(z - 0.15, 0.3))} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button onClick={resetView} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <svg
        ref={svgRef}
        className="flex-1 w-full cursor-grab active:cursor-grabbing"
        onMouseDown={handleSvgMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={(e) => setZoom(z => Math.min(2, Math.max(0.3, z - e.deltaY * 0.001)))}
      >
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-primary" />
          </marker>
        </defs>
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Relationship lines */}
          {relationships.map((rel, i) => {
            const path = getConnectionPoints(rel);
            if (!path) return null;
            return (
              <path
                key={i}
                d={path}
                fill="none"
                className="stroke-primary"
                strokeWidth={1.5}
                strokeDasharray="6 3"
                markerEnd="url(#arrow)"
                opacity={0.6}
              />
            );
          })}

          {/* Tables */}
          {tables.map((table) => {
            const pos = positions[table.name];
            if (!pos) return null;
            const height = getTableHeight(table);
            return (
              <g
                key={`${table.schema}.${table.name}`}
                className="table-node"
                onMouseDown={(e) => handleMouseDown(table.name, e)}
                style={{ cursor: 'move' }}
              >
                {/* Shadow */}
                <rect x={pos.x + 2} y={pos.y + 2} width={TABLE_WIDTH} height={height} rx={6} className="fill-foreground/5" />
                {/* Card */}
                <rect x={pos.x} y={pos.y} width={TABLE_WIDTH} height={height} rx={6} className="fill-card stroke-border" strokeWidth={1} />
                {/* Header */}
                <rect x={pos.x} y={pos.y} width={TABLE_WIDTH} height={HEADER_HEIGHT} rx={6} className="fill-primary" />
                <rect x={pos.x} y={pos.y + HEADER_HEIGHT - 6} width={TABLE_WIDTH} height={6} className="fill-primary" />
                <text x={pos.x + 12} y={pos.y + 13} className="fill-primary-foreground" fontFamily="var(--font-mono)" fontSize={9} opacity={0.7}>
                  {table.schema}
                </text>
                <text x={pos.x + 12} y={pos.y + 25} className="fill-primary-foreground" fontFamily="var(--font-mono)" fontSize={11} fontWeight="600">
                  {table.name}
                </text>

                {/* Columns */}
                {table.columns.map((col, idx) => {
                  const cy = pos.y + HEADER_HEIGHT + idx * ROW_HEIGHT;
                  return (
                    <g key={col.name}>
                      {idx < table.columns.length - 1 && (
                        <line x1={pos.x + 8} y1={cy + ROW_HEIGHT} x2={pos.x + TABLE_WIDTH - 8} y2={cy + ROW_HEIGHT} className="stroke-border" strokeWidth={0.5} />
                      )}
                      {col.primaryKey ? (
                        <text x={pos.x + 12} y={cy + 16} fontFamily="var(--font-sans)" fontSize={10}>🔑</text>
                      ) : (
                        <text x={pos.x + 12} y={cy + 16} className="fill-muted-foreground" fontFamily="var(--font-sans)" fontSize={10}>○</text>
                      )}
                      <text x={pos.x + 28} y={cy + 16} className="fill-foreground" fontFamily="var(--font-mono)" fontSize={11}>
                        {col.name}
                      </text>
                      <text x={pos.x + TABLE_WIDTH - 8} y={cy + 16} textAnchor="end" className="fill-muted-foreground" fontFamily="var(--font-mono)" fontSize={9}>
                        {col.type}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
