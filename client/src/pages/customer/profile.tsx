import { useState } from 'react';
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
import { User, Mail, Phone, MapPin, Calendar, Save } from 'lucide-react';
import { format } from 'date-fns';

export default function Profile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const currentTier = subscriptionTiers.find(t => t.slug === user?.subscriptionTier);

  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    address: user?.address || '',
    city: user?.city || '',
    state: user?.state || '',
    zip: user?.zip || '',
  });

  const [isEditing, setIsEditing] = useState(false);

  const handleSave = () => {
    toast({ title: 'Profile updated', description: 'Your profile information has been saved.' });
    setIsEditing(false);
  };

  return (
    <CustomerLayout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
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
                    <Label htmlFor="address">Street Address</Label>
                    {isEditing ? (
                      <Input
                        id="address"
                        placeholder="123 Main Street"
                        value={form.address}
                        onChange={(e) => setForm(prev => ({ ...prev, address: e.target.value }))}
                      />
                    ) : (
                      <div className="p-3 rounded-lg bg-muted/50">
                        {form.address || 'Not provided'}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="city">City</Label>
                      {isEditing ? (
                        <Input
                          id="city"
                          placeholder="Regina"
                          value={form.city}
                          onChange={(e) => setForm(prev => ({ ...prev, city: e.target.value }))}
                        />
                      ) : (
                        <div className="p-3 rounded-lg bg-muted/50">
                          {form.city || '-'}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="state">Province</Label>
                      {isEditing ? (
                        <Input
                          id="state"
                          placeholder="SK"
                          value={form.state}
                          onChange={(e) => setForm(prev => ({ ...prev, state: e.target.value }))}
                        />
                      ) : (
                        <div className="p-3 rounded-lg bg-muted/50">
                          {form.state || '-'}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="zip">Postal Code</Label>
                      {isEditing ? (
                        <Input
                          id="zip"
                          placeholder="S4P 1A1"
                          value={form.zip}
                          onChange={(e) => setForm(prev => ({ ...prev, zip: e.target.value }))}
                        />
                      ) : (
                        <div className="p-3 rounded-lg bg-muted/50">
                          {form.zip || '-'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {isEditing && (
                <div className="flex items-center gap-3 pt-4">
                  <Button variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
                  <Button className="bg-copper hover:bg-copper/90" onClick={handleSave} data-testid="button-save-profile">
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
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
    </CustomerLayout>
  );
}
