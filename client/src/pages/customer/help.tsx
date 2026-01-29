import { useState } from 'react';
import { motion } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import CustomerLayout from '@/components/customer-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useToast } from '@/hooks/use-toast';
import { faqs } from '@/lib/mockData';
import { HelpCircle, MessageSquare, Phone, Mail, Send, FileText, Scale, Shield, Database, CreditCard, Loader2 } from 'lucide-react';

interface HelpProps {
  embedded?: boolean;
}

export default function Help({ embedded = false }: HelpProps) {
  const { toast } = useToast();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const contactMutation = useMutation({
    mutationFn: async (data: { subject: string; message: string }) => {
      const res = await fetch('/api/support/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to send message');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Message sent!',
        description: 'Our support team will get back to you within 24 hours.',
      });
      setSubject('');
      setMessage('');
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to send',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    contactMutation.mutate({ subject, message });
  };

  const content = (
    <div className={embedded ? "space-y-6" : "max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6"}>
      {!embedded && (
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Help & Support</h1>
          <p className="text-muted-foreground mt-1">Find answers or contact our team</p>
        </div>
      )}

        <div className="grid md:grid-cols-2 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="h-full">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-copper/10 flex items-center justify-center">
                    <Phone className="w-5 h-5 text-copper" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Call Us</p>
                    <p className="text-sm text-muted-foreground">(403) 430-0390</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">Sun-Tues: 8AM - 5PM MST/MDT</p>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <Card className="h-full">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-brass/10 flex items-center justify-center">
                    <Mail className="w-5 h-5 text-brass" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Email Us</p>
                    <p className="text-sm text-muted-foreground">info@prairiemobilefuel.ca</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">Response within 24 hours</p>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-copper" />
                Frequently Asked Questions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {faqs.map((faq, i) => (
                  <AccordionItem key={i} value={`item-${i}`}>
                    <AccordionTrigger className="text-left font-medium">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <Card>
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <Shield className="w-5 h-5 text-copper" />
                Privacy Policy
              </CardTitle>
              <CardDescription>Prairie Mobile Fuel Services</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-muted-foreground leading-relaxed">
                Prairie Mobile Fuel Services ("PMFS," "we," "us," or "our") is committed to protecting the privacy, confidentiality, and security of our customers' personal information. This Privacy Policy explains how we collect, use, store, protect, and delete personal information in the course of providing mobile fuel delivery and subscription services.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                This Policy applies to all users of our website, mobile applications, services, subscriptions, and related platforms.
              </p>
              
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="info-collect">
                  <AccordionTrigger className="text-left font-medium">1. Information We Collect</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground space-y-3">
                    <p>We collect only the information necessary to operate our services safely, legally, and effectively.</p>
                    <div>
                      <p className="font-medium text-foreground mb-1">Information You Provide Directly</p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li>Full name, email address, phone number</li>
                        <li>Billing and delivery address(es)</li>
                        <li>Vehicle or equipment information (fuel type, capacity, notes)</li>
                        <li>Subscription selections</li>
                        <li>Payment method details (processed securely via Stripe; PMFS does not store full card numbers)</li>
                        <li>Communications with PMFS (support inquiries, service notes)</li>
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium text-foreground mb-1">Information Collected Automatically</p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li>Order history and delivery records</li>
                        <li>Delivery window selections</li>
                        <li>Location data related to delivery completion (GPS confirmation)</li>
                        <li>Device, browser, and session data for security and fraud prevention</li>
                        <li>Account activity logs</li>
                      </ul>
                    </div>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="info-use">
                  <AccordionTrigger className="text-left font-medium">2. How We Use Your Information</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground space-y-2">
                    <p>We use customer information strictly for legitimate business purposes, including:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>Providing and completing fuel deliveries</li>
                      <li>Managing subscriptions and billing</li>
                      <li>Communicating order updates and service notifications</li>
                      <li>Ensuring safety, compliance, and accurate delivery</li>
                      <li>Fraud prevention and dispute resolution</li>
                      <li>Legal, regulatory, and tax compliance</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="data-access">
                  <AccordionTrigger className="text-left font-medium">3. Data Access & Internal Use</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground space-y-2">
                    <p>Customer data access is strictly limited:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>Company operators only receive the minimum information required to safely and accurately complete deliveries (e.g., delivery address, fuel type, access notes)</li>
                      <li>Administrative and owner accounts may access broader customer information for billing, compliance, and customer support</li>
                      <li>No employee, contractor, or operator may access customer data for personal use or non-operational purposes</li>
                    </ul>
                    <p className="font-medium">Unauthorized access, use, or disclosure is strictly prohibited.</p>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="data-sharing">
                  <AccordionTrigger className="text-left font-medium">4. Data Sharing & Disclosure</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground space-y-2">
                    <p className="font-medium">PMFS does not sell, rent, lease, trade, or otherwise share customer data with any third party — ever.</p>
                    <p>Limited disclosure may occur only in the following circumstances:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>Payment processing via Stripe (PCI-compliant)</li>
                      <li>Legal obligations (court orders, lawful requests)</li>
                      <li>Protection of PMFS's legal rights, safety, or property</li>
                      <li>Fraud prevention and dispute resolution with payment processors</li>
                    </ul>
                    <p className="font-medium">No marketing lists. No advertisers. No data brokers.</p>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="data-security">
                  <AccordionTrigger className="text-left font-medium">5. Data Storage & Security</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground space-y-2">
                    <p>We implement administrative, technical, and organizational safeguards designed to protect customer data, including:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>Encrypted connections</li>
                      <li>Secure authentication and access controls</li>
                      <li>Limited-role permissions</li>
                      <li>Monitoring and logging of access activity</li>
                    </ul>
                    <p>While no system is 100% secure, PMFS takes reasonable and industry-standard measures to protect personal information.</p>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="data-retention">
                  <AccordionTrigger className="text-left font-medium">6. Data Retention</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground space-y-2">
                    <p>We retain personal data only as long as necessary to:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>Fulfill services</li>
                      <li>Comply with legal and tax obligations</li>
                      <li>Resolve disputes</li>
                      <li>Enforce agreements</li>
                    </ul>
                    <p>Retention periods may vary based on regulatory requirements.</p>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="data-deletion">
                  <AccordionTrigger className="text-left font-medium">7. Data Deletion & Customer Rights</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground space-y-2">
                    <p>Customers may request deletion of their personal data at any time, provided that:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>All outstanding balances are paid in full</li>
                      <li>Subscriptions are canceled and paid up to date</li>
                      <li>No unresolved disputes, chargebacks, or legal holds exist</li>
                    </ul>
                    <p>Deletion requests may be submitted through the app or by contacting PMFS support.</p>
                    <p>Certain records (e.g., invoices, tax records) may be retained where legally required.</p>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="policy-updates">
                  <AccordionTrigger className="text-left font-medium">8. Policy Updates</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    <p>We may update this Privacy Policy periodically. Continued use of our services constitutes acceptance of the updated policy.</p>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="contact">
                  <AccordionTrigger className="text-left font-medium">9. Contact</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    <p>For privacy-related inquiries or requests: info@prairiemobilefuel.ca</p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card>
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <Scale className="w-5 h-5 text-copper" />
                Terms of Service
              </CardTitle>
              <CardDescription>Prairie Mobile Fuel Services</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-muted-foreground leading-relaxed">
                These Terms of Service ("Terms") govern your use of Prairie Mobile Fuel Services ("PMFS"). By accessing or using our services, you agree to be bound by these Terms.
              </p>
              
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="services">
                  <AccordionTrigger className="text-left font-medium">1. Services Provided</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    <p>PMFS provides mobile fuel delivery services and subscription-based access to those services. All services are subject to availability, safety conditions, and regulatory compliance.</p>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="eligibility">
                  <AccordionTrigger className="text-left font-medium">2. Eligibility</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    <p>You must be legally capable of entering binding agreements and comply with all applicable laws to use PMFS services.</p>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="billing">
                  <AccordionTrigger className="text-left font-medium">3. Orders, Billing & Payment</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground space-y-2">
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>Payments are processed via Stripe</li>
                      <li>A temporary authorization may be placed at booking</li>
                      <li>Final charges occur only after successful delivery</li>
                      <li>Customers are responsible for ensuring valid payment methods</li>
                    </ul>
                    <p>Failure to pay may result in service suspension or account termination.</p>
                    <p className="mt-2">Fuel pricing is determined using daily local supplier ("Rack") pricing plus a convenience premium for mobile delivery. Subscription benefits (such as reduced or free delivery) apply only while your subscription is active and in good standing. PMFS does not guarantee pricing parity with retail fuel stations. Fuel pricing does not include subscription price. Fuel is priced on a $/L basis. All prices are subject to 5% GST, calculated and remitted in accordance with Canadian federal tax law.</p>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="cancellations">
                  <AccordionTrigger className="text-left font-medium">4. Cancellations & Modifications</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground space-y-2">
                    <p>Orders may be cancelled or modified up to 2 hours before your scheduled delivery window. Changes made within 2 hours may be subject to fees to cover operational costs.</p>
                    <p>For fill-to-full orders, the final charge is based on the actual litres delivered, which may differ from the estimated amount.</p>
                    <p>To cancel or modify an order, use the Orders page in your account or contact our support team.</p>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="safety">
                  <AccordionTrigger className="text-left font-medium">5. Safety & Service Refusal</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground space-y-2">
                    <p>PMFS reserves the right to:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>Delay, refuse, or cancel service due to unsafe conditions (extreme weather, blocked access, safety hazards)</li>
                      <li>Suspend service where compliance or safety cannot be assured</li>
                    </ul>
                    <p className="font-medium">Safety decisions are final and non-negotiable.</p>
                    <p>Our drivers are trained in Transportation of Dangerous Goods (TDG) compliance and follow all applicable safety regulations. PMFS operates under all required licenses and certifications. No fees will be charged until safe delivery is completed.</p>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="responsibilities">
                  <AccordionTrigger className="text-left font-medium">6. Customer Responsibilities</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground space-y-2">
                    <p>Customers must:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>Provide accurate delivery information</li>
                      <li>Ensure safe and legal access to fuel tanks</li>
                      <li>Comply with all applicable regulations</li>
                    </ul>
                    <p>PMFS is not liable for delays or failures caused by inaccurate information or unsafe conditions.</p>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="liability">
                  <AccordionTrigger className="text-left font-medium">7. Limitation of Liability</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    <p>To the maximum extent permitted by law, PMFS shall not be liable for indirect, incidental, consequential, or special damages arising from use of our services.</p>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="disputes">
                  <AccordionTrigger className="text-left font-medium">8. Disputes & Chargebacks</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    <p>Customers agree to contact PMFS before initiating disputes or chargebacks. PMFS may submit delivery records, authorization logs, GPS data, pricing disclosures, and confirmation evidence through Stripe and Stripe Radar to resolve disputes.</p>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="governing-law">
                  <AccordionTrigger className="text-left font-medium">9. Governing Law</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    <p>These Terms are governed by the laws of the Province of Alberta and applicable federal laws of Canada.</p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
              
              <div className="pt-4 border-t border-border">
                <p className="text-muted-foreground leading-relaxed">
                  Prairie Mobile Fuel Services is a convenience-based, safety-first mobile fueling service. By using our service, customers acknowledge and accept the pricing structure, billing flow, and safety-driven operating decisions outlined above.
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
          <Card>
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <Database className="w-5 h-5 text-copper" />
                Data Policy
              </CardTitle>
              <CardDescription>Prairie Mobile Fuel Services</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-muted-foreground leading-relaxed">
                This Data Policy supplements our Privacy Policy and explains how data is handled operationally.
              </p>
              
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="ownership">
                  <AccordionTrigger className="text-left font-medium">1. Data Ownership</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    <p>Customers retain ownership of their personal data. PMFS is the data custodian.</p>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="minimization">
                  <AccordionTrigger className="text-left font-medium">2. Data Minimization</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground space-y-2">
                    <p>We collect only the data necessary to:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>Deliver fuel</li>
                      <li>Manage subscriptions</li>
                      <li>Ensure safety and compliance</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="controls">
                  <AccordionTrigger className="text-left font-medium">3. Internal Controls</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>Role-based access</li>
                      <li>Operator-limited data exposure</li>
                      <li>Audit logging</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="deletion">
                  <AccordionTrigger className="text-left font-medium">4. Data Deletion</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    <p>Deletion is permanent and irreversible once completed, subject to legal retention requirements.</p>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="monetization">
                  <AccordionTrigger className="text-left font-medium">5. No Data Monetization</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    <p>PMFS does not monetize, sell, or exploit customer data.</p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.21 }}>
          <Card>
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-copper" />
                Subscription Policy
              </CardTitle>
              <CardDescription>Prairie Mobile Fuel Services</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="structure">
                  <AccordionTrigger className="text-left font-medium">1. Subscription Structure</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground space-y-2">
                    <p>Subscriptions provide:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>Priority access and scheduling</li>
                      <li>Reduced or free delivery fees</li>
                      <li>Multiple vehicle support (higher tiers)</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="billing">
                  <AccordionTrigger className="text-left font-medium">2. Billing</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>Subscriptions are billed monthly</li>
                      <li>Charges recur automatically</li>
                      <li>GST is applied where required</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="changes">
                  <AccordionTrigger className="text-left font-medium">3. Changes & Cancellations</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>Tier changes are pro-rated mid-cycle</li>
                      <li>Cancellations take effect at end of billing cycle</li>
                      <li>No refunds for partially used periods unless required by law</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="suspension">
                  <AccordionTrigger className="text-left font-medium">4. Suspension & Termination</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground space-y-2">
                    <p>PMFS may suspend or terminate subscriptions for:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>Non-payment</li>
                      <li>Abuse of service</li>
                      <li>Safety violations</li>
                      <li>Fraud or misuse</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="transfer">
                  <AccordionTrigger className="text-left font-medium">5. Non-Transferability</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    <p>Subscriptions are non-transferable and intended for the account holder only.</p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}>
          <Card>
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-copper" />
                Send Us a Message
              </CardTitle>
              <CardDescription>Have a question or concern? We're here to help.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject</Label>
                  <Input
                    id="subject"
                    placeholder="What can we help you with?"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="message">Message</Label>
                  <Textarea
                    id="message"
                    placeholder="Tell us more..."
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full bg-copper hover:bg-copper/90"
                  disabled={contactMutation.isPending}
                  data-testid="button-send-message"
                >
                  {contactMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  {contactMutation.isPending ? 'Sending...' : 'Send Message'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
  );

  if (embedded) return content;
  return <CustomerLayout>{content}</CustomerLayout>;
}
