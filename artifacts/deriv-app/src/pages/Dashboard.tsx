import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserInfo } from "@workspace/api-client-react/src/generated/api.schemas";
import { Spinner } from "@/components/ui/spinner";
import { LogOut, Monitor, User, Wallet, Globe } from "lucide-react";

export function Dashboard() {
  const [, setLocation] = useLocation();
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("deriv_access_token");
    if (!token) {
      setLocation("/");
      return;
    }

    const fetchMe = async () => {
      try {
        const res = await fetch("/api/auth/me", {
          headers: {
            "Authorization": token
          }
        });
        
        if (!res.ok) {
          throw new Error("Failed to fetch user data");
        }
        
        const data = await res.json();
        setUserInfo(data);
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Failed to load account info.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchMe();
  }, [setLocation]);

  const handleLogout = () => {
    localStorage.removeItem("deriv_access_token");
    setLocation("/");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground">
        <Spinner className="w-6 h-6" />
      </div>
    );
  }

  if (error || !userInfo) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground p-4">
        <div className="text-center space-y-4">
          <div className="text-destructive font-medium">{error || "Something went wrong"}</div>
          <Button variant="outline" onClick={handleLogout}>Back to Login</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-background text-foreground font-mono">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Monitor className="w-5 h-5 text-chart-1" />
            <span className="font-bold tracking-tight text-lg">Deriv Edge // Terminal</span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-foreground">
            <LogOut className="w-4 h-4 mr-2" />
            DISCONNECT
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1 uppercase">Account Overview</h1>
          <p className="text-sm text-muted-foreground">Session active. Real-time data connected.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Balance Card - Highlighted */}
          <Card className="border-border bg-card lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Wallet className="w-3 h-3" /> Net Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold flex items-baseline gap-2">
                {userInfo.balance != null ? userInfo.balance.toFixed(2) : "0.00"}
                <span className="text-lg text-chart-1">{userInfo.currency || "USD"}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <User className="w-3 h-3" /> Account ID
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-medium tracking-tight truncate">
                {userInfo.loginid}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Globe className="w-3 h-3" /> Region
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-medium tracking-tight">
                {userInfo.country ? userInfo.country.toUpperCase() : "N/A"}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">
              Profile Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-3 py-3 border-b border-border/50">
                <div className="text-muted-foreground text-sm uppercase">Email Address</div>
                <div className="col-span-2 font-medium truncate">{userInfo.email}</div>
              </div>
              <div className="grid grid-cols-3 py-3 border-b border-border/50">
                <div className="text-muted-foreground text-sm uppercase">Full Name</div>
                <div className="col-span-2 font-medium">{userInfo.fullname || "Not provided"}</div>
              </div>
              <div className="grid grid-cols-3 py-3">
                <div className="text-muted-foreground text-sm uppercase">Status</div>
                <div className="col-span-2 text-chart-1 font-medium flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-chart-1 animate-pulse" />
                  AUTHENTICATED
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
