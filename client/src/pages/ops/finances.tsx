import { useState } from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, Wallet, PiggyBank, TrendingUp, Calendar, DollarSign, 
  Loader2, Target, CheckCircle, Clock, Download, Settings, Fuel,
  Building2, Shield, Wrench, Rocket, Heart, AlertTriangle, Banknote,
  CalendarCheck, FileSpreadsheet, LayoutDashboard
} from 'lucide-react';
import OpsLayout from '@/components/ops-layout';
import { format } from 'date-fns';

const ACCOUNT_ICONS: Record<string, any> = {
  operating_chequing: Building2,
  gst_holding: Banknote,
  deferred_subscription: Clock,
  income_tax_reserve: FileSpreadsheet,
  operating_buffer: Wallet,
  maintenance_reserve: Wrench,
  emergency_risk: Shield,
  growth_capital: Rocket,
  owner_draw_holding: Heart,
};

const ACCOUNT_COLORS: Record<string, string> = {
  operating_chequing: 'bg-blue-500/10 border-blue-500/30 text-blue-600',
  gst_holding: 'bg-red-500/10 border-red-500/30 text-red-600',
  deferred_subscription: 'bg-amber-500/10 border-amber-500/30 text-amber-600',
  income_tax_reserve: 'bg-purple-500/10 border-purple-500/30 text-purple-600',
  operating_buffer: 'bg-teal-500/10 border-teal-500/30 text-teal-600',
  maintenance_reserve: 'bg-orange-500/10 border-orange-500/30 text-orange-600',
  emergency_risk: 'bg-rose-500/10 border-rose-500/30 text-rose-600',
  growth_capital: 'bg-green-500/10 border-green-500/30 text-green-600',
  owner_draw_holding: 'bg-pink-500/10 border-pink-500/30 text-pink-600',
};

interface FinancialAccount {
  id: string;
  accountType: string;
  name: string;
  description: string | null;
  balance: string;
  isHolding: boolean;
  sortOrder: number;
}

interface RunwayData {
  ownerDrawBalance: number;
  targetMonthlyIncome: number;
  monthsOfRunway: number;
  avgWeeklyContribution: number;
  weeksToFreedom: number;
  freedomDate: string | null;
  recentTransfers: any[];
}

interface WeekSummary {
  weekStart: string;
  weekEnd: string;
  operatingMode: string;
  summary: {
    ordersCompleted: number;
    litresBilled: number;
    fuelRevenueGross: number;
    deliveryFeeRevenue: number;
    subscriptionRevenue: number;
    totalGstCollected: number;
    totalRevenue: number;
  };
}

