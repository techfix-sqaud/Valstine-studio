import { useState, useEffect } from "react";
import Editor from "@monaco-editor/react";
import {
  Code2,
  Copy,
  Check,
  Download,
  ChevronDown,
  Loader2,
  Sparkles,
  Play,
  Send,
  Globe,
  Clock,
  AlertCircle,
} from "lucide-react";
import { cn } from "@valstine/ui/lib/utils";
import { useAppStore } from "@valstine/core/store/app-store";
import * as api from "@valstine/core/lib/api";
import type { RemoteColumnInfo } from "@valstine/core/lib/api";

// ── Type mapping ───────────────────────────────────────────────

function sqlTypeToCsharp(sqlType: string, nullable: boolean): string {
  const t = sqlType.toLowerCase().replace(/\(.*?\)/g, "").trim();
  const map: Record<string, string> = {
    int: "int", integer: "int", int4: "int", int2: "short",
    smallint: "short", tinyint: "byte",
    bigint: "long", int8: "long",
    decimal: "decimal", numeric: "decimal", money: "decimal", smallmoney: "decimal",
    float: "double", real: "float", "double precision": "double", "double": "double",
    varchar: "string", nvarchar: "string", char: "string", nchar: "string",
    text: "string", ntext: "string", clob: "string", "character varying": "string",
    boolean: "bool", bool: "bool", bit: "bool",
    date: "DateOnly", datetime: "DateTime", datetime2: "DateTime",
    timestamp: "DateTime", timestamptz: "DateTime", "timestamp without time zone": "DateTime",
    "timestamp with time zone": "DateTimeOffset",
    time: "TimeSpan", timetz: "TimeSpan",
    uuid: "Guid", uniqueidentifier: "Guid",
    json: "string", jsonb: "string", xml: "string",
    bytea: "byte[]", varbinary: "byte[]", binary: "byte[]", image: "byte[]",
  };
  const csType = map[t] ?? "string";
  // string is already a reference type (nullable by default), no ? needed
  if (csType === "string" || csType === "byte[]") return csType;
  return nullable ? `${csType}?` : csType;
}

