# Frontend Applications Reference

All 20 frontend applications built with Next.js 15 and Sera UI.

## Application Matrix

| App                      | Purpose                                                      | Target Users        | Deployment |
| ------------------------ | ------------------------------------------------------------ | ------------------- | ---------- |
| **customer-dashboard**   | Customer-facing portal for contracts, accounts, transactions | End customers       | CF Pages   |
| **admin-portal**         | Internal admin for tenant management, system config          | Platform admins     | CF Pages   |
| **api-explorer**         | Interactive API documentation and testing                    | Developers          | CF Pages   |
| **billing-dashboard**    | Subscription management, invoices, usage                     | Billing admins      | CF Pages   |
| **compliance-explorer**  | Browse compliance frameworks (SOC2, GDPR, etc.)              | Compliance officers | CF Pages   |
| **developer-portal**     | Developer onboarding, SDKs, guides                           | Developers          | CF Pages   |
| **sandbox**              | API sandbox environment for testing                          | Developers          | CF Pages   |
| **webhook-explorer**     | Webhook testing and debugging                                | Developers          | CF Pages   |
| **status-page**          | System status dashboard                                      | All users           | CF Pages   |
| **docs**                 | VitePress documentation site                                 | All users           | CF Pages   |
| **wiki**                 | Internal knowledge base                                      | Internal team       | CF Pages   |
| **join**                 | Waitlist and signup landing page                             | Prospects           | CF Pages   |
| **why**                  | Marketing: Why IOF?                                          | Prospects           | CF Pages   |
| **partnership**          | Partnership portal                                           | Partners            | CF Pages   |
| **demo-bank**            | Demo: Islamic bank showcase                                  | Demo audience       | CF Pages   |
| **demo-embeddedfinance** | Demo: Embedded finance                                       | Demo audience       | CF Pages   |
| **demo-fintech**         | Demo: Fintech application                                    | Demo audience       | CF Pages   |
| **demo-microfinance**    | Demo: Microfinance platform                                  | Demo audience       | CF Pages   |
| **demo-takaful**         | Demo: Islamic insurance                                      | Demo audience       | CF Pages   |

## Shared UI Stack

All apps use the same UI foundation:

- **Framework**: Next.js 15 (App Router)
- **UI Components**: Sera UI (via shadcn registry)
- **Styling**: Tailwind CSS v4
- **State**: React Query (TanStack Query)
- **Auth**: Clerk (SSO, MFA)
- **Legal**: Built-in legal pages at `/legal/*`
- **Branding**: Islamic Open Finance™ consistent across all apps

## App Structure (Standard)

```
apps/{app-name}/
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── layout.tsx        # Root layout
│   │   ├── page.tsx          # Home page
│   │   └── legal/            # Built-in legal pages
│   │       ├── terms/
│   │       ├── privacy/
│   │       └── dpa/
│   ├── pages/                # Page components
│   ├── components/           # App-specific components
│   │   └── ui/               # Sera UI components
│   └── lib/                  # Utilities, API clients
├── public/                   # Static assets
├── next.config.js            # Next.js config
├── tailwind.config.ts        # Tailwind config
├── tsconfig.json             # TypeScript config
└── package.json              # Package manifest
```

## Requirements (All Apps)

1. All data from real APIs (zero mock data)
2. Legal pages built-in at `/legal/*`
3. No underlying tech references (Meilisearch, PostgreSQL, etc.)
4. Sera UI components for all interactive elements
5. Responsive design (mobile + desktop)
6. Accessibility (WCAG 2.1 AA)
7. Structured error states (never blank screens)
