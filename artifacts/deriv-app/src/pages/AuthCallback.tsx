import { useEffect, useState } from "react";
import { useLocation } from "wouter";

export function AuthCallback() {
  const [, setLocation] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Verifying credentials...");

  useEffect(() => {
    const processCallback = () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const token1 = urlParams.get("token1");

        if (!token1) {
          throw new Error("No access token received from Deriv.");
        }

        setStatus("Securing session...");
        localStorage.setItem("deriv_access_token", token1);

        setStatus("Loading dashboard...");
        setTimeout(() => setLocation("/dashboard"), 600);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Authentication failed.";
        setError(message);
      }
    };

    const timer = setTimeout(processCallback, 400);
    return () => clearTimeout(timer);
  }, [setLocation]);

  if (error) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground p-4">
        <div className="w-full max-w-md text-center space-y-4 border border-destructive/30 rounded-2xl p-8 bg-card">
          <div className="text-destructive font-semibold text-lg">Authentication Failed</div>
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            onClick={() => setLocation("/")}
            className="text-sm underline hover:text-foreground transition-colors"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background text-foreground">
      <div className="flex flex-col items-center space-y-6">
        <div className="w-14 h-14 rounded-xl flex items-center justify-center border border-border bg-card shadow-sm">
          <div className="w-6 h-6 rounded-sm bg-gradient-to-br from-purple-500 to-yellow-400 animate-pulse" />
        </div>
        <div className="text-sm font-medium tracking-widest uppercase text-muted-foreground animate-pulse">
          {status}
        </div>
        <div className="flex space-x-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-purple-500"
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
