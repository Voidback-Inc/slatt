# slatt — Collective Intelligence

**slatt** is a mobile app that lets people teach a shared AI agent and ask it anything. It grows smarter as contributors add knowledge, and it stays objective by fact-checking claims, labelling anecdotal experiences, and citing sources.

Built by **Datou** at [Voidback, Inc.](https://github.com/Voidback-Inc)

---

## How it works

- **TEACH mode** — you share something you know. The agent evaluates it (AI fact-check + quality gate), optionally asks for a source, then ingests it into a shared knowledge graph.
- **ASK mode** — you ask anything. The agent answers using its collective knowledge plus its own pre-trained knowledge, citing sources and flagging anecdotal content when relevant.
- **Anecdotal experiences** — personal accounts are stored with an `[ANECDOTAL EXPERIENCE]` tag. When surfaced, the agent always makes clear it's one person's story and gives an honest truth analysis.

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
| Styling | React Native StyleSheet + NativeWind |

---

## Project structure

```
slatt/
├── app/
│   ├── _layout.tsx          # Root layout + AuthGate
│   ├── (auth)/
│   │   ├── login.tsx
│   │   ├── signup.tsx
│   │   └── verify.tsx       # 8-digit OTP verification
│   └── (tabs)/
│       ├── chat.tsx          # Main chat screen (TEACH / ASK)
│       ├── history.tsx       # Conversation history
│       └── settings.tsx      # Account, billing, legal
├── lib/
│   ├── supabase.ts          # Supabase client + Profile type
│   ├── history.ts           # AsyncStorage conversation persistence
│   ├── constants.ts         # FREE_DAILY_LIMIT, Stripe labels
│   └── legal.ts             # Privacy Policy + Terms of Service text
├── supabase/
│   └── functions/
│       ├── agent/           # Core chat/teach edge function
│       ├── checkout/        # Stripe Checkout session creator
│       └── stripe-webhook/  # Stripe event handler (tier updates)
└── assets/
    └── images/
```

---

## Getting started

### Prerequisites

- Node.js 20+
- Expo CLI: `npm install -g expo-cli`
- Supabase CLI: `brew install supabase/tap/supabase`
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
ANTONLYTICS_API_KEY      your Antonlytics API key
ANTONLYTICS_PROJECT_ID   your Antonlytics project ID
ANTHROPIC_API_KEY        your Anthropic (Claude) API key
STRIPE_SECRET_KEY        your Stripe secret key
STRIPE_MONTHLY_PRICE_ID  Stripe price ID for $20/month plan
STRIPE_ANNUAL_PRICE_ID   Stripe price ID for $18/month annual plan
STRIPE_WEBHOOK_SECRET    your Stripe webhook signing secret
```

### 5. Deploy edge functions

```bash
npx supabase functions deploy agent --project-ref YOUR_PROJECT_REF --use-api
npx supabase functions deploy checkout --project-ref YOUR_PROJECT_REF --use-api
npx supabase functions deploy stripe-webhook --project-ref YOUR_PROJECT_REF --use-api
```

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

## Contributing

1. Fork the repo and create a branch: `git checkout -b feature/your-feature`
2. Make your changes — keep diffs small and focused
3. Test on both iOS and Android if possible
4. Open a PR against `main` with a clear description of what changed and why

### Code style

- All UI is React Native StyleSheet — no Tailwind in app screens (NativeWind is only kept for legacy gluestack compatibility)
- No comments unless the *why* is non-obvious
- TypeScript strict mode — no `any` except where unavoidable at API boundaries

### Edge functions

The edge functions run on Deno. To test locally:

```bash
npx supabase start
npx supabase functions serve agent --env-file .env.local
```

---

## License

Open source — see [LICENSE](LICENSE) for details.

© 2026 Voidback, Inc.
