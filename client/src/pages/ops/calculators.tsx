import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Calculator, Construction } from 'lucide-react';

export default function OpsCalculators() {
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
                <Calculator className="w-5 h-5 text-copper" />
                <span className="font-display font-bold text-foreground">Business Calculators</span>
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
          <Card className="border-dashed" data-testid="card-calculators-placeholder">
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-copper/10 flex items-center justify-center mb-4">
                <Construction className="w-8 h-8 text-copper" />
              </div>
              <CardTitle className="font-display text-xl">Calculators Coming Soon</CardTitle>
              <CardDescription>
                Custom business calculators will be added here based on your specifications.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-sm text-muted-foreground">
                Please provide the calculator requirements to proceed.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
}
