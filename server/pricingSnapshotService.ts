import { storage } from './storage';
import type { PricingSnapshot } from '@shared/schema';

const GST_RATE = 0.05;

interface OrderItem {
  fuelType: 'regular' | 'premium' | 'diesel';
  fuelAmount: string;
  pricePerLitre: string;
  actualLitresDelivered?: string | null;
}

interface SnapshotInput {
  orderId: string;
  orderItems: OrderItem[];
  deliveryFee: string | number;
  actualLitresOverride?: number;
  operatorUserId?: string;
}

interface SnapshotResult {
  success: boolean;
  snapshot?: PricingSnapshot;
  error?: string;
}

export class PricingSnapshotService {
  async buildSnapshot(input: SnapshotInput): Promise<SnapshotResult> {
    try {
      const items: PricingSnapshot['items'] = [];
      
      for (const item of input.orderItems) {
        const fuelPricing = await storage.getFuelPricing(item.fuelType);
        
        const litres = input.actualLitresOverride 
          ? input.actualLitresOverride 
          : (item.actualLitresDelivered 
            ? parseFloat(item.actualLitresDelivered) 
            : parseFloat(item.fuelAmount));
        
        if (!fuelPricing) {
          items.push({
            fuelType: item.fuelType,
            litres,
            baseCost: 0,
            markupPercent: 0,
            markupFlat: 0,
            customerPrice: parseFloat(item.pricePerLitre),
          });
        } else {
          items.push({
            fuelType: item.fuelType,
            litres,
            baseCost: parseFloat(fuelPricing.baseCost),
            markupPercent: parseFloat(fuelPricing.markupPercent),
            markupFlat: parseFloat(fuelPricing.markupFlat),
            customerPrice: parseFloat(fuelPricing.customerPrice),
          });
        }
      }
      
      const deliveryFeeBeforeGst = typeof input.deliveryFee === 'string' 
        ? parseFloat(input.deliveryFee) 
        : input.deliveryFee;
      
      const allPricing = await storage.getAllFuelPricing();
      const latestUpdate = allPricing.length > 0 
        ? allPricing.reduce((latest, p) => 
            p.updatedAt && (!latest || new Date(p.updatedAt) > new Date(latest)) 
              ? p.updatedAt.toISOString() 
              : latest, 
            allPricing[0]?.updatedAt?.toISOString() || new Date().toISOString())
        : new Date().toISOString();
      
      const snapshot: PricingSnapshot = {
        gstRate: GST_RATE,
        deliveryFeeBeforeGst,
        items,
        createdAtSnapshot: new Date().toISOString(),
        fuelPricingUpdatedAt: latestUpdate,
      };
      
      return { success: true, snapshot };
    } catch (error) {
      console.error('[PricingSnapshot] Error building snapshot:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error building pricing snapshot' 
      };
    }
  }
  
