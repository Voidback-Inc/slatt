/**
 * SettingsScreen.jsx
 *
 * Settings for slatt — owned by Voidback, Inc.
 * Two expandable sections: Privacy Policy and Terms of Service.
 */

import { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, StatusBar, Animated, Dimensions, Platform,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronDown, Shield, FileText, ExternalLink } from 'lucide-react-native';
import { Image } from '@/components/ui/image';
import Logo from '@/assets/images/icon.png';


const { width: W } = Dimensions.get('window');

const T = {
  bg: '#000',
  bgCard: '#0F0F0F',
  bgRow: '#141414',
  accent: '#FFF',
  accentDim: 'rgba(255,255,255,0.45)',
  accentSub: 'rgba(255,255,255,0.18)',
  border: 'rgba(255,255,255,0.07)',
  danger: '#FF3B30',
};

// ─────────────────────────────────────────────────────────────────────────────
// LEGAL CONTENT
// ─────────────────────────────────────────────────────────────────────────────

const COMPANY = 'Voidback, Inc.';
const STATE = 'Delaware';
const YEAR = '2026';
const APP = 'slatt';
const OPENSOURCE = "https://github.com/24greyhat/slattApp";


const PRIVACY_POLICY = `Last updated: January 1, ${YEAR}

${COMPANY} ("we," "our," or "us") operates the ${APP} mobile application (the "App"). This Privacy Policy explains how we handle information in connection with your use of the App.

1. NO DATA COLLECTION
${APP} does not collect, store, transmit, or share any personal data, usage data, analytics, crash reports, or any other information about you or your device. The App operates entirely on-device with zero network requests of any kind.

2. NO INTERNET CONNECTIVITY
The App has no API integrations, no backend servers, no third-party SDKs that phone home, no advertising networks, and no analytics frameworks. It does not connect to the internet under any circumstances.

3. YOUR MEDIA
All photos and videos you capture and save using the App are stored exclusively on your device in the App's private sandbox directory (iOS: NSApplicationSupportDirectory; Android: internal app storage). This data never leaves your device and is not accessible to any other app or service without your explicit action.

4. BIOMETRIC DATA
The App uses iOS Face ID / Touch ID or Android BiometricPrompt solely for local authentication to unlock the Media Vault. Biometric data is processed entirely by the operating system's secure enclave and is never accessed, stored, or transmitted by the App or ${COMPANY}.

5. OPEN SOURCE
The App is entirely open source. You may inspect every line of code to verify the claims in this policy. Source code is available at the repository linked in the App Store / Play Store listing.

6. CHILDREN
The App does not knowingly collect data from anyone, including children under the age of 13. Because the App collects no data at all, no special considerations for children apply.

7. CHANGES TO THIS POLICY
If we ever update this policy in a way that introduces data collection, we will prominently notify users in the App and obtain consent where legally required. Any such change would be a fundamental departure from our current architecture.

8. CONTACT
If you have questions about this Privacy Policy, contact us at:

${COMPANY}
Incorporated in the State of ${STATE}, ${YEAR}
legal@voidback.com`;

