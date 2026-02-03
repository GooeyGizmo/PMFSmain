import { useState, useMemo } from 'react';
import { Link } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, Target, Sparkles, Calendar, TrendingUp, DollarSign, Plane, CheckCircle2 } from 'lucide-react';
import OpsLayout from '@/components/ops-layout';

interface FreedomRunwayCalculatorProps {
  embedded?: boolean;
}

export default function FreedomRunwayCalculator({ embedded = false }: FreedomRunwayCalculatorProps) {
  const [inputs, setInputs] = useState({
    currentWeeklyIncome: '800',
    targetWeeklyIncome: '1500',
    currentJobIncome: '3850',
    month6Goal: '1200',
    month12Goal: '3850',
    currentSavings: '5000',
    monthlyExpenses: '4500',
  });

  const calculations = useMemo(() => {
    const currentWeekly = parseFloat(inputs.currentWeeklyIncome) || 0;
    const targetWeekly = parseFloat(inputs.targetWeeklyIncome) || 0;
    const jobIncome = parseFloat(inputs.currentJobIncome) || 0;
    const month6Goal = parseFloat(inputs.month6Goal) || 0;
    const month12Goal = parseFloat(inputs.month12Goal) || 0;
    const savings = parseFloat(inputs.currentSavings) || 0;
    const expenses = parseFloat(inputs.monthlyExpenses) || 0;

    const currentMonthly = currentWeekly * 4.33;
    const targetMonthly = targetWeekly * 4.33;
    const jobMonthly = jobIncome;

    const month6Progress = month6Goal > 0 ? Math.min((currentWeekly / month6Goal) * 100, 100) : 0;
    const month12Progress = month12Goal > 0 ? Math.min((currentWeekly / month12Goal) * 100, 100) : 0;
    const targetProgress = targetWeekly > 0 ? Math.min((currentWeekly / targetWeekly) * 100, 100) : 0;
    const jobReplacementProgress = jobMonthly > 0 ? Math.min((currentMonthly / jobMonthly) * 100, 100) : 0;

    const gapToTarget = Math.max(0, targetWeekly - currentWeekly);
    const gapToJob = Math.max(0, jobMonthly - currentMonthly);
    const monthsOfRunway = expenses > 0 ? savings / expenses : 0;

    const weeksToTarget = gapToTarget > 0 && currentWeekly > 0 
      ? Math.ceil(gapToTarget / (currentWeekly * 0.1)) 
      : 0;

    const canCoverExpenses = currentMonthly >= expenses;
    const excessOrShortfall = currentMonthly - expenses;

    return {
      currentWeekly,
      currentMonthly,
      targetWeekly,
      targetMonthly,
      jobMonthly,
      month6Progress,
      month12Progress,
      targetProgress,
      jobReplacementProgress,
      gapToTarget,
      gapToJob,
      monthsOfRunway,
      weeksToTarget,
      canCoverExpenses,
      excessOrShortfall,
    };
  }, [inputs]);

  const milestones = [
    { label: 'First $500/week', target: 500, achieved: calculations.currentWeekly >= 500 },
    { label: 'First $1,000/week', target: 1000, achieved: calculations.currentWeekly >= 1000 },
    { label: 'Cover basic expenses', target: parseFloat(inputs.monthlyExpenses) / 4.33, achieved: calculations.canCoverExpenses },
    { label: 'Match job income', target: parseFloat(inputs.currentJobIncome), achieved: calculations.currentMonthly >= parseFloat(inputs.currentJobIncome) },
    { label: 'Month 6 goal', target: parseFloat(inputs.month6Goal), achieved: calculations.currentWeekly >= parseFloat(inputs.month6Goal) },
    { label: 'Month 12 goal', target: parseFloat(inputs.month12Goal), achieved: calculations.currentWeekly >= parseFloat(inputs.month12Goal) },
  ];

  const content = (
    <main className={embedded ? "space-y-6" : "max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8 space-y-6"}>
      {!embedded && (
        <div className="flex items-center gap-3 mb-6">
          <Link href="/owner/finance">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-pink-500" />
            <span className="font-display font-bold text-foreground">Freedom Runway Planner</span>
          </div>
        </div>
      )}

        <Card className="border-2 border-pink-500/30 bg-gradient-to-br from-pink-500/5 to-pink-500/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 rounded-full bg-pink-500/20 flex items-center justify-center">
                <Plane className="w-8 h-8 text-pink-500" />
              </div>
              <div>
                <h2 className="font-display text-2xl font-bold">Your Freedom Runway</h2>
                <p className="text-muted-foreground">Track your path to financial independence</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 mt-6">
              <div className="p-4 rounded-xl bg-background/50">
                <div className="text-sm text-muted-foreground mb-1">Current Weekly</div>
                <div className="font-display text-3xl font-bold text-pink-500">${calculations.currentWeekly.toFixed(0)}</div>
              </div>
              <div className="p-4 rounded-xl bg-background/50">
                <div className="text-sm text-muted-foreground mb-1">Job Replacement</div>
                <div className="font-display text-3xl font-bold">{calculations.jobReplacementProgress.toFixed(0)}%</div>
              </div>
              <div className="p-4 rounded-xl bg-background/50">
                <div className="text-sm text-muted-foreground mb-1">Runway</div>
                <div className="font-display text-3xl font-bold">{calculations.monthsOfRunway.toFixed(1)} mo</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-copper" />
                Your Numbers
              </CardTitle>
              <CardDescription>Enter your current income and goals</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Current Weekly Business Income ($)</Label>
                <Input
                  type="number"
                  value={inputs.currentWeeklyIncome}
                  onChange={(e) => setInputs(prev => ({ ...prev, currentWeeklyIncome: e.target.value }))}
                  className="mt-1"
                  data-testid="input-current-weekly"
                />
              </div>
              <div>
                <Label>Target Weekly Income ($)</Label>
                <Input
                  type="number"
                  value={inputs.targetWeeklyIncome}
                  onChange={(e) => setInputs(prev => ({ ...prev, targetWeeklyIncome: e.target.value }))}
                  className="mt-1"
                  data-testid="input-target-weekly"
                />
              </div>
              <div>
                <Label>Current Job Monthly Income ($)</Label>
                <Input
                  type="number"
                  value={inputs.currentJobIncome}
                  onChange={(e) => setInputs(prev => ({ ...prev, currentJobIncome: e.target.value }))}
                  className="mt-1"
                  data-testid="input-job-income"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Month 6 Goal ($/week)</Label>
                  <Input
                    type="number"
                    value={inputs.month6Goal}
                    onChange={(e) => setInputs(prev => ({ ...prev, month6Goal: e.target.value }))}
                    className="mt-1"
                    data-testid="input-month6-goal"
                  />
                </div>
                <div>
                  <Label>Month 12 Goal ($/week)</Label>
                  <Input
                    type="number"
                    value={inputs.month12Goal}
                    onChange={(e) => setInputs(prev => ({ ...prev, month12Goal: e.target.value }))}
                    className="mt-1"
                    data-testid="input-month12-goal"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Current Savings ($)</Label>
                  <Input
                    type="number"
                    value={inputs.currentSavings}
                    onChange={(e) => setInputs(prev => ({ ...prev, currentSavings: e.target.value }))}
                    className="mt-1"
                    data-testid="input-savings"
                  />
                </div>
                <div>
                  <Label>Monthly Expenses ($)</Label>
                  <Input
                    type="number"
                    value={inputs.monthlyExpenses}
                    onChange={(e) => setInputs(prev => ({ ...prev, monthlyExpenses: e.target.value }))}
                    className="mt-1"
                    data-testid="input-expenses"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-gold" />
                Milestones
              </CardTitle>
              <CardDescription>Celebrate your progress</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {milestones.map((milestone, index) => (
                <div 
                  key={index}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    milestone.achieved ? 'bg-sage/10 border-sage/30' : 'bg-muted/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {milestone.achieved ? (
                      <CheckCircle2 className="w-5 h-5 text-sage" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />
                    )}
                    <span className={milestone.achieved ? 'font-medium' : 'text-muted-foreground'}>
                      {milestone.label}
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    ${milestone.target.toFixed(0)}/wk
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Calendar className="w-5 h-5 text-copper" />
              Goal Progress
            </CardTitle>
            <CardDescription>Track your journey to each milestone</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">Month 6 Goal</span>
                </div>
                <span className="text-sm text-muted-foreground">${inputs.month6Goal}/week</span>
              </div>
              <div className="relative">
                <Progress value={calculations.month6Progress} className="h-4" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-bold text-white drop-shadow">{calculations.month6Progress.toFixed(0)}%</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {calculations.month6Progress >= 100 
                  ? "Goal achieved! Time to aim higher!" 
                  : `$${(parseFloat(inputs.month6Goal) - calculations.currentWeekly).toFixed(0)} more per week to reach goal`}
              </p>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-gold" />
                  <span className="font-medium">Month 12 Goal</span>
                </div>
                <span className="text-sm text-muted-foreground">${inputs.month12Goal}/week</span>
              </div>
              <div className="relative">
                <Progress value={calculations.month12Progress} className="h-4" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-bold text-white drop-shadow">{calculations.month12Progress.toFixed(0)}%</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {calculations.month12Progress >= 100 
                  ? "Amazing! You've exceeded your year-one vision!" 
                  : `$${(parseFloat(inputs.month12Goal) - calculations.currentWeekly).toFixed(0)} more per week to reach goal`}
              </p>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-sage" />
                  <span className="font-medium">Job Replacement</span>
                </div>
                <span className="text-sm text-muted-foreground">${inputs.currentJobIncome}/mo</span>
              </div>
              <div className="relative">
                <Progress value={calculations.jobReplacementProgress} className="h-4" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-bold text-white drop-shadow">{calculations.jobReplacementProgress.toFixed(0)}%</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {calculations.jobReplacementProgress >= 100 
                  ? "You're making more than your job! Freedom is here!" 
                  : `$${calculations.gapToJob.toFixed(0)} more per month to match your job income`}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className={calculations.canCoverExpenses ? 'border-sage/50' : 'border-amber-500/50'}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg font-bold">
                  {calculations.canCoverExpenses ? "Expenses Covered!" : "Building Toward Coverage"}
                </h3>
                <p className="text-muted-foreground">
                  {calculations.canCoverExpenses 
                    ? `You have $${calculations.excessOrShortfall.toFixed(0)}/mo surplus after expenses`
                    : `$${Math.abs(calculations.excessOrShortfall).toFixed(0)}/mo shortfall to cover expenses`}
                </p>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Monthly Income</div>
                <div className="font-display text-2xl font-bold">${calculations.currentMonthly.toFixed(0)}</div>
                <div className="text-xs text-muted-foreground">vs ${inputs.monthlyExpenses} expenses</div>
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
