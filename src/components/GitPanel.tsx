import { useState, useEffect, useCallback } from "react";
import {
  gitStatus,
  gitBranches,
  gitStage,
  gitUnstage,
  gitCommit,
  gitPush,
  gitPull,
  gitCheckout,
  gitCreatePR,
  gitLog,
  gitDiff,
  gitAddRemote,
  gitInit,
  githubClone,
  githubSchemaSql,
  GitFileStatus,
} from "@/lib/api";
import {
  ghGetUser,
  ghListRepos,
  ghCreateRepo,
  ghGetFile,
  ghPushFile,
  ghParseRepoUrl,
  GHUser,
  GHRepo,
} from "@/lib/github";
import { useAppStore } from "@/store/app-store";
import {
  GitBranch,
  GitCommit,
  GitPullRequest,
  Plus,
  RefreshCw,
  Upload,
  Download,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  ExternalLink,
  AlertTriangle,
  Check,
  Eye,
  Lock,
  Globe,
  Copy,
  Database,
  Trash2,
  LogOut,
  Search,
  ArrowDown,
  FolderDown,
  CloudUpload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  M: { label: "Modified", color: "text-yellow-400" },
  A: { label: "Added", color: "text-green-400" },
  D: { label: "Deleted", color: "text-red-400" },
  R: { label: "Renamed", color: "text-blue-400" },
  C: { label: "Copied", color: "text-blue-300" },
  U: { label: "Unmerged", color: "text-orange-400" },
  "?": { label: "Untracked", color: "text-gray-400" },
  "??": { label: "Untracked", color: "text-gray-400" },
};

function statusInfo(s: string) {
  return (
    STATUS_LABELS[s] ??
    STATUS_LABELS[s[0]] ?? { label: s, color: "text-gray-400" }
  );
}

function toast(msg: string, type: "success" | "error" = "success") {
  // Simple in-panel notification; a toast library would be ideal but this is self-contained
  console[type === "error" ? "error" : "log"]("[GitPanel]", msg);
}

