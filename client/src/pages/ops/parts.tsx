import { useState } from 'react';
import { useHorizontalScroll } from "@/hooks/use-horizontal-scroll";
import { useAuth } from '@/lib/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Search, Plus, Pencil, Trash2, Loader2, Package, ChevronUp, ChevronDown, Filter } from 'lucide-react';
import OpsLayout from '@/components/ops-layout';

type PartsCategory = 'operations' | 'safety_compliance' | 'certification';

interface Part {
  id: string;
  category: PartsCategory;
  supplier: string;
  itemModel: string;
  quantity: number;
  unitPrice: string;
  currency: 'CAD' | 'USD';
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

const CATEGORY_LABELS: Record<PartsCategory, string> = {
  operations: 'Operations',
  safety_compliance: 'Safety / Compliance',
  certification: 'Certification'
};

// Extract part/model/serial number from itemModel field
const extractPartNumber = (itemModel: string): string => {
  if (!itemModel) return '-';
  
  // Look for common patterns: Part #, Model #, Serial #, P/N, M/N, S/N, or alphanumeric codes
  const patterns = [
    /(?:Part\s*#?|P\/N|PN)[:\s]*([A-Z0-9\-_]+)/i,
    /(?:Model\s*#?|M\/N|MN)[:\s]*([A-Z0-9\-_]+)/i,
    /(?:Serial\s*#?|S\/N|SN)[:\s]*([A-Z0-9\-_]+)/i,
    /(?:Item\s*#?)[:\s]*([A-Z0-9\-_]+)/i,
    /#([A-Z0-9\-_]+)/i,
    /\b([A-Z]{2,}[\-_]?[0-9]{2,}[A-Z0-9\-_]*)\b/i,  // Pattern like ABC-123, XY123
    /\b([0-9]{3,}[A-Z\-_][A-Z0-9\-_]*)\b/i,  // Pattern like 123-ABC
  ];
  
  for (const pattern of patterns) {
    const match = itemModel.match(pattern);
    if (match && match[1]) {
      return match[1].toUpperCase();
    }
  }
  
  return '-';
};

type SortField = 'category' | 'supplier' | 'itemModel' | 'quantity' | 'unitPrice' | 'createdAt';
type SortDirection = 'asc' | 'desc';

interface OpsPartsProps {
  embedded?: boolean;
}

export default function OpsParts({ embedded = false }: OpsPartsProps) {
  const scrollRef = useHorizontalScroll();
  const { isOwner } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('category');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currencyFilter, setCurrencyFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedPart, setSelectedPart] = useState<Part | null>(null);
  
  const [formCategory, setFormCategory] = useState<PartsCategory>('operations');
  const [formSupplier, setFormSupplier] = useState('');
  const [formItemModel, setFormItemModel] = useState('');
  const [formQuantity, setFormQuantity] = useState('0');
  const [formUnitPrice, setFormUnitPrice] = useState('0');
  const [formCurrency, setFormCurrency] = useState<'CAD' | 'USD'>('CAD');
  const [formNotes, setFormNotes] = useState('');

  const { data: partsData, isLoading } = useQuery({
    queryKey: ['/api/ops/parts'],
    refetchOnMount: 'always',
    queryFn: async () => {
      const res = await fetch('/api/ops/parts', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch parts');
      return res.json() as Promise<{ parts: Part[] }>;
    }
  });

  const createMutation = useMutation({
    mutationFn: async (data: { category: string; supplier: string; itemModel: string; quantity: number; unitPrice: string; currency: string; notes: string | null }) => {
      const res = await fetch('/api/ops/parts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Failed to create part');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/parts'] });
      toast({ title: 'Success', description: 'Part added successfully.' });
      resetForm();
      setIsAddDialogOpen(false);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to add part.', variant: 'destructive' });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Part> }) => {
      const res = await fetch(`/api/ops/parts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Failed to update part');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/parts'] });
      toast({ title: 'Success', description: 'Part updated successfully.' });
      resetForm();
      setIsEditDialogOpen(false);
      setSelectedPart(null);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update part.', variant: 'destructive' });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/ops/parts/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to delete part');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/parts'] });
      toast({ title: 'Success', description: 'Part deleted successfully.' });
      setIsDeleteDialogOpen(false);
      setSelectedPart(null);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete part.', variant: 'destructive' });
    }
  });

  const resetForm = () => {
    setFormCategory('operations');
    setFormSupplier('');
    setFormItemModel('');
    setFormQuantity('0');
    setFormUnitPrice('0');
    setFormCurrency('CAD');
    setFormNotes('');
  };

  const openEditDialog = (part: Part) => {
    setSelectedPart(part);
    setFormCategory(part.category);
    setFormSupplier(part.supplier);
    setFormItemModel(part.itemModel);
    setFormQuantity(String(part.quantity));
    setFormUnitPrice(part.unitPrice);
    setFormCurrency(part.currency);
    setFormNotes(part.notes || '');
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (part: Part) => {
    setSelectedPart(part);
    setIsDeleteDialogOpen(true);
  };

  const handleCreate = () => {
    if (!formSupplier.trim() || !formItemModel.trim()) {
      toast({ title: 'Error', description: 'Supplier and Item/Model are required.', variant: 'destructive' });
      return;
    }
    createMutation.mutate({
      category: formCategory,
      supplier: formSupplier.trim(),
      itemModel: formItemModel.trim(),
      quantity: parseInt(formQuantity) || 0,
      unitPrice: formUnitPrice || '0',
      currency: formCurrency,
      notes: formNotes.trim() || null
    });
  };

  const handleUpdate = () => {
    if (!selectedPart) return;
    if (!formSupplier.trim() || !formItemModel.trim()) {
      toast({ title: 'Error', description: 'Supplier and Item/Model are required.', variant: 'destructive' });
      return;
    }
    updateMutation.mutate({
      id: selectedPart.id,
      data: {
        category: formCategory,
        supplier: formSupplier.trim(),
        itemModel: formItemModel.trim(),
        quantity: parseInt(formQuantity) || 0,
        unitPrice: formUnitPrice || '0',
        currency: formCurrency,
        notes: formNotes.trim() || null
      }
    });
  };

  const handleDelete = () => {
    if (!selectedPart) return;
    deleteMutation.mutate(selectedPart.id);
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? 
      <ChevronUp className="w-4 h-4 inline ml-1" /> : 
      <ChevronDown className="w-4 h-4 inline ml-1" />;
  };

  const parts = partsData?.parts || [];
  
  const filteredParts = parts
    .filter(p => {
      const matchesSearch = searchQuery === '' || 
        p.supplier.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.itemModel.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.notes && p.notes.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCurrency = currencyFilter === 'all' || p.currency === currencyFilter;
      const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;
      return matchesSearch && matchesCurrency && matchesCategory;
    })
    .sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'category':
          comparison = a.category.localeCompare(b.category);
          break;
        case 'supplier':
          comparison = a.supplier.localeCompare(b.supplier);
          break;
        case 'itemModel':
          comparison = a.itemModel.localeCompare(b.itemModel);
          break;
        case 'quantity':
          comparison = a.quantity - b.quantity;
          break;
        case 'unitPrice':
          comparison = parseFloat(a.unitPrice) - parseFloat(b.unitPrice);
          break;
        case 'createdAt':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

  const formatCurrency = (amount: string, currency: 'CAD' | 'USD') => {
    const num = parseFloat(amount);
    return `${currency === 'USD' ? 'US$' : '$'}${num.toFixed(2)}`;
  };

  const calculateSubtotal = (qty: number, price: string) => {
    return (qty * parseFloat(price)).toFixed(2);
  };

  const content = (
    <div className="space-y-6">
      {!embedded && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold">Parts Inventory</h1>
            <p className="text-muted-foreground">Master list of all parts, equipment, and supplies</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-copper" />
              All Parts ({filteredParts.length})
            </CardTitle>
            {isOwner && (
              <Button 
                onClick={() => { resetForm(); setIsAddDialogOpen(true); }}
                className="bg-copper hover:bg-copper/90"
                data-testid="button-add-part"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Part
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search by supplier, item, or notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-parts"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-44" data-testid="select-category-filter">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="option-category-all">All Categories</SelectItem>
                <SelectItem value="operations" data-testid="option-category-operations">Operations</SelectItem>
                <SelectItem value="safety_compliance" data-testid="option-category-safety">Safety / Compliance</SelectItem>
                <SelectItem value="certification" data-testid="option-category-certification">Certification</SelectItem>
              </SelectContent>
            </Select>
            <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
              <SelectTrigger className="w-full sm:w-32" data-testid="select-currency-filter">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Currency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="option-currency-all">All</SelectItem>
                <SelectItem value="CAD" data-testid="option-currency-cad">CAD</SelectItem>
                <SelectItem value="USD" data-testid="option-currency-usd">USD</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-copper" />
            </div>
          ) : filteredParts.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-1">No Parts Found</h3>
              <p className="text-muted-foreground">
                {searchQuery || currencyFilter !== 'all' || categoryFilter !== 'all'
                  ? 'Try adjusting your search or filters.' 
                  : 'Add your first part to get started.'}
              </p>
            </div>
          ) : (
            <div ref={scrollRef} tabIndex={0} className="overflow-x-auto scrollbar-none outline-none focus:ring-1 focus:ring-ring/30 focus:rounded" style={{ scrollbarWidth: "none" }}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => toggleSort('category')}
                      data-testid="header-sort-category"
                    >
                      Category <SortIcon field="category" />
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => toggleSort('supplier')}
                      data-testid="header-sort-supplier"
                    >
                      Supplier <SortIcon field="supplier" />
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => toggleSort('itemModel')}
                      data-testid="header-sort-item"
                    >
                      Item/Model <SortIcon field="itemModel" />
                    </TableHead>
                    <TableHead data-testid="header-part-number">Part #</TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50 select-none text-right"
                      onClick={() => toggleSort('quantity')}
                      data-testid="header-sort-quantity"
                    >
                      Qty <SortIcon field="quantity" />
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50 select-none text-right"
                      onClick={() => toggleSort('unitPrice')}
                      data-testid="header-sort-price"
                    >
                      Unit Price <SortIcon field="unitPrice" />
                    </TableHead>
                    <TableHead className="text-right" data-testid="header-subtotal">Subtotal</TableHead>
                    <TableHead data-testid="header-currency">Currency</TableHead>
                    <TableHead data-testid="header-notes">Notes/Source</TableHead>
                    {isOwner && <TableHead className="text-right" data-testid="header-actions">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredParts.map((part) => (
                    <TableRow key={part.id} data-testid={`row-part-${part.id}`}>
                      <TableCell>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${
                          part.category === 'operations' ? 'bg-purple-100 text-purple-700' :
                          part.category === 'safety_compliance' ? 'bg-orange-100 text-orange-700' :
                          'bg-cyan-100 text-cyan-700'
                        }`}>
                          {CATEGORY_LABELS[part.category]}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">{part.supplier}</TableCell>
                      <TableCell>{part.itemModel}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground" data-testid={`text-part-number-${part.id}`}>{extractPartNumber(part.itemModel)}</TableCell>
                      <TableCell className="text-right">{part.quantity}</TableCell>
                      <TableCell className="text-right">{formatCurrency(part.unitPrice, part.currency)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(calculateSubtotal(part.quantity, part.unitPrice), part.currency)}
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          part.currency === 'USD' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {part.currency}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground">
                        {part.notes || '-'}
                      </TableCell>
                      {isOwner && (
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => openEditDialog(part)}
                              data-testid={`button-edit-part-${part.id}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => openDeleteDialog(part)}
                              className="text-destructive hover:text-destructive"
                              data-testid={`button-delete-part-${part.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Part</DialogTitle>
            <DialogDescription>Add a new part, equipment, or supply to your inventory.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="add-category">Category *</Label>
              <Select value={formCategory} onValueChange={(v) => setFormCategory(v as PartsCategory)}>
                <SelectTrigger data-testid="select-add-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="operations" data-testid="option-add-category-operations">Operations</SelectItem>
                  <SelectItem value="safety_compliance" data-testid="option-add-category-safety">Safety / Compliance</SelectItem>
                  <SelectItem value="certification" data-testid="option-add-category-certification">Certification</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-supplier">Supplier/Manufacturer *</Label>
              <Input
                id="add-supplier"
                value={formSupplier}
                onChange={(e) => setFormSupplier(e.target.value)}
                placeholder="e.g., Cat Pumps, Graco, Amazon"
                data-testid="input-add-supplier"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-item">Item/Model *</Label>
              <Input
                id="add-item"
                value={formItemModel}
                onChange={(e) => setFormItemModel(e.target.value)}
                placeholder="e.g., 310 Plunger Pump, 3/4 NPT Elbow"
                data-testid="input-add-item"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-quantity">Quantity</Label>
                <Input
                  id="add-quantity"
                  type="number"
                  min="0"
                  value={formQuantity}
                  onChange={(e) => setFormQuantity(e.target.value)}
                  data-testid="input-add-quantity"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-unit-price">Unit Price</Label>
                <Input
                  id="add-unit-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formUnitPrice}
                  onChange={(e) => setFormUnitPrice(e.target.value)}
                  data-testid="input-add-unit-price"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-currency">Currency</Label>
              <Select value={formCurrency} onValueChange={(v) => setFormCurrency(v as 'CAD' | 'USD')}>
                <SelectTrigger data-testid="select-add-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CAD" data-testid="option-add-currency-cad">CAD (Canadian Dollar)</SelectItem>
                  <SelectItem value="USD" data-testid="option-add-currency-usd">USD (US Dollar)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-notes">Notes/Source</Label>
              <Textarea
                id="add-notes"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="e.g., Amazon link, supplier part number, where to buy..."
                rows={3}
                data-testid="input-add-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} data-testid="button-cancel-add">Cancel</Button>
            <Button 
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="bg-copper hover:bg-copper/90"
              data-testid="button-confirm-add"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Part'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Part</DialogTitle>
            <DialogDescription>Update the part details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-category">Category *</Label>
              <Select value={formCategory} onValueChange={(v) => setFormCategory(v as PartsCategory)}>
                <SelectTrigger data-testid="select-edit-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="operations" data-testid="option-edit-category-operations">Operations</SelectItem>
                  <SelectItem value="safety_compliance" data-testid="option-edit-category-safety">Safety / Compliance</SelectItem>
                  <SelectItem value="certification" data-testid="option-edit-category-certification">Certification</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-supplier">Supplier/Manufacturer *</Label>
              <Input
                id="edit-supplier"
                value={formSupplier}
                onChange={(e) => setFormSupplier(e.target.value)}
                data-testid="input-edit-supplier"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-item">Item/Model *</Label>
              <Input
                id="edit-item"
                value={formItemModel}
                onChange={(e) => setFormItemModel(e.target.value)}
                data-testid="input-edit-item"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-quantity">Quantity</Label>
                <Input
                  id="edit-quantity"
                  type="number"
                  min="0"
                  value={formQuantity}
                  onChange={(e) => setFormQuantity(e.target.value)}
                  data-testid="input-edit-quantity"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-unit-price">Unit Price</Label>
                <Input
                  id="edit-unit-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formUnitPrice}
                  onChange={(e) => setFormUnitPrice(e.target.value)}
                  data-testid="input-edit-unit-price"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-currency">Currency</Label>
              <Select value={formCurrency} onValueChange={(v) => setFormCurrency(v as 'CAD' | 'USD')}>
                <SelectTrigger data-testid="select-edit-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CAD" data-testid="option-edit-currency-cad">CAD (Canadian Dollar)</SelectItem>
                  <SelectItem value="USD" data-testid="option-edit-currency-usd">USD (US Dollar)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-notes">Notes/Source</Label>
              <Textarea
                id="edit-notes"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={3}
                data-testid="input-edit-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} data-testid="button-cancel-edit">Cancel</Button>
            <Button 
              onClick={handleUpdate}
              disabled={updateMutation.isPending}
              className="bg-copper hover:bg-copper/90"
              data-testid="button-confirm-edit"
            >
              {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Part</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedPart?.itemModel}" from {selectedPart?.supplier}? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  if (embedded) {
    return content;
  }

  return <OpsLayout>{content}</OpsLayout>;
}
