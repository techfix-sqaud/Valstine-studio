import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  HashRouter,
  BrowserRouter,
  Route,
  Routes,
  Navigate,
} from "react-router-dom";
import { Toaster as Sonner } from "@valstine/ui/components/ui/sonner";
import { Toaster } from "@valstine/ui/components/ui/toaster";
import { TooltipProvider } from "@valstine/ui/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import Landing from "./pages/Landing.tsx";
import Tour from "./pages/Tour.tsx";
import NotFound from "./pages/NotFound.tsx";
import { useAppStore } from "@valstine/core/store/app-store";
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
      <Navigate to="/tour" replace />
    ) : (
      <Navigate to="/studio" replace />
    );
  }

  // Web: show landing page on first visit
  return isFirstTime ? (
    <Navigate to="/tour" replace />
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
