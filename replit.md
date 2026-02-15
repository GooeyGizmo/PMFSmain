# Prairie Mobile Fuel Services

## Overview
Prairie Mobile Fuel Services (PMFS) is a mobile fuel delivery web application designed to streamline fuel delivery scheduling for customers at various locations. The platform offers a customer-facing interface for booking and vehicle management, along with an operations dashboard for administrators to manage orders, pricing, and business analytics. The project aims to capture a significant share of the mobile fuel delivery market by providing a convenient, subscription-based service with advanced operational and financial management tools. Key capabilities include multi-vehicle order support, a robust payment system with pre-authorization, recurring delivery automation, emergency and after-hours services, comprehensive business analytics, and a unique 9-bucket financial accounting system for sole proprietors, now enhanced with CRA compliance.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend uses React 18 with TypeScript, Wouter for routing, and TanStack React Query for server state management. UI components are built with shadcn/ui on Radix UI primitives, styled with Tailwind CSS v4, and animated with Framer Motion. Vite serves as the build tool.

### Backend
The backend is built with Node.js, Express, and TypeScript, providing a RESTful JSON API. Session management uses `express-session` with a PostgreSQL store, and authentication is session-based with bcryptjs for password hashing. Zod schemas ensure validation and type safety.

### Data Storage
PostgreSQL is the primary database, accessed via Drizzle ORM, storing key entities like Users, Vehicles/Equipment, Orders, Fuel Pricing, and Subscription Tiers.

### Core Features
- **Multi-Vehicle Order Management**: Supports orders for multiple vehicles, each with specific fuel requirements and fill settings.
- **Dynamic Pricing Model**: Uses a premium fuel pricing model with delivery fees varying by subscription tier.
- **VIP Tier**: Offers exclusive scheduling, Sunday delivery, priority service, unlimited personal vehicles, and free delivery, with a hard cap and waitlist.
- **Smart Pre-Authorization System**: Utilizes Stripe for payments, with pre-authorization based on smart, tank-based estimates, adjusted to actual fuel delivered.
- **Quick Fuel Re-Order**: Allows customers to re-order frequently used vehicle combinations with a single tap.
- **VIP Auto Fill-to-Full**: Automatically enables and locks fill-to-full for VIP customers' vehicle-type equipment.
- **Authentication & Authorization**: Session-based authentication with role-based access control (user, operator, admin, owner) and mandatory email verification.
- **Business Analytics & Financial Management**: Includes comprehensive analytics, a "Cash Flow Waterfall" for 9 financial buckets, and various reports.
- **Route Optimization & ETA**: Tracks route distances and provides real-time ETAs using OSRM routing.
- **Pre-Trip Inspections**: Requires daily pre-trip inspections for trucks, visible on the fleet page.
- **Recurring Delivery Automation**: Allows customers to schedule recurring deliveries (weekly, bi-weekly, monthly).
- **Emergency & After-Hours Services**: Optional "Emergency Access Add-On" for after-hours fuel delivery, lockout, and boost services.
- **Weekly Close System**: A "Weekly Close Doctrine" using a 9-bucket account structure for revenue allocation and a "Freedom Runway Tracker."
- **Profitability Calculator**: Models a business waterfall for financial projections, focusing on mandatory obligations and discretionary reserves.
- **Stripe Bookkeeping System**: Stripe-led financial tracking system with a `ledger_entries` table, webhook integration, and reconciliation.
- **Weekly Closeout & Reconciliation System**: Automates weekly closeouts, integrating pricing snapshots, fuel reconciliation, and Stripe reconciliation.
- **Subscription Management Rules**: No refunds on cancellation (cancel_at_period_end, service continues to end of billing cycle). Upgrades use immediate proration (always_invoice). Downgrades scheduled for next billing cycle via pendingDowngradeTier (no immediate change). 3-day grace period for failed payments before suspending service (paymentFailedAt tracking).
- **Income Tax Reserve**: Standardized at 25% across all calculations, settings, and UI displays.
- **Unified App Mode System**: Single `appMode` setting with 3 states: `test` (company emails only, waitlist hidden), `pre-launch` (company emails only, waitlist visible for public lead gathering), `live` (fully open). Plus independent `maintenanceMode` toggle showing "We'll be back shortly" page to non-admins. Stored in `business_settings` table as `appMode` and `maintenanceMode` keys. Backward compatible with old `launchMode`/`preLaunchMode` settings via auto-migration.

### User Interface & Navigation
- **UX/IA Overhaul**: Restructured navigation with role-specific shells and components, consolidating pages into 5 primary destinations per role (Customer, Operator, Owner). Operator bottom nav: Today, Fleet, Fuel, Customers, Settings. Operator pages embed real ops/ components with `embedded` prop instead of placeholder "Open X" buttons.
- **Finance Command Center Redesign**: Overview tab redesigned into a dashboard featuring KPI Bar, Live P&L Statement, 9-Bucket Account Balances, Revenue & GST Summary, Recent Activity, Freedom Runway, and Settings & Tools.
- **Analytics Tab Redesign**: Redesigned into a chart-heavy dashboard including Profitability Banner + KPI Bar, Goals & Projections, Order Volume Chart, Revenue Sources Donut, Daily Fuel Cost Trend, Fuel Type Performance, Route Efficiency, Customer Metrics, and Deleted Orders.
- **Reports Center**: Centralized /owner/reports page organizing all reports into 4 categories (Financial, CRA/Tax, Operations, Customer) with search and one-tap navigation to any report.
- **Verification Delete/Reset**: Ability to delete Heroes tier verifications, automatically moving the customer to Household tier ($49.99/mo) with notification.

### CRA Compliance & Financial Documentation System
- **Unified Fuel Ledger**: Connects truck-level transactions with global fuel inventory, tracks 9 transaction types, calculates weighted-average cost, and supports supplier tracking.
- **CRA-Compliant Invoice System**: Auto-generates sequential, CRA-compliant invoices upon order completion, including business info, GST registration, and line items.
- **Expense & ITC Tracking**: Categorizes expenses according to CRA T2125, tracks Input Tax Credits (ITCs), and supports receipt uploads.
- **CRA Compliance Database Tables**: Introduced 8 new tables for invoices, expenses, CCA assets, vehicle logs, audit logs, GST filing periods, and CRA business settings.
- **Audit Trail**: Provides 6-year CRA retention audit logging for all critical actions with data snapshots.
- **CRA Reports & UI**: Dedicated "CRA" tab with sub-tabs for Invoices, Expenses, Fuel Ledger, GST Filing, T2125, CCA, and Settings, along with a "Fuel Management" tab under Operations.
- **Centralized Email Configuration**: All company email addresses are centrally defined in `shared/schema.ts` for consistent use across the application.

## External Dependencies

### Database
- PostgreSQL
- Drizzle ORM

### UI Component Libraries
- Radix UI
- shadcn/ui
- Lucide React
- embla-carousel-react
- react-day-picker
- vaul
- cmdk

### Payment Processing
- Stripe

### Mapping & Routing
- OSRM (Open Source Routing Machine)

### Fonts
- Space Grotesk
- Inter
- JetBrains Mono