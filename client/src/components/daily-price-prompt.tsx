import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Fuel, Save, RefreshCw, X, Clock } from 'lucide-react';

interface FuelPricingData {
  fuelType: string;
  baseCost: string;
  markupPercent: string;
  markupFlat: string;
  customerPrice: string;
}

const fuelTypeConfig = {
  regular: { label: 'Regular 87', color: 'text-red-500', bgColor: 'bg-red-500/10' },
  premium: { label: 'Premium', color: 'text-amber-500', bgColor: 'bg-amber-500/10' },
  diesel: { label: 'Diesel', color: 'text-green-500', bgColor: 'bg-green-500/10' },
};

const STORAGE_KEY = 'pmfs_daily_price_prompt_last_shown';
const RESET_HOUR = 4;

function getCalgaryTimeParts(): { year: number; month: number; day: number; hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Edmonton',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  
  const parts = formatter.formatToParts(new Date());
  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0', 10);
  
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

function getCalgaryDateString(): string {
  const { year, month, day } = getCalgaryTimeParts();
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getCalgaryHour(): number {
  return getCalgaryTimeParts().hour;
}

function getMillisUntil4amCalgary(): number {
  const { hour, minute } = getCalgaryTimeParts();
  
  if (hour >= RESET_HOUR) {
    const hoursUntilMidnight = 24 - hour;
    const hoursUntil4am = hoursUntilMidnight + RESET_HOUR;
    return (hoursUntil4am * 60 - minute) * 60 * 1000;
  } else {
    const hoursUntil4am = RESET_HOUR - hour;
    return (hoursUntil4am * 60 - minute) * 60 * 1000;
  }
}

function shouldShowPrompt(): boolean {
  const calgaryHour = getCalgaryHour();
  
  if (calgaryHour < RESET_HOUR) {
    return false;
  }
  
  const lastShown = localStorage.getItem(STORAGE_KEY);
  const today = getCalgaryDateString();
  
  if (!lastShown) {
    return true;
  }
  
  if (lastShown === today) {
    return false;
  }
  
  if (lastShown < today) {
    return true;
  }
  
  return false;
}

function markPromptShown(): void {
  localStorage.setItem(STORAGE_KEY, getCalgaryDateString());
}

export default function DailyPricePrompt() {
  const { user, isOwner } = useAuth();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pricing, setPricing] = useState<Record<string, FuelPricingData>>({
    regular: { fuelType: 'regular', baseCost: '1.2000', markupPercent: '10', markupFlat: '0.10', customerPrice: '1.4200' },
    premium: { fuelType: 'premium', baseCost: '1.4000', markupPercent: '10', markupFlat: '0.10', customerPrice: '1.6400' },
    diesel: { fuelType: 'diesel', baseCost: '1.3500', markupPercent: '10', markupFlat: '0.10', customerPrice: '1.5850' },
  });

  const fetchPricing = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/fuel-pricing', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.pricing && data.pricing.length > 0) {
          const pricingMap: Record<string, FuelPricingData> = {};
          data.pricing.forEach((p: any) => {
            pricingMap[p.fuelType] = {
              fuelType: p.fuelType,
              baseCost: p.baseCost,
              markupPercent: p.markupPercent,
              markupFlat: p.markupFlat,
              customerPrice: p.customerPrice,
            };
          });
          setPricing(prev => ({ ...prev, ...pricingMap }));
        }
      }
    } catch (error) {
      console.error('Failed to fetch pricing:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const checkAndShowPrompt = useCallback(() => {
    if (isOwner && shouldShowPrompt()) {
      fetchPricing();
      setIsOpen(true);
    }
  }, [isOwner, fetchPricing]);

  useEffect(() => {
    if (!isOwner) return;
    
    const timeoutId = setTimeout(() => {
      checkAndShowPrompt();
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [isOwner, checkAndShowPrompt]);

  useEffect(() => {
    if (!isOwner) return;

    const msUntil4am = getMillisUntil4amCalgary();
    
    const timerId = setTimeout(() => {
      localStorage.removeItem(STORAGE_KEY);
      fetchPricing();
      setIsOpen(true);
    }, msUntil4am);
    
    return () => clearTimeout(timerId);
  }, [isOwner, fetchPricing]);

  const updatePricing = (fuelType: string, field: keyof FuelPricingData, value: string) => {
    setPricing(prev => {
      const updated = { ...prev[fuelType], [field]: value };
      
      if (field === 'baseCost' || field === 'markupPercent' || field === 'markupFlat') {
        const baseCost = parseFloat(field === 'baseCost' ? value : updated.baseCost) || 0;
        const markupPercent = parseFloat(field === 'markupPercent' ? value : updated.markupPercent) || 0;
        const markupFlat = parseFloat(field === 'markupFlat' ? value : updated.markupFlat) || 0;
        
        const percentMarkup = baseCost * (markupPercent / 100);
        const customerPrice = baseCost + percentMarkup + markupFlat;
        updated.customerPrice = customerPrice.toFixed(4);
      }
      
      return { ...prev, [fuelType]: updated };
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const pricingArray = Object.values(pricing);
      const res = await fetch('/api/ops/fuel-pricing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pricing: pricingArray }),
      });

      if (res.ok) {
        toast({ title: 'Pricing Updated', description: 'Daily fuel prices have been saved.' });
        markPromptShown();
        setIsOpen(false);
      } else {
        const data = await res.json();
        toast({ title: 'Error', description: data.message || 'Failed to update pricing', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update pricing', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = () => {
    markPromptShown();
    setIsOpen(false);
    toast({ 
      title: 'Skipped for today', 
      description: 'You can update prices anytime from Pricing in the menu.' 
    });
  };

  if (!isOwner) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="daily-price-prompt-dialog">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Clock className="w-5 h-5 text-copper" />
            Daily Fuel Price Update
          </DialogTitle>
          <DialogDescription>
            Good morning! Please review and update today's fuel prices.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {(['regular', 'premium', 'diesel'] as const).map((fuelType) => {
              const config = fuelTypeConfig[fuelType];
              const p = pricing[fuelType];
              
              return (
                <div key={fuelType} className="rounded-lg border border-border p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-6 h-6 rounded ${config.bgColor} flex items-center justify-center`}>
                      <Fuel className={`w-3 h-3 ${config.color}`} />
                    </div>
                    <span className="font-medium">{config.label}</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Base Cost ($/L)</Label>
                      <Input
                        type="number"
                        step="0.001"
                        value={p.baseCost}
                        onChange={(e) => updatePricing(fuelType, 'baseCost', e.target.value)}
                        className="h-9"
                        data-testid={`daily-input-${fuelType}-baseCost`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Markup %</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={p.markupPercent}
                        onChange={(e) => updatePricing(fuelType, 'markupPercent', e.target.value)}
                        className="h-9"
                        data-testid={`daily-input-${fuelType}-markupPercent`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Flat ($/L)</Label>
                      <Input
                        type="number"
                        step="0.001"
                        value={p.markupFlat}
                        onChange={(e) => updatePricing(fuelType, 'markupFlat', e.target.value)}
                        className="h-9"
                        data-testid={`daily-input-${fuelType}-markupFlat`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Customer Price ($/L)</Label>
                      <Input
                        type="number"
                        step="0.001"
                        value={p.customerPrice}
                        onChange={(e) => updatePricing(fuelType, 'customerPrice', e.target.value)}
                        className="h-9 font-semibold"
                        data-testid={`daily-input-${fuelType}-customerPrice`}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            
            <p className="text-xs text-muted-foreground mt-4">
              Formula: Customer Price = Base Cost + (Base Cost × Markup %) + Flat Markup
            </p>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleSkip}
            disabled={isSaving}
            data-testid="daily-price-skip-button"
          >
            <X className="w-4 h-4 mr-2" />
            Skip Today
          </Button>
          <Button
            className="bg-copper hover:bg-copper/90"
            onClick={handleSave}
            disabled={isSaving || isLoading}
            data-testid="daily-price-save-button"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Prices
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
