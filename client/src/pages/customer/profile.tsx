import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import CustomerLayout from '@/components/customer-layout';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { subscriptionTiers } from '@/lib/mockData';
import { User, Mail, Phone, MapPin, Save, Loader2, CreditCard, ChevronRight, Fuel } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'wouter';

interface ProfileProps {
  embedded?: boolean;
}

export default function Profile({ embedded = false }: ProfileProps) {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const currentTier = subscriptionTiers.find(t => t.slug === user?.subscriptionTier);

  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    defaultAddress: user?.defaultAddress || '',
    defaultCity: user?.defaultCity || '',
  });

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        defaultAddress: user.defaultAddress || '',
        defaultCity: user.defaultCity || '',
      });
    }
  }, [user]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          defaultAddress: form.defaultAddress,
          defaultCity: form.defaultCity,
        }),
      });

      if (res.ok) {
        await refreshUser();
        toast({ title: 'Profile updated', description: 'Your profile information has been saved.' });
        setIsEditing(false);
      } else {
        toast({ title: 'Error', description: 'Failed to save profile. Please try again.', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save profile. Please try again.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const content = (
    <div className={embedded ? "space-y-6" : "max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6"}>
      {!embedded && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Profile</h1>
            <p className="text-muted-foreground mt-1">Manage your account information</p>
          </div>
          {!isEditing && (
            <Button variant="outline" onClick={() => setIsEditing(true)} data-testid="button-edit-profile">
              Edit Profile
            </Button>
          )}
        </div>
      )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card>
            <CardHeader>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-copper/10 flex items-center justify-center">
                  <User className="w-8 h-8 text-copper" />
                </div>
                <div>
                  <CardTitle className="font-display text-xl">{user?.name}</CardTitle>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="capitalize">{currentTier?.name}</Badge>
                    <span className="text-sm text-muted-foreground">
                      Member since {user?.createdAt ? format(user.createdAt, 'MMMM yyyy') : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </CardHeader>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg">Personal Information</CardTitle>
              <CardDescription>Your contact details and address</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  {isEditing ? (
                    <Input
                      id="name"
                      value={form.name}
                      onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                    />
                  ) : (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span>{form.name}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <span>{form.email}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                {isEditing ? (
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="(306) 555-0100"
                    value={form.phone}
                    onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))}
                  />
                ) : (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <span>{form.phone || 'Not provided'}</span>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-border">
                <h4 className="font-medium text-foreground mb-4 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-copper" />
                  Default Delivery Address
                </h4>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="defaultAddress">Street Address</Label>
                    {isEditing ? (
                      <Input
                        id="defaultAddress"
                        placeholder="123 Main Street"
                        value={form.defaultAddress}
                        onChange={(e) => setForm(prev => ({ ...prev, defaultAddress: e.target.value }))}
                      />
                    ) : (
                      <div className="p-3 rounded-lg bg-muted/50">
                        {form.defaultAddress || 'Not provided'}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="defaultCity">City, Province</Label>
                    {isEditing ? (
                      <Input
                        id="defaultCity"
                        placeholder="Calgary, AB"
                        value={form.defaultCity}
                        onChange={(e) => setForm(prev => ({ ...prev, defaultCity: e.target.value }))}
                      />
                    ) : (
                      <div className="p-3 rounded-lg bg-muted/50">
                        {form.defaultCity || 'Not provided'}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {isEditing && (
                <div className="flex items-center gap-3 pt-4">
                  <Button variant="outline" onClick={() => setIsEditing(false)} disabled={isSaving}>Cancel</Button>
                  <Button className="bg-copper hover:bg-copper/90" onClick={handleSave} disabled={isSaving} data-testid="button-save-profile">
                    {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-lg">Your Subscription</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-copper/10 flex items-center justify-center">
                    <Fuel className="w-6 h-6 text-copper" />
                  </div>
                  <div>
                    <p className="font-display font-semibold text-foreground">{currentTier?.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {currentTier?.monthlyPrice === 0 ? 'No monthly fee' : `$${currentTier?.monthlyPrice}/month`}
                    </p>
                  </div>
                </div>
                <Link href="/customer/subscription">
                  <Button variant="outline" size="sm" data-testid="button-manage-subscription">
                    {currentTier?.slug === 'payg' ? 'Upgrade' : 'Manage'}
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Link href="/app/account?tab=payment">
            <Card className="cursor-pointer hover:bg-muted/30 transition-colors" data-testid="link-payment-methods">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-copper/10 flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-copper" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Payment Methods</p>
                    <p className="text-sm text-muted-foreground">Manage your saved cards</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg">Account Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Total Orders', value: '12' },
                  { label: 'Litres Delivered', value: '847L' },
                  { label: 'Total Spent', value: '$1,245' },
                  { label: 'Savings', value: '$48.20' },
                ].map((stat) => (
                  <div key={stat.label} className="text-center p-4 rounded-xl bg-muted/50">
                    <p className="font-display text-2xl font-bold text-foreground">{stat.value}</p>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
  );

  if (embedded) return content;
  return <CustomerLayout>{content}</CustomerLayout>;
}
