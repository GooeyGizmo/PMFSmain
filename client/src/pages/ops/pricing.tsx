import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, DollarSign, Fuel, Save, RefreshCw, Calculator
} from 'lucide-react';

interface FuelPricingData {
  fuelType: string;
  baseCost: string;
  markupPercent: string;
  markupFlat: string;
  customerPrice: string;
}

const fuelTypeConfig = {
  regular: { label: 'Regular 87 Gas', color: 'text-red-500', bgColor: 'bg-red-500/10' },
  premium: { label: 'Premium', color: 'text-amber-500', bgColor: 'bg-amber-500/10' },
  diesel: { label: 'Diesel', color: 'text-green-500', bgColor: 'bg-green-500/10' },
};

export default function OpsPricing() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pricing, setPricing] = useState<Record<string, FuelPricingData>>({
    regular: { fuelType: 'regular', baseCost: '1.200', markupPercent: '10', markupFlat: '0.10', customerPrice: '1.429' },
    premium: { fuelType: 'premium', baseCost: '1.400', markupPercent: '10', markupFlat: '0.10', customerPrice: '1.629' },
    diesel: { fuelType: 'diesel', baseCost: '1.350', markupPercent: '10', markupFlat: '0.10', customerPrice: '1.549' },
  });

  useEffect(() => {
    fetchPricing();
  }, []);

  const fetchPricing = async () => {
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
  };

  const updatePricing = (fuelType: string, field: keyof FuelPricingData, value: string) => {
    setPricing(prev => {
      const updated = { ...prev[fuelType], [field]: value };
      
      // Auto-calculate customer price when base cost, markup percent, or markup flat changes
      if (field === 'baseCost' || field === 'markupPercent' || field === 'markupFlat') {
        const baseCost = parseFloat(field === 'baseCost' ? value : updated.baseCost) || 0;
        const markupPercent = parseFloat(field === 'markupPercent' ? value : updated.markupPercent) || 0;
        const markupFlat = parseFloat(field === 'markupFlat' ? value : updated.markupFlat) || 0;
        
        const percentMarkup = baseCost * (markupPercent / 100);
        const customerPrice = baseCost + percentMarkup + markupFlat;
        updated.customerPrice = customerPrice.toFixed(3);
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
        toast({ title: 'Pricing Updated', description: 'Fuel prices have been updated app-wide.' });
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

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 backdrop-blur-md bg-background/90 border-b border-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Link href="/ops">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div>
                <span className="font-display font-bold text-foreground">Pricing & Rates</span>
                <Badge variant="outline" className="ml-2 text-xs border-copper/30 text-copper">Admin</Badge>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <motion.h1 
            className="font-display text-2xl font-bold text-foreground"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Fuel Pricing Management
          </motion.h1>
          <p className="text-muted-foreground mt-1">
            Set base costs, markups, and customer prices for each fuel type
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Calculator className="w-5 h-5 text-copper" />
              Pricing Formula
            </CardTitle>
            <CardDescription>
              Customer Price = Base Cost + (Base Cost × Markup %) + Flat Markup
            </CardDescription>
          </CardHeader>
        </Card>

        <div className="space-y-4">
          {(['regular', 'premium', 'diesel'] as const).map((fuelType, i) => {
            const config = fuelTypeConfig[fuelType];
            const p = pricing[fuelType];
            
            return (
              <motion.div
                key={fuelType}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="font-display flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg ${config.bgColor} flex items-center justify-center`}>
                        <Fuel className={`w-4 h-4 ${config.color}`} />
                      </div>
                      {config.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor={`${fuelType}-baseCost`}>Base Cost ($/L)</Label>
                        <Input
                          id={`${fuelType}-baseCost`}
                          type="number"
                          step="0.001"
                          value={p.baseCost}
                          onChange={(e) => updatePricing(fuelType, 'baseCost', e.target.value)}
                          data-testid={`input-${fuelType}-baseCost`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`${fuelType}-markupPercent`}>Markup %</Label>
                        <Input
                          id={`${fuelType}-markupPercent`}
                          type="number"
                          step="0.1"
                          value={p.markupPercent}
                          onChange={(e) => updatePricing(fuelType, 'markupPercent', e.target.value)}
                          data-testid={`input-${fuelType}-markupPercent`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`${fuelType}-markupFlat`}>Flat Markup ($/L)</Label>
                        <Input
                          id={`${fuelType}-markupFlat`}
                          type="number"
                          step="0.001"
                          value={p.markupFlat}
                          onChange={(e) => updatePricing(fuelType, 'markupFlat', e.target.value)}
                          data-testid={`input-${fuelType}-markupFlat`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`${fuelType}-customerPrice`}>Customer Price ($/L)</Label>
                        <Input
                          id={`${fuelType}-customerPrice`}
                          type="number"
                          step="0.001"
                          value={p.customerPrice}
                          onChange={(e) => updatePricing(fuelType, 'customerPrice', e.target.value)}
                          className="font-semibold"
                          data-testid={`input-${fuelType}-customerPrice`}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>

        <div className="flex justify-end pt-4">
          <Button
            className="bg-copper hover:bg-copper/90"
            onClick={handleSave}
            disabled={isSaving}
            data-testid="button-save-pricing"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save All Pricing
              </>
            )}
          </Button>
        </div>

        <Card className="bg-muted/30">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <DollarSign className="w-5 h-5 text-muted-foreground mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">How pricing works</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><strong>Base Cost:</strong> Your wholesale cost per litre</li>
                  <li><strong>Markup %:</strong> Percentage added to base cost</li>
                  <li><strong>Flat Markup:</strong> Fixed amount added per litre</li>
                  <li><strong>Customer Price:</strong> What customers see before tier discounts</li>
                </ul>
                <p className="mt-2">Tier discounts (Access: 3¢, Household: 5¢, Rural: 7¢) are applied at checkout.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
