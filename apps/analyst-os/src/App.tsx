import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster as Sonner } from "@valstine/ui/components/ui/sonner";
import { Toaster } from "@valstine/ui/components/ui/toaster";
import { TooltipProvider } from "@valstine/ui/components/ui/tooltip";
import { ValstineAnalystOSWorkbench } from "./components/valstineAnalystOS/ValstineAnalystOSWorkbench";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <ValstineAnalystOSWorkbench />
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