export default function OpsFinances() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('dashboard');

  const { data: accountsData, isLoading: accountsLoading } = useQuery<{ accounts: FinancialAccount[] }>({
    queryKey: ['/api/ops/finances/accounts'],
  });

  const { data: settingsData } = useQuery<{ settings: Record<string, string> }>({
    queryKey: ['/api/ops/finances/settings'],
  });

  const { data: runwayData } = useQuery<RunwayData>({
    queryKey: ['/api/ops/finances/runway'],
  });

  const { data: weekSummaryData } = useQuery<WeekSummary>({
    queryKey: ['/api/ops/finances/current-week-summary'],
  });

  const { data: closesData } = useQuery<{ closes: any[] }>({
    queryKey: ['/api/ops/finances/weekly-closes'],
  });

  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const res = await fetch(`/api/ops/finances/settings/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ value }),
      });
      if (!res.ok) throw new Error('Failed to update setting');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/finances/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ops/finances/current-week-summary'] });
      toast({ title: 'Setting Updated', description: 'Finance setting has been saved' });
    },
  });

  const accounts = accountsData?.accounts || [];
  const settings = settingsData?.settings || {};
  const runway = runwayData;
  const weekSummary = weekSummaryData;
  const closes = closesData?.closes || [];
  
  const operatingMode = settings.operating_mode || 'soft_launch';
  const totalBalance = accounts.reduce((sum, a) => sum + parseFloat(a.balance), 0);
  const holdingBalance = accounts.filter(a => a.isHolding).reduce((sum, a) => sum + parseFloat(a.balance), 0);

  if (accountsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-copper" />
      </div>
    );
  }

  return (
    <OpsLayout>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8 space-y-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/ops">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-copper" />
              <span className="font-display font-bold text-foreground">Business Finances</span>
            </div>
            <Badge 
              variant="secondary" 
              className={operatingMode === 'soft_launch' 
                ? 'bg-amber-500/20 text-amber-700 border-amber-500/30' 
                : 'bg-green-500/20 text-green-700 border-green-500/30'}
            >
              {operatingMode === 'soft_launch' ? 'Soft Launch (Sun-Tue)' : 'Full-Time (Mon-Sat)'}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2" data-testid="button-export">
              <Download className="w-4 h-4" />
              Export to QuickBooks
            </Button>
          </div>
        </div>

        <div>
          <motion.h1 
            className="font-display text-2xl font-bold text-foreground"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Weekly Close & Financial Management
          </motion.h1>
          <p className="text-muted-foreground mt-1">
            {operatingMode === 'soft_launch' 
              ? 'Close every Wednesday for Sun-Tue operations'
              : 'Close every Sunday for Mon-Sat operations'}
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="dashboard" className="gap-2">
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="weekly-close" className="gap-2">
              <CalendarCheck className="w-4 h-4" />
              Weekly Close
            </TabsTrigger>
            <TabsTrigger value="runway" className="gap-2">
              <Target className="w-4 h-4" />
              Freedom Runway
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="w-4 h-4" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-2 border-copper/30 bg-gradient-to-br from-copper/5 to-background">
                <CardHeader className="pb-2">
                  <CardDescription>Total Across All Buckets</CardDescription>
                  <CardTitle className="text-3xl font-display">${totalBalance.toFixed(2)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {accounts.length} accounts tracked
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Holding Accounts (Untouchable)</CardDescription>
                  <CardTitle className="text-3xl font-display text-amber-600">${holdingBalance.toFixed(2)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    GST, Tax, Reserves, Owner Draw
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Owner Draw Holding</CardDescription>
                  <CardTitle className="text-3xl font-display text-pink-600">
                    ${runway?.ownerDrawBalance?.toFixed(2) || '0.00'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {runway?.monthsOfRunway?.toFixed(1) || 0} months of runway
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <PiggyBank className="w-5 h-5 text-copper" />
                  Account Buckets
                </CardTitle>
                <CardDescription>Your 9 financial buckets with current balances</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {accounts.map((account) => {
                    const Icon = ACCOUNT_ICONS[account.accountType] || Wallet;
                    const colorClass = ACCOUNT_COLORS[account.accountType] || 'bg-gray-500/10 border-gray-500/30';
                    const balance = parseFloat(account.balance);
                    
                    return (
                      <div 
                        key={account.id}
                        className={`p-4 rounded-xl border-2 ${colorClass} transition-all hover:scale-[1.02]`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Icon className="w-5 h-5" />
                            <span className="font-medium text-sm">{account.name}</span>
                          </div>
                          {account.isHolding && (
                            <Badge variant="outline" className="text-xs">Holding</Badge>
                          )}
                        </div>
                        <p className="text-2xl font-display font-bold">
                          ${balance.toFixed(2)}
                        </p>
                        {account.description && (
                          <p className="text-xs text-muted-foreground mt-1">{account.description}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="weekly-close" className="space-y-6">
            <Card className="border-2 border-sage/30">
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <CalendarCheck className="w-5 h-5 text-sage" />
                  Current Week Summary
                </CardTitle>
                <CardDescription>
                  {weekSummary ? (
                    <>Week of {format(new Date(weekSummary.weekStart), 'MMM d')} - {format(new Date(weekSummary.weekEnd), 'MMM d, yyyy')}</>
                  ) : 'Loading...'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {weekSummary && (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="p-4 rounded-lg bg-muted/50">
                        <p className="text-sm text-muted-foreground">Orders Completed</p>
                        <p className="text-2xl font-display font-bold">{weekSummary.summary.ordersCompleted}</p>
                      </div>
                      <div className="p-4 rounded-lg bg-muted/50">
                        <p className="text-sm text-muted-foreground">Litres Billed</p>
                        <p className="text-2xl font-display font-bold">{weekSummary.summary.litresBilled.toFixed(1)}L</p>
                      </div>
                      <div className="p-4 rounded-lg bg-muted/50">
                        <p className="text-sm text-muted-foreground">Fuel Revenue</p>
                        <p className="text-2xl font-display font-bold">${weekSummary.summary.fuelRevenueGross.toFixed(2)}</p>
                      </div>
                      <div className="p-4 rounded-lg bg-muted/50">
                        <p className="text-sm text-muted-foreground">GST Collected</p>
                        <p className="text-2xl font-display font-bold">${weekSummary.summary.totalGstCollected.toFixed(2)}</p>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-sage/10 border border-sage/30">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Total Week Revenue (incl. GST)</p>
                          <p className="text-3xl font-display font-bold text-sage">${weekSummary.summary.totalRevenue.toFixed(2)}</p>
                        </div>
                        <Button className="gap-2" disabled>
                          <CheckCircle className="w-4 h-4" />
                          Start Weekly Close
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Weekly close wizard will guide you through: Fuel Reconciliation → UFA Payment → GST Separation → Allocations → Owner Draw
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-copper" />
                  Previous Weekly Closes
                </CardTitle>
              </CardHeader>
              <CardContent>
                {closes.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CalendarCheck className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No weekly closes completed yet</p>
                    <p className="text-sm">Your first close will appear here</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {closes.map((close) => (
                      <div key={close.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <div>
                          <p className="font-medium">
                            Week of {format(new Date(close.weekStartDate), 'MMM d')} - {format(new Date(close.weekEndDate), 'MMM d')}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {close.ordersCompleted || 0} orders • ${parseFloat(close.fuelRevenueGross || 0).toFixed(2)} fuel revenue
                          </p>
                        </div>
                        <Badge variant={close.status === 'completed' ? 'default' : 'secondary'}>
                          {close.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="runway" className="space-y-6">
            <Card className="border-2 border-pink-500/30 bg-gradient-to-br from-pink-500/5 to-background">
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <Heart className="w-5 h-5 text-pink-500" />
                  Freedom Runway Tracker
                </CardTitle>
                <CardDescription>
                  Track your progress toward replacing your full-time job income
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {runway && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-4 rounded-xl bg-pink-500/10 border border-pink-500/30">
                        <p className="text-sm text-muted-foreground">Owner Draw Holding</p>
                        <p className="text-3xl font-display font-bold text-pink-600">
                          ${runway.ownerDrawBalance.toFixed(2)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">Untouchable freedom fund</p>
                      </div>
                      
                      <div className="p-4 rounded-xl bg-muted/50">
                        <p className="text-sm text-muted-foreground">Monthly Target Income</p>
                        <p className="text-3xl font-display font-bold">${runway.targetMonthlyIncome.toFixed(0)}</p>
                        <p className="text-xs text-muted-foreground mt-1">To replace your job</p>
                      </div>
                      
                      <div className="p-4 rounded-xl bg-muted/50">
                        <p className="text-sm text-muted-foreground">Current Runway</p>
                        <p className="text-3xl font-display font-bold text-sage">
                          {runway.monthsOfRunway.toFixed(1)} months
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">At target spending rate</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Progress to 6-Month Runway (Safety Net)</span>
                        <span>{Math.min(100, (runway.monthsOfRunway / 6) * 100).toFixed(0)}%</span>
                      </div>
                      <Progress 
                        value={Math.min(100, (runway.monthsOfRunway / 6) * 100)} 
                        className="h-3"
                      />
                    </div>

                    {runway.freedomDate && (
                      <div className="p-4 rounded-xl bg-gradient-to-r from-sage/20 to-copper/20 border border-sage/30">
                        <div className="flex items-center gap-3">
                          <Target className="w-8 h-8 text-sage" />
                          <div>
                            <p className="text-sm text-muted-foreground">Projected Freedom Date</p>
                            <p className="text-2xl font-display font-bold">
                              {format(new Date(runway.freedomDate), 'MMMM d, yyyy')}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              ~{runway.weeksToFreedom} weeks at ${runway.avgWeeklyContribution.toFixed(0)}/week avg contribution
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                        <div>
                          <p className="font-medium text-amber-700">The Golden Rule</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            This money is transferred weekly but <strong>never touched</strong> until PMFS replaces your full-time income.
                            No debit card. No bill payments. No emergencies. This is your freedom fund.
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2">
                  <Settings className="w-5 h-5 text-copper" />
                  Operating Mode
                </CardTitle>
                <CardDescription>
                  Switch between soft launch and full-time operations
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
                  <div>
                    <p className="font-medium">Current Mode: {operatingMode === 'soft_launch' ? 'Soft Launch' : 'Full-Time'}</p>
                    <p className="text-sm text-muted-foreground">
                      {operatingMode === 'soft_launch' 
                        ? 'Operating Sun-Tue, weekly close on Wednesday'
                        : 'Operating Mon-Sat, weekly close on Sunday'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={operatingMode === 'soft_launch' ? 'font-medium' : 'text-muted-foreground'}>
                      Soft Launch
                    </span>
                    <Switch 
                      checked={operatingMode === 'full_time'}
                      onCheckedChange={(checked) => {
                        updateSettingMutation.mutate({
                          key: 'operating_mode',
                          value: checked ? 'full_time' : 'soft_launch'
                        });
                      }}
                    />
                    <span className={operatingMode === 'full_time' ? 'font-medium' : 'text-muted-foreground'}>
                      Full-Time
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl border">
                    <Label>Target Monthly Income to Replace Job</Label>
                    <div className="flex gap-2 mt-2">
                      <Input 
                        type="number"
                        value={settings.target_monthly_income || '5000'}
                        onChange={(e) => {
                          updateSettingMutation.mutate({
                            key: 'target_monthly_income',
                            value: e.target.value
                          });
                        }}
                        className="max-w-32"
                      />
                      <span className="text-muted-foreground self-center">/month</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Used to calculate your freedom runway
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border">
                    <Label>GST Rate</Label>
                    <div className="flex gap-2 mt-2">
                      <Input 
                        type="number"
                        value={settings.gst_rate || '5'}
                        onChange={(e) => {
                          updateSettingMutation.mutate({
                            key: 'gst_rate',
                            value: e.target.value
                          });
                        }}
                        className="max-w-20"
                      />
                      <span className="text-muted-foreground self-center">%</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Canadian GST rate for calculations
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </OpsLayout>
  );
}
