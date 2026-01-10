import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Fuel, Construction, TrendingDown, AlertTriangle, History } from 'lucide-react';

export default function OpsInventory() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 backdrop-blur-md bg-background/90 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Link href="/ops">
                <Button variant="ghost" size="icon" data-testid="button-back">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <Fuel className="w-5 h-5 text-copper" />
                <span className="font-display font-bold text-foreground">Fuel Inventory</span>
                <Badge variant="outline" className="text-xs border-copper/30 text-copper">Operations</Badge>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="border-dashed" data-testid="card-inventory-placeholder">
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-copper/10 flex items-center justify-center mb-4">
                <Construction className="w-8 h-8 text-copper" />
              </div>
              <CardTitle className="font-display text-xl">Fuel Inventory Coming Soon</CardTitle>
              <CardDescription>
                Track fuel truck levels, manage fill-ups, and receive low inventory alerts.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Fuel className="w-5 h-5 text-sage" />
                  <div>
                    <p className="text-sm font-medium">Tank Levels</p>
                    <p className="text-xs text-muted-foreground">Real-time fuel levels per truck</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  <div>
                    <p className="text-sm font-medium">Low Stock Alerts</p>
                    <p className="text-xs text-muted-foreground">Automatic refill notifications</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <History className="w-5 h-5 text-brass" />
                  <div>
                    <p className="text-sm font-medium">Fill-up History</p>
                    <p className="text-xs text-muted-foreground">Track all inventory changes</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
}
