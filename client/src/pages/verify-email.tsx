import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Loader2, Mail, ArrowLeft } from 'lucide-react';

export default function VerifyEmail() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'expired'>('loading');
  const [message, setMessage] = useState('');

  const token = new URLSearchParams(window.location.search).get('token');

  const verifyMutation = useMutation({
    mutationFn: async (token: string) => {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw { ...data, status: res.status };
      }
      return data;
    },
    onSuccess: (data) => {
      setStatus('success');
      setMessage(data.message || 'Email verified successfully!');
    },
    onError: (error: any) => {
      if (error.expired) {
        setStatus('expired');
        setMessage(error.message || 'Verification link has expired.');
      } else {
        setStatus('error');
        setMessage(error.message || 'Verification failed. Please try again.');
      }
    },
  });

  useEffect(() => {
    if (token) {
      verifyMutation.mutate(token);
    } else {
      setStatus('error');
      setMessage('No verification token provided.');
    }
  }, [token]);

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
            <div className="mx-auto mb-4">
              {status === 'loading' && (
                <div className="w-16 h-16 rounded-full bg-copper/10 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-copper animate-spin" />
                </div>
              )}
              {status === 'success' && (
                <div className="w-16 h-16 rounded-full bg-sage/10 flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-sage" />
                </div>
              )}
              {(status === 'error' || status === 'expired') && (
                <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                  <XCircle className="w-8 h-8 text-destructive" />
                </div>
              )}
            </div>
            <CardTitle className="font-display text-2xl">
              {status === 'loading' && 'Verifying Your Email...'}
              {status === 'success' && 'Email Verified!'}
              {status === 'error' && 'Verification Failed'}
              {status === 'expired' && 'Link Expired'}
            </CardTitle>
            <CardDescription className="text-base">
              {message}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {status === 'success' && (
              <Button 
                onClick={() => setLocation('/')} 
                className="w-full bg-copper hover:bg-copper/90"
                data-testid="button-go-to-login"
              >
                Go to Login
              </Button>
            )}
            {status === 'expired' && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground text-center">
                  Your verification link has expired. Click below to request a new one.
                </p>
                <Button 
                  onClick={() => setLocation('/?resend=true')} 
                  className="w-full bg-copper hover:bg-copper/90"
                  data-testid="button-request-new-link"
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Request New Verification Link
                </Button>
              </div>
            )}
            {status === 'error' && (
              <Button 
                onClick={() => setLocation('/')} 
                variant="outline"
                className="w-full"
                data-testid="button-back-home"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