export default function GitPanel() {
  const { addTab, setActiveTab, githubToken, setGithubToken } = useAppStore();
  const activeConn = useAppStore((s) =>
    s.connections.find(
      (c) => c.id === s.activeConnectionId && c.status === "connected",
    ),
  );

  // ── Local git state ──────────────────────────────────────────────────
  const [branch, setBranch] = useState("");
  const [files, setFiles] = useState<GitFileStatus[]>([]);
  const [ahead, setAhead] = useState(0);
  const [behind, setBehind] = useState(0);
  const [branches, setBranches] = useState<string[]>([]);
  const [commits, setCommits] = useState<
    { hash: string; message: string; author: string; date: string }[]
  >([]);
  const [commitMsg, setCommitMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [notGit, setNotGit] = useState(false);
  const [changesOpen, setChangesOpen] = useState(true);
  const [logOpen, setLogOpen] = useState(false);

  // ── GitHub state ─────────────────────────────────────────────────────
  const [ghUser, setGhUser] = useState<GHUser | null>(null);
  const [ghRepos, setGhRepos] = useState<GHRepo[]>([]);
  const [ghLoading, setGhLoading] = useState(false);
  const [ghError, setGhError] = useState("");
  const [ghSearch, setGhSearch] = useState("");
  const [ghOpen, setGhOpen] = useState(true);
  const [tokenInput, setTokenInput] = useState("");

  // ── Dialog state ─────────────────────────────────────────────────────
  const [prOpen, setPrOpen] = useState(false);
  const [prTitle, setPrTitle] = useState("");
  const [prBody, setPrBody] = useState("");
  const [prBase, setPrBase] = useState("main");
  const [prLoading, setPrLoading] = useState(false);

  const [newBranchOpen, setNewBranchOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");

  const [createRepoOpen, setCreateRepoOpen] = useState(false);
  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoDesc, setNewRepoDesc] = useState("");
  const [newRepoPrivate, setNewRepoPrivate] = useState(false);
  const [createRepoLoading, setCreateRepoLoading] = useState(false);

  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneUrl, setCloneUrl] = useState("");
  const [cloneDir, setCloneDir] = useState("");
  const [cloneLoading, setCloneLoading] = useState(false);

  const [pushSchemaOpen, setPushSchemaOpen] = useState(false);
  const [pushSchemaRepo, setPushSchemaRepo] = useState<GHRepo | null>(null);
  const [pushSchemaLoading, setPushSchemaLoading] = useState(false);

  // ── Local git refresh ────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const [statusRes, branchRes, logRes] = await Promise.all([
        gitStatus(),
        gitBranches(),
        gitLog(15),
      ]);
      if (!statusRes.ok) {
        if (statusRes.error?.includes("Not a git")) setNotGit(true);
        else setError(statusRes.error ?? "Failed to get git status");
        return;
      }
      setNotGit(false);
      setBranch(statusRes.branch);
      setFiles(statusRes.files);
      setAhead(statusRes.ahead);
      setBehind(statusRes.behind);
      if (branchRes.ok) setBranches(branchRes.branches);
      if (logRes.ok) setCommits(logRes.commits);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ── GitHub auth ──────────────────────────────────────────────────────
  const loadGitHub = useCallback(async (token: string) => {
    if (!token) {
      setGhUser(null);
      setGhRepos([]);
      return;
    }
    setGhLoading(true);
    setGhError("");
    try {
      const [user, repos] = await Promise.all([
        ghGetUser(token),
        ghListRepos(token),
      ]);
      setGhUser(user);
      setGhRepos(repos);
    } catch (e: any) {
      setGhError(e.message ?? "Failed to authenticate with GitHub");
      setGhUser(null);
    } finally {
      setGhLoading(false);
    }
  }, []);

  useEffect(() => {
    if (githubToken) loadGitHub(githubToken);
  }, [githubToken, loadGitHub]);

  async function handleGitHubLogin() {
    const t = tokenInput.trim();
    if (!t) return;
    setGhLoading(true);
    setGhError("");
    try {
      const user = await ghGetUser(t);
      setGithubToken(t);
      setGhUser(user);
      setTokenInput("");
      await loadGitHub(t);
    } catch (e: any) {
      setGhError(e.message ?? "Invalid token");
    } finally {
      setGhLoading(false);
    }
  }

  // ── Local git actions ────────────────────────────────────────────────
  async function handleStage(paths: string[]) {
    const res = await gitStage(paths);
    if (!res.ok) setError(res.error ?? "Stage failed");
    refresh();
  }

  async function handleUnstage(paths: string[]) {
    const res = await gitUnstage(paths);
    if (!res.ok) setError(res.error ?? "Unstage failed");
    refresh();
  }

  async function handleCommit() {
    if (!commitMsg.trim()) return;
    setCommitting(true);
    setError("");
    try {
      const res = await gitCommit(commitMsg);
      if (!res.ok) setError(res.error ?? "Commit failed");
      else {
        setSuccess("Committed successfully");
        setCommitMsg("");
        setTimeout(() => setSuccess(""), 3000);
        refresh();
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCommitting(false);
    }
  }

  async function handlePush() {
    setPushing(true);
    setError("");
    try {
      const res = await gitPush(branch, ahead === 0 && behind === 0);
      if (!res.ok) setError(res.error ?? "Push failed");
      else {
        setSuccess("Pushed to remote");
        setTimeout(() => setSuccess(""), 3000);
        refresh();
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPushing(false);
    }
  }

  async function handlePull() {
    setPulling(true);
    setError("");
    try {
      const res = await gitPull();
      if (!res.ok) setError(res.error ?? "Pull failed");
      else {
        setSuccess("Pulled from remote");
        setTimeout(() => setSuccess(""), 3000);
        refresh();
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPulling(false);
    }
  }

  async function handleCheckout(b: string) {
    setError("");
    try {
      const res = await gitCheckout(b);
      if (!res.ok) setError(res.error ?? "Checkout failed");
      else refresh();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleNewBranch() {
    if (!newBranchName.trim()) return;
    setError("");
    try {
      const res = await gitCheckout(newBranchName.trim(), true);
      if (!res.ok) setError(res.error ?? "Failed to create branch");
      else {
        setNewBranchOpen(false);
        setNewBranchName("");
        refresh();
      }
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleCreatePR() {
    if (!prTitle.trim()) return;
    setPrLoading(true);
    setError("");
    try {
      await handlePush();
      const res = await gitCreatePR(prTitle, prBody, prBase);
      if (!res.ok) setError(res.error ?? "Failed to create PR link");
      else if (res.prUrl) {
        window.open(res.prUrl, "_blank");
        setPrOpen(false);
        setPrTitle("");
        setPrBody("");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPrLoading(false);
    }
  }

  async function viewDiff(file: string) {
    try {
      const res = await gitDiff(file);
      if (!res.ok) return;
      const diffText = (res.stagedDiff || res.diff || "No changes").trim();
      const id = `diff-${Date.now()}`;
      addTab({
        id,
        title: `Diff: ${file.split("/").pop()}`,
        type: "query",
        content: `-- Diff for ${file}\n${diffText}`,
        connectionId: "",
        isDirty: false,
      });
      setActiveTab(id);
    } catch {}
  }

  // ── GitHub actions ───────────────────────────────────────────────────
  async function handleCreateRepo() {
    if (!newRepoName.trim() || !githubToken) return;
    setCreateRepoLoading(true);
    try {
      const repo = await ghCreateRepo(
        githubToken,
        newRepoName.trim(),
        newRepoDesc.trim(),
        newRepoPrivate,
      );
      setGhRepos((prev) => [repo, ...prev]);
      setSuccess(`Repository "${repo.full_name}" created!`);
      setTimeout(() => setSuccess(""), 4000);
      setCreateRepoOpen(false);
      setNewRepoName("");
      setNewRepoDesc("");
      setNewRepoPrivate(false);

      // Offer to add as remote
      if (!notGit) {
        const addRemote = window.confirm(
          `Add "${repo.clone_url}" as the "origin" remote for this workspace?`,
        );
        if (addRemote) {
          await gitAddRemote("origin", repo.clone_url);
          setSuccess(`Remote set to ${repo.full_name}. You can now push.`);
          setTimeout(() => setSuccess(""), 4000);
        }
      }
    } catch (e: any) {
      setError(e.message ?? "Failed to create repository");
    } finally {
      setCreateRepoLoading(false);
    }
  }

  async function handleClone() {
    if (!cloneUrl.trim()) return;
    setCloneLoading(true);
    setError("");
    try {
      const res = await githubClone(
        cloneUrl.trim(),
        cloneDir.trim() || undefined,
      );
      if (!res.ok) setError(res.error ?? "Clone failed");
      else {
        setSuccess(`Cloned to ${res.clonedTo}`);
        setTimeout(() => setSuccess(""), 5000);
        setCloneOpen(false);
        setCloneUrl("");
        setCloneDir("");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCloneLoading(false);
    }
  }

  async function handlePushSchema(repo: GHRepo) {
    if (!activeConn || !githubToken) return;
    setPushSchemaLoading(true);
    setError("");
    try {
      const parsed = ghParseRepoUrl(repo.html_url);
      if (!parsed) throw new Error("Cannot parse repo URL");

      const schemaRes = await githubSchemaSql(activeConn);
      if (!schemaRes.ok || !schemaRes.sql)
        throw new Error(schemaRes.error ?? "Failed to export schema");

      const filePath = `schema/${activeConn.database}.sql`;
      const existing = await ghGetFile(
        githubToken,
        parsed.owner,
        parsed.repo,
        filePath,
      );

      await ghPushFile(
        githubToken,
        parsed.owner,
        parsed.repo,
        filePath,
        schemaRes.sql,
        `chore: update schema for ${activeConn.database} (${schemaRes.tableCount} tables)`,
        existing?.sha,
      );

      setSuccess(`Schema pushed to ${repo.full_name}/${filePath} ✓`);
      setTimeout(() => setSuccess(""), 5000);
      setPushSchemaOpen(false);
    } catch (e: any) {
      setError(e.message ?? "Failed to push schema");
    } finally {
      setPushSchemaLoading(false);
    }
  }

  const filteredRepos = ghRepos.filter(
    (r) =>
      !ghSearch ||
      r.name.toLowerCase().includes(ghSearch.toLowerCase()) ||
      r.description?.toLowerCase().includes(ghSearch.toLowerCase()),
  );

  // ── Not a git repo ───────────────────────────────────────────────────
  if (notGit) {
    return (
      <div className="p-4 text-xs text-muted-foreground text-center space-y-3">
        <GitBranch className="w-5 h-5 mx-auto opacity-40" />
        <p>This workspace is not a Git repository.</p>
        <Button
          size="sm"
          variant="outline"
          className="w-full text-xs"
          onClick={async () => {
            const res = await gitInit();
            if (res.ok) refresh();
            else setError(res.error ?? "git init failed");
          }}
        >
          <GitBranch className="w-3 h-3 mr-1" /> Initialize Repository
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Branch bar */}
      <div className="px-3 pt-3 pb-2 border-b border-border/50">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Source Control
          </h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <div className="flex items-center gap-1.5">
          <GitBranch className="w-3 h-3 text-muted-foreground shrink-0" />
          <Select value={branch} onValueChange={handleCheckout}>
            <SelectTrigger className="h-6 text-xs flex-1 min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {branches
                .filter((b) => !b.includes("remotes/"))
                .map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setNewBranchOpen(true)}
            title="New branch"
          >
            <Plus className="w-3 h-3" />
          </Button>
        </div>

        {(ahead > 0 || behind > 0) && (
          <div className="text-[10px] text-muted-foreground mt-1 pl-4 flex items-center gap-2">
            {behind > 0 && (
              <span className="text-orange-400 flex items-center gap-0.5">
                <ArrowDown className="w-2.5 h-2.5" />
                {behind} behind
              </span>
            )}
            {ahead > 0 && (
              <span className="text-green-400 flex items-center gap-0.5">
                <Upload className="w-2.5 h-2.5" />
                {ahead} ahead
              </span>
            )}
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {error && (
            <div className="text-xs text-red-400 bg-red-400/10 rounded p-2 flex items-start gap-1.5">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
              <span className="break-words">{error}</span>
            </div>
          )}
          {success && (
            <div className="text-xs text-green-400 bg-green-400/10 rounded p-2 flex items-center gap-1.5">
              <Check className="w-3 h-3 shrink-0" />
              <span className="break-words">{success}</span>
            </div>
          )}

          {/* Commit + push/pull row */}
          <div className="space-y-1.5">
            <Textarea
              className="text-xs min-h-[60px] resize-none"
              placeholder="Commit message… (Ctrl+Enter to commit)"
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                  handleCommit();
              }}
            />
            <div className="flex gap-1">
              <Button
                size="sm"
                className="flex-1 h-7 text-xs"
                onClick={handleCommit}
                disabled={!commitMsg.trim() || committing}
              >
                {committing ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <GitCommit className="w-3 h-3 mr-1" />
                )}
                Commit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={handlePull}
                disabled={pulling}
                title="Pull from remote"
              >
                {pulling ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Download className="w-3 h-3" />
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={handlePush}
                disabled={pushing}
                title="Push to remote"
              >
                {pushing ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Upload className="w-3 h-3" />
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  setPrTitle("");
                  setPrBody("");
                  setPrOpen(true);
                }}
                title="Create Pull Request"
              >
                <GitPullRequest className="w-3 h-3" />
              </Button>
            </div>
          </div>

          <Separator />

          {/* Changed files */}
          <Collapsible open={changesOpen} onOpenChange={setChangesOpen}>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-foreground w-full hover:text-foreground/80">
              {changesOpen ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              Changes
              {files.length > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-auto text-[10px] h-4 px-1.5"
                >
                  {files.length}
                </Badge>
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1">
              {files.length === 0 ? (
                <p className="text-[10px] text-muted-foreground pl-4">
                  No changes
                </p>
              ) : (
                <div className="space-y-0.5">
                  <div className="flex justify-end gap-1 mb-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 text-[10px] px-1.5"
                      onClick={() => handleStage(files.map((f) => f.path))}
                    >
                      <Plus className="w-2.5 h-2.5 mr-0.5" /> Stage All
                    </Button>
                  </div>
                  {files.map((f) => {
                    const info = statusInfo(f.status);
                    return (
                      <div
                        key={f.path}
                        className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-muted/40 group text-xs"
                      >
                        <span
                          className={`font-mono text-[10px] w-4 shrink-0 ${info.color}`}
                        >
                          {f.status}
                        </span>
                        <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="truncate flex-1" title={f.path}>
                          {f.path}
                        </span>
                        <div className="hidden group-hover:flex gap-0.5">
                          <button
                            className="p-0.5 hover:bg-muted rounded"
                            onClick={() => viewDiff(f.path)}
                            title="View diff"
                          >
                            <Eye className="w-3 h-3" />
                          </button>
                          <button
                            className="p-0.5 hover:bg-muted rounded"
                            onClick={() => handleStage([f.path])}
                            title="Stage"
                          >
                            <Plus className="w-3 h-3 text-green-400" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* Recent commits */}
          <Collapsible open={logOpen} onOpenChange={setLogOpen}>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-foreground w-full hover:text-foreground/80">
              {logOpen ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              Recent Commits
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1">
              {commits.length === 0 ? (
                <p className="text-[10px] text-muted-foreground pl-4">
                  No commits yet
                </p>
              ) : (
                <div className="space-y-0.5">
                  {commits.map((c) => (
                    <div
                      key={c.hash}
                      className="px-2 py-1 rounded hover:bg-muted/40 text-xs"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] text-blue-400 shrink-0">
                          {c.hash}
                        </span>
                        <span className="truncate flex-1">{c.message}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground pl-10">
                        {c.author} — {c.date}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          {/* ── GitHub Section ────────────────────────────────────────── */}
          <Collapsible open={ghOpen} onOpenChange={setGhOpen}>
            <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium text-foreground w-full hover:text-foreground/80">
              {ghOpen ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              {/* <Github className="w-3.5 h-3.5" /> */}
              GitHub
              {ghUser && (
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {ghUser.login}
                </span>
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              {ghError && (
                <div className="text-xs text-red-400 bg-red-400/10 rounded p-2 mb-2 flex items-start gap-1.5">
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>{ghError}</span>
                </div>
              )}

              {/* Not authenticated */}
              {!githubToken && (
                <div className="space-y-2">
                  <p className="text-[10px] text-muted-foreground">
                    Connect with a GitHub Personal Access Token (PAT) to create
                    repos, push schemas, and clone.
                  </p>
                  <div className="flex gap-1">
                    <Input
                      type="password"
                      className="h-7 text-xs flex-1"
                      placeholder="ghp_xxxxxxxxxxxx"
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleGitHubLogin()
                      }
                    />
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      onClick={handleGitHubLogin}
                      disabled={!tokenInput.trim() || ghLoading}
                    >
                      {ghLoading ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        "Connect"
                      )}
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Needs <code className="bg-muted px-0.5 rounded">repo</code>{" "}
                    + <code className="bg-muted px-0.5 rounded">read:user</code>{" "}
                    scopes.
                  </p>
                </div>
              )}

              {/* Authenticated */}
              {githubToken && ghUser && (
                <div className="space-y-3">
                  {/* User card */}
                  <div className="flex items-center gap-2 p-2 bg-muted/40 rounded-md">
                    <img
                      src={ghUser.avatar_url}
                      alt={ghUser.login}
                      className="w-6 h-6 rounded-full"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">
                        {ghUser.name ?? ghUser.login}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        @{ghUser.login} · {ghRepos.length} repos
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setGithubToken("");
                        setGhUser(null);
                        setGhRepos([]);
                      }}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-red-400 transition-colors"
                      title="Disconnect"
                    >
                      <LogOut className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Action buttons */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px] justify-start"
                      onClick={() => setCreateRepoOpen(true)}
                    >
                      <Plus className="w-3 h-3 mr-1" /> New Repo
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px] justify-start"
                      onClick={() => setCloneOpen(true)}
                    >
                      <FolderDown className="w-3 h-3 mr-1" /> Clone
                    </Button>
                    {activeConn && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px] justify-start col-span-2"
                        onClick={() => setPushSchemaOpen(true)}
                      >
                        <CloudUpload className="w-3 h-3 mr-1" />
                        Push Schema to GitHub
                      </Button>
                    )}
                  </div>

                  {/* Repos list */}
                  <div>
                    <div className="relative mb-1.5">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                      <Input
                        className="h-6 text-xs pl-6"
                        placeholder="Filter repos…"
                        value={ghSearch}
                        onChange={(e) => setGhSearch(e.target.value)}
                      />
                    </div>
                    {ghLoading && (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    <div className="space-y-0.5 max-h-64 overflow-y-auto">
                      {filteredRepos.map((repo) => (
                        <div
                          key={repo.id}
                          className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-muted/40 group text-xs cursor-default"
                        >
                          {repo.private ? (
                            <Lock className="w-3 h-3 text-orange-400 shrink-0" />
                          ) : (
                            <Globe className="w-3 h-3 text-blue-400 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="truncate font-medium">{repo.name}</p>
                            {repo.description && (
                              <p className="truncate text-[10px] text-muted-foreground">
                                {repo.description}
                              </p>
                            )}
                          </div>
                          <div className="hidden group-hover:flex gap-0.5 shrink-0">
                            <button
                              title="Copy clone URL"
                              className="p-0.5 hover:bg-muted rounded"
                              onClick={() =>
                                navigator.clipboard.writeText(repo.clone_url)
                              }
                            >
                              <Copy className="w-2.5 h-2.5" />
                            </button>
                            <button
                              title="Open on GitHub"
                              className="p-0.5 hover:bg-muted rounded"
                              onClick={() =>
                                window.open(repo.html_url, "_blank")
                              }
                            >
                              <ExternalLink className="w-2.5 h-2.5" />
                            </button>
                            <button
                              title="Clone this repo"
                              className="p-0.5 hover:bg-muted rounded"
                              onClick={() => {
                                setCloneUrl(repo.clone_url);
                                setCloneOpen(true);
                              }}
                            >
                              <FolderDown className="w-2.5 h-2.5" />
                            </button>
                            {activeConn && (
                              <button
                                title="Push schema to this repo"
                                className="p-0.5 hover:bg-muted rounded text-blue-400"
                                onClick={() => {
                                  setPushSchemaRepo(repo);
                                  handlePushSchema(repo);
                                }}
                              >
                                <CloudUpload className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                      {filteredRepos.length === 0 && !ghLoading && (
                        <p className="text-[10px] text-muted-foreground px-2 py-2">
                          No repositories found
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full h-6 text-[10px] mt-1"
                      onClick={() => loadGitHub(githubToken)}
                    >
                      <RefreshCw className="w-2.5 h-2.5 mr-1" /> Refresh repos
                    </Button>
                  </div>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </ScrollArea>

      {/* ── Dialogs ─────────────────────────────────────────────────── */}

      {/* New Branch */}
      <Dialog open={newBranchOpen} onOpenChange={setNewBranchOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle className="text-sm">Create Branch</DialogTitle>
          </DialogHeader>
          <Input
            className="text-xs"
            placeholder="feature/my-branch"
            value={newBranchName}
            onChange={(e) => setNewBranchName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleNewBranch()}
          />
          <DialogFooter>
            <Button
              size="sm"
              className="text-xs"
              onClick={handleNewBranch}
              disabled={!newBranchName.trim()}
            >
              <GitBranch className="w-3 h-3 mr-1" /> Create & Switch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PR */}
      <Dialog open={prOpen} onOpenChange={setPrOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-1.5">
              <GitPullRequest className="w-4 h-4" /> Create Pull Request
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase mb-1 block">
                Base Branch
              </label>
              <Input
                className="text-xs"
                value={prBase}
                onChange={(e) => setPrBase(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase mb-1 block">
                Title
              </label>
              <Input
                className="text-xs"
                placeholder="PR title…"
                value={prTitle}
                onChange={(e) => setPrTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase mb-1 block">
                Description
              </label>
              <Textarea
                className="text-xs min-h-[80px] resize-none"
                placeholder="Optional…"
                value={prBody}
                onChange={(e) => setPrBody(e.target.value)}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              From <strong>{branch}</strong> → <strong>{prBase}</strong>
            </p>
          </div>
          <DialogFooter>
            <Button
              size="sm"
              className="text-xs"
              onClick={handleCreatePR}
              disabled={!prTitle.trim() || prLoading}
            >
              {prLoading ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <ExternalLink className="w-3 h-3 mr-1" />
              )}
              Push & Open PR
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create GitHub Repo */}
      <Dialog open={createRepoOpen} onOpenChange={setCreateRepoOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-1.5">
              {/* <Github className="w-4 h-4" /> Create GitHub Repository */}
              Create GitHub Repository
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase mb-1 block">
                Repository Name *
              </label>
              <Input
                className="text-xs"
                placeholder="my-db-schemas"
                value={newRepoName}
                onChange={(e) => setNewRepoName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase mb-1 block">
                Description
              </label>
              <Input
                className="text-xs"
                placeholder="Database schema repository…"
                value={newRepoDesc}
                onChange={(e) => setNewRepoDesc(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setNewRepoPrivate(!newRepoPrivate)}
                className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded border transition-colors ${newRepoPrivate ? "border-orange-400/50 bg-orange-400/10 text-orange-400" : "border-border text-muted-foreground"}`}
              >
                {newRepoPrivate ? (
                  <Lock className="w-3 h-3" />
                ) : (
                  <Globe className="w-3 h-3" />
                )}
                {newRepoPrivate ? "Private" : "Public"}
              </button>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setCreateRepoOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="text-xs"
              onClick={handleCreateRepo}
              disabled={!newRepoName.trim() || createRepoLoading}
            >
              {createRepoLoading ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                // <Github className="w-3 h-3 mr-1" />
                <p></p>
              )}
              Create Repository
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clone */}
      <Dialog open={cloneOpen} onOpenChange={setCloneOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-1.5">
              <FolderDown className="w-4 h-4" /> Clone Repository
            </DialogTitle>
            <DialogDescription className="text-xs">
              The repo will be cloned on the server at the specified path.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase mb-1 block">
                Repository URL *
              </label>
              <Input
                className="text-xs"
                placeholder="https://github.com/owner/repo.git"
                value={cloneUrl}
                onChange={(e) => setCloneUrl(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase mb-1 block">
                Target Directory (optional)
              </label>
              <Input
                className="text-xs"
                placeholder="~/valstine-repos/repo-name"
                value={cloneDir}
                onChange={(e) => setCloneDir(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setCloneOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="text-xs"
              onClick={handleClone}
              disabled={!cloneUrl.trim() || cloneLoading}
            >
              {cloneLoading ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <FolderDown className="w-3 h-3 mr-1" />
              )}
              Clone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Push Schema */}
      <Dialog open={pushSchemaOpen} onOpenChange={setPushSchemaOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-1.5">
              <CloudUpload className="w-4 h-4" /> Push Schema to GitHub
            </DialogTitle>
            <DialogDescription className="text-xs">
              Exports the active database schema as SQL and pushes it to a
              GitHub repository under <code>schema/</code>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {activeConn && (
              <div className="flex items-center gap-2 p-2 bg-muted/40 rounded">
                <Database className="w-3.5 h-3.5 text-muted-foreground" />
                <div>
                  <p className="text-xs font-medium">{activeConn.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {activeConn.database}
                  </p>
                </div>
              </div>
            )}
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {filteredRepos.map((repo) => (
                <button
                  key={repo.id}
                  onClick={() => setPushSchemaRepo(repo)}
                  className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs text-left transition-colors ${pushSchemaRepo?.id === repo.id ? "bg-primary/15 text-primary" : "hover:bg-muted/40"}`}
                >
                  {repo.private ? (
                    <Lock className="w-3 h-3 shrink-0" />
                  ) : (
                    <Globe className="w-3 h-3 shrink-0" />
                  )}
                  <span className="truncate">{repo.full_name}</span>
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setPushSchemaOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="text-xs"
              onClick={() => pushSchemaRepo && handlePushSchema(pushSchemaRepo)}
              disabled={!pushSchemaRepo || pushSchemaLoading}
            >
              {pushSchemaLoading ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <CloudUpload className="w-3 h-3 mr-1" />
              )}
              Push Schema
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
