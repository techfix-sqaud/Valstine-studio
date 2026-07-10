import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles, Send } from "lucide-react";
import { cn } from "@valstine/ui/lib/utils";
import { useAppStore } from "@valstine/core/store/app-store";
import { ApiGenerator } from "@/components/ApiGenerator";
import { ApiTester } from "@/components/ApiTester";

type WorkspaceTab = "generator" | "tester";

const TABS: { id: WorkspaceTab; label: string; icon: typeof Sparkles }[] = [
  { id: "generator", label: ".NET Generator", icon: Sparkles },
  { id: "tester", label: "API Tester", icon: Send },
];

export default function ApiWorkspace() {
  const navigate = useNavigate();
  const { theme } = useAppStore();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("generator");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background text-foreground">
      {/* Title bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-panel-border bg-titlebar shrink-0">
        <button
          onClick={() => navigate("/studio")}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-secondary"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Studio
        </button>

        <div className="w-px h-4 bg-panel-border mx-1" />

        {/* Tab switcher */}
        <div className="flex items-center gap-0.5 bg-panel-bg rounded-md p-0.5 border border-panel-border">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 text-xs rounded transition-colors",
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="ml-auto text-[10px] text-muted-foreground">
          Valstine Studio · API Workspace
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "generator" && <ApiGenerator />}
        {activeTab === "tester" && <ApiTester />}
      </div>
    </div>
  );
}
