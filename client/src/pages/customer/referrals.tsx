import { useState } from 'react';
import { motion } from 'framer-motion';
import CustomerLayout from '@/components/customer-layout';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Gift, Copy, Users, DollarSign, Check, Clock } from 'lucide-react';

interface Referral {
  id: string;
  email: string;
  status: 'pending' | 'signed_up' | 'first_order' | 'rewarded';
  reward: number;
  createdAt: Date;
}

export default function Referrals() {
  const { user } = useAuth();
  const { toast } = useToast();
  const referralCode = `PRAIRIE-${user?.name?.split(' ')[0]?.toUpperCase() || 'USER'}-25`;
  
  const [referrals] = useState<Referral[]>([
    { id: '1', email: 'john.d***@email.com', status: 'rewarded', reward: 25, createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    { id: '2', email: 'sarah.m***@email.com', status: 'first_order', reward: 25, createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    { id: '3', email: 'mike.t***@email.com', status: 'signed_up', reward: 0, createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
  ]);

  const totalEarned = referrals.filter(r => r.status === 'rewarded').reduce((acc, r) => acc + r.reward, 0);
  const pendingRewards = referrals.filter(r => r.status === 'first_order').reduce((acc, r) => acc + r.reward, 0);

  const copyCode = () => {
    navigator.clipboard.writeText(referralCode);
    toast({ title: 'Copied!', description: 'Referral code copied to clipboard.' });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'signed_up': return <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 border-blue-500/20">Signed Up</Badge>;
      case 'first_order': return <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20">First Order</Badge>;
      case 'rewarded': return <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-green-500/20"><Check className="w-3 h-3 mr-1" />Rewarded</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <CustomerLayout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Referrals</h1>
          <p className="text-muted-foreground mt-1">Earn $25 for every friend you refer</p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="border-copper/30 bg-gradient-to-r from-copper/5 to-brass/5">
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <Gift className="w-5 h-5 text-copper" />
                Your Referral Code
              </CardTitle>
              <CardDescription>Share this code with friends and family</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <Input
                  value={referralCode}
                  readOnly
                  className="font-mono text-lg font-bold text-center"
                />
                <Button onClick={copyCode} variant="outline" className="flex-shrink-0">
                  <Copy className="w-4 h-4 mr-2" />
                  Copy
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                When they sign up and complete their first order, you both get <span className="font-semibold text-copper">$25 credit</span>!
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <div className="grid grid-cols-2 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-sage/10 flex items-center justify-center">
                    <DollarSign className="w-6 h-6 text-sage" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Earned</p>
                    <p className="font-display text-2xl font-bold text-foreground">${totalEarned}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-brass/10 flex items-center justify-center">
                    <Users className="w-6 h-6 text-brass" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Referrals</p>
                    <p className="font-display text-2xl font-bold text-foreground">{referrals.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">Your Referrals</CardTitle>
          </CardHeader>
          <CardContent>
            {referrals.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No referrals yet. Share your code to start earning!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {referrals.map((referral, i) => (
                  <motion.div
                    key={referral.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center justify-between p-4 rounded-xl bg-muted/50"
                  >
                    <div>
                      <p className="font-medium text-foreground">{referral.email}</p>
                      <p className="text-sm text-muted-foreground">
                        {referral.createdAt.toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {referral.status === 'rewarded' && (
                        <span className="font-display font-semibold text-sage">+${referral.reward}</span>
                      )}
                      {getStatusBadge(referral.status)}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">How It Works</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { step: 1, title: 'Share Your Code', description: 'Give your unique referral code to friends and family' },
                { step: 2, title: 'They Sign Up', description: 'They create an account using your code' },
                { step: 3, title: 'First Delivery', description: 'They complete their first fuel delivery' },
                { step: 4, title: 'You Both Earn', description: 'You each receive $25 credit to your account' },
              ].map((item, i) => (
                <div key={item.step} className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-copper text-white flex items-center justify-center font-display font-bold text-sm flex-shrink-0">
                    {item.step}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{item.title}</p>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </CustomerLayout>
  );
}
