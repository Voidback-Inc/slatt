# slatt v1.0.6 — Build 4

Release date: 2026-04-29  
Platform: iOS (App Store)  
EAS Profile: production

---

## What's new

### Chat
- **Long-press to copy** — hold any message to share or copy its text via the native share sheet
- **Retry on network failure** — error messages now show a retry button that restores your last message and resends it
- **Clickable URLs** — links returned by slatt are tappable and open in the browser
- **Fixed input position** — the text area now sits flush above the tab bar with no unnecessary gap

### History
- **View past conversations** — tap any history item to open the full conversation in a modal
- **Continue from history** — pick up any conversation where you left off; the chat screen resumes with full context
- **Credit gate** — free users who have reached their daily limit see an upgrade prompt instead of the continue button

### Authentication
- **OTP-only password reset** — "Forgot password" now sends an 8-digit OTP (consistent with the rest of the auth flow) instead of a magic link

### Settings
- **Delete account** — users can permanently delete their account via Face ID confirmation + OTP verification. Pro users see a no-refund warning. Stripe subscription is cancelled automatically on deletion.
- **Privacy policy & terms** — expandable inline in settings

### Infrastructure
- `delete-account` Supabase Edge Function deployed — cancels Stripe subscription then deletes the auth user via service role
- `expo-local-authentication` plugin added to `app.json` — registers `NSFaceIDUsageDescription` in `Info.plist` so Face ID works correctly on iOS
- Removed 15 unused dependencies (gluestack, legend-state, expo-av, expo-camera, expo-gl, and more)

---

## Credits ring & Pro badge

Free users see a colour-coded circular progress ring showing remaining daily queries (green → amber → red). Pro users see a gold gradient "⚡ PRO" badge instead.

---

## Bug fixes

- Fixed GluestackUIProvider removed, replaced with plain `View` — no more import crash on fresh installs
- Fixed `expo-local-authentication` missing from `app.json` plugins — Face ID now works correctly for account deletion
- Fixed history modal content overflowing on devices with long messages — `ScrollView` is now properly bounded with `flex: 1`
- Fixed "forgot password" routing to OTP verify screen with correct `type=email` param
- Settings image now uses native `Image` component (no more gluestack dependency)
