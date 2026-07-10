import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Send, Sparkles, Trash2, Wand2 } from "lucide-react";
import { useAppStore } from "@valstine/core/store/app-store";
import { useSchemaCache } from "@/hooks/use-schema-cache";
import { buildAIContextPrefix } from "@/lib/ai-context";
import { cn } from "@valstine/ui/lib/utils";
import { QuickActionsPanel } from "./ui/aiActionsPanel";

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AIChatSidebar() {
  const {
    aiMessages,
    aiThinking,
    sendAiMessage,
    clearAiMessages,
    tabs,
    activeTabId,
    connections,
    activeConnectionId,
    queryHistory,
  } = useAppStore();
  const [prompt, setPrompt] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId),
    [tabs, activeTabId],
  );
  const conn = connections.find((c) => c.id === activeConnectionId);

  const { cache } = useSchemaCache();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [aiMessages, aiThinking]);

  const buildContext = () =>
    buildAIContextPrefix(cache, conn, activeTab?.content ?? "", queryHistory);

  const handleAction = (builtPrompt: string) => {
    // If prompt ends with ": ", it's a "fill in" action (Find Tables) — put it in the textarea
    if (builtPrompt.endsWith(": ")) {
      setPrompt(builtPrompt);
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(
          builtPrompt.length,
          builtPrompt.length,
        );
      }, 50);
    } else {
      sendAiMessage(builtPrompt, buildContext());
    }
  };

  const submitPrompt = () => {
    if (!prompt.trim()) return;
    sendAiMessage(prompt, buildContext());
    setPrompt("");
  };

  return (
    <div className="flex h-full flex-col bg-panel-bg">
      {/* Header */}
      <div className="border-b border-panel-border px-3 py-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              AI Agent
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Chat in the sidebar while you work on SQL.
            </p>
          </div>
          <button
            onClick={clearAiMessages}
            title="Clear chat"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Context pill */}
        <div className="mt-3 rounded-md border border-panel-border bg-background/70 px-2.5 py-2 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Context
            </div>
            <div className="text-xs text-foreground truncate mt-0.5">
              {activeTab ? activeTab.title : "No active tab"}
              {conn && (
                <span className="ml-2 text-muted-foreground">
                  · {conn.name} ({conn.type})
                </span>
              )}
            </div>
          </div>
          {activeTab?.content?.trim() && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/20 shrink-0">
              SQL ready
            </span>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <QuickActionsPanel onAction={handleAction} />

      {/* Messages */}
      <div className="flex-1 space-y-3 overflow-auto px-3 py-3">
        {aiMessages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex gap-2",
              message.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            {message.role === "assistant" && (
              <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                <Bot className="h-4 w-4" />
              </div>
            )}
            <div
              className={cn(
                "max-w-[88%] rounded-xl px-3 py-2 text-xs leading-relaxed shadow-sm",
                message.role === "assistant"
                  ? "bg-background text-foreground border border-panel-border"
                  : "bg-primary text-primary-foreground",
              )}
            >
              <div className="whitespace-pre-wrap break-words">
                {message.content}
              </div>
              <div
                className={cn(
                  "mt-1 text-[10px]",
                  message.role === "assistant"
                    ? "text-muted-foreground"
                    : "text-primary-foreground/70",
                )}
              >
                {formatTime(message.createdAt)}
              </div>
            </div>
          </div>
        ))}

        {aiThinking && (
          <div className="flex gap-2">
            <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
              <Wand2 className="h-4 w-4" />
            </div>
            <div className="rounded-xl border border-panel-border bg-background px-3 py-2 text-xs text-muted-foreground">
              Thinking...
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="border-t border-panel-border p-3">
        <div className="rounded-lg border border-panel-border bg-background p-2">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submitPrompt();
              }
            }}
            rows={3}
            placeholder="Ask the AI agent about your query or schema..."
            className="w-full resize-none bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">
              Enter to send · Shift+Enter for newline
            </span>
            <button
              onClick={submitPrompt}
              disabled={!prompt.trim()}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
