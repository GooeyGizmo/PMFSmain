# Prairie Mobile Fuel Services

## Overview
Prairie Mobile Fuel Services (PMFS) is a mobile fuel delivery web application designed to streamline fuel delivery scheduling for customers at various locations (home, farm, fleet). The platform provides a customer-facing interface for booking and vehicle management, complemented by an operations dashboard for administrators to manage orders, pricing, and business analytics. The project aims to capture a significant share of the mobile fuel delivery market by offering a convenient, subscription-based service with advanced operational and financial management tools. Key capabilities include multi-vehicle order support, a robust payment system with pre-authorization, recurring delivery automation, emergency and after-hours services, comprehensive business analytics, and a unique 9-bucket financial accounting system for sole proprietors.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is built with React 18 and TypeScript, utilizing Wouter for routing and TanStack React Query for server state management. UI components are developed using shadcn/ui on Radix UI primitives, styled with Tailwind CSS v4, and enhanced with Framer Motion for animations. Vite is used as the build tool.

### Backend
The backend runs on Node.js with Express and TypeScript. It implements a RESTful JSON API. Session management uses `express-session` with a PostgreSQL store, and authentication is session-based with bcryptjs for password hashing. Zod schemas ensure validation and type safety across client and server.

### Data Storage
PostgreSQL is the primary database, accessed via Drizzle ORM. Key entities include Users (with roles), Vehicles/Equipment, Orders (supporting multi-vehicle deliveries), OrderItems, Fuel Pricing, and Subscription Tiers (PAYG, ACCESS, HOUSEHOLD, RURAL, VIP). The schema is defined in `shared/schema.ts`.

### Equipment Types
**Added: January 2026**

The "My Vehicles" page now supports multiple equipment types beyond just road vehicles:
- **Vehicle** - Cars, trucks, farm equipment (shows Year, Make, Model, Color, License Plate)
- **Boat** - Watercraft (shows Year, Make, Model, Hull ID)
- **RV** - Recreational vehicles (shows Year, Make, Model, Color, License Plate)
- **Quads/Toys** - ATVs, snowmobiles, etc. (shows Make, Model)
- **Generator** - Portable generators (shows Make, Model)
- **Other** - Miscellaneous fuel-consuming equipment

Each type shows/hides relevant input fields. All equipment includes a nickname field for easy identification. The `equipment_type` enum defaults to "vehicle" for backward compatibility with existing data.

### Multi-Vehicle Order Management
The system supports orders containing multiple vehicles, each with specific fuel requirements and fill settings. Pricing considers per-vehicle fuel costs, a single delivery fee per order (varying by tier), and a 5% GST.

### Pricing Model (Option 4 - pmfs_option4_v1)
**Effective: January 2026**

The platform uses a premium fuel pricing model where:
- **NO per-litre tier discounts** - Fuel price is invariant by subscription tier
- **Subscriptions sell access/reliability/scheduling** - NOT cheaper fuel
- **Delivery fees vary by tier:**
  - PAYG: $24.99
  - Access: $14.99
  - Household: $0.00 (free)
  - Rural: $0.00 (free)
  - VIP: $0.00 (free)
- **Promo codes:** Percentage-fuel discounts require explicit `adminOverride` flag
- **Premium justification:** Prices include a convenience premium for mobile delivery

### VIP Fuel Concierge Tier
**Added: January 2026**

The VIP tier ($249.99/month) offers exclusive scheduling and time control:
- **Guaranteed 1-hour private booking** - No stacked deliveries during your hour
- **Exact start time selection** - 30-minute increment time picker (not windows)
- **Sunday delivery access** - VIP-only (all other tiers blocked from Sundays)
- **Priority scheduling** - Highest tier priority (0)
- **Unlimited personal vehicles** - No vehicle limit per order
- **10-subscriber hard cap** - Waitlist system when capacity is reached
- **Free delivery** - No delivery fees

Database fields: `booking_type` (standard_window/vip_exclusive), `vip_start_time`, `vip_end_time` on orders table. VIP waitlist stored in `vip_waitlist` table.

Key files: `shared/pricing.ts`, `server/paymentService.ts`

### Payment System
Stripe is integrated for all payment processing. All customers maintain a monthly subscription (even a $0/month PAYG option). Orders involve pre-authorization at booking, with final capture adjusted based on actual fuel delivered. A 5% GST is applied to all charges.

### Authentication & Authorization
Session-based authentication is stored in PostgreSQL. Role-based access control (user, operator, admin, owner) is enforced with middleware. Email verification is mandatory for new users, and password reset functionality is available.

### Daily Fuel Price Prompt
Owner accounts receive a daily modal prompt at 4:00 AM (Calgary time) to update fuel prices, pre-filled with current rates. This feature ensures timely price adjustments and is tracked via `localStorage`.

### Business Analytics & Financial Management
The system includes comprehensive analytics and financial tools. Configurable business settings (operating costs, tax reserves) influence profitability calculations. A "Cash Flow Waterfall" provides a detailed breakdown of revenue allocation across 9 distinct financial buckets for sole proprietors, including GST holding, various reserve funds, and an owner draw. Analytics cover real-time customer data, demand patterns, projections using linear regression, and route efficiency metrics (distance, fuel economy, estimated costs). Date ranges (daily, weekly, monthly, yearly) are supported for reporting.

### Route Optimization & ETA
Route distances are tracked, and dispatch metrics display total distance, average stop distance, fleet fuel economy, and estimated fuel usage. OSRM routing provides real-time ETAs to delivery stops, updating dynamically with route changes.

