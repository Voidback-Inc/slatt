const COMPANY = 'Voidback, Inc.';
const STATE = 'Delaware';
const YEAR = '2026';
const APP = 'slatt';

export const PRIVACY_POLICY = `Last updated: January 1, ${YEAR}

${COMPANY} ("we," "our," or "us") operates the ${APP} mobile application (the "App"). This Privacy Policy explains how we handle your information.

1. INFORMATION WE COLLECT
We collect the minimum necessary to operate the service:
  • Email address (for account creation and authentication)
  • Account tier (Free or Pro) and daily query count (for rate limiting)
  • Stripe customer and subscription IDs (for billing, stored in our database only as references — Stripe holds payment data)
  • Teachings you submit in the App (stored in Antonlytics' shared knowledge graph, accessible to all Pro members)

2. THIRD-PARTY SERVICES
The App connects to:
  • Supabase (auth.supabase.io) — authentication and account data storage
  • Antonlytics (antonlytics.com) — AI memory and collective knowledge graph
  • Stripe (stripe.com) — subscription payments and billing

Each service operates under its own Privacy Policy. We recommend reviewing them.

3. YOUR TEACHINGS
When you submit a teaching in the App, that text is processed and stored in Antonlytics' shared knowledge graph. It becomes part of the collective intelligence available to all Pro members. Do not submit anything you consider confidential or private.

4. DATA WE DO NOT COLLECT
We do not collect device identifiers, location data, usage analytics, crash reports, or advertising data. We have no analytics frameworks in the App.

5. DATA RETENTION
Account data is retained until you delete your account. To request deletion, email legal@voidback.com.

6. CHILDREN
The App is not directed at children under 13. We do not knowingly collect data from minors.

7. CHANGES TO THIS POLICY
Material changes will be communicated via the App or App Store update notes.

8. CONTACT
${COMPANY}
Incorporated in the State of ${STATE}, ${YEAR}
legal@voidback.com`;

export const TERMS_OF_SERVICE = `Last updated: January 1, ${YEAR}

These Terms of Service ("Terms") govern your use of the ${APP} mobile application ("App") operated by ${COMPANY} ("we," "our," "us"), incorporated in the State of ${STATE}.

1. ACCEPTANCE
By downloading or using the App, you agree to be bound by these Terms. If you do not agree, do not use the App.

2. ACCOUNTS
You must create an account to use the App. You are responsible for maintaining the security of your account credentials and for all activity under your account.

3. SUBSCRIPTION PLANS
  Free Plan: Up to 30 queries per day (teaches + asks combined). Access to the collective knowledge base.
  Pro Plan: Unlimited queries. $5/month or $50/year billed annually. Billed via Apple In-App Purchase. Payment is charged to your Apple ID account at confirmation of purchase. Subscription automatically renews unless cancelled at least 24 hours before the end of the current period. Manage or cancel in Settings → Apple ID → Subscriptions. You may cancel at any time; cancellation takes effect at the end of the current billing period.

4. REFUNDS
Subscription fees are non-refundable except where required by applicable law.

5. SHARED KNOWLEDGE BASE
By submitting a teaching, you grant ${COMPANY} and Antonlytics a non-exclusive, royalty-free license to store and make that teaching available to other Pro members. Do not submit content that is confidential, proprietary, or violates third-party rights.

6. LICENSE
We grant you a limited, non-exclusive, non-transferable, revocable license to use the App for your personal, non-commercial purposes.

7. OPEN SOURCE
The App's source code is open source. The applicable open-source license governs your rights to inspect, modify, and redistribute the code. These Terms govern your use of the compiled App.

8. PROHIBITED CONDUCT
You agree not to:
  (a) Submit false, harmful, or illegal content.
  (b) Attempt to extract, scrape, or abuse the shared knowledge base.
  (c) Share account credentials with others.
  (d) Reverse-engineer the compiled App beyond what the open-source license permits.

9. DISCLAIMER OF WARRANTIES
THE APP IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. WE DO NOT WARRANT UNINTERRUPTED OR ERROR-FREE SERVICE.

10. LIMITATION OF LIABILITY
TO THE MAXIMUM EXTENT PERMITTED BY LAW, ${COMPANY.toUpperCase()} SHALL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE APP.

11. GOVERNING LAW
These Terms are governed by the laws of the State of ${STATE}. Disputes shall be resolved in the courts of ${STATE}.

12. CHANGES TO TERMS
We reserve the right to modify these Terms. Material changes will be communicated through the App or App Store update notes.

13. CONTACT
${COMPANY}
legal@voidback.com`;
