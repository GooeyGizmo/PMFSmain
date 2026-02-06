import { useState, useMemo } from 'react';
import { Link } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, RefreshCw, Plus, X, Save, Check, DollarSign, Calendar, Truck, Fuel } from 'lucide-react';
import OpsLayout from '@/components/ops-layout';
import { useToast } from '@/hooks/use-toast';

interface Expense {
  id: string;
  name: string;
  amount: string;
  frequency: 'daily' | 'weekly' | 'monthly';
}

interface OperatingCostsCalculatorProps {
  embedded?: boolean;
}

export default function OperatingCostsCalculator({ embedded = false }: OperatingCostsCalculatorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [settingsSaved, setSettingsSaved] = useState(false);

  const { data: settingsData } = useQuery<{ settings: Record<string, string> }>({
    queryKey: ['/api/ops/settings'],
  });

  const saveSettingsMutation = useMutation({
    mutationFn: async (settings: Record<string, string>) => {
      const res = await fetch('/api/ops/settings/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ settings }),
      });
      if (!res.ok) throw new Error('Failed to save settings');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/settings'] });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
      toast({ title: 'Settings saved', description: 'Operating costs saved for analytics' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to save settings', variant: 'destructive' });
    },
  });

  const [expenses, setExpenses] = useState<Expense[]>([
    { id: '1', name: 'Truck Fuel (Diesel)', amount: '50', frequency: 'daily' },
    { id: '2', name: 'Vehicle Insurance', amount: '275', frequency: 'monthly' },
    { id: '3', name: 'Phone/Data Plan', amount: '0', frequency: 'monthly' },
    { id: '4', name: 'Software Subscriptions', amount: '50', frequency: 'monthly' },
  ]);

  const [workInputs, setWorkInputs] = useState({
    workDaysPerWeek: '6',
    stopsPerDay: '14',
  });

  const addExpense = () => {
    setExpenses([...expenses, { id: crypto.randomUUID(), name: '', amount: '0', frequency: 'monthly' }]);
  };

  const removeExpense = (id: string) => {
    setExpenses(expenses.filter(e => e.id !== id));
  };

  const updateExpense = (id: string, field: keyof Expense, value: string) => {
    setExpenses(expenses.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const calculations = useMemo(() => {
    const workDays = parseFloat(workInputs.workDaysPerWeek) || 3;
    const stopsPerDay = parseFloat(workInputs.stopsPerDay) || 5;
    const weeklyStops = workDays * stopsPerDay;
    const monthlyStops = weeklyStops * 4.33;

    let dailyTotal = 0;
    let weeklyTotal = 0;
    let monthlyTotal = 0;

    const expenseBreakdown = expenses.map(exp => {
      const amount = parseFloat(exp.amount) || 0;
      let daily = 0, weekly = 0, monthly = 0;
      
      switch (exp.frequency) {
        case 'daily':
          daily = amount;
          weekly = amount * workDays;
          monthly = amount * workDays * 4.33;
          break;
        case 'weekly':
          daily = amount / workDays;
          weekly = amount;
          monthly = amount * 4.33;
          break;
        case 'monthly':
          daily = amount / (workDays * 4.33);
          weekly = amount / 4.33;
          monthly = amount;
          break;
      }
      
      dailyTotal += daily;
      weeklyTotal += weekly;
      monthlyTotal += monthly;

      return { ...exp, daily, weekly, monthly };
    });

    const costPerStop = monthlyStops > 0 ? monthlyTotal / monthlyStops : 0;
    const yearlyTotal = monthlyTotal * 12;

    return {
      expenseBreakdown,
      dailyTotal,
      weeklyTotal,
      monthlyTotal,
      yearlyTotal,
      costPerStop,
      weeklyStops,
      monthlyStops,
    };
  }, [expenses, workInputs]);

  const handleSaveToSettings = () => {
    saveSettingsMutation.mutate({
      monthly_operating_cost: calculations.monthlyTotal.toFixed(2),
      cost_per_stop: calculations.costPerStop.toFixed(2),
    });
  };

  const content = (
    <main className={embedded ? "space-y-6" : "max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8 space-y-6"}>
      {!embedded && (
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/owner/finance">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-blue-500" />
              <span className="font-display font-bold text-foreground">Operating Costs</span>
            </div>
          </div>
          <Button 
            onClick={handleSaveToSettings}
            disabled={saveSettingsMutation.isPending}
            className="gap-2"
            data-testid="button-save-settings"
          >
            {settingsSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {settingsSaved ? 'Saved!' : 'Save to Analytics'}
          </Button>
        </div>
      )}

        <div className="grid md:grid-cols-4 gap-4">
          <Card className="border-2 border-blue-500/30 bg-gradient-to-br from-blue-500/5 to-blue-500/10">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-blue-500" />
                <span className="text-sm text-muted-foreground">Daily</span>
              </div>
              <p className="font-display text-2xl font-bold">${calculations.dailyTotal.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card className="border-2 border-purple-500/30 bg-gradient-to-br from-purple-500/5 to-purple-500/10">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-purple-500" />
                <span className="text-sm text-muted-foreground">Weekly</span>
              </div>
              <p className="font-display text-2xl font-bold">${calculations.weeklyTotal.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card className="border-2 border-copper/30 bg-gradient-to-br from-copper/5 to-copper/10">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-copper" />
                <span className="text-sm text-muted-foreground">Monthly</span>
              </div>
              <p className="font-display text-2xl font-bold">${calculations.monthlyTotal.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card className="border-2 border-sage/30 bg-gradient-to-br from-sage/5 to-sage/10">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <Truck className="w-4 h-4 text-sage" />
                <span className="text-sm text-muted-foreground">Per Stop</span>
              </div>
              <p className="font-display text-2xl font-bold">${calculations.costPerStop.toFixed(2)}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Truck className="w-5 h-5 text-copper" />
              Work Schedule
            </CardTitle>
            <CardDescription>Your delivery schedule affects cost allocation</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Work Days per Week</Label>
                <Input
                  type="number"
                  value={workInputs.workDaysPerWeek}
                  onChange={(e) => setWorkInputs(prev => ({ ...prev, workDaysPerWeek: e.target.value }))}
                  className="mt-1"
                  data-testid="input-work-days"
                />
              </div>
              <div>
                <Label>Stops per Day</Label>
                <Input
                  type="number"
                  value={workInputs.stopsPerDay}
                  onChange={(e) => setWorkInputs(prev => ({ ...prev, stopsPerDay: e.target.value }))}
                  className="mt-1"
                  data-testid="input-stops-day"
                />
              </div>
            </div>
            <div className="mt-4 p-3 rounded-lg bg-muted text-sm">
              <span className="text-muted-foreground">Based on your schedule: </span>
              <span className="font-medium">{calculations.weeklyStops.toFixed(0)} stops/week</span>
              <span className="text-muted-foreground"> · </span>
              <span className="font-medium">{calculations.monthlyStops.toFixed(0)} stops/month</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="font-display flex items-center gap-2">
                  <Fuel className="w-5 h-5 text-copper" />
                  Expense Items
                </CardTitle>
                <CardDescription>Add all your recurring business expenses</CardDescription>
              </div>
              <Button onClick={addExpense} variant="outline" size="sm" className="gap-2" data-testid="button-add-expense">
                <Plus className="w-4 h-4" />
                Add Expense
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="grid grid-cols-12 gap-3 text-sm font-medium text-muted-foreground pb-2 border-b">
                <div className="col-span-4">Expense Name</div>
                <div className="col-span-2">Amount ($)</div>
                <div className="col-span-2">Frequency</div>
                <div className="col-span-1 text-right">Daily</div>
                <div className="col-span-1 text-right">Weekly</div>
                <div className="col-span-1 text-right">Monthly</div>
                <div className="col-span-1"></div>
              </div>

              {calculations.expenseBreakdown.map((expense) => (
                <div key={expense.id} className="grid grid-cols-12 gap-3 items-center">
                  <div className="col-span-4">
                    <Input
                      value={expense.name}
                      onChange={(e) => updateExpense(expense.id, 'name', e.target.value)}
                      placeholder="Expense name"
                      data-testid={`input-expense-name-${expense.id}`}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      value={expense.amount}
                      onChange={(e) => updateExpense(expense.id, 'amount', e.target.value)}
                      data-testid={`input-expense-amount-${expense.id}`}
                    />
                  </div>
                  <div className="col-span-2">
                    <Select 
                      value={expense.frequency} 
                      onValueChange={(v) => updateExpense(expense.id, 'frequency', v)}
                    >
                      <SelectTrigger data-testid={`select-expense-freq-${expense.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-1 text-right text-sm">${expense.daily.toFixed(2)}</div>
                  <div className="col-span-1 text-right text-sm">${expense.weekly.toFixed(2)}</div>
                  <div className="col-span-1 text-right text-sm">${expense.monthly.toFixed(2)}</div>
                  <div className="col-span-1 flex justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeExpense(expense.id)}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      data-testid={`button-remove-expense-${expense.id}`}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}

              <div className="grid grid-cols-12 gap-3 pt-3 border-t font-medium">
                <div className="col-span-4">Total</div>
                <div className="col-span-2"></div>
                <div className="col-span-2"></div>
                <div className="col-span-1 text-right">${calculations.dailyTotal.toFixed(2)}</div>
                <div className="col-span-1 text-right">${calculations.weeklyTotal.toFixed(2)}</div>
                <div className="col-span-1 text-right text-sage">${calculations.monthlyTotal.toFixed(2)}</div>
                <div className="col-span-1"></div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display">Annual Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 to-amber-500/5 border">
                <div className="text-sm text-muted-foreground mb-1">Yearly Operating Costs</div>
                <div className="font-display text-2xl font-bold text-amber-600">${calculations.yearlyTotal.toFixed(0)}</div>
              </div>
              <div className="p-4 rounded-xl bg-gradient-to-br from-sage/10 to-sage/5 border">
                <div className="text-sm text-muted-foreground mb-1">Cost Per Stop</div>
                <div className="font-display text-2xl font-bold">${calculations.costPerStop.toFixed(2)}</div>
              </div>
              <div className="p-4 rounded-xl bg-gradient-to-br from-copper/10 to-copper/5 border">
                <div className="text-sm text-muted-foreground mb-1">Yearly Stops</div>
                <div className="font-display text-2xl font-bold">{(calculations.monthlyStops * 12).toFixed(0)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
  );

  if (embedded) {
    return content;
  }

  return <OpsLayout>{content}</OpsLayout>;
}
