# Prairie Mobile Fuel Services

## Overview

Prairie Mobile Fuel Services (PMFS) is a mobile fuel delivery web application that allows customers to schedule fuel deliveries to their vehicles at home, farms, or fleet locations. The platform features customer-facing booking and vehicle management, along with an operations dashboard for administrators to manage orders and pricing.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state, React Context for auth
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS v4 with custom theme variables for brand colors (prairie, copper, brass, gold, sage, wheat)
- **Animations**: Framer Motion for page transitions and UI animations
- **Build Tool**: Vite with custom plugins for Replit integration

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript compiled with tsx
- **API Pattern**: RESTful JSON API with `/api` prefix
- **Session Management**: express-session with PostgreSQL store (connect-pg-simple)
- **Authentication**: Session-based auth with bcryptjs password hashing
- **Validation**: Zod schemas shared between client and server via drizzle-zod

### Data Storage
- **Database**: PostgreSQL via Drizzle ORM
- **Schema Location**: `shared/schema.ts` - contains all table definitions
- **Key Entities**:
  - Users (with roles: user, operator, admin, owner)
  - Vehicles (linked to users, stores fuel type and tank capacity)
  - Orders (delivery scheduling with status tracking)
  - OrderItems (per-vehicle fuel details for multi-vehicle orders)
  - Fuel Pricing (configurable pricing per fuel type)
  - Subscription Tiers (PAYG, ACCESS, HOUSEHOLD, RURAL with pricing rules)

### Multi-Vehicle Orders
- One order can include multiple vehicles (based on subscription tier limits)
- Each vehicle has its own fuel amount and fill-to-full setting
- Fuel type is determined by each vehicle's stored fuel type
- Single delivery fee per order (not per vehicle)
- OrderItems table stores per-vehicle details: vehicleId, fuelType, fuelAmount, fillToFull, pricePerLitre, subtotal
- Order total = sum of all vehicle fuel costs - tier discounts + delivery fee + 5% GST

### Payment System (Stripe Integration)
- **Monthly Subscriptions**: All customers have a subscription (even PAYG at $0/month)
- **Pre-Authorization**: Every fuel order pre-auths the customer's card at booking
- **Capture on Delivery**: Actual litres delivered are used for final charge
- **GST**: 5% GST applied to all charges (subscriptions and orders)

**Subscription Tiers:**
| Tier | Monthly Fee | Delivery Fee | Per-L Discount | Min Order | Max Vehicles | Max Orders/Month |
|------|-------------|--------------|----------------|-----------|--------------|------------------|
| PAYG | $0.00 | $19.99 | $0.00 | 50L | 1 | 4 |
| ACCESS | $24.99 | $12.49 | $0.03 | 50L | 1 | 4 |
| HOUSEHOLD | $49.99 | FREE | $0.05 | None | 4 | Unlimited |
| RURAL | $99.99 | FREE | $0.07 | None | 20 | Unlimited |

**Order Pricing Formula:**
- Pre-auth: (litres × price − litres × discount + delivery fee) + 5% GST
- Capture: (actual litres × price − actual litres × discount + delivery fee) + 5% GST

**Payment Services:**
- `server/paymentService.ts` - Pre-auth and capture logic
- `server/subscriptionService.ts` - Subscription management
- `server/stripeClient.ts` - Stripe API client
- `server/webhookHandlers.ts` - Stripe webhook processing

### Authentication & Authorization
- Session-based authentication stored in PostgreSQL
- Role-based access control with middleware helpers (`requireAuth`, `requireAdmin`)
- User roles determine access to customer vs operations dashboards
- Password reset functionality requires current password verification

### Business Analytics & Settings
- **Business Settings Table**: Stores configurable values (operating costs, tax reserve rate)
- **Operating Costs**: Set in Business Calculators page, saved to database, used in Analytics profitability calculations
- **Revenue Flow (Sole Proprietor)**: Gross Income → Operating Costs → True Profit → Obligations → Owner Draw Available → Retained Capital
- **Date Ranges**:
  - Daily: Today only (Calgary timezone)
  - Weekly: Current week (Sunday to Saturday, Calgary timezone)
  - Monthly: Current calendar month (1st to end of month)
  - Yearly: Current calendar year (January 1 to December 31)
- **Tax Treatment**:
  - GST (5%): Collected from customers, remitted to CRA - displayed separately in Analytics
  - Tax Reserve (30%): Income tax withholding from true profit - displayed separately in Analytics
- **Fuel COGS**: Calculated from inventory purchase transactions with cost tracking
- **Real-time Analytics**: New customers this month, peak delivery day/window, demand patterns - all from live data
- **Projections**: Statistical analysis using linear regression on historical data (no external API costs):
  - Next month revenue/orders/litres forecast
  - Annual projection based on trends
  - Health indicators (positive/negative/neutral signals for business health)
- **Route Efficiency Analytics**: Tracks delivery route performance and operating costs
  - Total/average driving distances per route (calculated using Haversine formula)
  - Fleet fuel economy tracking (L/100km) from truck pre-trip inspections
  - Estimated fuel consumption: (distance / 100) × L/100km
  - Estimated fuel cost: fuel consumption × diesel price per litre
  - Daily trends chart showing fuel cost over time
  - API endpoint: `/api/ops/analytics/route-efficiency`

### Route Optimization & ETA
- **Route Distance Tracking**: Routes table stores totalDistanceKm and avgStopDistanceKm
- **Dispatch Metrics Display**: Route Efficiency Metrics card on dispatch page shows:
  - Total distance, average stop distance
  - Fleet fuel economy (default 15 L/100km for diesel trucks)
  - Estimated fuel use and cost
- **ETA Calculations**: OSRM routing provides real-time ETAs:
  - Time to next stop and arrival time displayed on map markers
  - ETA summary panel shows next stop details with arrival estimate
  - ETAs update when routes change

### Emergency & After-Hours Services
- **Emergency Access Add-On**: $14.99/month subscription for after-hours services
- **Business Hours**: 7:00 AM - 5:30 PM Calgary time (weekdays only)
- **Services Available**:
  - Emergency Fuel - Ran out of gas, we bring fuel to you
  - Lockout Assistance - Locked out of vehicle
  - Boost Service - Dead battery jump start
- **Pricing**:
  - Service call fee: $29.99 per call (+ fuel cost for emergency fuel)
  - Annual credit: 1 free service call per year with Emergency Access
  - GST: 5% applied to all charges
- **Database Tables**:
  - Users table extended with: hasEmergencyAccess, emergencyAccessStripeSubId, emergencyCreditsRemaining, emergencyCreditYearStart
  - ServiceRequests table: tracks emergency service requests with status workflow (pending → dispatched → en_route → on_site → completed)
- **Customer UI**: `/customer/emergency` - Subscribe to Emergency Access, request services, view history
- **Ops UI**: `/ops/emergency` - View and manage all emergency service requests

### Build & Deployment
- Development: Vite dev server with HMR proxied through Express
- Production: esbuild bundles server code, Vite builds client to `dist/public`
- Static files served by Express in production mode

## External Dependencies

### Database
- PostgreSQL (required, connection via `DATABASE_URL` environment variable)
- Drizzle ORM for type-safe database queries
- connect-pg-simple for session storage

### UI Component Libraries
- Radix UI primitives (accordion, dialog, dropdown, tabs, etc.)
- Lucide React for icons
- embla-carousel-react for carousels
- react-day-picker for calendar components
- vaul for drawer components
- cmdk for command palette

### Fonts
- Space Grotesk (display font)
- Inter (body font)
- JetBrains Mono (monospace)
- Loaded via Google Fonts CDN