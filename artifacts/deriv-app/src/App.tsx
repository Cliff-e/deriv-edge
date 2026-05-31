import { useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Login } from "@/pages/Login";
import { AuthCallback } from "@/pages/AuthCallback";
import { Dashboard } from "@/pages/Dashboard";

const queryClient = new QueryClient();

function SplashScreen() {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{
        backgroundImage: "url('/splash.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="absolute inset-0 bg-black/55" />
      <div className="relative z-10 flex flex-col items-center space-y-8">
        <div className="w-20 h-20 rounded-2xl flex items-center justify-center border border-purple-400/40 bg-black/60 backdrop-blur-sm shadow-[0_0_40px_rgba(168,85,247,0.5)]">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-400 to-yellow-400 animate-pulse" />
        </div>
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-white tracking-tight">Deriv Edge</h1>
          <p className="text-purple-200/70 text-sm tracking-widest uppercase animate-pulse">
            Initializing...
          </p>
        </div>
        <div className="flex space-x-2 pt-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-purple-400"
              style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
            />
          ))}
        </div>
      </div>
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/auth/callback" component={AuthCallback} />
      <Route path="/dashboard" component={Dashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setInitializing(false), 1800);
    return () => clearTimeout(timer);
  }, []);

  if (initializing) return <SplashScreen />;

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
