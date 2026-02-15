import { useState } from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle, XCircle, Loader2, ArrowLeft, Lock, Eye, EyeOff } from 'lucide-react';

function getPasswordStrength(password: string): { level: 'weak' | 'medium' | 'strong'; label: string; color: string; width: string } {
  if (!password) return { level: 'weak', label: '', color: '', width: '0%' };
  
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 2) return { level: 'weak', label: 'Weak', color: 'bg-red-500', width: '33%' };
  if (score <= 4) return { level: 'medium', label: 'Medium', color: 'bg-amber-500', width: '66%' };
  return { level: 'strong', label: 'Strong', color: 'bg-green-500', width: '100%' };
}

export default function ResetPassword() {
  const token = new URLSearchParams(window.location.search).get('token');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<'form' | 'loading' | 'success' | 'error'>('form');
  const [errorMessage, setErrorMessage] = useState('');

  const strength = getPasswordStrength(newPassword);
  const passwordsMatch = newPassword === confirmPassword;
  const meetsRequirements = newPassword.length >= 8 && /\d/.test(newPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!meetsRequirements) {
      setErrorMessage('Password must be at least 8 characters and contain a number.');
      return;
    }
    if (!passwordsMatch) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setStatus('loading');
    setErrorMessage('');

    try {
      const res = await fetch('/api/auth/reset-password-with-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus('success');
      } else {
        setStatus('error');
        setErrorMessage(data.message || 'Password reset failed. Please try again.');
      }
    } catch {
      setStatus('error');
      setErrorMessage('Something went wrong. Please try again.');
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-copper/5 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-2 border-destructive/20">
          <CardHeader className="text-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-destructive" />
            </div>
            <CardTitle className="font-display text-2xl">Invalid Link</CardTitle>
            <CardDescription>This password reset link is invalid or has already been used.</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Link href="/">
              <Button className="bg-copper hover:bg-copper/90" data-testid="button-back-home">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-copper/5 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Card className="border-2 border-copper/20">
          <CardHeader className="text-center">
            <div className="w-16 h-16 rounded-full bg-copper/10 flex items-center justify-center mx-auto mb-4">
              {status === 'loading' ? (
                <Loader2 className="w-8 h-8 text-copper animate-spin" />
              ) : status === 'success' ? (
                <CheckCircle className="w-8 h-8 text-green-600" />
              ) : status === 'error' ? (
                <XCircle className="w-8 h-8 text-destructive" />
              ) : (
                <Lock className="w-8 h-8 text-copper" />
              )}
            </div>
            <CardTitle className="font-display text-2xl">
              {status === 'success' ? 'Password Updated!' : status === 'error' ? 'Reset Failed' : 'Set New Password'}
            </CardTitle>
            <CardDescription>
              {status === 'success' 
                ? 'Your password has been updated. You can now sign in.'
                : status === 'error'
                  ? errorMessage
                  : 'Choose a strong password for your account.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {status === 'form' && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="At least 8 characters with a number"
                      value={newPassword}
                      onChange={(e) => { setNewPassword(e.target.value); setErrorMessage(''); }}
                      required
                      minLength={8}
                      data-testid="input-new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      data-testid="toggle-password-visibility"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {newPassword && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-300 ${strength.color}`}
                            style={{ width: strength.width }}
                          />
                        </div>
                        <span className={`text-xs font-medium ${
                          strength.level === 'weak' ? 'text-red-500' : 
                          strength.level === 'medium' ? 'text-amber-500' : 'text-green-500'
                        }`}>
                          {strength.label}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className={`text-xs ${newPassword.length >= 8 ? 'text-green-600' : 'text-muted-foreground'}`}>
                          {newPassword.length >= 8 ? '\u2713' : '\u2022'} At least 8 characters
                        </span>
                        <span className={`text-xs ${/\d/.test(newPassword) ? 'text-green-600' : 'text-muted-foreground'}`}>
                          {/\d/.test(newPassword) ? '\u2713' : '\u2022'} Contains a number
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <Input
                    id="confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Type your password again"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setErrorMessage(''); }}
                    required
                    data-testid="input-confirm-password"
                  />
                  {confirmPassword && !passwordsMatch && (
                    <p className="text-xs text-red-500">Passwords do not match</p>
                  )}
                </div>
                {errorMessage && (
                  <p className="text-sm text-destructive">{errorMessage}</p>
                )}
                <Button 
                  type="submit" 
                  className="w-full bg-copper hover:bg-copper/90"
                  disabled={!meetsRequirements || !passwordsMatch}
                  data-testid="button-set-password"
                >
                  Set New Password
                </Button>
              </form>
            )}

            {status === 'loading' && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-copper" />
                <span className="ml-2 text-muted-foreground">Updating your password...</span>
              </div>
            )}

            {status === 'success' && (
              <div className="text-center">
                <Link href="/">
                  <Button className="bg-copper hover:bg-copper/90" data-testid="button-go-to-signin">
                    Go to Sign In
                  </Button>
                </Link>
              </div>
            )}

            {status === 'error' && (
              <div className="space-y-3 text-center">
                <Button 
                  onClick={() => { setStatus('form'); setErrorMessage(''); }}
                  variant="outline"
                  className="mr-2"
                  data-testid="button-try-again"
                >
                  Try Again
                </Button>
                <Link href="/">
                  <Button variant="ghost" data-testid="button-request-new-link">
                    Request New Link
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Prairie Mobile Fuel Services &middot; Calgary, Alberta
        </p>
      </motion.div>
    </div>
  );
}