const TERMS_OF_SERVICE = `Last updated: January 1, ${YEAR}

These Terms of Service ("Terms") govern your use of the ${APP} mobile application ("App") operated by ${COMPANY} ("we," "our," "us"), a corporation incorporated in the State of ${STATE}.

1. ACCEPTANCE
By downloading or using the App, you agree to be bound by these Terms. If you do not agree, do not use the App.

2. LICENSE
Subject to these Terms, we grant you a limited, non-exclusive, non-transferable, revocable license to install and use the App on devices you own or control, solely for your personal, non-commercial purposes.

3. OPEN SOURCE
The App is released as open-source software. The applicable open-source license (see repository) governs your rights to inspect, modify, and redistribute the source code. These Terms govern your use of the compiled App as a consumer product.

4. YOUR CONTENT
You retain full ownership of all photos, videos, and other media you create using the App. We have no rights to your content. The App stores your content solely on your device and does not upload, transmit, or otherwise access it.

5. PROHIBITED CONDUCT
You agree not to:
  (a) Use the App to capture, store, or distribute content that is illegal, harmful, or violates the rights of others.
  (b) Reverse-engineer the compiled App for purposes other than those permitted by the open-source license.
  (c) Use the App in any way that violates applicable local, state, national, or international law.

6. DISCLAIMER OF WARRANTIES
THE APP IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE APP WILL BE ERROR-FREE OR UNINTERRUPTED.

7. LIMITATION OF LIABILITY
TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, ${COMPANY.toUpperCase()} AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING OUT OF OR RELATED TO YOUR USE OF THE APP, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

8. INDEMNIFICATION
You agree to indemnify and hold harmless ${COMPANY} and its affiliates from any claims, losses, or damages (including reasonable attorneys' fees) arising from your use of the App or violation of these Terms.

9. GOVERNING LAW
These Terms shall be governed by and construed in accordance with the laws of the State of ${STATE}, without regard to its conflict-of-law provisions. Any disputes shall be resolved in the courts of ${STATE}.

10. CHANGES TO TERMS
We reserve the right to modify these Terms at any time. We will notify you of material changes through the App or App Store update notes. Continued use of the App after changes constitutes acceptance.

11. CONTACT
${COMPANY}
Incorporated in the State of ${STATE}, ${YEAR}
legal@voidback.com`;

// ─────────────────────────────────────────────────────────────────────────────
// EXPANDABLE SECTION
// ─────────────────────────────────────────────────────────────────────────────

