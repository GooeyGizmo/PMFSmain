import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';

export default function InviteSignupPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [signupSuccess, setSignupSuccess] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const inviteToken = params.get('invite');

  const { data: inviteData, isLoading, error } = useQuery({
    queryKey: ['/api/waitlist/invite', inviteToken],
    queryFn: () => fetch(`/api/waitlist/invite/${inviteToken}`).then(r => {
      if (!r.ok) throw new Error('Invalid invite');
      return r.json();
    }),
    enabled: !!inviteToken,
  });

  const signupMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; name: string }) => {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      setSignupSuccess(true);
    },
    onError: (error: Error) => {
      toast({
        title: 'Signup failed',
        description: error.message || 'Unable to create account. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 8) {
      toast({
        title: 'Password too short',
        description: 'Password must be at least 8 characters.',
        variant: 'destructive',
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: 'Passwords do not match',
        description: 'Please make sure your passwords match.',
        variant: 'destructive',
      });
      return;
    }

    const entry = inviteData?.entry;
    if (!entry) return;

    const name = `${entry.firstName} ${entry.lastName}`.trim();
    signupMutation.mutate({
      email: entry.email,
      password,
      name,
    });
  };

  if (!inviteToken) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2" data-testid="text-no-invite">No Invite Token</h2>
            <p className="text-muted-foreground mb-6">
              No invite token was provided. Please use the link from your invite email.
            </p>
            <Button
              variant="outline"
              onClick={() => setLocation('/')}
              data-testid="button-return-waitlist"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Return to Waitlist
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-copper mx-auto mb-4" data-testid="spinner-loading" />
          <p className="text-muted-foreground">Verifying your invite...</p>
        </div>
      </div>
    );
  }

  if (error || !inviteData?.entry) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2" data-testid="text-invalid-invite">Invalid or Expired Invite</h2>
            <p className="text-muted-foreground mb-6">
              This invite link is invalid or has expired. Please contact support or join the waitlist again.
            </p>
            <Button
              variant="outline"
              onClick={() => setLocation('/')}
              data-testid="button-return-waitlist"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Return to Waitlist
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (signupSuccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="w-12 h-12 text-prairie-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2" data-testid="text-signup-success">Account Created!</h2>
            <p className="text-muted-foreground mb-6">
              Check your email to verify your account before logging in.
            </p>
            <Button
              className="bg-copper hover:bg-copper/90 text-white"
              onClick={() => setLocation('/login')}
              data-testid="button-go-to-login"
            >
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const entry = inviteData;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <img
            src="/pmfs-logo-full.png"
            alt="Prairie Mobile Fuel Services"
            className="h-16 mx-auto mb-4"
            data-testid="img-logo"
          />
          <h1 className="font-display text-2xl font-bold text-foreground">
            Welcome to PMFS
          </h1>
          <p className="text-muted-foreground mt-1">
            Complete your account setup to get started
          </p>
        </div>

        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Your Information</CardTitle>
            <CardDescription>From your waitlist registration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Name</span>
              <span className="text-sm font-medium" data-testid="text-invite-name">
                {entry.firstName} {entry.lastName}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Email</span>
              <span className="text-sm font-medium" data-testid="text-invite-email">
                {entry.email}
              </span>
            </div>
            {entry.interestedTier && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Interested Tier</span>
                <Badge variant="secondary" data-testid="badge-invite-tier">
                  {entry.interestedTier}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Set Your Password</CardTitle>
            <CardDescription>Choose a secure password for your account</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  required
                  minLength={8}
                  data-testid="input-password"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  required
                  minLength={8}
                  data-testid="input-confirm-password"
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-copper hover:bg-copper/90 text-white font-semibold"
                disabled={signupMutation.isPending}
                data-testid="button-create-account"
              >
                {signupMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  'Create My Account'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-4">
          Already have an account?{' '}
          <button
            onClick={() => setLocation('/login')}
            className="text-copper hover:underline font-medium"
            data-testid="link-login"
          >
            Log in
          </button>
        </p>
      </div>
    </div>
  );
}