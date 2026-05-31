import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function Login() {
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    setIsLoading(true);
    try {
      const appId = import.meta.env.VITE_DERIV_APP_ID || "36300";
      const redirectUri =
        import.meta.env.VITE_REDIRECT_URI ||
        window.location.origin + "/auth/callback";
      const authUrl = `https://oauth.deriv.com/oauth2/authorize?app_id=${appId}&l=en&redirect_uri=${encodeURIComponent(redirectUri)}`;
      window.location.href = authUrl;
    } catch {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center mb-6">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center border border-border bg-card shadow-sm">
              <div className="w-6 h-6 rounded-sm bg-gradient-to-br from-purple-500 to-yellow-400" />
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Deriv Edge</h1>
          <p className="text-muted-foreground text-sm tracking-widest uppercase">
            Professional trading authentication
          </p>
        </div>

        <Card className="border-border shadow-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">Secure Access</CardTitle>
            <CardDescription>Connect your Deriv account to continue</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              className="w-full text-lg h-12 font-semibold bg-gradient-to-r from-purple-600 to-yellow-500 hover:from-purple-500 hover:to-yellow-400 text-white border-0 transition-all duration-200"
              onClick={handleLogin}
              disabled={isLoading}
            >
              {isLoading ? "Connecting..." : "Login with Deriv"}
            </Button>
            <div className="text-xs text-center text-muted-foreground pt-2">
              By logging in, you agree to our Terms of Service and Privacy Policy.
            </div>
            <div className="text-center pt-1">
              <a
                href="/bot/"
                className="text-xs text-muted-foreground underline hover:text-foreground transition-colors"
              >
                Preview the trading app →
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
