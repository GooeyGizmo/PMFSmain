import CustomerLayout from '@/components/customer-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { FileText, Scale } from 'lucide-react';

export default function Terms() {
  return (
    <CustomerLayout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Terms & Conditions</h1>
          <p className="text-muted-foreground mt-1">Prairie Mobile Fuel Services</p>
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <Scale className="w-5 h-5 text-copper" />
                Service Terms
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 text-sm">
              <section className="space-y-2">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <FileText className="w-4 h-4 text-copper" />
                  Billing Authorization
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  By placing an order or maintaining a subscription with Prairie Mobile Fuel Services ("PMFS"), the customer authorizes PMFS to place a temporary payment authorization at the time of booking. Final charges are processed only upon successful delivery completion.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-semibold text-foreground">Cancellations & Modifications</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Modification and cancellation deadlines apply based on subscription tier. Requests made outside permitted timeframes may result in applicable delivery or service fees due to operational commitment.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-semibold text-foreground">Subscription Changes</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Subscription tier changes are pro-rated when made during an active billing cycle. Charges or refunds reflect the price difference for the remaining cycle. The full subscription amount for the selected tier is charged on the next billing date.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-semibold text-foreground">Pricing</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Fuel pricing is determined using daily local pump pricing plus disclosed delivery and service markups. Subscription discounts apply only while active and in good standing. PMFS does not guarantee pricing parity with retail fuel stations.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-semibold text-foreground">Weather & Safety</h3>
                <p className="text-muted-foreground leading-relaxed">
                  PMFS reserves the right to delay or reschedule deliveries due to unsafe road, weather, or operating conditions. No delivery or service fees will be charged until safe delivery is completed.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-semibold text-foreground">Taxes</h3>
                <p className="text-muted-foreground leading-relaxed">
                  GST is calculated, collected, itemized, and remitted in accordance with Canadian federal tax law.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-semibold text-foreground">Disputes & Chargebacks</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Customers agree to contact PMFS directly to resolve billing concerns prior to initiating disputes or chargebacks. PMFS may submit delivery records, authorization logs, GPS data, pricing disclosures, and confirmation evidence through Stripe and Stripe Radar to resolve disputes.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-semibold text-foreground">Safety & Compliance</h3>
                <p className="text-muted-foreground leading-relaxed">
                  PMFS operates under all required licenses and certifications. Safety-related decisions are final and non-negotiable.
                </p>
              </section>

              <section className="space-y-2 pt-4 border-t border-border">
                <h3 className="font-semibold text-foreground">Final Note</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Prairie Mobile Fuel Services is a convenience-based, safety-first mobile fueling service.
                </p>
                <p className="text-muted-foreground leading-relaxed font-medium">
                  By using our service, customers acknowledge and accept the pricing structure, billing flow, and safety-driven operating decisions outlined above.
                </p>
              </section>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </CustomerLayout>
  );
}
