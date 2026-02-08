import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { ObjectUploader } from '@/components/ObjectUploader';
import { format } from 'date-fns';
import {
  FileText, Receipt, Fuel, Calculator, Building2, Settings, Loader2,
  Plus, Eye, XCircle, CalendarIcon, Upload, ChevronDown, ChevronRight,
  DollarSign, TrendingUp, Droplets, AlertTriangle, Truck, Package
} from 'lucide-react';

const formatCurrency = (amount: number) => `$${Number(amount).toFixed(2)}`;

const T2125_CATEGORIES = [
  { value: 'advertising', label: 'Advertising' },
  { value: 'delivery_freight', label: 'Delivery, Freight' },
  { value: 'fuel_oil', label: 'Fuel Costs (except motor vehicles)' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'interest_bank', label: 'Interest & Bank Charges' },
  { value: 'maintenance_repairs', label: 'Maintenance & Repairs' },
  { value: 'management_admin', label: 'Management & Admin Fees' },
  { value: 'meals_entertainment', label: 'Meals & Entertainment' },
  { value: 'motor_vehicle', label: 'Motor Vehicle Expenses' },
  { value: 'office_supplies', label: 'Office Supplies' },
  { value: 'legal_accounting', label: 'Legal, Accounting & Professional Fees' },
  { value: 'rent', label: 'Rent' },
  { value: 'salaries_wages', label: 'Salaries, Wages & Benefits' },
  { value: 'travel', label: 'Travel' },
  { value: 'telephone_utilities', label: 'Telephone & Utilities' },
  { value: 'business_tax', label: 'Business Taxes, Licences & Memberships' },
  { value: 'other', label: 'Other Expenses' },
];

const T2125_LINE_MAP: Record<string, { line: string; name: string; deductibleRate?: number }> = {
  advertising: { line: '8521', name: 'Advertising' },
  delivery_freight: { line: '8523', name: 'Delivery, freight, and express' },
  fuel_oil: { line: '8524', name: 'Fuel costs (except for motor vehicles)' },
  insurance: { line: '8690', name: 'Insurance' },
  interest_bank: { line: '8710', name: 'Interest and bank charges' },
  maintenance_repairs: { line: '8811', name: 'Maintenance and repairs' },
  management_admin: { line: '8871', name: 'Management and administration fees' },
  meals_entertainment: { line: '8523', name: 'Meals and entertainment', deductibleRate: 0.5 },
  motor_vehicle: { line: '9281', name: 'Motor vehicle expenses' },
  office_supplies: { line: '8810', name: 'Office expenses' },
  legal_accounting: { line: '8862', name: 'Professional fees' },
  rent: { line: '8910', name: 'Rent' },
  salaries_wages: { line: '9060', name: 'Salaries, wages, and benefits' },
  travel: { line: '9200', name: 'Travel' },
  telephone_utilities: { line: '9220', name: 'Telephone and utilities' },
  business_tax: { line: '8760', name: 'Business taxes, fees, licences, and memberships' },
  other: { line: '9270', name: 'Other expenses' },
};

const INVOICE_STATUS_COLORS: Record<string, string> = {
  issued: 'bg-blue-500/10 text-blue-700 border-blue-500/30',
  paid: 'bg-green-500/10 text-green-700 border-green-500/30',
  void: 'bg-red-500/10 text-red-700 border-red-500/30',
  draft: 'bg-gray-500/10 text-gray-700 border-gray-500/30',
};

