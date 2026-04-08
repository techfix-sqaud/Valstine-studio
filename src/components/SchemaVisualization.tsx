import { useState, useRef, useCallback, useEffect } from 'react';
import { Key, Columns3, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { mockTables, DBTable } from '@/lib/mock-data';

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

export function SchemaVisualization() {
  const activeConnectionId = useAppStore((s) => s.activeConnectionId);
  const tables = mockTables[activeConnectionId] || [];
  const [positions, setPositions] = useState<Record<string, TablePosition>>(() => getInitialPositions(tables));
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState<string | null>(null);
  const [panning, setPanning] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const relationships = getRelationships(tables);

  useEffect(() => {
    setPositions(getInitialPositions(tables));
  }, [activeConnectionId]);

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
      fromX = fromRight;
      toX = toPos.x;
    } else if (toRight < fromPos.x) {
      fromX = fromPos.x;
      toX = toRight;
    } else {
      fromX = fromRight;
      toX = toRight;
    }

    const midX = (fromX + toX) / 2;
    return `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`;
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between px-3 py-2 border-b border-panel-border shrink-0">
        <span className="text-xs font-medium text-foreground">Schema Diagram</span>
        <div className="flex items-center gap-1">
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
                key={table.name}
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
                <text x={pos.x + 12} y={pos.y + 20} className="fill-primary-foreground text-[12px] font-semibold" fontFamily="var(--font-sans)">
                  {table.schema}.{table.name}
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
                        <text x={pos.x + 12} y={cy + 16} className="fill-warning text-[10px]" fontFamily="var(--font-sans)">🔑</text>
                      ) : (
                        <text x={pos.x + 12} y={cy + 16} className="fill-muted-foreground text-[10px]" fontFamily="var(--font-sans)">○</text>
                      )}
                      <text x={pos.x + 28} y={cy + 16} className="fill-foreground text-[11px]" fontFamily="var(--font-mono)">
                        {col.name}
                      </text>
                      <text x={pos.x + TABLE_WIDTH - 8} y={cy + 16} textAnchor="end" className="fill-muted-foreground text-[9px]" fontFamily="var(--font-mono)">
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
