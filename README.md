# slatt — Collective Intelligence

**slatt** is a mobile app that lets people teach a shared AI agent and ask it anything. It grows smarter as contributors add knowledge, and it stays objective by fact-checking claims, labelling anecdotal experiences, and citing sources.

Built by **Voidback, Inc.** — [github.com/Voidback-Inc](https://github.com/Voidback-Inc)

---

## How it works

- **TEACH mode** — you share something you know. The agent evaluates it (AI fact-check + quality gate), optionally asks for a source, then ingests it into a shared knowledge graph.
- **ASK mode** — you ask anything. The agent answers using its collective knowledge plus its own pre-trained knowledge, citing sources and flagging anecdotal content when relevant.
- **Anecdotal experiences** — personal accounts are stored with an `[ANECDOTAL EXPERIENCE]` tag. When surfaced, the agent always makes clear it's one person's story and gives an honest truth analysis.

---

## Features (v1.1.0)

### Chat
- TEACH / ASK modes with a shared collective knowledge graph
- Third-person claims about public figures gate-checked before filing (asks for source or personal confirmation)
- Long-press any message to copy or share via the native share sheet
- Retry button on network failures — restores your last message and resends
- Clickable URLs in agent responses open in the browser
- Input sits flush above the tab bar with a consistent 20px gap

### History
- All conversations are stored locally and grouped by day
- Tap any entry to open the full conversation in a modal
- Continue any past conversation — chat screen resumes with full context
- Free users who have hit their daily limit see an upgrade prompt instead of the continue button

### Settings
- **Credits ring** — free users see a colour-coded circular progress ring (green → amber → red) showing remaining daily queries
- **Pro badge** — Pro users see a gold "⚡ PRO" badge
- **Upgrade flow** — Apple In-App Purchase (monthly $5/mo · annual $50/yr, billed annually, save 17%) via RevenueCat
- **Restore purchases** — restores an active Apple subscription on a new device
- **Change password** — sends an OTP to your email, then lets you set a new password
- **Delete account** — Face ID / passcode confirmation + OTP verification

### Auth
- OTP-only sign-in, sign-up, and password reset (no magic links)

### Splash screen
- Custom animated wordmark — fades in while auth initialises, then transitions to the app

---

## Stack

| Layer | Technology |
|---|---|
| App | React Native + Expo 54 (managed workflow) |
| Routing | Expo Router v5 (file-based) |
| Auth | Supabase Auth (OTP email) |
| Database | Supabase Postgres (`profiles` table) + Realtime |
| AI backend | Antonlytics v2 (collective knowledge graph) |
| AI evaluation | Claude Haiku (Anthropic API) — pre-flight teach gate |
| Subscriptions | Apple In-App Purchase via RevenueCat |
| Edge functions | Supabase Edge Functions (Deno) |
| Biometrics | expo-local-authentication (Face ID + passcode fallback) |
| Styling | React Native StyleSheet |

---

## Subscription sync

Subscription state flows through three channels so users always have immediate access after paying:

1. **In-app purchase** — RevenueCat SDK confirms the transaction → app calls `apple-iap` edge function → Supabase sets `tier = 'pro'` → Supabase Realtime pushes the update to the client instantly.
2. **RevenueCat webhook** — Apple renewal / expiration / cancellation events hit `revenuecat-webhook` edge function → Supabase updated → Realtime syncs all open clients.
3. **Background listener** — RevenueCat SDK `addCustomerInfoUpdateListener` fires on any entitlement change while the app is open (e.g. restore purchases, family sharing) → `apple-iap` called immediately.

The agent edge function enforces limits server-side regardless of client state, so the client UI is always consistent with the source of truth.

---

## Project structure

```
slatt/
├── app/
│   ├── _layout.tsx              # Root layout + animated splash + AuthGate
│   ├── (auth)/
│   │   ├── login.tsx
│   │   ├── signup.tsx
│   │   └── verify.tsx           # 8-digit OTP verification
│   └── (tabs)/
│       ├── chat.tsx             # Main chat screen (TEACH / ASK)
│       ├── history.tsx          # Conversation history + detail modal
│       └── settings.tsx         # Account, billing, legal
├── lib/
│   ├── supabase.ts             # Supabase client + Profile type
│   ├── useProfile.ts           # Shared hook — profile fetch + Realtime subscription
│   ├── iap.ts                  # RevenueCat IAP (purchase, restore, lifecycle)
│   ├── history.ts              # AsyncStorage conversation persistence
│   ├── constants.ts            # FREE_DAILY_LIMIT, pricing labels
│   └── legal.ts                # Privacy Policy + Terms of Service text
├── supabase/
│   └── functions/
│       ├── agent/              # Core chat/teach edge function (enforces tier limits)
│       ├── apple-iap/          # Activates/deactivates pro tier (RevenueCat-verified)
│       ├── revenuecat-webhook/ # Handles RevenueCat events (renewals, expirations)
│       ├── checkout/           # Legacy Stripe checkout (unused)
│       ├── stripe-webhook/     # Legacy Stripe webhook (unused)
│       └── delete-account/     # Deletes auth user
└── assets/
    └── images/
```

---

## Getting started

### Prerequisites

- Node.js 20+
- EAS CLI: `npm install -g eas-cli`
- Supabase CLI v2.95+: `brew install supabase/tap/supabase`
- An [Expo](https://expo.dev) account (for EAS builds)
- A [Supabase](https://supabase.com) project
- An [Antonlytics](https://antonlytics.com) project
- An [Anthropic](https://console.anthropic.com) API key (for Claude Haiku)
- A [RevenueCat](https://www.revenuecat.com) account with iOS products configured

### 1. Clone and install

```bash
git clone https://github.com/Voidback-Inc/slatt.git
cd slatt/slatt
npm install
```

### 2. Environment variables

EAS reads these from the `production` environment (set via `eas env:create`):

```
EXPO_PUBLIC_SUPABASE_URL          https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_KEY          your Supabase anon key
EXPO_PUBLIC_REVENUECAT_APPLE_KEY  your RevenueCat public iOS SDK key (starts with appl_)
```

### 3. Supabase setup

Create the `profiles` table and enable Realtime on it:

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'free',
  queries_today int not null default 0,
  queries_reset_date date not null default current_date,
  stripe_customer_id text,
  stripe_subscription_id text
);

-- Enable Realtime
alter publication supabase_realtime add table profiles;

-- Row Level Security
alter table profiles enable row level security;
create policy "Users can read own profile" on profiles
  for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles
  for update using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
```

### 4. Edge function secrets

In Supabase → Edge Functions → Secrets:

```
ANTONLYTICS_API_KEY        your Antonlytics API key
ANTONLYTICS_PROJECT_ID     your Antonlytics project ID
ANTHROPIC_API_KEY          your Anthropic (Claude) API key
REVENUECAT_SECRET_KEY      your RevenueCat secret key (starts with sk_)
REVENUECAT_WEBHOOK_SECRET  a secret string you set in RevenueCat → Webhooks → Authorization
SUPABASE_SERVICE_ROLE_KEY  your Supabase service role key
```

### 5. Deploy edge functions

```bash
supabase functions deploy agent
supabase functions deploy apple-iap --no-verify-jwt
supabase functions deploy revenuecat-webhook --no-verify-jwt
supabase functions deploy delete-account
```

### 6. RevenueCat webhook

In RevenueCat → Project Settings → Webhooks, add a webhook pointing to:

```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/revenuecat-webhook
```

Set the **Authorization** header to the same value you put in `REVENUECAT_WEBHOOK_SECRET`.

Enable events: `INITIAL_PURCHASE`, `RENEWAL`, `REACTIVATION`, `UNCANCELLATION`, `EXPIRATION`, `CANCELLATION`, `BILLING_ISSUE`.

### 7. RevenueCat offerings

In RevenueCat → Products, configure two products matching your App Store Connect in-app purchases:
- Monthly subscription (`$5/mo`)
- Annual subscription (`$50/yr`)

Attach them to an Offering and set the Offering as **Current**. The SDK fetches `offerings.current?.monthly` and `offerings.current?.annual` by identifier.

### 8. Run locally

```bash
npx expo start
```

Scan the QR code with Expo Go. Purchases are stubbed in Expo Go — test them on TestFlight.

---

## Building + releasing

```bash
# Production build (auto-increments build number, uses EAS env vars)
eas build --platform ios --profile production

# Submit to App Store Connect / TestFlight
eas submit --platform ios --latest
```

---

## Contributing

1. Fork the repo and create a branch: `git checkout -b feature/your-feature`
2. Make your changes — keep diffs small and focused
3. Test on a real device if touching biometrics, keyboard behaviour, or safe area layout
4. Open a PR against `main` with a clear description of what changed and why

### Code style

- All UI is React Native StyleSheet — no Tailwind in app screens
- No comments unless the *why* is non-obvious
- TypeScript strict mode — no `any` except at API boundaries
- Safe area insets via `useSafeAreaInsets()` hook inside Modals (not `SafeAreaView`, which is unreliable inside React Native's `Modal`)

---

## License

Open source — see [LICENSE](LICENSE) for details.

© 2026 Voidback, Inc.
