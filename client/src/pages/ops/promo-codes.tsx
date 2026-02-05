import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, Ticket, Plus, Users, Calendar, Check, X, Loader2, Trash2, Copy, Pencil
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import OpsLayout from '@/components/ops-layout';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PromoCode {
  id: string;
  code: string;
  description: string | null;
  discountType: string;
  discountValue: string | null;
  minimumOrderValue: string | null;
  maximumDiscountCap: string | null;
  stackable: boolean;
  eligibleTiers: string;
  maxTotalUses: number | null;
  currentUses: number;
  oneTimePerUser: boolean;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  redemptions?: {
    id: string;
    userId: string;
    orderId: string | null;
    redeemedAt: string;
  }[];
}

export default function OpsPromoCodes({ embedded }: { embedded?: boolean }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editingPromo, setEditingPromo] = useState<PromoCode | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const [newCode, setNewCode] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDiscountType, setNewDiscountType] = useState('delivery_fee');
  const [newDiscountValue, setNewDiscountValue] = useState('');
  const [newMinimumOrderValue, setNewMinimumOrderValue] = useState('');
  const [newMaximumDiscountCap, setNewMaximumDiscountCap] = useState('');
  const [newStackable, setNewStackable] = useState(true);
  const [newEligibleTiers, setNewEligibleTiers] = useState('payg,access');
  const [newMaxUses, setNewMaxUses] = useState('');
  const [newExpiresAt, setNewExpiresAt] = useState('');
  const [newOneTimePerUser, setNewOneTimePerUser] = useState(true);

  const [editDescription, setEditDescription] = useState('');
  const [editEligibleTiers, setEditEligibleTiers] = useState('');
  const [editMaxUses, setEditMaxUses] = useState('');
  const [editExpiresAt, setEditExpiresAt] = useState('');
  const [editOneTimePerUser, setEditOneTimePerUser] = useState(true);
  const [editStackable, setEditStackable] = useState(true);

  useEffect(() => {
    fetchPromoCodes();
  }, []);

  const fetchPromoCodes = async () => {
    try {
      const res = await fetch('/api/ops/promo-codes', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setPromoCodes(data.promoCodes || []);
      }
    } catch (error) {
      console.error('Failed to fetch promo codes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createPromoCode = async () => {
    if (!newCode.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a promo code.',
        variant: 'destructive',
      });
      return;
    }

    setIsCreating(true);
    try {
      const res = await fetch('/api/ops/promo-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          code: newCode.trim().toUpperCase(),
          description: newDescription.trim() || null,
          discountType: newDiscountType,
          discountValue: newDiscountValue ? newDiscountValue : null,
          minimumOrderValue: newMinimumOrderValue ? newMinimumOrderValue : null,
          maximumDiscountCap: newMaximumDiscountCap ? newMaximumDiscountCap : null,
          stackable: newStackable,
          eligibleTiers: newEligibleTiers,
          maxTotalUses: newMaxUses ? parseInt(newMaxUses) : null,
          oneTimePerUser: newOneTimePerUser,
          expiresAt: newExpiresAt || null,
        }),
      });

      if (res.ok) {
        toast({
          title: 'Success',
          description: 'Promo code created successfully.',
        });
        setIsDialogOpen(false);
        resetForm();
        fetchPromoCodes();
      } else {
        const data = await res.json();
        toast({
          title: 'Error',
          description: data.message || 'Failed to create promo code.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create promo code.',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const togglePromoCode = async (id: string, isActive: boolean) => {
    try {
      const res = await fetch(`/api/ops/promo-codes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: !isActive }),
      });

      if (res.ok) {
        toast({
          title: 'Success',
          description: isActive ? 'Promo code deactivated.' : 'Promo code activated.',
        });
        fetchPromoCodes();
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update promo code.',
        variant: 'destructive',
      });
    }
  };

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({
      title: 'Copied',
      description: `${code} copied to clipboard.`,
    });
  };

  const openEditDialog = (promo: PromoCode) => {
    setEditingPromo(promo);
    setEditDescription(promo.description || '');
    setEditEligibleTiers(promo.eligibleTiers);
    setEditMaxUses(promo.maxTotalUses?.toString() || '');
    setEditExpiresAt(promo.expiresAt ? promo.expiresAt.split('T')[0] : '');
    setEditOneTimePerUser(promo.oneTimePerUser);
    setEditStackable(promo.stackable);
    setIsEditDialogOpen(true);
  };

  const updatePromoCode = async () => {
    if (!editingPromo) return;

    setIsUpdating(true);
    try {
      const res = await fetch(`/api/ops/promo-codes/${editingPromo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          description: editDescription.trim() || null,
          eligibleTiers: editEligibleTiers,
          maxTotalUses: editMaxUses ? parseInt(editMaxUses) : null,
          oneTimePerUser: editOneTimePerUser,
          expiresAt: editExpiresAt || null,
          stackable: editStackable,
        }),
      });

      if (res.ok) {
        toast({
          title: 'Success',
          description: 'Promo code updated successfully.',
        });
        setIsEditDialogOpen(false);
        setEditingPromo(null);
        fetchPromoCodes();
      } else {
        const data = await res.json();
        toast({
          title: 'Error',
          description: data.message || 'Failed to update promo code.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update promo code.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const deletePromoCode = async (id: string) => {
    setIsDeleting(id);
    try {
      const res = await fetch(`/api/ops/promo-codes/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (res.ok) {
        toast({
          title: 'Success',
          description: 'Promo code deleted successfully.',
        });
        fetchPromoCodes();
      } else {
        const data = await res.json();
        toast({
          title: 'Error',
          description: data.message || 'Failed to delete promo code.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete promo code.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(null);
    }
  };

  const resetForm = () => {
    setNewCode('');
    setNewDescription('');
    setNewDiscountType('delivery_fee');
    setNewDiscountValue('');
    setNewMinimumOrderValue('');
    setNewMaximumDiscountCap('');
    setNewStackable(true);
    setNewEligibleTiers('payg,access');
    setNewMaxUses('');
    setNewExpiresAt('');
    setNewOneTimePerUser(true);
  };

  const getDiscountDescription = (promo: PromoCode) => {
    const value = promo.discountValue ? parseFloat(promo.discountValue) : 0;
    switch (promo.discountType) {
      case 'delivery_fee':
        return 'Free Delivery';
      case 'percentage_fuel':
        let desc = `${value}% off fuel`;
        if (promo.maximumDiscountCap) {
          desc += ` (max $${parseFloat(promo.maximumDiscountCap).toFixed(2)})`;
        }
        return desc;
      case 'flat_amount':
        return `$${value.toFixed(2)} off`;
      default:
        return 'Discount';
    }
  };

  const getTierBadges = (tiers: string) => {
    const tierArray = tiers.split(',').map(t => t.trim().toLowerCase());
    return tierArray.map(tier => {
      const colors: Record<string, string> = {
        payg: 'bg-gray-500',
        access: 'bg-cyan-600',
        household: 'bg-sky-400',
        rural: 'bg-green-700',
        all: 'bg-purple-500',
      };
      return (
        <Badge key={tier} className={`${colors[tier] || 'bg-gray-500'} text-white text-xs`}>
          {tier.toUpperCase()}
        </Badge>
      );
    });
  };

  if (user?.role !== 'owner') {
    return (
      <OpsLayout>
        <div className="p-6 text-center">
          <p className="text-muted-foreground">Access restricted to owners only.</p>
        </div>
      </OpsLayout>
    );
  }

  const content = (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6 space-y-6 max-w-6xl mx-auto"
      >
        <div className="flex items-center justify-between">
          {!embedded && (
            <div className="flex items-center gap-4">
              <Link href="/ops">
                <Button variant="ghost" size="icon" data-testid="button-back">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-display font-bold text-charcoal">Promo Codes</h1>
                <p className="text-sm text-muted-foreground">Create and manage promotional codes for free delivery</p>
              </div>
            </div>
          )}
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-copper hover:bg-copper/90" data-testid="button-create-promo">
                <Plus className="w-4 h-4 mr-2" />
                New Promo Code
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Promo Code</DialogTitle>
                <DialogDescription>
                  Create a new promotional code with flexible discount options.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Promo Code *</Label>
                  <Input
                    id="code"
                    placeholder="e.g., WELCOME2026"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                    data-testid="input-new-promo-code"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    placeholder="e.g., Welcome offer for new customers"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    data-testid="input-promo-description"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Discount Type *</Label>
                  <Select value={newDiscountType} onValueChange={setNewDiscountType}>
                    <SelectTrigger data-testid="select-discount-type">
                      <SelectValue placeholder="Select discount type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="delivery_fee">Free Delivery</SelectItem>
                      <SelectItem value="percentage_fuel">Percentage Off Fuel</SelectItem>
                      <SelectItem value="flat_amount">Fixed Dollar Amount Off</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {newDiscountType !== 'delivery_fee' && (
                  <div className="space-y-2">
                    <Label htmlFor="discountValue">
                      {newDiscountType === 'percentage_fuel' ? 'Discount Percentage (%)' : 'Discount Amount ($)'}
                    </Label>
                    <Input
                      id="discountValue"
                      type="number"
                      step={newDiscountType === 'percentage_fuel' ? '1' : '0.01'}
                      placeholder={newDiscountType === 'percentage_fuel' ? 'e.g., 10' : 'e.g., 25.00'}
                      value={newDiscountValue}
                      onChange={(e) => setNewDiscountValue(e.target.value)}
                      data-testid="input-discount-value"
                    />
                    {newDiscountType === 'percentage_fuel' && (
                      <p className="text-xs text-muted-foreground">Enter a value between 1 and 100</p>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="minimumOrder">Minimum Order Value ($)</Label>
                  <Input
                    id="minimumOrder"
                    type="number"
                    step="0.01"
                    placeholder="e.g., 100.00 (optional)"
                    value={newMinimumOrderValue}
                    onChange={(e) => setNewMinimumOrderValue(e.target.value)}
                    data-testid="input-minimum-order"
                  />
                  <p className="text-xs text-muted-foreground">Leave empty for no minimum</p>
                </div>

                {newDiscountType === 'percentage_fuel' && (
                  <div className="space-y-2">
                    <Label htmlFor="maxDiscountCap">Maximum Discount Cap ($)</Label>
                    <Input
                      id="maxDiscountCap"
                      type="number"
                      step="0.01"
                      placeholder="e.g., 50.00 (optional)"
                      value={newMaximumDiscountCap}
                      onChange={(e) => setNewMaximumDiscountCap(e.target.value)}
                      data-testid="input-max-discount-cap"
                    />
                    <p className="text-xs text-muted-foreground">Limit the maximum discount amount</p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Eligible Tiers</Label>
                  <Select value={newEligibleTiers} onValueChange={setNewEligibleTiers}>
                    <SelectTrigger data-testid="select-eligible-tiers">
                      <SelectValue placeholder="Select eligible tiers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="payg,access">PAYG & ACCESS only</SelectItem>
                      <SelectItem value="payg">PAYG only</SelectItem>
                      <SelectItem value="access">ACCESS only</SelectItem>
                      <SelectItem value="all">All tiers</SelectItem>
                    </SelectContent>
                  </Select>
                  {newDiscountType === 'delivery_fee' && (
                    <p className="text-xs text-muted-foreground">
                      HOUSEHOLD and RURAL already have free delivery
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxUses">Max Total Uses</Label>
                  <Input
                    id="maxUses"
                    type="number"
                    placeholder="Leave empty for unlimited"
                    value={newMaxUses}
                    onChange={(e) => setNewMaxUses(e.target.value)}
                    data-testid="input-max-uses"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="expiresAt">Expiration Date</Label>
                  <Input
                    id="expiresAt"
                    type="date"
                    value={newExpiresAt}
                    onChange={(e) => setNewExpiresAt(e.target.value)}
                    data-testid="input-expires-at"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>One-Time Use Per Customer</Label>
                    <p className="text-xs text-muted-foreground">
                      Each customer can only use this code once
                    </p>
                  </div>
                  <Switch
                    checked={newOneTimePerUser}
                    onCheckedChange={setNewOneTimePerUser}
                    data-testid="switch-one-time-use"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Stackable with Other Discounts</Label>
                    <p className="text-xs text-muted-foreground">
                      Can be combined with other promotions
                    </p>
                  </div>
                  <Switch
                    checked={newStackable}
                    onCheckedChange={setNewStackable}
                    data-testid="switch-stackable"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={createPromoCode}
                  disabled={isCreating}
                  className="bg-copper hover:bg-copper/90"
                  data-testid="button-submit-promo"
                >
                  {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-copper" />
          </div>
        ) : promoCodes.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Ticket className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No promo codes yet.</p>
              <p className="text-sm text-muted-foreground mt-1">
                Create your first promo code to offer customers free delivery.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 overflow-hidden">
            {promoCodes.map((promo) => (
              <Card key={promo.id} className={`overflow-hidden ${!promo.isActive ? 'opacity-60' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <code className="text-lg font-mono font-bold text-copper bg-copper/10 px-3 py-1 rounded">
                            {promo.code}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => copyToClipboard(promo.code)}
                            data-testid={`button-copy-${promo.code}`}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                        </div>
                        {!promo.isActive && (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                        {promo.expiresAt && new Date(promo.expiresAt) < new Date() && (
                          <Badge variant="destructive">Expired</Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {getDiscountDescription(promo)}
                        </Badge>
                        {promo.minimumOrderValue && (
                          <Badge variant="outline" className="text-xs">
                            Min ${parseFloat(promo.minimumOrderValue).toFixed(2)}
                          </Badge>
                        )}
                        {promo.stackable && (
                          <Badge variant="outline" className="text-xs text-sage">
                            Stackable
                          </Badge>
                        )}
                      </div>
                      
                      {promo.description && (
                        <p className="text-sm text-muted-foreground">{promo.description}</p>
                      )}
                      
                      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          <span>
                            {promo.currentUses} uses
                            {promo.maxTotalUses && ` / ${promo.maxTotalUses} max`}
                          </span>
                        </div>
                        {promo.expiresAt && (
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            <span>Expires {format(new Date(promo.expiresAt), 'MMM d, yyyy')}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          {promo.oneTimePerUser ? (
                            <Check className="w-4 h-4 text-sage" />
                          ) : (
                            <X className="w-4 h-4" />
                          )}
                          <span>One-time per user</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Eligible:</span>
                        <div className="flex gap-1">
                          {getTierBadges(promo.eligibleTiers)}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEditDialog(promo)}
                        data-testid={`button-edit-${promo.code}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            data-testid={`button-delete-${promo.code}`}
                          >
                            {isDeleting === promo.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Promo Code</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete the promo code <strong>{promo.code}</strong>? This will also delete all redemption history for this code. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deletePromoCode(promo.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <Switch
                        checked={promo.isActive}
                        onCheckedChange={() => togglePromoCode(promo.id, promo.isActive)}
                        data-testid={`switch-active-${promo.code}`}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Edit Promo Code Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Promo Code</DialogTitle>
              <DialogDescription>
                Update settings for <strong>{editingPromo?.code}</strong>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Input
                  id="edit-description"
                  placeholder="Optional internal note"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  data-testid="input-edit-description"
                />
              </div>

              <div className="space-y-2">
                <Label>Eligible Tiers</Label>
                <Select value={editEligibleTiers} onValueChange={setEditEligibleTiers}>
                  <SelectTrigger data-testid="select-edit-eligible-tiers">
                    <SelectValue placeholder="Select eligible tiers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="payg,access">PAYG & ACCESS only</SelectItem>
                    <SelectItem value="payg">PAYG only</SelectItem>
                    <SelectItem value="access">ACCESS only</SelectItem>
                    <SelectItem value="all">All tiers</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-max-uses">Max Total Uses</Label>
                <Input
                  id="edit-max-uses"
                  type="number"
                  placeholder="Leave empty for unlimited"
                  value={editMaxUses}
                  onChange={(e) => setEditMaxUses(e.target.value)}
                  data-testid="input-edit-max-uses"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-expires-at">Expiration Date</Label>
                <Input
                  id="edit-expires-at"
                  type="date"
                  value={editExpiresAt}
                  onChange={(e) => setEditExpiresAt(e.target.value)}
                  data-testid="input-edit-expires-at"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>One-Time Use Per Customer</Label>
                  <p className="text-xs text-muted-foreground">
                    Each customer can only use this code once
                  </p>
                </div>
                <Switch
                  checked={editOneTimePerUser}
                  onCheckedChange={setEditOneTimePerUser}
                  data-testid="switch-edit-one-time-use"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Stackable with Other Discounts</Label>
                  <p className="text-xs text-muted-foreground">
                    Can be combined with other promotions
                  </p>
                </div>
                <Switch
                  checked={editStackable}
                  onCheckedChange={setEditStackable}
                  data-testid="switch-edit-stackable"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={updatePromoCode}
                disabled={isUpdating}
                className="bg-copper hover:bg-copper/90"
                data-testid="button-save-edit"
              >
                {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </motion.div>
    </div>
  );

  if (embedded) {
    return content;
  }

  return <OpsLayout>{content}</OpsLayout>;
}