function toPascalCase(str: string): string {
  return str
    .split(/[_\s-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

// ── Code generation ────────────────────────────────────────────

interface GenContext {
  tableName: string;
  modelName: string;
  columns: RemoteColumnInfo[];
  pkCol: RemoteColumnInfo;
  pkCsType: string;
  dbProvider: string;
  connString: string;
  nugetProvider: string;
  routeBase: string;
}

function buildContext(
  tableName: string,
  columns: RemoteColumnInfo[],
  dbType: string,
): GenContext {
  const modelName = toPascalCase(tableName);
  const pkCol = columns.find((c) => c.primaryKey) ?? columns[0];
  const pkCsType = pkCol ? sqlTypeToCsharp(pkCol.type, false) : "int";

  const providerMap: Record<string, { pkg: string; nuget: string; cs: string }> = {
    pg: {
      pkg: "Npgsql.EntityFrameworkCore.PostgreSQL",
      nuget: "Npgsql.EntityFrameworkCore.PostgreSQL",
      cs: `Host=localhost;Database=mydb;Username=postgres;Password=secret`,
    },
    mysql: {
      pkg: "Pomelo.EntityFrameworkCore.MySql",
      nuget: "Pomelo.EntityFrameworkCore.MySql",
      cs: `Server=localhost;Database=mydb;User=root;Password=secret`,
    },
    sqlite: {
      pkg: "Microsoft.EntityFrameworkCore.Sqlite",
      nuget: "Microsoft.EntityFrameworkCore.Sqlite",
      cs: `Data Source=app.db`,
    },
    mssql: {
      pkg: "Microsoft.EntityFrameworkCore.SqlServer",
      nuget: "Microsoft.EntityFrameworkCore.SqlServer",
      cs: `Server=localhost;Database=mydb;User Id=sa;Password=secret;TrustServerCertificate=true`,
    },
  };

  const prov = providerMap[dbType] ?? providerMap.mssql;
  const routeBase = toCamelCase(tableName) + "s";

  return {
    tableName,
    modelName,
    columns,
    pkCol,
    pkCsType,
    dbProvider: prov.pkg,
    connString: prov.cs,
    nugetProvider: prov.nuget,
    routeBase,
  };
}

function genModel(ctx: GenContext): string {
  const props = ctx.columns
    .map((col) => {
      const csType = sqlTypeToCsharp(col.type, col.nullable && !col.primaryKey);
      const name = toPascalCase(col.name);
      const lines: string[] = [];
      if (col.primaryKey) lines.push("    [Key]");
      if (!col.nullable && csType === "string") lines.push("    [Required]");
      const defaultVal = csType === "string" ? ' = string.Empty;' : ";";
      lines.push(`    public ${csType} ${name} { get; set; }${csType === "string" ? defaultVal : ""}`);
      return lines.join("\n");
    })
    .join("\n\n");

  return `using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Api.Models;

[Table("${ctx.tableName}")]
public class ${ctx.modelName}
{
${props}
}
`;
}

function genDbContext(ctx: GenContext): string {
  const setName = toPascalCase(ctx.tableName) + "s";
  return `using Microsoft.EntityFrameworkCore;
using Api.Models;

namespace Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<${ctx.modelName}> ${setName} => Set<${ctx.modelName}>();
}
`;
}

function genController(ctx: GenContext): string {
  const setName = toPascalCase(ctx.tableName) + "s";
  const routeName = toPascalCase(ctx.tableName) + "s";
  const pkParam = toCamelCase(ctx.pkCol?.name ?? "id");
  const pkProp = toPascalCase(ctx.pkCol?.name ?? "id");

  return `using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Api.Data;
using Api.Models;

namespace Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ${routeName}Controller : ControllerBase
{
    private readonly AppDbContext _db;

    public ${routeName}Controller(AppDbContext db) => _db = db;

    // GET: api/${ctx.routeBase}
    [HttpGet]
    public async Task<ActionResult<IEnumerable<${ctx.modelName}>>> GetAll(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        return await _db.${setName}
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();
    }

    // GET: api/${ctx.routeBase}/{${pkParam}}
    [HttpGet("{${pkParam}}")]
    public async Task<ActionResult<${ctx.modelName}>> GetById(${ctx.pkCsType} ${pkParam})
    {
        var item = await _db.${setName}.FindAsync(${pkParam});
        return item is null ? NotFound() : Ok(item);
    }

    // POST: api/${ctx.routeBase}
    [HttpPost]
    public async Task<ActionResult<${ctx.modelName}>> Create(${ctx.modelName} item)
    {
        _db.${setName}.Add(item);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { ${pkParam} = item.${pkProp} }, item);
    }

    // PUT: api/${ctx.routeBase}/{${pkParam}}
    [HttpPut("{${pkParam}}")]
    public async Task<IActionResult> Update(${ctx.pkCsType} ${pkParam}, ${ctx.modelName} item)
    {
        if (${pkParam} != item.${pkProp}) return BadRequest();
        _db.Entry(item).State = EntityState.Modified;
        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            if (!await _db.${setName}.AnyAsync(e => e.${pkProp} == ${pkParam}))
                return NotFound();
            throw;
        }
        return NoContent();
    }

    // DELETE: api/${ctx.routeBase}/{${pkParam}}
    [HttpDelete("{${pkParam}}")]
    public async Task<IActionResult> Delete(${ctx.pkCsType} ${pkParam})
    {
        var item = await _db.${setName}.FindAsync(${pkParam});
        if (item is null) return NotFound();
        _db.${setName}.Remove(item);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
`;
}

function genProgramCs(ctx: GenContext): string {
  const setName = toPascalCase(ctx.tableName) + "s";

  const providerCall =
    ctx.dbProvider === "Npgsql.EntityFrameworkCore.PostgreSQL"
      ? "UseNpgsql"
      : ctx.dbProvider === "Pomelo.EntityFrameworkCore.MySql"
        ? "UseMySql(..., ServerVersion.AutoDetect(...))"
        : ctx.dbProvider === "Microsoft.EntityFrameworkCore.Sqlite"
          ? "UseSqlite"
          : "UseSqlServer";

  return `using Microsoft.EntityFrameworkCore;
using Api.Data;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Install: dotnet add package ${ctx.nugetProvider}
builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.${providerCall}(builder.Configuration.GetConnectionString("DefaultConnection")));

// Allow requests from Valstine Studio (dev)
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();
app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();

app.Run();
`;
}

function genAppSettings(ctx: GenContext): string {
  return `{
  "ConnectionStrings": {
    "DefaultConnection": "${ctx.connString}"
  },
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "AllowedHosts": "*"
}
`;
}

function genCsproj(ctx: GenContext): string {
  return `<Project Sdk="Microsoft.NET.Sdk.Web">

  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.AspNetCore.OpenApi" Version="8.0.*" />
    <PackageReference Include="Swashbuckle.AspNetCore" Version="6.6.*" />
    <PackageReference Include="${ctx.nugetProvider}" Version="8.0.*" />
  </ItemGroup>

</Project>
`;
}

// ── Endpoint cards ─────────────────────────────────────────────

const METHOD_COLORS: Record<string, string> = {
  GET:    "bg-blue-500/15 text-blue-400 border-blue-500/30",
  POST:   "bg-green-500/15 text-green-400 border-green-500/30",
  PUT:    "bg-amber-500/15 text-amber-400 border-amber-500/30",
  DELETE: "bg-red-500/15 text-red-400 border-red-500/30",
};

interface EndpointDef {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  description: string;
  params?: { name: string; type: string; in: "path" | "query" }[];
  body?: { name: string; type: string; required: boolean }[];
  response: string;
}

function buildEndpoints(ctx: GenContext): EndpointDef[] {
  const base = `/api/${ctx.routeBase}`;
  const pk = ctx.pkCol?.name ?? "id";
  const pkType = ctx.pkCsType;

  const bodyFields = ctx.columns
    .filter((c) => !c.primaryKey)
    .map((c) => ({ name: c.name, type: sqlTypeToCsharp(c.type, c.nullable), required: !c.nullable }));

  return [
    {
      method: "GET",
      path: base,
      description: `List all ${ctx.tableName} records with pagination.`,
      params: [
        { name: "page", type: "int", in: "query" },
        { name: "pageSize", type: "int", in: "query" },
      ],
      response: `${ctx.modelName}[]`,
    },
    {
      method: "GET",
      path: `${base}/{${pk}}`,
      description: `Get a single ${ctx.modelName} by its primary key.`,
      params: [{ name: pk, type: pkType, in: "path" }],
      response: ctx.modelName,
    },
    {
      method: "POST",
      path: base,
      description: `Create a new ${ctx.modelName} record.`,
      body: bodyFields,
      response: `${ctx.modelName} (201 Created)`,
    },
    {
      method: "PUT",
      path: `${base}/{${pk}}`,
      description: `Update an existing ${ctx.modelName} record.`,
      params: [{ name: pk, type: pkType, in: "path" }],
      body: bodyFields,
      response: "204 No Content",
    },
    {
      method: "DELETE",
      path: `${base}/{${pk}}`,
      description: `Delete a ${ctx.modelName} record by its primary key.`,
      params: [{ name: pk, type: pkType, in: "path" }],
      response: "204 No Content",
    },
  ];
}

interface RunResponse {
  status: number;
  statusText: string;
  body: string;
  elapsed: number;
}

function buildDefaultBody(body: EndpointDef["body"]): string {
  if (!body || body.length === 0) return "";
  const example: Record<string, unknown> = {};
  for (const f of body) {
    const t = f.type.replace("?", "");
    if (t === "string") example[f.name] = "";
    else if (t === "bool") example[f.name] = false;
    else if (t === "Guid") example[f.name] = "00000000-0000-0000-0000-000000000000";
    else if (t === "DateTime" || t === "DateTimeOffset" || t === "DateOnly")
      example[f.name] = new Date().toISOString().split("T")[0];
    else example[f.name] = 0;
  }
  return JSON.stringify(example, null, 2);
}

function StatusBadge({ status }: { status: number }) {
  const cls =
    status >= 200 && status < 300
      ? "bg-green-500/15 text-green-400 border-green-500/30"
      : status >= 400
        ? "bg-red-500/15 text-red-400 border-red-500/30"
        : "bg-amber-500/15 text-amber-400 border-amber-500/30";
  return (
    <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded border font-mono", cls)}>
      {status}
    </span>
  );
}

function EndpointCard({ ep, baseUrl }: { ep: EndpointDef; baseUrl: string }) {
  const [docsOpen, setDocsOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);

  const pathParams = ep.params?.filter((p) => p.in === "path") ?? [];
  const queryParams = ep.params?.filter((p) => p.in === "query") ?? [];

  const [pathValues, setPathValues] = useState<Record<string, string>>(
    Object.fromEntries(pathParams.map((p) => [p.name, ""])),
  );
  const [queryValues, setQueryValues] = useState<Record<string, string>>(
    Object.fromEntries(queryParams.map((p) => [p.name, ""])),
  );
  const [bodyText, setBodyText] = useState(() => buildDefaultBody(ep.body));
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<RunResponse | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const buildUrl = () => {
    let p = ep.path;
    for (const [k, v] of Object.entries(pathValues)) {
      p = p.replace(`{${k}}`, encodeURIComponent(v || `:${k}`));
    }
    const qs = queryParams
      .filter((q) => queryValues[q.name])
      .map((q) => `${q.name}=${encodeURIComponent(queryValues[q.name])}`)
      .join("&");
    return `${baseUrl.replace(/\/$/, "")}${p}${qs ? `?${qs}` : ""}`;
  };

  const handleSend = async () => {
    setSending(true);
    setResponse(null);
    setRunError(null);
    const hasBody = (ep.method === "POST" || ep.method === "PUT") && bodyText.trim();
    try {
      const res = await fetch("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: buildUrl(),
          method: ep.method,
          headers: hasBody ? { "Content-Type": "application/json" } : {},
          body: hasBody ? bodyText : undefined,
          timeout: 10000,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setResponse({ status: data.status, statusText: data.statusText, body: data.body, elapsed: data.elapsed });
      } else {
        setRunError(data.error ?? "Request failed");
      }
    } catch (e: any) {
      setRunError(e.message ?? "Network error");
    } finally {
      setSending(false);
    }
  };

  const formattedBody = (() => {
    if (!response) return "";
    try { return JSON.stringify(JSON.parse(response.body), null, 2); }
    catch { return response.body || "(empty)"; }
  })();

  return (
    <div className="border border-panel-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-panel-bg/40 hover:bg-panel-bg/60 transition-colors">
        <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded border font-mono shrink-0", METHOD_COLORS[ep.method])}>
          {ep.method}
        </span>
        <button
          className="text-xs text-foreground font-mono flex-1 min-w-0 truncate text-left"
          onClick={() => setDocsOpen((v) => !v)}
        >
          {ep.path}
        </button>
        <span className="text-[11px] text-muted-foreground truncate hidden md:block max-w-[200px]">
          {ep.description}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); setRunOpen((v) => !v); }}
          className={cn(
            "shrink-0 flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded border transition-colors",
            runOpen
              ? "border-primary/50 bg-primary/10 text-primary"
              : "border-panel-border text-muted-foreground hover:text-foreground hover:border-primary/30",
          )}
        >
          <Play className="w-3 h-3" />
          Run
        </button>
        <ChevronDown
          className={cn("w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform cursor-pointer", docsOpen && "rotate-180")}
          onClick={() => setDocsOpen((v) => !v)}
        />
      </div>

      {/* Docs panel */}
      {docsOpen && (
        <div className="px-4 pb-4 pt-3 border-t border-panel-border bg-background/20 space-y-3">
          <p className="text-[11px] text-muted-foreground">{ep.description}</p>
          {ep.params && ep.params.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Parameters</div>
              <div className="space-y-1">
                {ep.params.map((p) => (
                  <div key={p.name} className="flex items-center gap-2 text-[11px]">
                    <span className="font-mono text-foreground w-24 shrink-0">{p.name}</span>
                    <span className="text-blue-400">{p.type}</span>
                    <span className="text-muted-foreground/60 italic">({p.in})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {ep.body && ep.body.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Request Body</div>
              <div className="rounded border border-panel-border bg-panel-bg p-2.5 space-y-1">
                {ep.body.map((f) => (
                  <div key={f.name} className="flex items-center gap-2 text-[11px]">
                    <span className="font-mono text-foreground w-24 shrink-0">{f.name}</span>
                    <span className="text-blue-400">{f.type}</span>
                    {f.required && <span className="text-red-400 text-[10px]">required</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Response</div>
            <span className="font-mono text-[11px] text-green-400">{ep.response}</span>
          </div>
        </div>
      )}

      {/* Run panel */}
      {runOpen && (
        <div className="border-t border-panel-border bg-background/40 p-4 space-y-4">
          {/* Path params */}
          {pathParams.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Path Parameters</div>
              <div className="space-y-2">
                {pathParams.map((p) => (
                  <div key={p.name} className="flex items-center gap-3">
                    <label className="text-[11px] font-mono text-foreground w-24 shrink-0">{p.name}</label>
                    <input
                      value={pathValues[p.name] ?? ""}
                      onChange={(e) => setPathValues((v) => ({ ...v, [p.name]: e.target.value }))}
                      placeholder={p.type}
                      className="flex-1 bg-panel-bg border border-panel-border rounded px-2.5 py-1.5 text-xs font-mono text-foreground outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Query params */}
          {queryParams.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Query Parameters</div>
              <div className="space-y-2">
                {queryParams.map((p) => (
                  <div key={p.name} className="flex items-center gap-3">
                    <label className="text-[11px] font-mono text-foreground w-24 shrink-0">{p.name}</label>
                    <input
                      value={queryValues[p.name] ?? ""}
                      onChange={(e) => setQueryValues((v) => ({ ...v, [p.name]: e.target.value }))}
                      placeholder={p.type}
                      className="flex-1 bg-panel-bg border border-panel-border rounded px-2.5 py-1.5 text-xs font-mono text-foreground outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Request body */}
          {(ep.method === "POST" || ep.method === "PUT") && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Request Body (JSON)</div>
              <textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                rows={Math.min(10, (ep.body?.length ?? 1) * 2 + 3)}
                spellCheck={false}
                className="w-full bg-panel-bg border border-panel-border rounded px-3 py-2 text-xs font-mono text-foreground outline-none focus:ring-1 focus:ring-primary resize-y"
              />
            </div>
          )}

          {/* URL preview + Send */}
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 flex items-center gap-1.5 bg-panel-bg border border-panel-border rounded px-2.5 py-1.5">
              <Globe className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-[11px] font-mono text-muted-foreground truncate">{buildUrl()}</span>
            </div>
            <button
              onClick={handleSend}
              disabled={sending}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Send
            </button>
          </div>

          {/* Error */}
          {runError && (
            <div className="flex items-start gap-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {runError}
            </div>
          )}

          {/* Response */}
          {response && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <StatusBadge status={response.status} />
                <span className="text-[11px] text-muted-foreground">{response.statusText}</span>
                <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock className="w-3 h-3" />{response.elapsed}ms
                </span>
              </div>
              <div className="rounded border border-panel-border bg-panel-bg overflow-auto max-h-72">
                <pre className="p-3 text-[11px] font-mono text-foreground whitespace-pre-wrap break-all leading-relaxed">
                  {formattedBody}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Code view ──────────────────────────────────────────────────

const CODE_TABS = [
  { id: "model", label: "Model.cs" },
  { id: "dbcontext", label: "AppDbContext.cs" },
  { id: "controller", label: "Controller.cs" },
  { id: "program", label: "Program.cs" },
  { id: "appsettings", label: "appsettings.json" },
  { id: "csproj", label: "Api.csproj" },
] as const;

type CodeTabId = (typeof CODE_TABS)[number]["id"];

// ── Component ─────────────────────────────────────────────────

export function ApiGenerator() {
  const { connections, activeConnectionId, theme } = useAppStore();

  const [selectedConnId, setSelectedConnId] = useState(activeConnectionId || connections[0]?.id || "");
  const [schemas, setSchemas] = useState<string[]>([]);
  const [selectedSchema, setSelectedSchema] = useState("");
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [columns, setColumns] = useState<RemoteColumnInfo[]>([]);
  const [loadingSchemas, setLoadingSchemas] = useState(false);
  const [loadingTables, setLoadingTables] = useState(false);
  const [loadingCols, setLoadingCols] = useState(false);
  const [viewMode, setViewMode] = useState<"endpoints" | "code">("endpoints");
  const [codeTab, setCodeTab] = useState<CodeTabId>("model");
  const [copied, setCopied] = useState(false);
  const [baseUrl, setBaseUrl] = useState("http://localhost:5000");

  const conn = connections.find((c) => c.id === selectedConnId);

  useEffect(() => {
    if (!conn) return;
    setLoadingSchemas(true);
    setSchemas([]); setTables([]); setColumns([]);
    setSelectedSchema(""); setSelectedTable("");
    api.fetchSchemas(conn)
      .then((s) => { setSchemas(s); if (s.length) setSelectedSchema(s[0]); })
      .catch(() => {})
      .finally(() => setLoadingSchemas(false));
  }, [selectedConnId]);

  useEffect(() => {
    if (!conn || !selectedSchema) return;
    setLoadingTables(true);
    setTables([]); setColumns([]); setSelectedTable("");
    api.fetchTables(conn, selectedSchema)
      .then((t) => {
        const names = t.filter((x) => x.type === "table").map((x) => x.name);
        setTables(names);
        if (names.length) setSelectedTable(names[0]);
      })
      .catch(() => {})
      .finally(() => setLoadingTables(false));
  }, [selectedSchema, selectedConnId]);

  useEffect(() => {
    if (!conn || !selectedTable) return;
    setLoadingCols(true);
    setColumns([]);
    api.fetchColumns(conn, selectedTable, selectedSchema)
      .then((c) => setColumns(c))
      .catch(() => {})
      .finally(() => setLoadingCols(false));
  }, [selectedTable, selectedSchema, selectedConnId]);

  const ctx = conn && selectedTable && columns.length
    ? buildContext(selectedTable, columns, conn.type)
    : null;

  const codeMap: Record<CodeTabId, string> = ctx
    ? {
        model: genModel(ctx),
        dbcontext: genDbContext(ctx),
        controller: genController(ctx),
        program: genProgramCs(ctx),
        appsettings: genAppSettings(ctx),
        csproj: genCsproj(ctx),
      }
    : {
        model: "// Select a connection and table to generate code",
        dbcontext: "// Select a connection and table to generate code",
        controller: "// Select a connection and table to generate code",
        program: "// Select a connection and table to generate code",
        appsettings: "// Select a connection and table to generate code",
        csproj: "// Select a connection and table to generate code",
      };

  const handleCopy = () => {
    navigator.clipboard.writeText(codeMap[codeTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadAll = () => {
    if (!ctx) return;
    const files: [string, string][] = [
      [`Models/${ctx.modelName}.cs`, codeMap.model],
      ["Data/AppDbContext.cs", codeMap.dbcontext],
      [`Controllers/${ctx.modelName}sController.cs`, codeMap.controller],
      ["Program.cs", codeMap.program],
      ["appsettings.json", codeMap.appsettings],
      ["Api.csproj", codeMap.csproj],
    ];
    files.forEach(([name, content]) => {
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name.replace("/", "_");
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  const selectClass =
    "bg-panel-bg border border-panel-border text-foreground text-xs rounded px-2 py-1.5 w-full focus:outline-none focus:ring-1 focus:ring-primary";

  const endpoints = ctx ? buildEndpoints(ctx) : [];

  return (
    <div className="h-full flex overflow-hidden">
      {/* Left panel — config */}
      <div className="w-56 shrink-0 flex flex-col border-r border-panel-border bg-titlebar/30 overflow-y-auto">
        <div className="p-3 border-b border-panel-border">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground mb-3">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            .NET API Generator
          </div>

          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Connection</label>
          <div className="relative mb-3">
            <select value={selectedConnId} onChange={(e) => setSelectedConnId(e.target.value)} className={selectClass}>
              {connections.length === 0 && <option value="">No connections</option>}
              {connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Schema</label>
          <div className="relative mb-3">
            <select value={selectedSchema} onChange={(e) => setSelectedSchema(e.target.value)} className={selectClass} disabled={loadingSchemas || schemas.length === 0}>
              {loadingSchemas && <option>Loading...</option>}
              {schemas.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Table</label>
          <div className="relative mb-4">
            <select value={selectedTable} onChange={(e) => setSelectedTable(e.target.value)} className={selectClass} disabled={loadingTables || tables.length === 0}>
              {loadingTables && <option>Loading...</option>}
              {!loadingTables && tables.length === 0 && <option>No tables</option>}
              {tables.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        {/* Column preview */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Columns</div>
          {loadingCols ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading…
            </div>
          ) : columns.length === 0 ? (
            <div className="text-xs text-muted-foreground">Select a table</div>
          ) : (
            <div className="space-y-0.5">
              {columns.map((col) => (
                <div key={col.name} className="flex items-start gap-1.5 py-0.5">
                  <span className={cn("shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full", col.primaryKey ? "bg-yellow-400" : "bg-muted-foreground/40")} />
                  <div className="min-w-0">
                    <span className="text-[11px] text-foreground truncate block">{col.name}</span>
                    <span className="text-[10px] text-muted-foreground">{col.type}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-panel-border space-y-2">
          <button onClick={handleDownloadAll} disabled={!ctx} className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <Download className="w-3.5 h-3.5" />
            Download All Files
          </button>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* View mode toggle + file tabs */}
        <div className="flex items-center border-b border-panel-border bg-panel-bg/60 shrink-0">
          {/* Endpoints / Code toggle */}
          <div className="flex items-center gap-0.5 px-2 py-1.5">
            <button
              onClick={() => setViewMode("endpoints")}
              className={cn(
                "px-3 py-1 text-[11px] rounded transition-colors",
                viewMode === "endpoints" ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Endpoints
            </button>
            <button
              onClick={() => setViewMode("code")}
              className={cn(
                "px-3 py-1 text-[11px] rounded transition-colors",
                viewMode === "code" ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Code
            </button>
          </div>

          {/* Code file tabs (only in code view) */}
          {viewMode === "code" && (
            <div className="flex items-center gap-0 overflow-x-auto scrollbar-none flex-1">
              {CODE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setCodeTab(tab.id)}
                  className={cn(
                    "px-3 py-2 text-[11px] whitespace-nowrap border-b-2 transition-colors",
                    codeTab === tab.id ? "text-foreground border-primary" : "text-muted-foreground hover:text-foreground border-transparent",
                  )}
                >
                  {tab.label}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-1 px-2">
                <button onClick={handleCopy} title="Copy code" className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                  {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Endpoint cards view */}
        {viewMode === "endpoints" && (
          <div className="flex-1 overflow-y-auto">
            {!ctx ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
                <Code2 className="w-10 h-10 text-muted-foreground/30" />
                <div className="text-sm text-muted-foreground">Select a connection and table</div>
                <div className="text-[11px] text-muted-foreground/60">REST endpoints will appear here — you can run them live</div>
              </div>
            ) : (
              <div className="p-4 space-y-3">
                {/* API info + Base URL bar */}
                <div className="flex items-center gap-3 p-3 rounded-lg border border-panel-border bg-background/50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-semibold text-foreground">{ctx.modelName} API</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-panel-border text-muted-foreground font-mono">
                        {ctx.nugetProvider.split(".").pop()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Globe className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-[10px] text-muted-foreground shrink-0">Base URL:</span>
                      <input
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                        className="flex-1 bg-transparent text-[11px] font-mono text-foreground outline-none border-b border-transparent focus:border-primary/50 transition-colors"
                        placeholder="http://localhost:5000"
                      />
                    </div>
                  </div>
                </div>

                {/* Endpoint cards */}
                {endpoints.map((ep) => (
                  <EndpointCard key={ep.method + ep.path} ep={ep} baseUrl={baseUrl} />
                ))}

                <p className="text-[10px] text-muted-foreground pt-1">
                  Click <span className="text-foreground">Run</span> on any endpoint to send a live request. Switch to{" "}
                  <button onClick={() => setViewMode("code")} className="text-primary underline">Code view</button> for the generated .NET source files.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Code view */}
        {viewMode === "code" && (
          <div className="flex-1 min-h-0">
            <Editor
              height="100%"
              language={codeTab === "appsettings" ? "json" : codeTab === "csproj" ? "xml" : "csharp"}
              value={codeMap[codeTab]}
              theme={theme === "dark" ? "vs-dark" : "light"}
              options={{
                readOnly: true,
                fontSize: 12,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontLigatures: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                lineNumbers: "on",
                renderLineHighlight: "none",
                overviewRulerLanes: 0,
                padding: { top: 12, bottom: 12 },
              }}
            />
          </div>
        )}

        {ctx && (
          <div className="flex items-center gap-3 px-3 py-1 border-t border-panel-border bg-panel-bg/60 text-[10px] text-muted-foreground shrink-0">
            <span>Model: <span className="text-foreground">{ctx.modelName}</span></span>
            <span>Table: <span className="text-foreground">{ctx.tableName}</span></span>
            <span>Columns: <span className="text-foreground">{columns.length}</span></span>
          </div>
        )}
      </div>
    </div>
  );
}
