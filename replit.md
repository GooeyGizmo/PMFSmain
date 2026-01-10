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
  - Fuel Pricing (configurable pricing per fuel type)
  - Subscription Tiers (PAYG, ACCESS, HOUSEHOLD, RURAL with pricing rules)

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