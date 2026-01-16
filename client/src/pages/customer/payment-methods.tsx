import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import CustomerLayout from '@/components/customer-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { CreditCard, Plus, Trash2, Star, Loader2 } from 'lucide-react';

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

function AddCardForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsLoading(true);
    try {
      const setupIntentRes = await fetch('/api/setup-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!setupIntentRes.ok) {
        throw new Error('Failed to create setup intent');
      }

      const { clientSecret } = await setupIntentRes.json();

      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        throw new Error('Card element not found');
      }

      const { setupIntent, error } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: {
          card: cardElement,
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (setupIntent?.payment_method) {
        const attachRes = await fetch('/api/payment-methods', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentMethodId: setupIntent.payment_method }),
        });

        if (!attachRes.ok) {
          throw new Error('Failed to attach payment method');
        }

        toast({ title: 'Card added', description: 'Your new card has been saved successfully.' });
        onSuccess();
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to add card', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-4 border rounded-lg bg-muted/30">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#424770',
                '::placeholder': { color: '#aab7c4' },
              },
              invalid: { color: '#9e2146' },
            },
          }}
        />
      </div>
      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button type="submit" className="bg-copper hover:bg-copper/90" disabled={!stripe || isLoading}>
          {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {isLoading ? 'Adding...' : 'Add Card'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function PaymentMethodsContent() {
  const { toast } = useToast();
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [defaultPaymentMethodId, setDefaultPaymentMethodId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const keyRes = await fetch('/api/stripe/publishable-key');
        if (keyRes.ok) {
          const { publishableKey } = await keyRes.json();
          setStripePromise(loadStripe(publishableKey));
        }
      } catch (error) {
        console.error('Failed to load Stripe key:', error);
      }
    }
    init();
  }, []);

  const fetchPaymentMethods = async () => {
    try {
      const res = await fetch('/api/payment-methods');
      if (res.ok) {
        const data = await res.json();
        setPaymentMethods(data.paymentMethods || []);
        setDefaultPaymentMethodId(data.defaultPaymentMethodId || null);
      }
    } catch (error) {
      console.error('Failed to fetch payment methods:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPaymentMethods();
  }, []);

  const handleRemove = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/payment-methods/${id}`, { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        setPaymentMethods(data.paymentMethods || []);
        setDefaultPaymentMethodId(data.defaultPaymentMethodId || null);
        toast({ title: 'Card removed', description: 'The card has been removed from your account.' });
      } else {
        throw new Error('Failed to remove card');
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to remove card', variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSetDefault = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/payment-methods/${id}/default`, { method: 'PUT' });
      if (res.ok) {
        const data = await res.json();
        setPaymentMethods(data.paymentMethods || []);
        setDefaultPaymentMethodId(data.defaultPaymentMethodId || null);
        toast({ title: 'Default updated', description: 'Your default payment method has been updated.' });
      } else {
        throw new Error('Failed to set default');
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to set default payment method', variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddSuccess = () => {
    setIsAddDialogOpen(false);
    fetchPaymentMethods();
  };

  const getBrandIcon = (brand: string) => {
    return <CreditCard className="w-8 h-8 text-copper" />;
  };

  const formatBrand = (brand: string) => {
    const brands: Record<string, string> = {
      visa: 'Visa',
      mastercard: 'Mastercard',
      amex: 'American Express',
      discover: 'Discover',
      jcb: 'JCB',
      diners: 'Diners Club',
      unionpay: 'UnionPay',
    };
    return brands[brand?.toLowerCase()] || brand || 'Card';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-copper" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Payment Methods</h1>
          <p className="text-muted-foreground mt-1">Manage your saved cards</p>
        </div>
        {stripePromise && (
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-copper hover:bg-copper/90" data-testid="button-add-card">
                <Plus className="w-4 h-4 mr-2" />
                Add Card
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display">Add New Card</DialogTitle>
                <DialogDescription>
                  Enter your card details to save a new payment method.
                </DialogDescription>
              </DialogHeader>
              <Elements stripe={stripePromise} options={{ locale: 'en-CA' }}>
                <AddCardForm
                  onSuccess={handleAddSuccess}
                  onCancel={() => setIsAddDialogOpen(false)}
                />
              </Elements>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {paymentMethods.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <CreditCard className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="font-display text-lg font-semibold text-foreground mb-2">No payment methods saved</h3>
              <p className="text-muted-foreground mb-6 max-w-sm">
                Add a card to make checkout faster and easier for future orders.
              </p>
              {stripePromise && (
                <Button className="bg-copper hover:bg-copper/90" onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-first-card">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Card
                </Button>
              )}
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {paymentMethods.map((pm, index) => {
            const isDefault = pm.id === defaultPaymentMethodId;
            const isActioning = actionLoading === pm.id;

            return (
              <motion.div
                key={pm.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className={isDefault ? 'border-copper/50 bg-copper/5' : ''} data-testid={`card-payment-method-${pm.id}`}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-4">
                      {getBrandIcon(pm.brand)}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{formatBrand(pm.brand)}</span>
                          <span className="text-muted-foreground">•••• {pm.last4}</span>
                          {isDefault && (
                            <Badge variant="secondary" className="bg-copper/10 text-copper border-copper/20">
                              <Star className="w-3 h-3 mr-1 fill-current" />
                              Default
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Expires {pm.expMonth.toString().padStart(2, '0')}/{pm.expYear.toString().slice(-2)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isDefault && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSetDefault(pm.id)}
                          disabled={isActioning}
                          data-testid={`button-set-default-${pm.id}`}
                        >
                          {isActioning ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <Star className="w-4 h-4 mr-1" />
                              Set Default
                            </>
                          )}
                        </Button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            disabled={isActioning}
                            data-testid={`button-remove-${pm.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove Card</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to remove this {formatBrand(pm.brand)} card ending in {pm.last4}? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleRemove(pm.id)}
                              className="bg-destructive hover:bg-destructive/90"
                            >
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function PaymentMethods() {
  return (
    <CustomerLayout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <PaymentMethodsContent />
      </div>
    </CustomerLayout>
  );
}
