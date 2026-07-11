import { useEffect, useRef, useState } from "react";
import { AlertCircle, Download, RefreshCw, X } from "lucide-react";

type UpdateState =
  | { phase: "idle" }
  | { phase: "available"; version: string; devInformational?: boolean }
  | { phase: "downloading"; percent: number }
  | { phase: "ready"; version: string }
  | { phase: "error"; message: string };

declare global {
  interface Window {
    updaterAPI?: {
      onCheckingForUpdate: (cb: () => void) => () => void;
      onUpdateNotAvailable: (cb: () => void) => () => void;
      onUpdateAvailable: (
        cb: (info: { version: string; devInformational?: boolean }) => void,
      ) => () => void;
      onDownloadProgress: (cb: (p: { percent: number }) => void) => () => void;
      onUpdateDownloaded: (
        cb: (info: { version: string }) => void,
      ) => () => void;
      onUpdateError: (cb: (info: { message: string }) => void) => () => void;
      installUpdate: () => void;
      checkForUpdates: () => void;
    };
  }
}

export function UpdateNotification() {
  const [state, setState] = useState<UpdateState>({ phase: "idle" });
  // Track which version was dismissed so a NEW version re-shows the banner.
  const dismissedVersion = useRef<string | null>(null);

  useEffect(() => {
    const api = window.updaterAPI;
    if (!api) return;

    const offChecking = api.onCheckingForUpdate(() => {
      setState((s) => (s.phase === "ready" ? s : { phase: "idle" }));
    });

    const offNotAvailable = api.onUpdateNotAvailable(() => {
      setState((s) => (s.phase === "ready" ? s : { phase: "idle" }));
    });

    const offAvailable = api.onUpdateAvailable(({ version, devInformational }) => {
      // Re-show the banner whenever a genuinely new version is detected.
      if (dismissedVersion.current !== version) {
        setState({ phase: "available", version, devInformational });
      }
    });

    const offProgress = api.onDownloadProgress(({ percent }) =>
      setState((s) =>
        s.phase === "available" || s.phase === "downloading"
          ? { phase: "downloading", percent }
          : s,
      ),
    );

    const offDownloaded = api.onUpdateDownloaded(({ version }) => {
      dismissedVersion.current = null; // always show the "restart" prompt
      setState({ phase: "ready", version });
    });

    const offError = api.onUpdateError(({ message }) =>
      setState({ phase: "error", message }),
    );

    return () => {
      offChecking();
      offNotAvailable();
      offAvailable();
      offProgress();
      offDownloaded();
      offError();
    };
  }, []);

  const handleDismiss = () => {
    // Remember which version was dismissed so we don't re-show for that same version.
    if (state.phase === "available") dismissedVersion.current = state.version;
    setState({ phase: "idle" });
  };

  if (state.phase === "idle") return null;

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
            <span className="text-[11px] text-slate-400">
              {state.devInformational
                ? "Auto-update isn't available for dev builds — download it from GitHub."
                : "Downloading in the background…"}
            </span>
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
              Update ready — Restart now
            </span>
            <span className="text-[11px] text-slate-400">
              {(state as { phase: "ready"; version: string }).version
                ? `v${(state as { phase: "ready"; version: string }).version} downloaded and ready to install.`
                : "Restart to apply the update."}
            </span>
          </>
        )}

        {state.phase === "error" && (
          <>
            <span className="text-xs font-semibold text-red-400">
              Update failed
            </span>
            <span className="text-[11px] text-slate-400 line-clamp-2">
              {(state as { phase: "error"; message: string }).message}
            </span>
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

        {state.phase === "available" && !state.devInformational && (
          <Download className="h-4 w-4 animate-pulse text-blue-400" />
        )}

        {state.phase === "error" && (
          <AlertCircle className="h-4 w-4 text-red-400" />
        )}

        <button
          onClick={handleDismiss}
          className="rounded-md p-1 text-slate-500 transition hover:text-slate-300"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