### Pre-Trip Inspections (TDG Compliance)
Daily pre-trip inspections are required for all trucks before dispatch. Records are stored, tracking vehicle condition, fluid levels, safety equipment, odometer readings, and sellable fuel levels. Inspection status is visible on the fleet page, and truck fuel levels are updated system-wide.

### Recurring Delivery Automation
Customers can set up recurring deliveries (weekly, bi-weekly, monthly) for multiple vehicles. A daily scheduler (5:00 AM Calgary time) processes these, creating orders for the next day. Pre-authorization is attempted, and customers are notified of success or failure. Idempotency guards prevent duplicate orders.

### Emergency & After-Hours Services
An optional "Emergency Access Add-On" provides after-hours services like emergency fuel delivery, lockout assistance, and boost services for a monthly fee. These services incur a service call fee, with an annual credit provided. A workflow tracks service requests from pending to completed.

### Business Finances (Weekly Close System)
A strict "Weekly Close Doctrine" ensures all financial operations occur on a designated close day. This system utilizes a 9-bucket account structure for precise revenue allocation (e.g., GST Holding, Income Tax Reserve, Operating Buffer, Owner Draw). A "Freedom Runway Tracker" monitors the Owner Draw Holding balance against target income, projecting financial independence.

### Stripe Bookkeeping System
A Stripe-led financial tracking system treats Stripe as the source of truth for all revenue, GST, and fees. Key components:

**Ledger Entries Table** (`ledger_entries`): Stores all financial transactions with:
- Idempotency keys (`stripe:event:{id}` for webhooks, `direct:charge:{id}` for direct capture, `bf:{type}:{id}` for backfill, `manual:{timestamp}:{user}:{random}` for manual entries)
- Revenue categorization by subscription tier, fuel delivery, or unmapped
- GST tracking with `gst_needs_review` flag for entries needing verification
- Stripe object IDs (charge_id, payment_intent_id) for refund lookup

**Dual Recording System**: Ledger entries are created immediately when payments are captured (direct recording) and also via webhooks as backup. Idempotency checks prevent duplicates - the webhook handler checks both `stripe:event:{id}` and `direct:charge:{id}` keys before inserting.

**Webhook Integration**: Handles `invoice.payment_succeeded`, `charge.succeeded` (non-invoiced), `refund.created`, and `payout.paid` events with proper expansion for GST extraction.

**Reconciliation Validation**: Enforces that revenue_subscription + revenue_fuel + revenue_other = gross - gst for revenue entries. Exempt types: payout, fuel_cost, expense, adjustment, owner_draw, refund.

**Reports**: Monthly Revenue Summary, GST Summary (CRA-ready), Cash Flow, with CSV export.

**Manual Entries**: Owners can record fuel COGS, expenses, and adjustments for complete financial tracking.

**Backfill**: Historical Stripe data can be imported with deterministic idempotency keys.

**Diagnostics**: Identifies unmapped revenue and entries needing GST review.

### Weekly Closeout & Reconciliation System
**Added: January 2026**

A fully automated weekly closeout system that enables the business to run with minimal manual work - owner only needs to deliver fuel and do Sunday review while everything else auto-logs, auto-reconciles, auto-reports, and auto-flags anomalies.

**Pricing Snapshot Enforcement**: Every order captures a complete pricing snapshot at delivery time via `pricingSnapshotService.ts`. This locks the exact fuel pricing (baseCost, markupPercent, markupFlat, customerPrice), delivery fees, and GST for historical accuracy.

**Fuel Reconciliation**: `fuelReconciliationService.ts` calculates shrinkage from truckFuelTransactions by comparing expected fuel levels against actuals. Configurable rules in `fuelShrinkageRules` table define:
- Expected shrinkage range (default 0.5% - 3.0%)
- Hard alert threshold (default 8.0%)
- Classifications: within_expected, outside_expected, hard_alert

**Stripe Reconciliation**: `stripeReconciliationService.ts` compares Stripe charges/refunds/fees to ledger entries with full pagination support. Auto-creates missing entries and flags mismatches within tolerance (default 100 cents).

**Closeout Orchestration**: `closeoutService.ts` coordinates:
- Order totals computation with COGS from pricing snapshots
- Fuel reconciliation per truck
- Stripe reconciliation with ledger
- Flag generation for anomalies
- Dry-run mode for Sunday preview before committing
- CSV exports for orders, fuel recon, Stripe recon

**Database Schema**: 
- Orders extended with `pricingSnapshotJson`, `snapshotLockedAt`, `snapshotLockedBy`
- `fuelPriceHistory` extended with `baseCost`, `markupPercent`, `markupFlat`
- New tables: `fuelShrinkageRules`, `fuelReconciliationPeriods`, `closeoutRuns`, `closeoutFlags`, `closeoutExports`

**UI**: `/ops/closeout` page accessible to admins and owners with run controls, history view, summary cards, fuel shrinkage tables, Stripe reconciliation status, flag alerts, and CSV exports.

Key files: `server/closeoutService.ts`, `server/fuelReconciliationService.ts`, `server/stripeReconciliationService.ts`, `server/pricingSnapshotService.ts`, `client/src/pages/ops/closeout.tsx`

### Build & Deployment
Development uses Vite with HMR, proxied via Express. Production builds use esbuild for the server and Vite for the client, with static files served by Express.

## External Dependencies

### Database
- PostgreSQL
- Drizzle ORM
- connect-pg-simple

### UI Component Libraries
- Radix UI
- Lucide React (icons)
- embla-carousel-react
- react-day-picker
- vaul
- cmdk

### Fonts
- Space Grotesk
- Inter
- JetBrains Mono