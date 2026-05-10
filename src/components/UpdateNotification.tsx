import { useEffect, useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";

type UpdateState =
  | { phase: "idle" }
  | { phase: "available"; version: string }
  | { phase: "downloading"; percent: number }
  | { phase: "ready"; version: string };

declare global {
  interface Window {
    updaterAPI?: {
      onUpdateAvailable: (cb: (info: { version: string }) => void) => () => void;
      onDownloadProgress: (cb: (p: { percent: number }) => void) => () => void;
      onUpdateDownloaded: (cb: (info: { version: string }) => void) => () => void;
      installUpdate: () => void;
      checkForUpdates: () => void;
    };
  }
}

export function UpdateNotification() {
  const [state, setState] = useState<UpdateState>({ phase: "idle" });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const api = window.updaterAPI;
    if (!api) return;

    const offAvailable = api.onUpdateAvailable(({ version }) =>
      setState({ phase: "available", version })
    );
    const offProgress = api.onDownloadProgress(({ percent }) =>
      setState((s) =>
        s.phase === "available" || s.phase === "downloading"
          ? { phase: "downloading", percent }
          : s
      )
    );
    const offDownloaded = api.onUpdateDownloaded(({ version }) =>
      setState({ phase: "ready", version })
    );

    return () => {
      offAvailable();
      offProgress();
      offDownloaded();
    };
  }, []);

  if (state.phase === "idle" || dismissed) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-xl border border-white/10 bg-[#1a2540] px-4 py-3 shadow-2xl"
      style={{ maxWidth: 340 }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {state.phase === "available" && (
          <>
            <span className="text-xs font-semibold text-white">
              Update available — v{state.version}
            </span>
            <span className="text-[11px] text-slate-400">Downloading in the background…</span>
          </>
        )}

        {state.phase === "downloading" && (
          <>
            <span className="text-xs font-semibold text-white">
              Downloading update… {state.percent}%
            </span>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-300"
                style={{ width: `${state.percent}%` }}
              />
            </div>
          </>
        )}

        {state.phase === "ready" && (
          <>
            <span className="text-xs font-semibold text-white">
              v{state.version} ready to install
            </span>
            <span className="text-[11px] text-slate-400">Restart to apply the update.</span>
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {state.phase === "ready" && (
          <button
            onClick={() => window.updaterAPI?.installUpdate()}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500"
          >
            <RefreshCw className="h-3 w-3" />
            Restart
          </button>
        )}

        {state.phase === "available" && (
          <Download className="h-4 w-4 animate-pulse text-blue-400" />
        )}

        <button
          onClick={() => setDismissed(true)}
          className="rounded-md p-1 text-slate-500 transition hover:text-slate-300"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