function Section({ icon: Icon, title, content, accent }) {
  const [open, setOpen] = useState(false);
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const toggle = () => {
    const toValue = open ? 0 : 1;
    Animated.spring(rotateAnim, { toValue, useNativeDriver: true, damping: 14, stiffness: 160 }).start();
    setOpen(v => !v);
  };

  const chevronRotate = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  return (
    <View style={s.sectionWrap}>
      <TouchableOpacity style={s.sectionHeader} onPress={toggle} activeOpacity={0.75}>
        <View style={[s.sectionIconWrap, accent && { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
          <Icon size={18} color={T.accent} strokeWidth={1.8} />
        </View>
        <Text style={s.sectionTitle}>{title}</Text>
        <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
          <ChevronDown size={16} color={T.accentDim} strokeWidth={2} />
        </Animated.View>
      </TouchableOpacity>

      {open && (
        <View style={s.sectionBody}>
          <Text style={s.sectionText}>{content}</Text>
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BADGE ROW
// ─────────────────────────────────────────────────────────────────────────────

function Badge({ label }) {
  return (
    <View style={s.badge}>
      <Text style={s.badgeTxt}>{label}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────

export default function SettingsScreen() {



  const handleOpenSource = async () => {
    const supported = await Linking.canOpenURL(OPENSOURCE);

    if (supported) {
      await Linking.openURL(OPENSOURCE);
    }
    else {
      Alert.alert(`Failed to open open sourc repo: ${url}`)
    }
  }



  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <StatusBar barStyle="light-content" />

      {/* Header (empty space) */}
      <View style={s.header}>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        {/* App identity card */}
        <View style={s.appCard}>
          <View style={s.appIconWrap}>
            <Image
              className="rounded-3xl w-[99%] h-[99%]"
              source={{ uri: Logo }}
              alt="logo"
            />
          </View>

          <Text style={s.appName}>slatt</Text>
          <Text style={s.appMaker}>by Voidback, Inc.</Text>
          <View style={s.badgeRow}>
            <Badge label="No Data Collected" />
            <Badge label="Open Source" />
            <Badge label="Offline Only" />
          </View>
        </View>

        {/* Commitment blurb */}
        <View style={s.blurbCard}>
          <Text style={s.blurbText}>
            slatt stores everything exclusively on your device. We have no servers, no APIs, no analytics, and no internet connection of any kind. Not even crash reports leave your phone.
          </Text>
        </View>

        {/* Legal sections */}
        <View style={s.group}>
          <Text style={s.groupLabel}>Legal</Text>
          <Section
            icon={Shield}
            title="Privacy Policy"
            content={PRIVACY_POLICY}
          />
          <View style={s.divider} />
          <Section
            icon={FileText}
            title="Terms of Service"
            content={TERMS_OF_SERVICE}
          />
        </View>

        {/* About */}
        <View style={s.group}>
          <Text style={s.groupLabel}>About</Text>
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Company</Text>
            <Text style={s.infoValue}>Voidback, Inc.</Text>
          </View>
          <View style={s.divider} />
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Incorporated</Text>
            <Text style={s.infoValue}>Delaware, {YEAR}</Text>
          </View>
          <View style={s.divider} />
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Internet Access</Text>
            <Text style={[s.infoValue, { color: '#34C759' }]}>None</Text>
          </View>
          <View style={s.divider} />
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Analytics</Text>
            <Text style={[s.infoValue, { color: '#34C759' }]}>None</Text>
          </View>
          <View style={s.divider} />
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Source Code</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <TouchableOpacity onPress={handleOpenSource}>
                <Text style={s.infoValue}>Open Source</Text>
              </TouchableOpacity>
              <ExternalLink size={11} color={T.accentDim} strokeWidth={2} />
            </View>
          </View>
          <View style={s.divider} />
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Contact</Text>
            <Text style={s.infoValue}>legal@voidback.com</Text>
          </View>
        </View>

        {/* Footer */}
        <Text style={s.footer}>
          © {YEAR} Voidback, Inc. All rights reserved.{'\n'}
          slatt is provided as-is with no warranty.
        </Text>
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 64 : 32,
    paddingBottom: 16,
  },
  headerTitle: {
    color: T.accent, fontSize: 15, fontWeight: '700', letterSpacing: 0.4,
  },

  // App card
  appCard: {
    alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24,
  },
  appIconWrap: {
    width: 80, height: 80, borderRadius: 22,
    backgroundColor: '#111', borderWidth: 1, borderColor: T.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  appIconTxt: {
    color: T.accent, fontSize: 36, fontWeight: '800', letterSpacing: -1,
  },
  appName: { color: T.accent, fontSize: 22, fontWeight: '700', letterSpacing: 0.3, marginBottom: 4 },
  appMaker: { color: T.accentDim, fontSize: 13, letterSpacing: 0.3, marginBottom: 16 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  badge: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: StyleSheet.hairlineWidth, borderColor: T.border,
  },
  badgeTxt: { color: T.accentDim, fontSize: 11, fontWeight: '600', letterSpacing: 0.4 },

  // Blurb
  blurbCard: {
    marginHorizontal: 20, marginBottom: 28,
    backgroundColor: T.bgCard, borderRadius: 12, padding: 18,
    borderWidth: StyleSheet.hairlineWidth, borderColor: T.border,
  },
  blurbText: { color: T.accentDim, fontSize: 13, lineHeight: 20, letterSpacing: 0.2 },

  // Groups
  group: {
    marginHorizontal: 20, marginBottom: 28,
  },
  groupLabel: {
    color: T.accentDim, fontSize: 11, fontWeight: '700',
    letterSpacing: 1.2, textTransform: 'uppercase',
    marginBottom: 10, marginLeft: 4,
  },

  // Expandable section
  sectionWrap: {
    backgroundColor: T.bgCard,
    borderRadius: 12, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: T.border,
    marginBottom: 0,
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 15, gap: 12,
  },
  sectionIconWrap: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: {
    flex: 1, color: T.accent, fontSize: 14, fontWeight: '600',
  },
  sectionBody: {
    paddingHorizontal: 16, paddingBottom: 20, paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: T.border,
  },
  sectionText: {
    color: T.accentDim, fontSize: 12, lineHeight: 19,
    letterSpacing: 0.15, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // Info rows
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 13, paddingHorizontal: 16,
    backgroundColor: T.bgCard,
  },
  infoLabel: { color: T.accentDim, fontSize: 13 },
  infoValue: { color: T.accent, fontSize: 13, fontWeight: '500' },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: T.border,
    marginLeft: 16,
  },

  footer: {
    color: 'rgba(255,255,255,0.18)', fontSize: 11,
    textAlign: 'center', lineHeight: 18,
    marginTop: 8, paddingHorizontal: 40,
  },
});
