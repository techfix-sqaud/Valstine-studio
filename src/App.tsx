import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  HashRouter,
  BrowserRouter,
  Route,
  Routes,
  Navigate,
} from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import Landing from "./pages/Landing.tsx";
import AnalystOS from "./pages/AnalystOS.tsx";
import Tour from "./pages/Tour.tsx";
import NotFound from "./pages/NotFound.tsx";
import { useAppStore } from "./store/app-store.ts";
import { UpdateNotification } from "./components/UpdateNotification.tsx";

const queryClient = new QueryClient();

// Use HashRouter in Electron (file:// protocol), BrowserRouter on web
const isElectron =
  typeof window !== "undefined" && (window as any).electronAPI?.isElectron;
const Router = isElectron ? HashRouter : BrowserRouter;

function RootRedirect() {
  const isFirstTime = useAppStore((s) => s.isFirstTime);

  // Desktop: first run lands on the product hub, then Studio remains the default
  if (isElectron) {
    return isFirstTime ? (
      <Navigate to="/welcome" replace />
    ) : (
      <Navigate to="/studio" replace />
    );
  }

  // Web: show landing page on first visit
  return isFirstTime ? (
    <Navigate to="/welcome" replace />
  ) : (
    <Navigate to="/studio" replace />
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <UpdateNotification />
      <Router>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/welcome" element={<Landing />} />
          <Route path="/analyst-os" element={<AnalystOS />} />
          <Route path="/tour" element={<Tour />} />
          <Route path="/studio" element={<Index />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
