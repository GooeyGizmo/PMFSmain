import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, XCircle, Eye, EyeOff, Fuel } from "lucide-react";
import { queryClient } from "@/lib/queryClient";

export default function ActivatePage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get("token") || "";
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState("");
  const [userInfo, setUserInfo] = useState<{ email: string; name: string; preferredTier: string } | null>(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activated, setActivated] = useState(false);

  useEffect(() => {
    if (!token) {
      setValidating(false);
      setTokenError("No activation token provided. Please use the link from your invitation email.");
      return;
    }
    fetch(`/api/auth/activate/validate?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        if (data.valid) {
          setTokenValid(true);
          setUserInfo({ email: data.email, name: data.name, preferredTier: data.preferredTier });
        } else {
          setTokenError(data.message || "Invalid activation link.");
        }
      })
      .catch(() => setTokenError("Failed to validate activation link."))
      .finally(() => setValidating(false));
  }, [token]);

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast({ title: "Password too short", description: "Password must be at least 8 characters.", variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", description: "Please make sure both passwords match.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Activation failed", description: data.message, variant: "destructive" });
        return;
      }

      setActivated(true);

      if (data.autoLogin) {
        await queryClient.invalidateQueries({ queryKey: ["/api/user"] });
        toast({ title: "Account activated!", description: "Redirecting you to choose your membership..." });
        const tier = userInfo?.preferredTier || "";
        setTimeout(() => {
          setLocation(`/app/account?tab=subscription${tier ? `&tier=${tier}` : ""}`);
        }, 1500);
      } else {
        toast({ title: "Account activated!", description: "Please log in with your new password." });
        setTimeout(() => setLocation("/"), 2000);
      }
    } catch {
      toast({ title: "Error", description: "Something went wrong. Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (validating) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Validating your activation link...</p>
        </div>
      </div>
    );
  }

  if (tokenError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <XCircle className="w-12 h-12 text-destructive mx-auto mb-2" />
            <CardTitle>Activation Link Invalid</CardTitle>
            <CardDescription>{tokenError}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground mb-4">
              If your link has expired, please contact us and we'll send you a new one.
            </p>
            <Button onClick={() => setLocation("/")} variant="outline" data-testid="button-back-home">
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (activated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
            <CardTitle>Account Activated!</CardTitle>
            <CardDescription>Redirecting you now...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Fuel className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>Activate Your Account</CardTitle>
          <CardDescription>
            {userInfo?.name ? `Welcome, ${userInfo.name.split(' ')[0]}!` : 'Welcome!'} Set your password to get started.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleActivate} className="space-y-4">
            {userInfo?.email && (
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={userInfo.email} disabled className="bg-muted" data-testid="input-activation-email" />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">Create Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                  minLength={8}
                  data-testid="input-activation-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  data-testid="button-toggle-password"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                required
                minLength={8}
                data-testid="input-activation-confirm-password"
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={submitting || password.length < 8 || password !== confirmPassword}
              data-testid="button-activate-account"
            >
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Activate Account
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}