import { useState, useEffect } from 'react';
import { useSearch, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { CreditCard, User, Settings, Wallet, Star, HelpCircle, RefreshCw, LayoutDashboard, Bell, Truck, Shield, Lock, Monitor, LogOut, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useLayoutMode } from '@/hooks/use-layout-mode';
import { usePreferences } from '@/hooks/use-preferences';
import { useAuth } from '@/lib/auth';
import { AppShell } from '@/components/app-shell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

import Subscription from '@/pages/customer/subscription';
import Profile from '@/pages/customer/profile';
import PaymentMethods from '@/pages/customer/payment-methods';
import Rewards from '@/pages/customer/referrals';
import Help from '@/pages/customer/help';
import Recurring from '@/pages/customer/recurring';
import Notifications from '@/pages/customer/notifications';

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

function SecurityContent() {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const { data: sessionData, refetch: refetchSessions } = useQuery<{ sessionCount: number }>({
    queryKey: ['/api/auth/sessions'],
  });

  const strength = getPasswordStrength(newPassword);
  const passwordsMatch = newPassword === confirmPassword;
  const meetsRequirements = newPassword.length >= 8 && /\d/.test(newPassword);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meetsRequirements || !passwordsMatch) return;

    setChangingPassword(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: 'Password updated', description: 'Your password has been changed successfully.' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        refetchSessions();
      } else {
        toast({ title: 'Error', description: data.message || 'Failed to change password.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Something went wrong. Please try again.', variant: 'destructive' });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSignOutAll = async () => {
    setSigningOut(true);
    try {
      const res = await fetch('/api/auth/sign-out-all', {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        toast({ title: 'Done', description: 'All other devices have been signed out.' });
        refetchSessions();
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to sign out other devices.', variant: 'destructive' });
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="space-y-6 py-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5" />
            Change Password
          </CardTitle>
          <CardDescription>Update your password to keep your account secure</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="current-pw">Current Password</Label>
              <div className="relative">
                <Input
                  id="current-pw"
                  type={showPasswords ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  data-testid="input-current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords(!showPasswords)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-pw">New Password</Label>
              <Input
                id="new-pw"
                type={showPasswords ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters with a number"
                required
                minLength={8}
                data-testid="input-new-pw"
              />
              {newPassword && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-300 ${strength.color}`} style={{ width: strength.width }} />
                    </div>
                    <span className={`text-xs font-medium ${strength.level === 'weak' ? 'text-red-500' : strength.level === 'medium' ? 'text-amber-500' : 'text-green-500'}`}>
                      {strength.label}
                    </span>
                  </div>
                  <span className={`text-xs ${newPassword.length >= 8 ? 'text-green-600' : 'text-muted-foreground'}`}>
                    {newPassword.length >= 8 ? '\u2713' : '\u2022'} At least 8 characters
                  </span>
                  <span className={`text-xs block ${/\d/.test(newPassword) ? 'text-green-600' : 'text-muted-foreground'}`}>
                    {/\d/.test(newPassword) ? '\u2713' : '\u2022'} Contains a number
                  </span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-pw">Confirm New Password</Label>
              <Input
                id="confirm-pw"
                type={showPasswords ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                data-testid="input-confirm-pw"
              />
              {confirmPassword && !passwordsMatch && (
                <p className="text-xs text-red-500">Passwords do not match</p>
              )}
            </div>
            <Button
              type="submit"
              className="bg-copper hover:bg-copper/90"
              disabled={changingPassword || !meetsRequirements || !passwordsMatch || !currentPassword}
              data-testid="button-change-password"
            >
              {changingPassword ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Updating...</> : 'Update Password'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="w-5 h-5" />
            Active Sessions
          </CardTitle>
          <CardDescription>
            You have {sessionData?.sessionCount || 1} active session{(sessionData?.sessionCount || 1) > 1 ? 's' : ''} across your devices
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            If you notice any suspicious activity, sign out of all other devices to secure your account.
          </p>
          <Button
            variant="outline"
            onClick={handleSignOutAll}
            disabled={signingOut || (sessionData?.sessionCount || 1) <= 1}
            data-testid="button-sign-out-all"
          >
            {signingOut ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Signing out...</> : <><LogOut className="w-4 h-4 mr-2" /> Sign Out All Other Devices</>}
          </Button>
          {(sessionData?.sessionCount || 1) <= 1 && (
            <p className="text-xs text-muted-foreground mt-2">You only have this one active session.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PreferencesContent() {
  const { preferences, resetPreferences } = usePreferences();
  const { isAdmin } = useAuth();
  
  return (
    <div className="py-4">
      <div className="space-y-4">
        <div className="p-4 rounded-lg border bg-muted/30">
          <h3 className="font-medium mb-2">Saved Preferences</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Your app remembers your choices to make ordering faster.
          </p>
          <button 
            onClick={resetPreferences}
            className="text-sm text-destructive hover:underline"
          >
            Reset all preferences
          </button>
        </div>

        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LayoutDashboard className="w-5 h-5" />
                Quick Navigation
              </CardTitle>
              <CardDescription>Switch between different views</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Link href="/owner" className="block">
                <Button 
                  variant="outline" 
                  className="w-full justify-start gap-3"
                  data-testid="button-back-to-dashboard"
                >
                  <Settings className="w-4 h-4" />
                  Back to Dashboard
                  <span className="text-xs text-muted-foreground ml-auto">Return to owner view</span>
                </Button>
              </Link>
              <Link href="/operator" className="block">
                <Button 
                  variant="outline" 
                  className="w-full justify-start gap-3"
                  data-testid="button-operator-view"
                >
                  <Truck className="w-4 h-4" />
                  Driver/Operator View
                  <span className="text-xs text-muted-foreground ml-auto">See app as a driver/operator</span>
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function AccountPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const tabParam = params.get('tab') || 'preferences';
  
  const [activeTab, setActiveTab] = useState(tabParam);
  const layout = useLayoutMode();
  const { setPreference } = usePreferences();

  useEffect(() => {
    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setPreference('lastAccountTab', value);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', value);
    window.history.replaceState({}, '', url.toString());
  };

  return (
    <AppShell forceShell="customer">
      <div className={cn(
        "max-w-4xl mx-auto px-4 py-6",
        layout.isCompact && "px-3 py-4"
      )}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="mb-6">
            <h1 className="text-2xl font-display font-bold text-foreground">
              Settings
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage your preferences, profile, and billing
            </p>
          </div>

          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
              <TabsTrigger value="preferences" className="gap-2" data-testid="tab-preferences">
                <Settings className="w-4 h-4" />
                <span>Preferences</span>
              </TabsTrigger>
              <TabsTrigger value="profile" className="gap-2" data-testid="tab-profile">
                <User className="w-4 h-4" />
                <span>Profile</span>
              </TabsTrigger>
              <TabsTrigger value="subscription" className="gap-2" data-testid="tab-subscription">
                <CreditCard className="w-4 h-4" />
                <span>Membership</span>
              </TabsTrigger>
              <TabsTrigger value="billing" className="gap-2" data-testid="tab-billing">
                <Wallet className="w-4 h-4" />
                <span>Payment Methods</span>
              </TabsTrigger>
              <TabsTrigger value="notifications" className="gap-2" data-testid="tab-notifications">
                <Bell className="w-4 h-4" />
                <span>Notifications</span>
              </TabsTrigger>
              <TabsTrigger value="recurring" className="gap-2" data-testid="tab-recurring">
                <RefreshCw className="w-4 h-4" />
                <span>Recurring</span>
              </TabsTrigger>
              <TabsTrigger value="rewards" className="gap-2" data-testid="tab-rewards">
                <Star className="w-4 h-4" />
                <span>Rewards</span>
              </TabsTrigger>
              <TabsTrigger value="security" className="gap-2" data-testid="tab-security">
                <Shield className="w-4 h-4" />
                <span>Security</span>
              </TabsTrigger>
              <TabsTrigger value="support" className="gap-2" data-testid="tab-support">
                <HelpCircle className="w-4 h-4" />
                <span>Support</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="mt-4">
              <Profile />
            </TabsContent>

            <TabsContent value="subscription" className="mt-4">
              <Subscription />
            </TabsContent>

            <TabsContent value="billing" className="mt-4">
              <PaymentMethods />
            </TabsContent>

            <TabsContent value="notifications" className="mt-4">
              <Notifications />
            </TabsContent>

            <TabsContent value="recurring" className="mt-4">
              <Recurring />
            </TabsContent>

            <TabsContent value="preferences" className="mt-4">
              <PreferencesContent />
            </TabsContent>

            <TabsContent value="rewards" className="mt-4">
              <Rewards />
            </TabsContent>

            <TabsContent value="security" className="mt-4">
              <SecurityContent />
            </TabsContent>

            <TabsContent value="support" className="mt-4">
              <Help />
            </TabsContent>

          </Tabs>
        </motion.div>
      </div>
    </AppShell>
  );
}
