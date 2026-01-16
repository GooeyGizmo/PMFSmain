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
| PAYG | $0.00 | $24.99 | $0.00 | 40L | 1 | 4 |
| ACCESS | $24.99 | $12.49 | $0.03 | 40L | 1 | 4 |
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
- **Email Verification**: New users must verify email before first login
  - Verification tokens expire after 24 hours
  - Resend verification available for expired tokens
  - Existing unverified users receive verification emails on server startup
  - Verification page: `/verify-email?token=...`
- User roles determine access to customer vs operations dashboards
- Password reset functionality requires current password verification

### Daily Fuel Price Prompt (Owner Feature)
- **Automatic Daily Prompt**: Owner accounts see a fuel pricing modal once per day
- **Trigger Time**: 4:00 AM Calgary time (America/Edmonton timezone)
- **Behavior**:
  - If logged in after 4am: Shows on first page load
  - If logged in before 4am: Auto-pops up when 4am arrives
  - Once acknowledged (saved or skipped), won't show again until next day's 4am
- **Form**: Pre-filled with current prices for Regular, Premium, and Diesel
- **Auto-calculation**: Customer price updates automatically when base cost or markup changes
- **Storage**: Uses localStorage to track last acknowledgment date
- **Component**: `client/src/components/daily-price-prompt.tsx`

### Business Analytics & Settings
- **Business Settings Table**: Stores configurable values (operating costs, tax reserve rate)
- **Operating Costs**: Set in Business Calculators page, saved to database, used in Analytics profitability calculations
- **Cash Flow Waterfall (Sole Proprietor)**:
  1. Customer Payment (GST-inclusive) - Total collected from customers
  2. − GST Collected (5%) → Set aside for CRA remittance
  3. = Net Revenue (GST-excluded)
  4. − Cost of Goods Sold (Fuel COGS)
  5. = Gross Profit
  6. − Operating Expenses (truck, insurance, maintenance)
  7. = Net Profit (Pre-Tax)
  8. − Income Tax Reserve (configurable 25%) → Set aside for tax payment
  9. − CPP Reserve (configurable 9%) → Self-employed CPP contribution
  10. = Available Owner Draw → Personal account
- **Reserve Rate Settings**: Configurable in Business Calculators:
  - Income Tax Rate: Default 25% (recommended 25-30%)
  - CPP Rate: Default 9% (self-employed: 9-12%)
- **Date Ranges**:
  - Daily: Today only (Calgary timezone)
  - Weekly: Current week (Sunday to Saturday, Calgary timezone)
  - Monthly: Current calendar month (1st to end of month)
  - Yearly: Current calendar year (January 1 to December 31)
- **Tax Treatment**:
  - GST (5%): Extracted from GST-inclusive revenue (totalWithGST × 5/105), set aside for CRA
  - Income Tax Reserve: Applied to Net Profit (Pre-Tax), not gross revenue
  - CPP Reserve: Self-employed contribution, applied to Net Profit (Pre-Tax)
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

### Pre-Trip Inspections (TDG Compliance)
- **Daily Inspection Requirement**: All trucks require daily pre-trip inspection before dispatch
- **Database Table**: `truck_pre_trip_inspections` stores all inspection records
- **Inspection Categories**:
  - Vehicle Condition: lights, brakes, tires, mirrors, horn, windshield, wipers
  - Fluid Levels: oil, coolant, washer fluid
  - Safety Equipment (TDG required): fire extinguisher, first aid kit, spill kit, TDG documents
  - Readings: odometer, truck fuel level, fuel economy (L/100km)
  - Sellable fuel levels: regular, premium, diesel
- **Status Tracking**:
  - Fleet page shows inspection status badge for each truck (Inspected/Defects/Pre-Trip Needed)
  - Inspection updates truck fuel levels across the system
- **API Endpoints**:
  - `GET /api/ops/fleet/trucks/:id/pretrip/today` - Check if truck has today's inspection
  - `GET /api/ops/fleet/trucks/:id/pretrip` - Get inspection history
  - `POST /api/ops/fleet/trucks/:id/pretrip` - Submit new inspection
  - `GET /api/ops/fleet/pretrip-status` - Get all trucks' daily inspection status
- **UI Location**: Fleet Management page (`/ops/fleet`) - Pre-Trip button on each truck card

### Recurring Delivery Automation
- **Customer UI**: `/customer/recurring` - Manage recurring delivery schedules
- **Multi-Vehicle Support**: Customers can select multiple vehicles with individual fuel types and amounts
- **Frequency Options**: Weekly, bi-weekly, or monthly deliveries
- **Scheduler**: Runs at 5:00 AM Calgary time (America/Edmonton) daily via server interval
- **Order Creation Flow**:
  1. Scheduler checks active schedules with fresh DB fetch for idempotency
  2. Orders are created for deliveries scheduled for tomorrow
  3. Pre-authorization is attempted on customer's saved payment method
  4. On success: Order confirmed, schedule updated with lastOrderDate/nextOrderDate
  5. On failure: Order cancelled, schedule paused, customer notified via email
- **Timezone Handling**: All timestamps use Calgary noon UTC instants via `fromZonedTime` (date-fns-tz)
- **Idempotency Guards**:
  - `isLastOrderDateTomorrow()` prevents duplicate orders for same delivery date
  - Fresh schedule refetch before each iteration catches updates from previous iterations
  - `lastProcessedDate` prevents multiple scheduler runs on same Calgary date
- **Database Tables**:
  - `recurring_schedules`: stores schedule config, lastOrderDate, nextOrderDate, active status
  - Orders table extended with: isRecurring, recurringScheduleId
- **Ops Visibility**: "Recurring" badge displayed on Ops Dashboard and Dispatch pages
- **Service Location**: `server/recurringOrderService.ts`

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