function categoryLabel(cat: string) {
  return T2125_CATEGORIES.find(c => c.value === cat)?.label || cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// ─── Invoices Tab ────────────────────────────────────────────────────────────

function InvoicesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState<any>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateOrderId, setGenerateOrderId] = useState('');

  const { data: invoices, isLoading } = useQuery<any[]>({
    queryKey: ['/api/cra/invoices'],
  });

  const voidMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      await apiRequest('POST', `/api/cra/invoices/${invoiceId}/void`);
    },
    onSuccess: () => {
      toast({ title: 'Invoice Voided', description: 'Invoice has been voided successfully.' });
      queryClient.invalidateQueries({ queryKey: ['/api/cra/invoices'] });
      setVoidDialogOpen(false);
      setVoidTarget(null);
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await apiRequest('POST', '/api/cra/invoices/generate', { orderId });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Invoice Generated', description: 'Invoice created successfully.' });
      queryClient.invalidateQueries({ queryKey: ['/api/cra/invoices'] });
      setGenerateOpen(false);
      setGenerateOrderId('');
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  if (isLoading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Invoices</h3>
        <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-generate-invoice"><Plus className="w-4 h-4 mr-1" />Generate Invoice</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate Invoice from Order</DialogTitle>
              <DialogDescription>Enter the order ID to generate a CRA-compliant invoice.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Order ID</Label>
                <Input value={generateOrderId} onChange={e => setGenerateOrderId(e.target.value)} placeholder="Enter order ID" data-testid="input-order-id" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setGenerateOpen(false)} data-testid="button-cancel-generate">Cancel</Button>
              <Button onClick={() => generateMutation.mutate(generateOrderId)} disabled={!generateOrderId || generateMutation.isPending} data-testid="button-confirm-generate">
                {generateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}Generate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
              <TableHead className="text-right">GST</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(!invoices || invoices.length === 0) ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No invoices found</TableCell></TableRow>
            ) : invoices.map((inv: any) => (
              <TableRow key={inv.id} className="cursor-pointer" onClick={() => { setSelectedInvoice(inv); setSheetOpen(true); }} data-testid={`row-invoice-${inv.id}`}>
                <TableCell className="font-mono text-sm">{inv.invoiceNumber}</TableCell>
                <TableCell>{inv.invoiceDate ? format(new Date(inv.invoiceDate), 'MMM d, yyyy') : '—'}</TableCell>
                <TableCell>{inv.customerName || '—'}</TableCell>
                <TableCell className="text-right">{formatCurrency(inv.subtotal || 0)}</TableCell>
                <TableCell className="text-right">{formatCurrency(inv.gstAmount || 0)}</TableCell>
                <TableCell className="text-right font-medium">{formatCurrency(inv.total || 0)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={INVOICE_STATUS_COLORS[inv.status] || ''} data-testid={`badge-status-${inv.id}`}>{inv.status}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setSelectedInvoice(inv); setSheetOpen(true); }} data-testid={`button-view-invoice-${inv.id}`}>
                      <Eye className="w-4 h-4" />
                    </Button>
                    {inv.status !== 'void' && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => { setVoidTarget(inv); setVoidDialogOpen(true); }} data-testid={`button-void-invoice-${inv.id}`}>
                        <XCircle className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Invoice {selectedInvoice?.invoiceNumber}</SheetTitle>
          </SheetHeader>
          {selectedInvoice && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Date:</span> {selectedInvoice.invoiceDate ? format(new Date(selectedInvoice.invoiceDate), 'MMM d, yyyy') : '—'}</div>
                <div><span className="text-muted-foreground">Status:</span> <Badge variant="outline" className={INVOICE_STATUS_COLORS[selectedInvoice.status] || ''}>{selectedInvoice.status}</Badge></div>
                <div><span className="text-muted-foreground">Customer:</span> {selectedInvoice.customerName || '—'}</div>
                <div><span className="text-muted-foreground">GST #:</span> {selectedInvoice.businessGstNumber || '—'}</div>
              </div>
              <Separator />
              <div>
                <h4 className="text-sm font-semibold mb-2">Business Info</h4>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>{selectedInvoice.businessName}</p>
                  <p>{selectedInvoice.businessAddress}</p>
                  <p>{selectedInvoice.businessPhone}</p>
                </div>
              </div>
              <Separator />
              <div>
                <h4 className="text-sm font-semibold mb-2">Line Items</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(selectedInvoice.lineItems || []).map((item: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell>{item.description}</TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.unitPrice || 0)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.amount || 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Separator />
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(selectedInvoice.subtotal || 0)}</span></div>
                <div className="flex justify-between"><span>GST (5%)</span><span>{formatCurrency(selectedInvoice.gstAmount || 0)}</span></div>
                <div className="flex justify-between font-bold text-base"><span>Total</span><span>{formatCurrency(selectedInvoice.total || 0)}</span></div>
              </div>
              {selectedInvoice.notes && (
                <>
                  <Separator />
                  <div><h4 className="text-sm font-semibold mb-1">Notes</h4><p className="text-sm text-muted-foreground">{selectedInvoice.notes}</p></div>
                </>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void Invoice</DialogTitle>
            <DialogDescription>Are you sure you want to void invoice {voidTarget?.invoiceNumber}? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidDialogOpen(false)} data-testid="button-cancel-void">Cancel</Button>
            <Button variant="destructive" onClick={() => voidTarget && voidMutation.mutate(voidTarget.id)} disabled={voidMutation.isPending} data-testid="button-confirm-void">
              {voidMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}Void Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Expenses Tab ────────────────────────────────────────────────────────────

function ExpensesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [taxYear, setTaxYear] = useState(String(currentYear));
  const [addOpen, setAddOpen] = useState(false);
  const [expDate, setExpDate] = useState<Date | undefined>(new Date());
  const [calOpen, setCalOpen] = useState(false);

  const [form, setForm] = useState({
    category: '', description: '', vendor: '', vendorGstNumber: '', referenceNumber: '',
    amount: '', gstPaid: '', receiptUrl: '',
  });

  const { data: expenses, isLoading } = useQuery<any[]>({
    queryKey: ['/api/cra/expenses', { taxYear, category: categoryFilter !== 'all' ? categoryFilter : undefined }],
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', '/api/cra/expenses', {
        ...form,
        amount: parseFloat(form.amount),
        gstPaid: parseFloat(form.gstPaid || '0'),
        expenseDate: expDate ? format(expDate, 'yyyy-MM-dd') : undefined,
      });
    },
    onSuccess: () => {
      toast({ title: 'Expense Added' });
      queryClient.invalidateQueries({ queryKey: ['/api/cra/expenses'] });
      setAddOpen(false);
      setForm({ category: '', description: '', vendor: '', vendorGstNumber: '', referenceNumber: '', amount: '', gstPaid: '', receiptUrl: '' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  if (isLoading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-semibold">Expenses</h3>
        <div className="flex items-center gap-2">
          <Select value={taxYear} onValueChange={setTaxYear}>
            <SelectTrigger className="w-[100px]" data-testid="select-tax-year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[currentYear, currentYear - 1, currentYear - 2].map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]" data-testid="select-category-filter">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {T2125_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-add-expense"><Plus className="w-4 h-4 mr-1" />Add Expense</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Expense</DialogTitle>
                <DialogDescription>Record a new business expense for CRA tracking.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                    <SelectTrigger data-testid="select-expense-category"><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {T2125_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Description</Label>
                  <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Expense description" data-testid="input-expense-description" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Vendor</Label>
                    <Input value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} placeholder="Vendor name" data-testid="input-expense-vendor" />
                  </div>
                  <div>
                    <Label>Vendor GST #</Label>
                    <Input value={form.vendorGstNumber} onChange={e => setForm(f => ({ ...f, vendorGstNumber: e.target.value }))} placeholder="GST number" data-testid="input-vendor-gst" />
                  </div>
                </div>
                <div>
                  <Label>Reference #</Label>
                  <Input value={form.referenceNumber} onChange={e => setForm(f => ({ ...f, referenceNumber: e.target.value }))} placeholder="Receipt/reference #" data-testid="input-reference-number" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Amount ($)</Label>
                    <Input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" data-testid="input-expense-amount" />
                  </div>
                  <div>
                    <Label>GST Paid ($)</Label>
                    <Input type="number" step="0.01" value={form.gstPaid} onChange={e => setForm(f => ({ ...f, gstPaid: e.target.value }))} placeholder="0.00" data-testid="input-expense-gst" />
                  </div>
                </div>
                <div>
                  <Label>Expense Date</Label>
                  <Popover open={calOpen} onOpenChange={setCalOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal" data-testid="button-expense-date">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {expDate ? format(expDate, 'MMM d, yyyy') : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={expDate} onSelect={d => { setExpDate(d); setCalOpen(false); }} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label>Receipt</Label>
                  <ObjectUploader
                    maxNumberOfFiles={1}
                    maxFileSize={10485760}
                    onGetUploadParameters={async (file) => {
                      const res = await fetch('/api/object-storage/presigned-url', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ fileName: file.name, fileType: file.type, directory: '.private/receipts' }),
                      });
                      const data = await res.json();
                      return { method: 'PUT' as const, url: data.url, headers: data.headers };
                    }}
                    onComplete={(result) => {
                      const uploaded = result.successful?.[0];
                      if (uploaded) {
                        setForm(f => ({ ...f, receiptUrl: uploaded.uploadURL || '' }));
                        toast({ title: 'Receipt Uploaded' });
                      }
                    }}
                  >
                    <Upload className="w-4 h-4 mr-1" />Upload Receipt
                  </ObjectUploader>
                  {form.receiptUrl && <p className="text-xs text-green-600 mt-1">Receipt attached</p>}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddOpen(false)} data-testid="button-cancel-expense">Cancel</Button>
                <Button onClick={() => addMutation.mutate()} disabled={!form.category || !form.amount || addMutation.isPending} data-testid="button-save-expense">
                  {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">GST (ITC)</TableHead>
              <TableHead className="text-right">Net</TableHead>
              <TableHead>ITC Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(!expenses || expenses.length === 0) ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No expenses found</TableCell></TableRow>
            ) : expenses.map((exp: any) => (
              <TableRow key={exp.id} data-testid={`row-expense-${exp.id}`}>
                <TableCell>{exp.expenseDate ? format(new Date(exp.expenseDate), 'MMM d, yyyy') : '—'}</TableCell>
                <TableCell>{categoryLabel(exp.category)}</TableCell>
                <TableCell>{exp.vendor || '—'}</TableCell>
                <TableCell className="text-right">{formatCurrency(exp.amount || 0)}</TableCell>
                <TableCell className="text-right">{formatCurrency(exp.gstPaid || 0)}</TableCell>
                <TableCell className="text-right">{formatCurrency((exp.amount || 0) - (exp.gstPaid || 0))}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={exp.itcClaimed ? 'bg-green-500/10 text-green-700' : 'bg-gray-500/10 text-gray-600'}>
                    {exp.itcClaimed ? 'Claimed' : 'Unclaimed'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Fuel Ledger Tab ─────────────────────────────────────────────────────────

function FuelLedgerTab() {
  const { data: lifecycle, isLoading: lifecycleLoading } = useQuery<any>({
    queryKey: ['/api/cra/fuel/lifecycle'],
  });

  const { data: regularCost } = useQuery<any>({
    queryKey: ['/api/cra/fuel/weighted-cost', { fuelType: 'regular' }],
  });
  const { data: premiumCost } = useQuery<any>({
    queryKey: ['/api/cra/fuel/weighted-cost', { fuelType: 'premium' }],
  });
  const { data: dieselCost } = useQuery<any>({
    queryKey: ['/api/cra/fuel/weighted-cost', { fuelType: 'diesel' }],
  });

  const { data: suppliers } = useQuery<any[]>({
    queryKey: ['/api/cra/fuel/suppliers'],
  });

  const { data: marginReport } = useQuery<any>({
    queryKey: ['/api/cra/fuel/margin-report'],
  });

  if (lifecycleLoading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  const kpis = [
    { label: 'Purchased', value: lifecycle?.purchased || 0, icon: Package, color: 'text-blue-500' },
    { label: 'Delivered', value: lifecycle?.delivered || 0, icon: Truck, color: 'text-green-500' },
    { label: 'Road Fuel', value: lifecycle?.roadFuel || 0, icon: Fuel, color: 'text-amber-500' },
    { label: 'Spillage', value: lifecycle?.spillage || 0, icon: Droplets, color: 'text-red-500' },
    { label: 'Transfers', value: lifecycle?.transfers || 0, icon: TrendingUp, color: 'text-purple-500' },
    { label: 'Net Change', value: lifecycle?.netChange || 0, icon: DollarSign, color: 'text-teal-500' },
  ];

  const fuelCosts = [
    { type: 'Regular', data: regularCost },
    { type: 'Premium', data: premiumCost },
    { type: 'Diesel', data: dieselCost },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Fuel Ledger</h3>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map(kpi => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label}>
              <CardContent className="p-3 text-center">
                <Icon className={`w-5 h-5 mx-auto mb-1 ${kpi.color}`} />
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className="text-lg font-bold" data-testid={`text-fuel-${kpi.label.toLowerCase().replace(/\s/g, '-')}`}>{Number(kpi.value).toFixed(1)}L</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {fuelCosts.map(fc => (
          <Card key={fc.type}>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{fc.type} Weighted Avg Cost</p>
              <p className="text-xl font-bold" data-testid={`text-weighted-cost-${fc.type.toLowerCase()}`}>
                {fc.data?.weightedCostPerLitre ? `$${Number(fc.data.weightedCostPerLitre).toFixed(4)}/L` : '—'}
              </p>
              {fc.data?.totalLitres && <p className="text-xs text-muted-foreground">{Number(fc.data.totalLitres).toFixed(0)}L total</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {marginReport && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Margin Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><span className="text-muted-foreground">Revenue:</span> <span className="font-medium" data-testid="text-margin-revenue">{formatCurrency(marginReport.totalRevenue || 0)}</span></div>
              <div><span className="text-muted-foreground">COGS:</span> <span className="font-medium" data-testid="text-margin-cogs">{formatCurrency(marginReport.totalCogs || 0)}</span></div>
              <div><span className="text-muted-foreground">Gross Margin:</span> <span className="font-medium" data-testid="text-margin-gross">{formatCurrency(marginReport.grossMargin || 0)}</span></div>
              <div><span className="text-muted-foreground">Margin %:</span> <span className="font-medium" data-testid="text-margin-percent">{Number(marginReport.marginPercent || 0).toFixed(1)}%</span></div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Recent Supplier Purchases</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Fuel Type</TableHead>
                  <TableHead className="text-right">Litres</TableHead>
                  <TableHead className="text-right">Cost/L</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!suppliers || suppliers.length === 0) ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-4">No supplier records</TableCell></TableRow>
                ) : suppliers.slice(0, 10).map((s: any, i: number) => (
                  <TableRow key={i} data-testid={`row-supplier-${i}`}>
                    <TableCell>{s.date ? format(new Date(s.date), 'MMM d, yyyy') : '—'}</TableCell>
                    <TableCell>{s.supplier || '—'}</TableCell>
                    <TableCell>{s.fuelType || '—'}</TableCell>
                    <TableCell className="text-right">{Number(s.litres || 0).toFixed(1)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(s.costPerLitre || 0)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(s.totalCost || 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── GST Filing Tab ──────────────────────────────────────────────────────────

function GstFilingTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  const [taxYear, setTaxYear] = useState(String(currentYear));

  const { data: settings } = useQuery<any>({
    queryKey: ['/api/cra/settings'],
  });

  const { data: itcSummary } = useQuery<any>({
    queryKey: ['/api/cra/expenses/summary/itc', { taxYear }],
  });

  const { data: invoiceSummary } = useQuery<any>({
    queryKey: ['/api/cra/invoices/summary'],
  });

  const { data: periods, isLoading: periodsLoading } = useQuery<any[]>({
    queryKey: ['/api/cra/gst/periods'],
  });

  const createPeriodMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', '/api/cra/gst/periods');
    },
    onSuccess: () => {
      toast({ title: 'Filing Period Created' });
      queryClient.invalidateQueries({ queryKey: ['/api/cra/gst/periods'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const totalRevenue = invoiceSummary?.totalRevenue || 0;
  const gstCollected = invoiceSummary?.totalGst || 0;
  const itcTotal = itcSummary?.totalItc || 0;
  const netTax = gstCollected - itcTotal;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold">GST34 Filing Workspace</h3>
          {settings?.gstRegistrationNumber && (
            <p className="text-sm text-muted-foreground">GST Registration: {settings.gstRegistrationNumber}</p>
          )}
        </div>
        <Select value={taxYear} onValueChange={setTaxYear}>
          <SelectTrigger className="w-[100px]" data-testid="select-gst-tax-year"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[currentYear, currentYear - 1, currentYear - 2].map(y => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">GST34 Calculation</CardTitle>
          <CardDescription>Ready-to-file GST amounts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b">
              <div><span className="font-mono text-xs text-muted-foreground mr-2">Line 101</span>Total revenue (taxable supplies)</div>
              <span className="font-bold" data-testid="text-gst-line-101">{formatCurrency(totalRevenue)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <div><span className="font-mono text-xs text-muted-foreground mr-2">Line 105</span>GST Collected</div>
              <span className="font-bold" data-testid="text-gst-line-105">{formatCurrency(gstCollected)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <div><span className="font-mono text-xs text-muted-foreground mr-2">Line 106</span>Input Tax Credits (ITCs)</div>
              <span className="font-bold text-green-600" data-testid="text-gst-line-106">{formatCurrency(itcTotal)}</span>
            </div>
            <div className="flex justify-between items-center py-2 bg-muted/50 rounded px-2">
              <div><span className="font-mono text-xs text-muted-foreground mr-2">Line 109</span>Net Tax (GST collected − ITCs)</div>
              <span className={`font-bold text-lg ${netTax >= 0 ? 'text-red-600' : 'text-green-600'}`} data-testid="text-gst-line-109">
                {formatCurrency(netTax)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Filing Periods</CardTitle>
            <Button size="sm" onClick={() => createPeriodMutation.mutate()} disabled={createPeriodMutation.isPending} data-testid="button-create-period">
              {createPeriodMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
              New Period
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {periodsLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Net Tax</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(!periods || periods.length === 0) ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">No filing periods</TableCell></TableRow>
                  ) : periods.map((p: any) => (
                    <TableRow key={p.id} data-testid={`row-period-${p.id}`}>
                      <TableCell className="font-medium">{p.name || p.period || '—'}</TableCell>
                      <TableCell>{p.startDate ? format(new Date(p.startDate), 'MMM d, yyyy') : '—'}</TableCell>
                      <TableCell>{p.endDate ? format(new Date(p.endDate), 'MMM d, yyyy') : '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={p.status === 'filed' ? 'bg-green-500/10 text-green-700' : 'bg-amber-500/10 text-amber-700'}>
                          {p.status || 'draft'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{p.netTax != null ? formatCurrency(p.netTax) : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── T2125 Tab ───────────────────────────────────────────────────────────────

function T2125Tab() {
  const currentYear = new Date().getFullYear();
  const [taxYear, setTaxYear] = useState(String(currentYear));

  const { data: categorySummary, isLoading } = useQuery<any>({
    queryKey: ['/api/cra/expenses/summary/category', { taxYear }],
  });

  if (isLoading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  const categories = categorySummary?.categories || [];
  let totalExpenses = 0;
  const rows = categories.map((cat: any) => {
    const mapping = T2125_LINE_MAP[cat.category] || T2125_LINE_MAP.other;
    const amount = Number(cat.total || 0);
    const deductible = mapping.deductibleRate ? amount * mapping.deductibleRate : amount;
    totalExpenses += deductible;
    return { ...cat, mapping, amount, deductible, hasPartial: !!mapping.deductibleRate };
  });

  const grossIncome = categorySummary?.grossIncome || 0;
  const netIncome = grossIncome - totalExpenses;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-semibold">T2125 Statement of Business Activities</h3>
        <Select value={taxYear} onValueChange={setTaxYear}>
          <SelectTrigger className="w-[100px]" data-testid="select-t2125-tax-year"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[currentYear, currentYear - 1, currentYear - 2].map(y => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>CRA Line</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Full Amount</TableHead>
                  <TableHead className="text-right">Deductible</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No expenses for this tax year</TableCell></TableRow>
                ) : rows.map((row: any) => (
                  <TableRow key={row.category} data-testid={`row-t2125-${row.category}`}>
                    <TableCell className="font-mono text-sm text-muted-foreground">Line {row.mapping.line}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{row.mapping.name}</p>
                        {row.hasPartial && <p className="text-xs text-muted-foreground">50% deductible</p>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(row.amount)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(row.deductible)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell></TableCell>
                  <TableCell>Total Business Expenses</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right" data-testid="text-t2125-total-expenses">{formatCurrency(totalExpenses)}</TableCell>
                </TableRow>
                {grossIncome > 0 && (
                  <TableRow className="bg-muted/30 font-bold">
                    <TableCell></TableCell>
                    <TableCell>Net Business Income (Loss)</TableCell>
                    <TableCell></TableCell>
                    <TableCell className={`text-right ${netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`} data-testid="text-t2125-net-income">
                      {formatCurrency(netIncome)}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── CCA Tab ─────────────────────────────────────────────────────────────────

function CcaTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [expandedAsset, setExpandedAsset] = useState<string | null>(null);
  const [form, setForm] = useState({
    assetName: '', ccaClass: '', ccaRate: '', originalCost: '', acquisitionDate: '', description: '',
  });

  const { data: assets, isLoading } = useQuery<any[]>({
    queryKey: ['/api/cra/cca/assets'],
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', '/api/cra/cca/assets', {
        ...form,
        ccaRate: parseFloat(form.ccaRate),
        originalCost: parseFloat(form.originalCost),
      });
    },
    onSuccess: () => {
      toast({ title: 'Asset Added' });
      queryClient.invalidateQueries({ queryKey: ['/api/cra/cca/assets'] });
      setAddOpen(false);
      setForm({ assetName: '', ccaClass: '', ccaRate: '', originalCost: '', acquisitionDate: '', description: '' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  if (isLoading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Capital Cost Allowance</h3>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-asset"><Plus className="w-4 h-4 mr-1" />Add Asset</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Capital Asset</DialogTitle>
              <DialogDescription>Record a new capital asset for CCA deductions.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Asset Name</Label>
                <Input value={form.assetName} onChange={e => setForm(f => ({ ...f, assetName: e.target.value }))} placeholder="e.g., Delivery Truck" data-testid="input-asset-name" />
              </div>
              <div>
                <Label>Description</Label>
                <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Asset description" data-testid="input-asset-description" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>CCA Class</Label>
                  <Input value={form.ccaClass} onChange={e => setForm(f => ({ ...f, ccaClass: e.target.value }))} placeholder="e.g., 10" data-testid="input-cca-class" />
                </div>
                <div>
                  <Label>CCA Rate (%)</Label>
                  <Input type="number" step="0.01" value={form.ccaRate} onChange={e => setForm(f => ({ ...f, ccaRate: e.target.value }))} placeholder="e.g., 30" data-testid="input-cca-rate" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Original Cost ($)</Label>
                  <Input type="number" step="0.01" value={form.originalCost} onChange={e => setForm(f => ({ ...f, originalCost: e.target.value }))} placeholder="0.00" data-testid="input-asset-cost" />
                </div>
                <div>
                  <Label>Acquisition Date</Label>
                  <Input type="date" value={form.acquisitionDate} onChange={e => setForm(f => ({ ...f, acquisitionDate: e.target.value }))} data-testid="input-acquisition-date" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)} data-testid="button-cancel-asset">Cancel</Button>
              <Button onClick={() => addMutation.mutate()} disabled={!form.assetName || !form.originalCost || addMutation.isPending} data-testid="button-save-asset">
                {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead></TableHead>
              <TableHead>Asset Name</TableHead>
              <TableHead>CCA Class</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead className="text-right">Original Cost</TableHead>
              <TableHead className="text-right">Accumulated CCA</TableHead>
              <TableHead className="text-right">UCC</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(!assets || assets.length === 0) ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No capital assets</TableCell></TableRow>
            ) : assets.map((asset: any) => (
              <>
                <TableRow key={asset.id} className="cursor-pointer" onClick={() => setExpandedAsset(expandedAsset === asset.id ? null : asset.id)} data-testid={`row-asset-${asset.id}`}>
                  <TableCell className="w-8">
                    {expandedAsset === asset.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </TableCell>
                  <TableCell className="font-medium">{asset.assetName}</TableCell>
                  <TableCell>Class {asset.ccaClass}</TableCell>
                  <TableCell>{Number(asset.ccaRate || 0)}%</TableCell>
                  <TableCell className="text-right">{formatCurrency(asset.originalCost || 0)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(asset.accumulatedCca || 0)}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(asset.ucc || 0)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={asset.status === 'active' ? 'bg-green-500/10 text-green-700' : 'bg-gray-500/10 text-gray-600'}>
                      {asset.status || 'active'}
                    </Badge>
                  </TableCell>
                </TableRow>
                {expandedAsset === asset.id && asset.entries && (
                  <TableRow key={`${asset.id}-entries`}>
                    <TableCell colSpan={8} className="bg-muted/30 p-3">
                      <div className="text-sm font-semibold mb-2">Annual CCA Entries</div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Year</TableHead>
                            <TableHead className="text-right">Opening UCC</TableHead>
                            <TableHead className="text-right">CCA Claimed</TableHead>
                            <TableHead className="text-right">Closing UCC</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(asset.entries || []).map((entry: any, i: number) => (
                            <TableRow key={i}>
                              <TableCell>{entry.year}</TableCell>
                              <TableCell className="text-right">{formatCurrency(entry.openingUcc || 0)}</TableCell>
                              <TableCell className="text-right">{formatCurrency(entry.ccaClaimed || 0)}</TableCell>
                              <TableCell className="text-right">{formatCurrency(entry.closingUcc || 0)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Settings Tab ────────────────────────────────────────────────────────────

function SettingsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<any>(null);

  const { data: settings, isLoading } = useQuery<any>({
    queryKey: ['/api/cra/settings'],
  });

  if (isLoading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  if (!form && settings) {
    setTimeout(() => setForm({ ...settings }), 0);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('PATCH', '/api/cra/settings', form);
    },
    onSuccess: () => {
      toast({ title: 'Settings Saved' });
      queryClient.invalidateQueries({ queryKey: ['/api/cra/settings'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  if (!form) return null;

  const updateField = (key: string, value: any) => setForm((f: any) => ({ ...f, [key]: value }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Business Settings</h3>
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-settings">
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}Save Settings
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Business Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Business Name</Label>
              <Input value={form.businessName || ''} onChange={e => updateField('businessName', e.target.value)} data-testid="input-business-name" />
            </div>
            <div>
              <Label>Legal Name</Label>
              <Input value={form.legalName || ''} onChange={e => updateField('legalName', e.target.value)} data-testid="input-legal-name" />
            </div>
            <div>
              <Label>Address</Label>
              <Textarea value={form.businessAddress || ''} onChange={e => updateField('businessAddress', e.target.value)} rows={2} data-testid="input-business-address" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Phone</Label>
                <Input value={form.businessPhone || ''} onChange={e => updateField('businessPhone', e.target.value)} data-testid="input-business-phone" />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={form.businessEmail || ''} onChange={e => updateField('businessEmail', e.target.value)} data-testid="input-business-email" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">CRA Registration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>CRA Business Number</Label>
              <Input value={form.craBusinessNumber || ''} onChange={e => updateField('craBusinessNumber', e.target.value)} placeholder="123456789RC0001" data-testid="input-cra-bn" />
            </div>
            <div>
              <Label>GST Registration Number</Label>
              <Input value={form.gstRegistrationNumber || ''} onChange={e => updateField('gstRegistrationNumber', e.target.value)} placeholder="123456789RT0001" data-testid="input-gst-reg" />
            </div>
            <div>
              <Label>GST Filing Frequency</Label>
              <Select value={form.gstFilingFrequency || 'quarterly'} onValueChange={v => updateField('gstFilingFrequency', v)}>
                <SelectTrigger data-testid="select-gst-frequency"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="annually">Annually</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Fiscal Year End</Label>
                <Input value={form.fiscalYearEnd || ''} onChange={e => updateField('fiscalYearEnd', e.target.value)} placeholder="12-31" data-testid="input-fiscal-year-end" />
              </div>
              <div>
                <Label>Income Tax Rate (%)</Label>
                <Input type="number" step="0.01" value={form.incomeTaxRate || ''} onChange={e => updateField('incomeTaxRate', e.target.value)} placeholder="15" data-testid="input-tax-rate" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Invoice Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label>Next Invoice Number</Label>
                <Input type="number" value={form.nextInvoiceNumber || ''} onChange={e => updateField('nextInvoiceNumber', parseInt(e.target.value) || '')} data-testid="input-next-invoice" />
              </div>
              <div>
                <Label>Invoice Prefix</Label>
                <Input value={form.invoicePrefix || ''} onChange={e => updateField('invoicePrefix', e.target.value)} placeholder="INV-" data-testid="input-invoice-prefix" />
              </div>
              <div>
                <Label>Payment Terms</Label>
                <Input value={form.invoiceTerms || ''} onChange={e => updateField('invoiceTerms', e.target.value)} placeholder="Net 30" data-testid="input-invoice-terms" />
              </div>
              <div>
                <Label>Default Notes</Label>
                <Input value={form.invoiceNotes || ''} onChange={e => updateField('invoiceNotes', e.target.value)} placeholder="Thank you for your business" data-testid="input-invoice-notes" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Main CRA Compliance Page ────────────────────────────────────────────────

export default function CraCompliancePage({ embedded }: { embedded?: boolean }) {
  const [activeTab, setActiveTab] = useState('invoices');

  const content = (
    <div className="space-y-4">
      {!embedded && (
        <div>
          <h1 className="font-display text-2xl font-bold">CRA Compliance</h1>
          <p className="text-muted-foreground">Tax compliance, invoicing, and business expense management</p>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
          <TabsTrigger value="invoices" className="gap-1.5" data-testid="tab-cra-invoices">
            <FileText className="w-4 h-4" />
            <span>Invoices</span>
          </TabsTrigger>
          <TabsTrigger value="expenses" className="gap-1.5" data-testid="tab-cra-expenses">
            <Receipt className="w-4 h-4" />
            <span>Expenses</span>
          </TabsTrigger>
          <TabsTrigger value="fuel-ledger" className="gap-1.5" data-testid="tab-cra-fuel-ledger">
            <Fuel className="w-4 h-4" />
            <span>Fuel Ledger</span>
          </TabsTrigger>
          <TabsTrigger value="gst-filing" className="gap-1.5" data-testid="tab-cra-gst-filing">
            <DollarSign className="w-4 h-4" />
            <span>GST Filing</span>
          </TabsTrigger>
          <TabsTrigger value="t2125" className="gap-1.5" data-testid="tab-cra-t2125">
            <Calculator className="w-4 h-4" />
            <span>T2125</span>
          </TabsTrigger>
          <TabsTrigger value="cca" className="gap-1.5" data-testid="tab-cra-cca">
            <Building2 className="w-4 h-4" />
            <span>CCA</span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5" data-testid="tab-cra-settings">
            <Settings className="w-4 h-4" />
            <span>Settings</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="mt-4"><InvoicesTab /></TabsContent>
        <TabsContent value="expenses" className="mt-4"><ExpensesTab /></TabsContent>
        <TabsContent value="fuel-ledger" className="mt-4"><FuelLedgerTab /></TabsContent>
        <TabsContent value="gst-filing" className="mt-4"><GstFilingTab /></TabsContent>
        <TabsContent value="t2125" className="mt-4"><T2125Tab /></TabsContent>
        <TabsContent value="cca" className="mt-4"><CcaTab /></TabsContent>
        <TabsContent value="settings" className="mt-4"><SettingsTab /></TabsContent>
      </Tabs>
    </div>
  );

  if (embedded) return content;

  return content;
}
