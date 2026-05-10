import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Send, Sparkles, Trash2, Wand2 } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";

const starterPrompts = [
  "Explain the active query",
  "Optimize the active query",
  "Generate SQL to find recently created users",
  "What indexes should I consider?",
];

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
  } = useAppStore();
  const [prompt, setPrompt] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId),
    [tabs, activeTabId],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [aiMessages, aiThinking]);

  const submitPrompt = () => {
    if (!prompt.trim()) return;
    sendAiMessage(prompt);
    setPrompt("");
  };

  return (
    <div className="flex h-full flex-col bg-panel-bg">
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

        <div className="mt-3 rounded-md border border-panel-border bg-background/70 px-2.5 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Context
          </div>
          <div className="mt-1 text-xs text-foreground">
            {activeTab ? activeTab.title : "No active tab"}
          </div>
        </div>

      </div>

      <div className="flex-1 space-y-3 overflow-auto px-3 py-3">
        <div className="flex flex-wrap gap-2">
          {starterPrompts.map((item) => (
            <button
              key={item}
              onClick={() => sendAiMessage(item)}
              className="rounded-full border border-panel-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {item}
            </button>
          ))}
        </div>

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

      <div className="border-t border-panel-border p-3">
        <div className="rounded-lg border border-panel-border bg-background p-2">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submitPrompt();
              }
            }}
            rows={3}
            placeholder="Ask the AI agent about your query or schema..."
            className="w-full resize-none bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">
              Enter to send, Shift+Enter for newline
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
