import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Truck, Construction, MapPin, Clock, Users } from 'lucide-react';

export default function OpsDispatch() {
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
                <Truck className="w-5 h-5 text-copper" />
                <span className="font-display font-bold text-foreground">Driver Dispatch</span>
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
          <Card className="border-dashed" data-testid="card-dispatch-placeholder">
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-copper/10 flex items-center justify-center mb-4">
                <Construction className="w-8 h-8 text-copper" />
              </div>
              <CardTitle className="font-display text-xl">Driver Dispatch Coming Soon</CardTitle>
              <CardDescription>
                Assign drivers to routes, track deliveries in real-time, and optimize scheduling.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Users className="w-5 h-5 text-sage" />
                  <div>
                    <p className="text-sm font-medium">Driver Assignment</p>
                    <p className="text-xs text-muted-foreground">Assign orders to available drivers</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <MapPin className="w-5 h-5 text-copper" />
                  <div>
                    <p className="text-sm font-medium">Route Optimization</p>
                    <p className="text-xs text-muted-foreground">Smart routing for efficiency</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Clock className="w-5 h-5 text-brass" />
                  <div>
                    <p className="text-sm font-medium">Live Tracking</p>
                    <p className="text-xs text-muted-foreground">Real-time delivery status</p>
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
