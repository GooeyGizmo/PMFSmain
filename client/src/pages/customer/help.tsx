import { useState } from 'react';
import { motion } from 'framer-motion';
import CustomerLayout from '@/components/customer-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useToast } from '@/hooks/use-toast';
import { faqs } from '@/lib/mockData';
import { HelpCircle, MessageSquare, Phone, Mail, Send, FileText } from 'lucide-react';

export default function Help() {
  const { toast } = useToast();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast({
      title: 'Message sent!',
      description: 'Our support team will get back to you within 24 hours.',
    });
    setSubject('');
    setMessage('');
  };

  return (
    <CustomerLayout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Help & Support</h1>
          <p className="text-muted-foreground mt-1">Find answers or contact our team</p>
        </div>

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
                <FileText className="w-5 h-5 text-copper" />
                Cancellation, Modification, Pricing & Billing Policy
              </CardTitle>
              <CardDescription>Prairie Mobile Fuel Services</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground leading-relaxed">
                At Prairie Mobile Fuel Services ("PMFS"), our mission is to eliminate wasted time, stress, and uncertainty around fueling. This policy explains how orders, subscriptions, pricing, billing, and safety decisions work—clearly, fairly, and transparently.
              </p>
              
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="cancellation">
                  <AccordionTrigger className="text-left font-medium">Order Cancellation</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground space-y-2">
                    <p>Orders may be cancelled without charge up to 2 hours before your scheduled delivery window. Cancellations made within 2 hours of your delivery window may be subject to a cancellation fee to cover operational costs.</p>
                    <p>To cancel an order, use the Orders page in your account or contact our support team.</p>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="modification">
                  <AccordionTrigger className="text-left font-medium">Order Modification</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground space-y-2">
                    <p>You may modify your order details (fuel amount, delivery address, or time window) up to 2 hours before your scheduled delivery. Modifications are subject to availability.</p>
                    <p>For fill-to-full orders, the final charge is based on the actual litres delivered, which may differ from the estimated amount.</p>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="pricing">
                  <AccordionTrigger className="text-left font-medium">Pricing</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground space-y-2">
                    <p>Fuel prices are set by PMFS and may change daily based on market conditions. The price displayed at the time of booking is the price you pay per litre.</p>
                    <p>Subscription members receive per-litre discounts as outlined in their tier benefits. Delivery fees vary by subscription tier, with some tiers including free delivery.</p>
                    <p>All prices are subject to 5% GST.</p>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="billing">
                  <AccordionTrigger className="text-left font-medium">Billing & Payment</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground space-y-2">
                    <p>When you place an order, we pre-authorize your payment method for the estimated total. The final charge is captured after delivery based on the actual litres delivered.</p>
                    <p>Subscription fees are billed monthly on your subscription start date. You may cancel your subscription at any time; cancellation takes effect at the end of your current billing period.</p>
                  </AccordionContent>
                </AccordionItem>
                
                <AccordionItem value="safety">
                  <AccordionTrigger className="text-left font-medium">Safety & Delivery Decisions</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground space-y-2">
                    <p>PMFS reserves the right to decline or postpone deliveries due to unsafe conditions, including but not limited to: extreme weather, blocked access, or safety hazards at the delivery location.</p>
                    <p>Our drivers are trained in Transportation of Dangerous Goods (TDG) compliance and follow all applicable safety regulations.</p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
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
                <Button type="submit" className="w-full bg-copper hover:bg-copper/90">
                  <Send className="w-4 h-4 mr-2" />
                  Send Message
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </CustomerLayout>
  );
}
