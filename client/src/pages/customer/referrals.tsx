import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Star, Gift, TrendingUp, Clock, Loader2, Package, ShoppingBag } from 'lucide-react';
import { format } from 'date-fns';

function RewardsContent() {
  const { data: balanceData, isLoading: balanceLoading } = useQuery<{ balance: any }>({
    queryKey: ['/api/rewards/balance'],
  });

  const { data: transactionsData, isLoading: transactionsLoading } = useQuery<{ transactions: any[] }>({
    queryKey: ['/api/rewards/transactions'],
  });

  const balance = balanceData?.balance;
  const transactions = transactionsData?.transactions || [];
  const isLoading = balanceLoading || transactionsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-copper" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="border-copper/30 bg-gradient-to-r from-copper/5 to-brass/5 overflow-hidden">
          <CardContent className="pt-6 pb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-copper to-brass flex items-center justify-center shadow-lg">
                  <Star className="w-8 h-8 text-white" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Available Points</p>
                  <p className="font-display text-4xl font-bold text-foreground">
                    {(balance?.availablePoints || 0).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Lifetime Earned</p>
                <p className="font-display text-xl font-semibold text-copper">
                  {(balance?.lifetimePoints || 0).toLocaleString()} pts
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-sage/10 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-sage" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Earn Rate</p>
                  <p className="font-display text-xl font-bold text-foreground">1 pt/$1</p>
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
                  <Package className="w-6 h-6 text-brass" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Transactions</p>
                  <p className="font-display text-xl font-bold text-foreground">{transactions.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-copper" />
            Merchandise Store
          </CardTitle>
          <CardDescription>Coming soon! Redeem your points for exclusive PMFS gear</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {[
              { name: 'PMFS Cap', points: 500, status: 'coming_soon' },
              { name: 'PMFS T-Shirt', points: 1000, status: 'coming_soon' },
              { name: 'PMFS Hoodie', points: 2500, status: 'coming_soon' },
              { name: 'PMFS Jacket', points: 5000, status: 'coming_soon' },
            ].map((item, i) => (
              <motion.div
                key={item.name}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.1 }}
                className="relative p-4 rounded-xl border border-border bg-muted/30"
              >
                <div className="aspect-square bg-muted rounded-lg mb-3 flex items-center justify-center">
                  <Gift className="w-8 h-8 text-muted-foreground opacity-50" />
                </div>
                <p className="font-medium text-foreground text-sm">{item.name}</p>
                <p className="text-xs text-copper font-semibold">{item.points.toLocaleString()} pts</p>
                <Badge variant="secondary" className="absolute top-2 right-2 text-[10px]">
                  Coming Soon
                </Badge>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">Points History</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Star className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No points earned yet</p>
              <p className="text-sm">Complete your first order to start earning!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {transactions.map((tx: any, i: number) => (
                <motion.div
                  key={tx.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center justify-between p-4 rounded-xl bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      tx.type === 'earned' ? 'bg-sage/10' : 
                      tx.type === 'redeemed' ? 'bg-copper/10' : 'bg-muted'
                    }`}>
                      {tx.type === 'earned' ? (
                        <TrendingUp className="w-5 h-5 text-sage" />
                      ) : tx.type === 'redeemed' ? (
                        <Gift className="w-5 h-5 text-copper" />
                      ) : (
                        <Clock className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-foreground text-sm">{tx.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(tx.createdAt), 'MMM d, yyyy')}
                        {tx.orderTotal && ` · $${parseFloat(tx.orderTotal).toFixed(2)} order`}
                      </p>
                    </div>
                  </div>
                  <span className={`font-display font-bold ${
                    tx.type === 'earned' ? 'text-sage' : 
                    tx.type === 'redeemed' ? 'text-copper' : 'text-muted-foreground'
                  }`}>
                    {tx.type === 'earned' ? '+' : '-'}{Math.abs(tx.points)} pts
                  </span>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">How Points Work</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { step: 1, title: 'Order Fuel', description: 'Place and complete fuel delivery orders' },
              { step: 2, title: 'Earn Points', description: 'Get 1 point for every $1 spent (after delivery)' },
              { step: 3, title: 'Redeem Rewards', description: 'Exchange points for exclusive PMFS merchandise' },
            ].map((item) => (
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
  );
}

export default function Rewards() {
  return <RewardsContent />;
}
