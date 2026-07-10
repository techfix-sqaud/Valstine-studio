import { QuickAction } from "@/types/AI";
import { BookOpen, Bug, FileText, Search, TrendingUp, Zap } from "lucide-react";
import { AIagentAPIClientInstance } from "@/Helpers/apis";
import { setAiChatTransport, type AIChatMessage } from "@valstine/core/lib/ai-client";

export type { AIChatMessage };

// Registers Studio's configured API client (runtime-authenticated, session-
// aware) as the AI transport used by the shared store and SQL optimizer in
// @valstine/core — overriding the plain build-time-token fetch default.
setAiChatTransport(async (messages) => {
  const response = await AIagentAPIClientInstance.post("", {
    model: "n/a",
    messages,
    stream: false,
  });
  const content: string =
    response.data?.choices?.[0]?.message?.content ?? "No response from AI agent.";
  return { ok: true, content };
});

export const QUICK_ACTIONS: QuickAction[] = [
  {
    icon: FileText,
    label: "Explain Query",
    description: "Break down what this SQL does",
    requiresQuery: true,
    buildPrompt: (sql, connName, dbType) =>
      `Explain this ${dbType.toUpperCase()} query in plain English. Break it down step by step, describe what data it fetches, and note any potential issues:\n\`\`\`sql\n${sql}\n\`\`\``,
  },
  {
    icon: TrendingUp,
    label: "Suggest Indexes",
    description: "Recommend indexes to speed this up",
    requiresQuery: true,
    buildPrompt: (sql, connName, dbType) =>
      `Analyze this ${dbType.toUpperCase()} query and suggest specific indexes that would improve its performance. Include the CREATE INDEX statements:\n\`\`\`sql\n${sql}\n\`\`\``,
  },
  {
    icon: Bug,
    label: "Find Anti-patterns",
    description: "Detect N+1, missing WHERE, etc.",
    requiresQuery: true,
    buildPrompt: (sql, connName, dbType) =>
      `Review this ${dbType.toUpperCase()} query for ORM anti-patterns, N+1 query risks, missing WHERE clauses, implicit type casts, or other performance pitfalls:\n\`\`\`sql\n${sql}\n\`\`\``,
  },
  {
    icon: Zap,
    label: "Optimize",
    description: "Rewrite for better performance",
    requiresQuery: true,
    buildPrompt: (sql, connName, dbType) =>
      `Rewrite this ${dbType.toUpperCase()} query to be more performant. Explain what you changed and why:\n\`\`\`sql\n${sql}\n\`\`\``,
  },
  {
    icon: BookOpen,
    label: "Generate Docs",
    description: "Create schema documentation",
    requiresQuery: false,
    buildPrompt: (sql, connName, dbType) =>
      `Generate clear documentation for the tables and columns used in this ${dbType.toUpperCase()} query on ${connName}. Format as markdown with table descriptions and column-level notes:\n\`\`\`sql\n${sql}\n\`\`\``,
  },
  {
    icon: Search,
    label: "Find Tables",
    description: "Discover tables by use case",
    requiresQuery: false,
    buildPrompt: (sql, connName, dbType) =>
      `Based on the active ${dbType.toUpperCase()} connection "${connName}", suggest which tables I should query to find: `,
  },
];