  async lockSnapshot(orderId: string, snapshot: PricingSnapshot, lockedBy?: string): Promise<{ success: boolean; error?: string }> {
    try {
      await storage.updateOrderPricingSnapshot(orderId, {
        pricingSnapshotJson: JSON.stringify(snapshot),
        snapshotLockedAt: new Date(),
        snapshotLockedBy: lockedBy || null,
      });
      
      console.log(`[PricingSnapshot] Locked snapshot for order ${orderId}`);
      return { success: true };
    } catch (error) {
      console.error(`[PricingSnapshot] Error locking snapshot for order ${orderId}:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error locking snapshot' 
      };
    }
  }
  
  async buildAndLock(input: SnapshotInput): Promise<SnapshotResult> {
    const buildResult = await this.buildSnapshot(input);
    if (!buildResult.success || !buildResult.snapshot) {
      return buildResult;
    }
    
    const lockResult = await this.lockSnapshot(input.orderId, buildResult.snapshot, input.operatorUserId);
    if (!lockResult.success) {
      return { success: false, error: lockResult.error };
    }
    
    return buildResult;
  }
  
  async buildBackfillSnapshot(orderId: string): Promise<SnapshotResult> {
    try {
      const order = await storage.getOrder(orderId);
      if (!order) {
        return { success: false, error: `Order ${orderId} not found` };
      }
      
      const orderItems = await storage.getOrderItems(orderId);
      
      const fuelType = order.fuelType || 'regular';
      const litres = order.actualLitresDelivered 
        ? parseFloat(order.actualLitresDelivered.toString())
        : (order.fuelAmount ? parseFloat(order.fuelAmount.toString()) : 0);
      
      let deliveryDate = order.updatedAt || order.createdAt;
      if (order.status === 'completed' && order.updatedAt) {
        deliveryDate = order.updatedAt;
      }
      
      const fuelHistory = await storage.getFuelPriceHistoryNearDate(fuelType, deliveryDate);
      const currentPricing = await storage.getFuelPricing(fuelType);
      
      let baseCost = 0;
      let markupPercent = 0;
      let markupFlat = 0;
      let customerPrice = parseFloat(order.pricePerLitre?.toString() || '0');
      
      if (fuelHistory && fuelHistory.baseCost) {
        baseCost = parseFloat(fuelHistory.baseCost.toString());
        markupPercent = parseFloat(fuelHistory.markupPercent?.toString() || '0');
        markupFlat = parseFloat(fuelHistory.markupFlat?.toString() || '0');
        customerPrice = parseFloat(fuelHistory.customerPrice.toString());
      } else if (currentPricing) {
        baseCost = parseFloat(currentPricing.baseCost);
        markupPercent = parseFloat(currentPricing.markupPercent);
        markupFlat = parseFloat(currentPricing.markupFlat);
      }
      
      const items: PricingSnapshot['items'] = [];
      
      if (orderItems && orderItems.length > 0) {
        for (const item of orderItems) {
          const itemFuelType = item.fuelType as 'regular' | 'premium' | 'diesel';
          const itemHistory = await storage.getFuelPriceHistoryNearDate(itemFuelType, deliveryDate);
          const itemPricing = await storage.getFuelPricing(itemFuelType);
          
          items.push({
            fuelType: itemFuelType,
            litres: item.actualLitresDelivered 
              ? parseFloat(item.actualLitresDelivered.toString()) 
              : parseFloat(item.fuelAmount.toString()),
            baseCost: itemHistory?.baseCost 
              ? parseFloat(itemHistory.baseCost.toString()) 
              : (itemPricing ? parseFloat(itemPricing.baseCost) : 0),
            markupPercent: itemHistory?.markupPercent 
              ? parseFloat(itemHistory.markupPercent.toString()) 
              : (itemPricing ? parseFloat(itemPricing.markupPercent) : 0),
            markupFlat: itemHistory?.markupFlat 
              ? parseFloat(itemHistory.markupFlat.toString()) 
              : (itemPricing ? parseFloat(itemPricing.markupFlat) : 0),
            customerPrice: parseFloat(item.pricePerLitre.toString()),
          });
        }
      } else {
        items.push({
          fuelType: fuelType as 'regular' | 'premium' | 'diesel',
          litres,
          baseCost,
          markupPercent,
          markupFlat,
          customerPrice,
        });
      }
      
      const snapshot: PricingSnapshot = {
        gstRate: GST_RATE,
        deliveryFeeBeforeGst: parseFloat(order.deliveryFee?.toString() || '0'),
        items,
        createdAtSnapshot: new Date().toISOString(),
        fuelPricingUpdatedAt: deliveryDate.toISOString(),
        notes: fuelHistory?.baseCost 
          ? 'COGS from fuelPriceHistory' 
          : 'COGS_RECONSTRUCTED from current fuelPricing',
      };
      
      return { success: true, snapshot };
    } catch (error) {
      console.error(`[PricingSnapshot] Error building backfill snapshot for order ${orderId}:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
}

export const pricingSnapshotService = new PricingSnapshotService();
