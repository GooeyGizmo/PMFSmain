# Prairie Mobile Fuel Services

## Overview
Prairie Mobile Fuel Services (PMFS) is a mobile fuel delivery web application designed to streamline fuel delivery scheduling for customers at various locations (home, farm, fleet). The platform provides a customer-facing interface for booking and vehicle management, complemented by an operations dashboard for administrators to manage orders, pricing, and business analytics. The project aims to capture a significant share of the mobile fuel delivery market by offering a convenient, subscription-based service with advanced operational and financial management tools. Key capabilities include multi-vehicle order support, a robust payment system with pre-authorization, recurring delivery automation, emergency and after-hours services, comprehensive business analytics, and a unique 9-bucket financial accounting system for sole proprietors.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is built with React 18 and TypeScript, using Wouter for routing and TanStack React Query for server state management. UI components are developed using shadcn/ui on Radix UI primitives, styled with Tailwind CSS v4, and enhanced with Framer Motion for animations. Vite is used as the build tool.

### Backend
The backend runs on Node.js with Express and TypeScript, implementing a RESTful JSON API. Session management uses `express-session` with a PostgreSQL store, and authentication is session-based with bcryptjs for password hashing. Zod schemas ensure validation and type safety.

### Data Storage
PostgreSQL is the primary database, accessed via Drizzle ORM. Key entities include Users, Vehicles/Equipment, Orders, OrderItems, Fuel Pricing, and Subscription Tiers.

### Equipment Types
The system supports various equipment types (Vehicle, Boat, RV, Quads/Toys, Generator, Other) with relevant input fields for each.

### Multi-Vehicle Order Management
The system supports orders containing multiple vehicles, each with specific fuel requirements and fill settings. Pricing includes per-vehicle fuel costs, a single delivery fee per order, and GST.

### Pricing Model
A premium fuel pricing model is used where fuel price is invariant by subscription tier. Delivery fees vary by tier (PAYG, Access, Household, Rural, VIP). Promo codes for percentage fuel discounts require an explicit `adminOverride` flag.

### VIP Fuel Concierge Tier
The VIP tier offers exclusive scheduling (guaranteed 1-hour private booking, exact start time selection), Sunday delivery access, priority scheduling, unlimited personal vehicles, and free delivery. It has a 10-subscriber hard cap with a waitlist system.

### Payment System
Stripe is integrated for all payment processing. Customers maintain a monthly subscription. Orders involve pre-authorization at booking, with final capture adjusted based on actual fuel delivered. A 5% GST is applied.

### Authentication & Authorization
Session-based authentication is stored in PostgreSQL. Role-based access control (user, operator, admin, owner) is enforced. Email verification and password reset are mandatory.

### Daily Fuel Price Prompt
Owner accounts receive a daily modal prompt at 4:00 AM (Calgary time) to update fuel prices.

### Business Analytics & Financial Management
The system includes comprehensive analytics and financial tools, such as configurable business settings, a "Cash Flow Waterfall" breaking down revenue across 9 financial buckets for sole proprietors, and various reports (customer data, demand patterns, route efficiency).

### Route Optimization & ETA
Route distances are tracked, and dispatch metrics display total distance, average stop distance, fleet fuel economy, and estimated fuel usage. OSRM routing provides real-time ETAs.

### Pre-Trip Inspections
Daily pre-trip inspections are required for trucks, recording vehicle condition, fluid levels, safety equipment, odometer, and sellable fuel levels. Inspection status is visible on the fleet page.

### Recurring Delivery Automation
Customers can set up recurring deliveries (weekly, bi-weekly, monthly). A daily scheduler processes these, creating orders for the next day with pre-authorization and notifications.

### Emergency & After-Hours Services
An optional "Emergency Access Add-On" provides after-hours services like emergency fuel delivery, lockout assistance, and boost services for a monthly fee, including a service call fee and annual credit.

### Business Finances (Weekly Close System)
A "Weekly Close Doctrine" uses a 9-bucket account structure for precise revenue allocation. A "Freedom Runway Tracker" monitors the Owner Draw Holding balance.

### Profitability Calculator Design Decisions
The profitability projection calculator (`client/src/pages/ops/financials/calculators/profitability.tsx`) models the 9-bucket waterfall for bank presentations. Key design decisions:
- **Owner Draw is rule-based, NOT residual**: Owner Draw Holding receives allocations per the configured database allocation rules (same as backend `waterfallService.ts`). It is NOT calculated as "what's left after OpEx."
- **OpEx is separate from the waterfall**: Operating expenses are paid from unallocated working capital in Operating Chequing (the portion left after all 8 reserve allocations). OpEx is not a bucket and does not affect bucket allocations.
- **Maintenance Reserve ≠ Operating Expenses**: The Maintenance & Replacement bucket is a savings fund for future equipment costs. Day-to-day expenses (truck fuel, insurance, phone) are OpEx.
- **Working capital shortfall**: If allocation rules move too much out of Operating Chequing (rules sum to >100% of available), the remaining working capital may not cover OpEx. This is shown as a warning — the fix is to grow customers or adjust allocation percentages, not to reduce Owner Draw.
- **Fuel margin clamped to max(0)**: Prevents negative bucket allocations when COGS exceeds fuel revenue.

### Stripe Bookkeeping System
A Stripe-led financial tracking system treats Stripe as the source of truth for all revenue, GST, and fees. It includes a `ledger_entries` table for all financial transactions with idempotency keys, a dual recording system, webhook integration for various Stripe events, reconciliation validation, reports (Monthly Revenue Summary, GST Summary), manual entry support, and backfill capabilities.

### Weekly Closeout & Reconciliation System
A fully automated weekly closeout system integrates pricing snapshots, fuel reconciliation (calculating shrinkage and flagging anomalies), and Stripe reconciliation (comparing charges/refunds/fees to ledger entries). The `closeoutService` orchestrates these processes, generates flags for anomalies, and allows dry-runs and CSV exports. Data integrity checks ensure consistency.

### Build & Deployment
Development uses Vite with HMR, proxied via Express. Production builds use esbuild for the server and Vite for the client, with static files served by Express.

### UX/IA Overhaul
Major navigation restructuring consolidates pages into approximately 5 primary destinations per role (Customer, Operator, Owner) with role-specific navigation shells and components for layout mode detection, user preferences, and capability gating. Existing routes remain functional.

### Centralized Email Configuration
All company email addresses are centrally defined in `shared/schema.ts` via the `COMPANY_EMAILS` constant object:
- `INFO`: info@prairiemobilefuel.ca - General inquiries, privacy requests, public-facing contact
- `SUPPORT`: support@prairiemobilefuel.ca - Order issues, service issues, customer service, delivery notifications
- `BILLING`: billing@prairiemobilefuel.ca - All billing, Stripe, subscription, payment-related communications
- `OWNER`: levi.ernst@prairiemobilefuel.ca - Owner/admin personal email for internal use
- `INTERNAL_DOMAIN`: @prairiemobilefuel.ca - Domain suffix for internal account detection

This centralized config is imported and used across all backend services (emailService, routes, pushService, geocodingService, subscriptionService) and frontend components instead of hardcoded email strings.

## External Dependencies

### Database
- PostgreSQL
- Drizzle ORM
- connect-pg-simple

### UI Component Libraries
- Radix UI
- Lucide React
- embla-carousel-react
- react-day-picker
- vaul
- cmdk

### Fonts
- Space Grotesk
- Inter
- JetBrains Mono