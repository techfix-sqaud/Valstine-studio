import { useState, useEffect, useCallback } from "react";
import {
  gitStatus,
  gitBranches,
  gitStage,
  gitUnstage,
  gitCommit,
  gitPush,
  gitCheckout,
  gitCreatePR,
  gitLog,
  gitDiff,
  GitFileStatus,
} from "@/lib/api";
import {
  GitBranch,
  GitCommit,
  GitPullRequest,
  Plus,
  Minus,
  RefreshCw,
  Upload,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  ExternalLink,
  AlertTriangle,
  Check,
  Eye,
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
} from "@/components/ui/dialog";
import { useAppStore } from "@/store/app-store";

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

export default function GitPanel() {
  const { addTab, setActiveTab } = useAppStore();
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
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [notGit, setNotGit] = useState(false);
  const [changesOpen, setChangesOpen] = useState(true);
  const [logOpen, setLogOpen] = useState(false);
  const [prOpen, setPrOpen] = useState(false);
  const [prTitle, setPrTitle] = useState("");
  const [prBody, setPrBody] = useState("");
  const [prBase, setPrBase] = useState("main");
  const [prLoading, setPrLoading] = useState(false);
  const [newBranchOpen, setNewBranchOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");

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
        else setError(statusRes.error ?? "Failed to get status");
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
      if (!res.ok) {
        setError(res.error ?? "Commit failed");
      } else {
        setSuccess("Committed!");
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
      const res = await gitPush(branch, true);
      if (!res.ok) {
        setError(res.error ?? "Push failed");
      } else {
        setSuccess("Pushed!");
        setTimeout(() => setSuccess(""), 3000);
        refresh();
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPushing(false);
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
      const res = await gitCreatePR(prTitle, prBody, prBase);
      if (!res.ok) {
        setError(res.error ?? "Failed to create PR link");
      } else if (res.prUrl) {
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

  if (notGit) {
    return (
      <div className="p-4 text-xs text-muted-foreground text-center">
        <GitBranch className="w-5 h-5 mx-auto mb-2 opacity-40" />
        <p>This workspace is not a Git repository.</p>
        <p className="mt-1 text-[10px]">
          Run <code className="bg-muted px-1 rounded">git init</code> to get
          started.
        </p>
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
          <GitBranch className="w-3 h-3 text-muted-foreground" />
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
          <div className="text-[10px] text-muted-foreground mt-1 pl-4">
            {ahead > 0 && <span className="text-green-400">↑{ahead}</span>}
            {ahead > 0 && behind > 0 && " "}
            {behind > 0 && <span className="text-orange-400">↓{behind}</span>}
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {error && (
            <div className="text-xs text-red-400 bg-red-400/10 rounded p-2 flex items-start gap-1.5">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="text-xs text-green-400 bg-green-400/10 rounded p-2 flex items-center gap-1.5">
              <Check className="w-3 h-3" />
              {success}
            </div>
          )}

          {/* Commit box */}
          <div className="space-y-1.5">
            <Textarea
              className="text-xs min-h-[60px] resize-none"
              placeholder="Commit message…"
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
                className="h-7 text-xs"
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
                className="h-7 text-xs"
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

          {/* Changes */}
          <Collapsible open={changesOpen} onOpenChange={setChangesOpen}>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-foreground w-full hover:text-foreground/80">
              {changesOpen ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              Changes
              {files.length > 0 && (
                <span className="ml-auto text-[10px] bg-muted rounded-full px-1.5 py-0.5">
                  {files.length}
                </span>
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1">
              {files.length === 0 ? (
                <p className="text-[10px] text-muted-foreground pl-4">
                  No changes
                </p>
              ) : (
                <div className="space-y-0.5">
                  {/* Stage All / Unstage All */}
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
                        <span className="font-mono text-[10px] text-blue-400">
                          {c.hash}
                        </span>
                        <span className="truncate flex-1">{c.message}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground pl-[52px]">
                        {c.author} — {c.date}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </ScrollArea>

      {/* New Branch dialog */}
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

      {/* PR Dialog */}
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
                placeholder="Optional description…"
                value={prBody}
                onChange={(e) => setPrBody(e.target.value)}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              From <strong>{branch}</strong> → <strong>{prBase}</strong>. This
              will push your branch and open a PR page in your browser.
            </p>
          </div>
          <DialogFooter>
            <Button
              size="sm"
              className="text-xs"
              onClick={async () => {
                await handlePush();
                await handleCreatePR();
              }}
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
    </div>
  );
}
