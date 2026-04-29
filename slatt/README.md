# slatt — Collective Intelligence

<p align="center">
  <img src="./assets/images/icon.png" width="100" style="border-radius:22px" />
</p>

**slatt** is a mobile app that lets people teach a shared AI agent and ask it anything. It grows smarter as contributors add knowledge, and it stays objective by fact-checking claims, labelling anecdotal experiences, and citing sources.

Built by **Datou** at [Voidback, Inc.](https://github.com/Voidback-Inc)

---

## How it works

- **TEACH mode** — you share something you know. The agent evaluates it (AI fact-check + quality gate), optionally asks for a source, then ingests it into a shared knowledge graph.
- **ASK mode** — you ask anything. The agent answers using its collective knowledge plus its own pre-trained knowledge, citing sources and flagging anecdotal content when relevant.
- **Anecdotal experiences** — personal accounts are stored with an `[ANECDOTAL EXPERIENCE]` tag. When surfaced, the agent always makes clear it's one person's story and gives an honest truth analysis.

---

## Features (v1.0.6)

### Chat
- TEACH / ASK modes with a shared collective knowledge graph
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
- **Change password** — sends an OTP to your email, then lets you set a new password
- **Delete account** — Face ID / passcode confirmation + OTP verification; Pro users see a no-refund warning; Stripe subscription is cancelled automatically
- Privacy policy and terms of service expandable inline

### Auth
- OTP-only sign-in, sign-up, and password reset (no magic links)

---

## Stack

| Layer | Technology |
|---|---|
| App | React Native + Expo 54 (managed workflow) |
| Routing | Expo Router v5 (file-based) |
| Auth | Supabase Auth (OTP email) |
| Database | Supabase Postgres (`profiles` table) |
| AI backend | Antonlytics v2 (collective knowledge graph) |
| AI evaluation | Claude Haiku (Anthropic API) — pre-flight teach gate |
| Subscriptions | Stripe Checkout + webhooks |
| Edge functions | Supabase Edge Functions (Deno) |
| Biometrics | expo-local-authentication (Face ID + passcode fallback) |
| Styling | React Native StyleSheet |

---

## Project structure

```
slatt/
├── app/
│   ├── _layout.tsx              # Root layout + AuthGate
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
│   ├── history.ts              # AsyncStorage conversation persistence
│   ├── constants.ts            # FREE_DAILY_LIMIT, Stripe labels
│   └── legal.ts                # Privacy Policy + Terms of Service text
├── supabase/
│   └── functions/
│       ├── agent/              # Core chat/teach edge function
│       ├── checkout/           # Stripe Checkout session creator
│       ├── stripe-webhook/     # Stripe event handler (tier updates)
│       └── delete-account/     # Cancels Stripe sub + deletes auth user
└── assets/
    └── images/
```

---

## Getting started

### Prerequisites

- Node.js 20+
- Expo CLI: `npm install -g expo-cli`
- EAS CLI: `npm install -g eas-cli`
- Supabase CLI v2.95+: `brew install supabase/tap/supabase`
- Deno 2.7+: `brew install deno`
- An [Expo](https://expo.dev) account (for EAS builds)
- A [Supabase](https://supabase.com) project
- An [Antonlytics](https://antonlytics.com) project
- An [Anthropic](https://console.anthropic.com) API key (for Claude Haiku)
- A [Stripe](https://stripe.com) account with two prices (monthly + annual)

### 1. Clone and install

```bash
git clone https://github.com/Voidback-Inc/slatt.git
cd slatt
npm install
```

### 2. Environment variables

Create `.env.local`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Supabase setup

In your Supabase project, create the `profiles` table:

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'free',
  queries_today int not null default 0,
  queries_reset_date date not null default current_date,
  stripe_customer_id text,
  stripe_subscription_id text
);

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

Enable Row Level Security and add a policy allowing users to read/update their own row.

### 4. Edge function secrets

In Supabase → Edge Functions → Secrets, set:

```
ANTONLYTICS_API_KEY       your Antonlytics API key
ANTONLYTICS_PROJECT_ID    your Antonlytics project ID
ANTHROPIC_API_KEY         your Anthropic (Claude) API key
STRIPE_SECRET_KEY         your Stripe secret key
STRIPE_MONTHLY_PRICE_ID   Stripe price ID for $20/month plan
STRIPE_ANNUAL_PRICE_ID    Stripe price ID for $18/month annual plan
STRIPE_WEBHOOK_SECRET     your Stripe webhook signing secret
SUPABASE_SERVICE_ROLE_KEY your Supabase service role key (delete-account function)
```

### 5. Deploy edge functions

The edge runtime runs with `--no-remote`, so all functions must be bundled before uploading:

```bash
# Bundle
deno bundle -o /tmp/agent.bundle.js supabase/functions/agent/index.ts

# Upload (replace TOKEN and PROJECT_REF)
curl -X PATCH \
  -H "Authorization: Bearer YOUR_SUPABASE_MANAGEMENT_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary "$(jq -n --arg body "$(cat /tmp/agent.bundle.js)" '{body: $body, verify_jwt: true}')" \
  "https://api.supabase.com/v1/projects/YOUR_PROJECT_REF/functions/agent"
```

Repeat for `checkout`, `stripe-webhook`, and `delete-account`.

### 6. Stripe webhook

In your Stripe dashboard, create a webhook pointing to:

```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook
```

Listen for:
- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

### 7. Run locally

```bash
npx expo start
```

Scan the QR code with Expo Go, or press `i` for iOS simulator.

---

## Building + releasing

```bash
# Production build (auto-increments build number)
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
