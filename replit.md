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

### VIP Tier
The VIP tier offers exclusive scheduling (guaranteed 1-hour private booking, exact start time selection), Sunday delivery access, priority scheduling, unlimited personal vehicles, and free delivery. It has a 10-subscriber hard cap with a waitlist system.

### Payment System
Stripe is integrated for all payment processing. Customers maintain a monthly subscription. Orders involve pre-authorization at booking, with final capture adjusted based on actual fuel delivered. A 5% GST is applied.

### Smart Pre-Authorization System
Pre-authorization amounts use smart tank-based estimates instead of flat values. For fill-to-full orders: estimated litres = 65% of tank capacity × 1.5× safety multiplier (~97.5% of tank). Constants defined in `shared/pricing.ts` (`PRE_AUTH_CONFIG`, `PRE_AUTH_FLOOR_CONFIG`). Pre-auth floors are percentage-based: calculated total × 1.15 (15% buffer) with an absolute minimum of $150. This replaces the old flat per-tier floors and scales proportionally with order size. Applied consistently across frontend (`calculateTotal()`), backend routes, `paymentService.createPreAuthorization()`, and re-authorization flows. Floors only apply when at least one vehicle/equipment has fillToFull=true; exact-litre orders use the calculated amount without floor enforcement.

### Quick Fuel Re-Order
A "Quick Re-Order" feature on the customer home page analyzes completed order history to find the user's most frequent vehicle combination. Requires 2+ completed orders with the same vehicle set. Shows a card with vehicle summary and a single-tap button that navigates to the booking page pre-filled with their usual vehicles, fuel types, quantities, fill-to-full settings, and address. The booking page accepts a `?quickOrder=true` URL parameter to trigger pre-fill from GET `/api/orders/frequent`.

### VIP Auto Fill-to-Full
VIP tier customers have fill-to-full automatically enabled and locked for vehicle-type equipment in the booking flow. Equipment types (boats, generators, etc.) remain manual selection. The UI shows "VIP Auto Fill" with amber styling on locked checkboxes.

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
The profitability projection calculator (`client/src/pages/ops/financials/calculators/profitability.tsx`) models the corrected business waterfall for bank presentations. Key design decisions:
- **Correct waterfall order**: Mandatory obligations first (GST, Fuel COGS, Operating Expenses, Income Tax Reserve, Deferred Subscription Revenue), then discretionary reserves splitting 100% of remaining distributable profit (Maintenance & Replacement, Emergency/Risk Fund, Growth/Capital Fund, Owner Draw Holding).
- **Self-contained calculator**: Uses editable inputs for income tax rate (default 30%) and discretionary split percentages — no longer queries database allocation rules.
- **Income Tax Reserve is mandatory**: Calculated as configurable % of net business income (Stripe Payout - GST - COGS - OpEx). Applied before any discretionary allocations.
- **Deferred Subscription Revenue is mandatory**: 40% of subscription net (after GST & Stripe fees) is an accounting obligation for unearned revenue.
- **Distributable Profit = Stripe Payout minus all mandatory obligations**: If negative, the business cannot cover its basic costs (mandatory shortfall warning).
- **Discretionary reserves split distributable profit**: 4 configurable percentages (Owner Draw 55%, Growth 20%, Maintenance 15%, Emergency 10%) must total 100%.
- **Maintenance Reserve ≠ Operating Expenses**: The Maintenance & Replacement bucket is a savings fund for future equipment costs. Day-to-day expenses (truck fuel, insurance, phone) are OpEx (mandatory obligation).
- **Fuel margin clamped to max(0)**: Prevents negative bucket allocations when COGS exceeds fuel revenue.

### Stripe Bookkeeping System
A Stripe-led financial tracking system treats Stripe as the source of truth for all revenue, GST, and fees. It includes a `ledger_entries` table for all financial transactions with idempotency keys, a dual recording system, webhook integration for various Stripe events, reconciliation validation, reports (Monthly Revenue Summary, GST Summary), manual entry support, and backfill capabilities.

### Weekly Closeout & Reconciliation System
A fully automated weekly closeout system integrates pricing snapshots, fuel reconciliation (calculating shrinkage and flagging anomalies), and Stripe reconciliation (comparing charges/refunds/fees to ledger entries). The `closeoutService` orchestrates these processes, generates flags for anomalies, and allows dry-runs and CSV exports. Data integrity checks ensure consistency.

### Build & Deployment
Development uses Vite with HMR, proxied via Express. Production builds use esbuild for the server and Vite for the client, with static files served by Express.

### UX/IA Overhaul
Major navigation restructuring consolidates pages into approximately 5 primary destinations per role (Customer, Operator, Owner) with role-specific navigation shells and components for layout mode detection, user preferences, and capability gating. Existing routes remain functional.

### Finance Command Center Overview Redesign
The Financial Command Center overview tab (`financials.tsx`) was redesigned from a cluttered vertical card stack into an intentional dashboard with clear visual hierarchy:
1. **KPI Bar** — 5 key metrics (Gross Revenue, Net GST Owing, All Buckets total, Owner Draw, Orders) in a compact grid
2. **Live P&L Statement** — Full 9-bucket CRA-compliant waterfall using real ledger data, matching the profitability calculator's table format. Shows Revenue Recognition → Mandatory Obligations (GST, Stripe, COGS, OpEx, Income Tax Reserve, Deferred Subs) → Distributable Profit → Discretionary Reserves (Maintenance, Emergency, Growth, Owner Draw) with Split%, Weekly, Monthly, Annual columns
3. **9-Bucket Account Balances** — Compact 2×3 grid (not vertical stack) showing current balance per bucket
4. **Revenue & GST Summary** — Side-by-side cards with breakdown and CRA-ready GST summary
5. **Recent Activity** — Clean table of recent completed orders (date, customer, location, litres, gross, margin)
6. **Freedom Runway** — Compact tracker with progress bar and projected freedom date
7. **Settings & Tools** — Collapsible section at bottom for operating mode, target income, and maintenance tools
P&L data sources: revenue report API, GST report API, cash flow summary API (for COGS and expenses). Income tax reserve at 30% default, deferred subscription at 40% of net subscription revenue.

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