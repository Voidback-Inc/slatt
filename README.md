<div align="center">

<img src="slatt/assets/images/icon.png" style="width: 100px; border-radius: 20px;" class="rounded-xl" alt="slatt" />

# slatt

**Your camera. No one else's.**

An open-source iOS camera vault for all those wild nights —
shoot freely, lock privately, share nothing.

![Open Source](https://img.shields.io/badge/Open%20Source-yes-30d158?style=flat-square&labelColor=0e0e0e)
![No Internet](https://img.shields.io/badge/Internet-none-30d158?style=flat-square&labelColor=0e0e0e)
![No Analytics](https://img.shields.io/badge/Analytics-none-30d158?style=flat-square&labelColor=0e0e0e)
![Auth](https://img.shields.io/badge/Auth-Face%20ID%20Only-white?style=flat-square&labelColor=0e0e0e)
![Platform](https://img.shields.io/badge/Platform-iOS-white?style=flat-square&labelColor=0e0e0e)
![Version](https://img.shields.io/badge/Version-1.0.4-555?style=flat-square&labelColor=0e0e0e)

</div>

---

## What is slatt?

slatt is a private camera app. You shoot photos and videos. They go into a biometric-locked vault on your device. They never leave unless you say so — and even then, you have to prove it's you again.

No cloud. No backup. No trail. No account. No internet connection of any kind, ever.

> *An open-source iOS app that aims to be the perfect vault for all those wild nights — you don't have to worry about accidentally sharing pictures or videos.*

---

## Features

### 🔒 Vault — Face ID Only, No Exceptions

The vault enforces biometric authentication every single time it opens. Passcode fallback is **permanently disabled** — `disableDeviceFallback: true` is hardcoded and the fallback button is hidden entirely. If the device has no enrolled biometrics, the vault shows a clear message directing you to Settings. There is no workaround.

### 📷 Camera

- **Tap** the shutter → take a photo
- **Hold** the shutter → record video (up to 60 seconds)
- **Slide up** during recording → zoom
- **Double-tap the viewfinder** with a second finger → flip cameras without stopping recording
- Front camera uses a software white-screen flash. Back camera uses the hardware LED torch during active recording only — never during photo standby.

### 🌀 60-Second Recording Ring

A progress arc grows clockwise around the shutter ring, filling completely at the 60-second mark. No timers, no numbers — just a clean visual indicator.

### 🗂️ Private Vault Gallery

- **All / Photos / Videos** tab bar
- 3-column flush grid, sorted newest first
- Tap any item → full-screen lightbox
- **Photos**: swipe down to dismiss, double-tap to zoom 2.2×, single tap to toggle toolbar
- **Videos**: custom player with scrubber, play/pause, mute toggle — no native controls
- Long-press any item → multi-select → bulk delete with confirmation

### 📤 Export to Photos — Re-Auth Required

Saving media back to your Camera Roll requires a **second Face ID confirmation** with its own purpose string. Accidental exports are impossible by design.

### 🛡️ On-Device Storage

Media is stored in the app's private `documentDirectory` with a cryptographically random UUID filename. On iOS this is protected by **iOS Data Protection** (AES-256 backed by the Secure Enclave) — files are inaccessible when the device is locked.

### 🌑 Zero Network Access

No APIs. No SDKs that phone home. No crash reporters. No analytics. No advertising. slatt does not make a single network request under any circumstance.

---

## What slatt does not do

| | |
|---|---|
| ✗ | Collect your data — not even anonymously |
| ✗ | Connect to the internet — not even for crash reports |
| ✗ | Allow passcode fallback to unlock the vault |
| ✗ | Upload your photos or videos anywhere, ever |
| ✗ | Require an account, email, or sign-in |
| ✗ | Show ads or track your behaviour |
| ✓ | All of the above — enforced in open-source code you can read |

---

## Tech Stack

Built on **Expo managed workflow**. Zero native dependencies. No ejecting required.

| Package | Purpose |
|---|---|
| `expo-camera` | Photo and video capture |
| `expo-video` | Custom video playback |
| `expo-file-system` | Sandboxed on-device storage |
| `expo-crypto` | UUID filename generation |
| `expo-local-authentication` | Face ID / Touch ID enforcement |
| `expo-media-library` | Export to Camera Roll (re-auth gated) |
| `expo-video-thumbnails` | Video thumbnail generation in gallery |
| `react-native-gesture-handler` | Pinch-zoom, double-tap, swipe-dismiss |
| `react-native-svg` | 60-second recording progress ring |
| `lucide-react-native` | Icons |

---

## Getting Started

```bash
# clone
git clone https://github.com/voidback/slatt
cd slatt

# install
npm install

# install expo deps
npx expo install \
  expo-camera expo-video expo-file-system expo-crypto \
  expo-local-authentication expo-media-library expo-video-thumbnails \
  react-native-gesture-handler react-native-svg lucide-react-native

# start
npx expo start
```

---

## Building for the App Store

```bash
# build
eas build --platform ios --profile production

# submit
eas submit --platform ios --latest
```

---

## Permissions

All permission strings clearly explain the purpose and confirm data never leaves the device.

```json
{
  "cameraPermission": "slatt uses your camera to capture photos and videos. Everything you shoot is stored privately on your device and is never uploaded, shared, or sent anywhere.",
  "microphonePermission": "slatt uses your microphone to record audio with videos. Audio is stored only on your device and is never uploaded, shared, or sent anywhere.",
  "NSFaceIDUsageDescription": "slatt uses Face ID to protect your private vault. Your media stays on-device and is never uploaded.",
  "NSPhotoLibraryAddUsageDescription": "slatt saves media to your Photos library only when you explicitly choose to export from the vault. No data is uploaded."
}
```

---

## Legal

slatt is fully open source. Inspect every line of code to verify the claims made here.

**Voidback, Inc.**
Incorporated in the State of Delaware, 2026
legal@voidback.com

---

<div align="center">

<img class="rounded-xl" src="slatt/assets/images/icon.png" style="width: 64px; border-radius: 20px;" alt="slatt" />

slatt &nbsp;·&nbsp; Voidback, Inc. &nbsp;·&nbsp; Delaware 2026

*No data collected &nbsp;·&nbsp; No internet &nbsp;·&nbsp; Open source*

</div>
