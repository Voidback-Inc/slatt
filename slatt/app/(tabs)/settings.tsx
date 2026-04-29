import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  StyleSheet, StatusBar, Animated, Platform,
  Linking, Alert, ActivityIndicator, Modal,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as LocalAuthentication from 'expo-local-authentication';
import { Image } from 'react-native';
import { ChevronDown, Shield, FileText, ExternalLink, LogOut, Trash2 } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { STRIPE_MONTHLY_LABEL, STRIPE_ANNUAL_LABEL, STRIPE_ANNUAL_SAVE } from '@/lib/constants';
import { PRIVACY_POLICY, TERMS_OF_SERVICE } from '@/lib/legal';
import type { Profile } from '@/lib/supabase';
import Logo from '@/assets/images/icon.png';

const T = {
  bg: '#000',
  bgCard: '#0F0F0F',
  bgRow: '#141414',
  accent: '#FFF',
  accentDim: 'rgba(255,255,255,0.45)',
  accentSub: 'rgba(255,255,255,0.18)',
  border: 'rgba(255,255,255,0.07)',
  pro: '#F5C842',
  danger: '#FF3B30',
  green: '#34C759',
  ask: '#1D9BF0',
};

const YEAR = '2026';
const OPENSOURCE = 'https://github.com/Voidback-Inc/slatt';

// ─────────────────────────────────────────────────────────────────────────────

function Section({ icon: Icon, title, content }: {
  icon: React.ComponentType<any>;
  title: string;
  content: string;
}) {
  const [open, setOpen] = useState(false);
  const rotAnim = useRef(new Animated.Value(0)).current;

  const toggle = () => {
    Animated.spring(rotAnim, {
      toValue: open ? 0 : 1,
      useNativeDriver: true, damping: 14, stiffness: 160,
    }).start();
    setOpen(v => !v);
  };

  const rotate = rotAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  return (
    <View style={s.sectionWrap}>
      <TouchableOpacity style={s.sectionHeader} onPress={toggle} activeOpacity={0.75}>
        <View style={s.sectionIconWrap}>
          <Icon size={18} color={T.accent} strokeWidth={1.8} />
        </View>
        <Text style={s.sectionTitle}>{title}</Text>
        <Animated.View style={{ transform: [{ rotate }] }}>
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

function Badge({ label, color }: { label: string; color?: string }) {
  return (
    <View style={[s.badge, color && { borderColor: color + '40', backgroundColor: color + '12' }]}>
      <Text style={[s.badgeTxt, color && { color }]}>{label}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string>('');
  const [upgradeLoading, setUpgradeLoading] = useState<'monthly' | 'annual' | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [deleteStep, setDeleteStep] = useState<'otp' | null>(null);
  const [deleteOtp, setDeleteOtp] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [changePwStep, setChangePwStep] = useState<'otp' | 'newPassword' | null>(null);
  const [changePwOtp, setChangePwOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changePwLoading, setChangePwLoading] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setEmail(user.email ?? '');
    const { data } = await supabase
      .from('profiles')
      .select('id, tier, queries_today, queries_reset_date, stripe_customer_id, stripe_subscription_id')
      .eq('id', user.id)
      .single();
    if (data) setProfile(data as Profile);
  };

  const handleUpgrade = async (plan: 'monthly' | 'annual') => {
    setUpgradeLoading(plan);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        Alert.alert('Not signed in', 'Please sign in again.');
        return;
      }
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/checkout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ plan }),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        Alert.alert('Upgrade failed', json.error ?? `Server error ${res.status}`);
        return;
      }
      if (!json.url) {
        Alert.alert('Upgrade failed', 'No checkout URL returned. Stripe secrets may not be configured.');
        return;
      }
      await WebBrowser.openBrowserAsync(json.url);
      await loadProfile();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to start checkout');
    } finally {
      setUpgradeLoading(null);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    setSigningOut(false);
  };

  const runDeleteFlow = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware && !isEnrolled) {
        Alert.alert('Authentication required', 'No Face ID or passcode is set up on this device. Go to Settings → Face ID & Passcode to configure authentication first.');
        return;
      }
      const biometric = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Confirm identity to delete account',
        disableDeviceFallback: false,
        cancelLabel: 'Cancel',
      });
      if (!biometric.success) {
        const errorCode = (biometric as any).error as string | undefined;
        if (errorCode === 'UserCancel' || errorCode === 'SystemCancel') return;
        Alert.alert('Verification failed', 'Authentication was not successful. Please try again.');
        return;
      }
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });
      if (error) { Alert.alert('Error', error.message); return; }
      setDeleteOtp('');
      setDeleteStep('otp');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  };

  const handleDeleteAccount = () => {
    if (!email) {
      Alert.alert('Error', 'Could not load your account details. Please restart the app and try again.');
      return;
    }
    Alert.alert(
      'Delete Account',
      isPro
        ? 'Your subscription will be cancelled immediately. No refund will be issued.\n\nAll your data will be permanently deleted. This cannot be undone.'
        : 'All your data will be permanently deleted. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', style: 'destructive', onPress: () => { void runDeleteFlow(); } },
      ],
    );
  };

  const confirmDeleteWithOtp = async () => {
    if (deleteOtp.length !== 8 || deleteLoading) return;
    setDeleteLoading(true);
    try {
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        email,
        token: deleteOtp,
        type: 'email',
      });
      if (verifyErr) { Alert.alert('Invalid code', verifyErr.message); return; }

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`,
        { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token}` } },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        Alert.alert('Error', (j as any).error ?? 'Failed to delete account.');
        return;
      }
      // AuthGate will redirect to login after signOut
      await supabase.auth.signOut();
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!email) return;
    setChangePwLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });
      if (error) { Alert.alert('Error', error.message); return; }
      setChangePwOtp('');
      setNewPassword('');
      setConfirmPassword('');
      setChangePwStep('otp');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to send code. Try again.');
    } finally {
      setChangePwLoading(false);
    }
  };

  const confirmChangePwOtp = async () => {
    if (changePwOtp.length !== 8 || changePwLoading) return;
    setChangePwLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: changePwOtp,
        type: 'email',
      });
      if (error) { Alert.alert('Invalid code', error.message); return; }
      setChangePwStep('newPassword');
    } finally {
      setChangePwLoading(false);
    }
  };

  const submitNewPassword = async () => {
    if (newPassword.length < 8) {
      Alert.alert('Too short', 'Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', "Passwords don't match.");
      return;
    }
    setChangePwLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) { Alert.alert('Error', error.message); return; }
      setChangePwStep(null);
      Alert.alert('Done', 'Password updated successfully.');
    } finally {
      setChangePwLoading(false);
    }
  };

  const handleOpenSource = async () => {
    if (await Linking.canOpenURL(OPENSOURCE)) {
      await Linking.openURL(OPENSOURCE);
    }
  };

  const isPro = profile?.tier === 'pro';

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <StatusBar barStyle="light-content" />
      <View style={s.header} />

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>

        {/* App identity card */}
        <View style={s.appCard}>
          <View style={s.appIconWrap}>
            <Image source={Logo} style={{ width: '100%', height: '100%' }} />
          </View>
          <Text style={s.appName}>slatt</Text>
          <Text style={s.appMaker}>by Voidback, Inc.</Text>
          <View style={s.badgeRow}>
            <Badge label="Collective Intelligence" />
            <Badge label="Open Source" />
            {isPro && <Badge label="Pro" color={T.pro} />}
          </View>
        </View>

        {/* Blurb */}
        <View style={s.blurbCard}>
          <Text style={s.blurbText}>
            slatt is a collective intelligence that grows as people teach it. Think of it as an ever-wise person who never forgets anything and learns from everyone — but stays objective. Everything you ask is either rigorously fact-checked or drawn from real anecdotal experience across multiple contributors.
          </Text>
        </View>

        {/* Account */}
        <View style={s.group}>
          <Text style={s.groupLabel}>Account</Text>
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Email</Text>
            <Text style={s.infoValue} numberOfLines={1}>{email || '—'}</Text>
          </View>
          <View style={s.divider} />
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Plan</Text>
            <Text style={[s.infoValue, { color: isPro ? T.pro : T.accentDim }]}>
              {isPro ? 'Pro' : 'Free'}
            </Text>
          </View>
          <View style={s.divider} />
          <TouchableOpacity style={s.infoRow} onPress={handleChangePassword} disabled={changePwLoading}>
            <Text style={s.infoLabel}>Password</Text>
            {changePwLoading
              ? <ActivityIndicator size="small" color={T.accentDim} />
              : <Text style={[s.infoValue, { color: T.ask }]}>Change</Text>}
          </TouchableOpacity>

          {!isPro && (
            <>
              <View style={s.divider} />
              <View style={s.upgradeWrap}>
                <Text style={s.upgradeLabel}>Unlock unlimited access</Text>
                <TouchableOpacity
                  style={s.upgradeBtn}
                  onPress={() => handleUpgrade('monthly')}
                  disabled={upgradeLoading !== null}
                >
                  {upgradeLoading === 'monthly'
                    ? <ActivityIndicator color="#000" size="small" />
                    : <Text style={s.upgradeBtnText}>{STRIPE_MONTHLY_LABEL}</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.upgradeBtnSecondary}
                  onPress={() => handleUpgrade('annual')}
                  disabled={upgradeLoading !== null}
                >
                  {upgradeLoading === 'annual'
                    ? <ActivityIndicator color={T.accent} size="small" />
                    : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={s.upgradeBtnSecondaryText}>{STRIPE_ANNUAL_LABEL}</Text>
                        <View style={s.saveBadge}>
                          <Text style={s.saveBadgeText}>{STRIPE_ANNUAL_SAVE}</Text>
                        </View>
                      </View>
                    )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {/* Legal */}
        <View style={s.group}>
          <Text style={s.groupLabel}>Legal</Text>
          <Section icon={Shield} title="Privacy Policy" content={PRIVACY_POLICY} />
          <View style={s.divider} />
          <Section icon={FileText} title="Terms of Service" content={TERMS_OF_SERVICE} />
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
            <Text style={s.infoLabel}>Backend</Text>
            <Text style={s.infoValue}>Supabase · Antonlytics · Stripe</Text>
          </View>
          <View style={s.divider} />
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Analytics</Text>
            <Text style={[s.infoValue, { color: T.green }]}>None</Text>
          </View>
          <View style={s.divider} />
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Source Code</Text>
            <TouchableOpacity onPress={handleOpenSource} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={[s.infoValue, { maxWidth: 160 }]}>Open Source</Text>
              <ExternalLink size={11} color={T.accentDim} strokeWidth={2} />
            </TouchableOpacity>
          </View>
          <View style={s.divider} />
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Contact</Text>
            <Text style={s.infoValue}>legal@voidback.com</Text>
          </View>
        </View>

        {/* Sign out + Delete */}
        <View style={[s.group, { marginTop: 0, gap: 10 }]}>
          <TouchableOpacity style={s.signOutRow} onPress={handleSignOut} disabled={signingOut}>
            {signingOut
              ? <ActivityIndicator size="small" color={T.danger} />
              : (
                <>
                  <LogOut size={16} color={T.danger} strokeWidth={2} />
                  <Text style={s.signOutText}>Sign out</Text>
                </>
              )}
          </TouchableOpacity>
          <TouchableOpacity style={s.deleteRow} onPress={handleDeleteAccount}>
            <Trash2 size={15} color="rgba(255,59,48,0.5)" strokeWidth={2} />
            <Text style={s.deleteText}>Delete account</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.footer}>
          © {YEAR} Voidback, Inc. All rights reserved.{'\n'}
          slatt is provided as-is with no warranty.
        </Text>
      </ScrollView>

      {/* Change password — OTP step */}
      <Modal
        visible={changePwStep === 'otp'}
        transparent
        animationType="slide"
        onRequestClose={() => setChangePwStep(null)}
      >
        <View style={ds.overlay}>
          <View style={ds.card}>
            <View style={ds.pill} />
            <Text style={ds.title}>Verify it's you</Text>
            <Text style={ds.sub}>
              Enter the 8-digit code sent to{'\n'}
              <Text style={{ color: '#fff', fontWeight: '600' }}>{email}</Text>
            </Text>
            <TextInput
              style={ds.otpInput}
              value={changePwOtp}
              onChangeText={t => setChangePwOtp(t.replace(/\D/g, '').slice(0, 8))}
              keyboardType="number-pad"
              placeholder="00000000"
              placeholderTextColor="rgba(255,255,255,0.18)"
              maxLength={8}
              autoFocus
            />
            <TouchableOpacity
              onPress={confirmChangePwOtp}
              disabled={changePwOtp.length < 8 || changePwLoading}
              style={[ds.confirmBtn, { backgroundColor: T.ask }, changePwOtp.length < 8 && { opacity: 0.4 }]}
              activeOpacity={0.82}
            >
              {changePwLoading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={ds.confirmText}>Continue</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setChangePwStep(null)} style={ds.cancel}>
              <Text style={ds.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Change password — new password step */}
      <Modal
        visible={changePwStep === 'newPassword'}
        transparent
        animationType="slide"
        onRequestClose={() => setChangePwStep(null)}
      >
        <View style={ds.overlay}>
          <View style={ds.card}>
            <View style={ds.pill} />
            <Text style={ds.title}>New password</Text>
            <Text style={ds.sub}>Choose a strong password — at least 8 characters.</Text>
            <View style={pw2.inputWrap}>
              <TextInput
                style={pw2.input}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="New password"
                placeholderTextColor="rgba(255,255,255,0.18)"
                secureTextEntry={!showNewPw}
                autoFocus
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowNewPw(v => !v)} style={pw2.eye}>
                <Text style={pw2.eyeText}>{showNewPw ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>
            <View style={[pw2.inputWrap, { marginBottom: 20 }]}>
              <TextInput
                style={pw2.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm password"
                placeholderTextColor="rgba(255,255,255,0.18)"
                secureTextEntry={!showConfirmPw}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowConfirmPw(v => !v)} style={pw2.eye}>
                <Text style={pw2.eyeText}>{showConfirmPw ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={submitNewPassword}
              disabled={newPassword.length < 8 || newPassword !== confirmPassword || changePwLoading}
              style={[ds.confirmBtn, { backgroundColor: T.ask }, (newPassword.length < 8 || newPassword !== confirmPassword) && { opacity: 0.4 }]}
              activeOpacity={0.82}
            >
              {changePwLoading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={ds.confirmText}>Update password</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setChangePwStep(null)} style={ds.cancel}>
              <Text style={ds.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Delete account OTP modal */}
      <Modal
        visible={deleteStep === 'otp'}
        transparent
        animationType="slide"
        onRequestClose={() => setDeleteStep(null)}
      >
        <View style={ds.overlay}>
          <View style={ds.card}>
            <View style={ds.pill} />
            <Text style={ds.title}>Confirm deletion</Text>
            <Text style={ds.sub}>
              Enter the 8-digit code sent to{'\n'}
              <Text style={{ color: '#fff', fontWeight: '600' }}>{email}</Text>
            </Text>
            <TextInput
              style={ds.otpInput}
              value={deleteOtp}
              onChangeText={t => setDeleteOtp(t.replace(/\D/g, '').slice(0, 8))}
              keyboardType="number-pad"
              placeholder="00000000"
              placeholderTextColor="rgba(255,255,255,0.18)"
              maxLength={8}
              autoFocus
            />
            <TouchableOpacity
              onPress={confirmDeleteWithOtp}
              disabled={deleteOtp.length < 8 || deleteLoading}
              style={[ds.confirmBtn, deleteOtp.length < 8 && { opacity: 0.4 }]}
              activeOpacity={0.82}
            >
              {deleteLoading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={ds.confirmText}>Delete my account permanently</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setDeleteStep(null)} style={ds.cancel}>
              <Text style={ds.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header: {
    paddingTop: Platform.OS === 'ios' ? 64 : 32,
    paddingBottom: 4,
  },
  appCard: {
    alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24,
  },
  appIconWrap: {
    width: 80, height: 80, borderRadius: 22,
    backgroundColor: '#111', borderWidth: 1, borderColor: T.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
    overflow: 'hidden',
  },
  appName: { color: T.accent, fontSize: 22, fontWeight: '700', letterSpacing: 0.3, marginBottom: 4 },
  appMaker: { color: T.accentDim, fontSize: 13, letterSpacing: 0.3, marginBottom: 16 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  badge: {
    backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: StyleSheet.hairlineWidth, borderColor: T.border,
  },
  badgeTxt: { color: T.accentDim, fontSize: 11, fontWeight: '600', letterSpacing: 0.4 },

  blurbCard: {
    marginHorizontal: 20, marginBottom: 28,
    backgroundColor: T.bgCard, borderRadius: 12, padding: 18,
    borderWidth: StyleSheet.hairlineWidth, borderColor: T.border,
  },
  blurbText: { color: T.accentDim, fontSize: 13, lineHeight: 20, letterSpacing: 0.2 },

  group: { marginHorizontal: 20, marginBottom: 28 },
  groupLabel: {
    color: T.accentDim, fontSize: 11, fontWeight: '700',
    letterSpacing: 1.2, textTransform: 'uppercase',
    marginBottom: 10, marginLeft: 4,
  },

  sectionWrap: {
    backgroundColor: T.bgCard, borderRadius: 12, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: T.border,
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
  sectionTitle: { flex: 1, color: T.accent, fontSize: 14, fontWeight: '600' },
  sectionBody: {
    paddingHorizontal: 16, paddingBottom: 20, paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: T.border,
  },
  sectionText: {
    color: T.accentDim, fontSize: 12, lineHeight: 19, letterSpacing: 0.15,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 13, paddingHorizontal: 16,
    backgroundColor: T.bgCard,
  },
  infoLabel: { color: T.accentDim, fontSize: 13 },
  infoValue: { color: T.accent, fontSize: 13, fontWeight: '500', maxWidth: '55%', textAlign: 'right' },

  divider: {
    height: StyleSheet.hairlineWidth, backgroundColor: T.border, marginLeft: 16,
  },

  upgradeWrap: {
    backgroundColor: T.bgCard, padding: 16, gap: 10,
  },
  upgradeLabel: {
    color: T.accentDim, fontSize: 13, marginBottom: 2,
  },
  upgradeBtn: {
    backgroundColor: T.accent, borderRadius: 10,
    paddingVertical: 13, alignItems: 'center',
  },
  upgradeBtnText: { color: '#000', fontSize: 14, fontWeight: '700' },
  upgradeBtnSecondary: {
    borderRadius: 10, paddingVertical: 13, alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: T.border,
    flexDirection: 'row', justifyContent: 'center',
  },
  upgradeBtnSecondaryText: { color: T.accent, fontSize: 14, fontWeight: '600' },
  saveBadge: {
    backgroundColor: 'rgba(245,200,66,0.15)', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  saveBadgeText: { color: T.pro, fontSize: 10, fontWeight: '700' },

  signOutRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: T.bgCard, borderRadius: 12,
    paddingVertical: 15,
    borderWidth: StyleSheet.hairlineWidth, borderColor: T.border,
  },
  signOutText: { color: T.danger, fontSize: 14, fontWeight: '600' },

  footer: {
    color: 'rgba(255,255,255,0.18)', fontSize: 11,
    textAlign: 'center', lineHeight: 18,
    marginTop: 8, paddingHorizontal: 40,
  },
  deleteRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: 'rgba(255,59,48,0.04)', borderRadius: 12,
    paddingVertical: 13,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,59,48,0.15)',
  },
  deleteText: { color: 'rgba(255,59,48,0.6)', fontSize: 14, fontWeight: '600' },
});

// ── Delete account OTP modal styles ──────────────────────────────────────────

const ds = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
  card: {
    backgroundColor: '#0D0D0D', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 28, paddingTop: 14,
    borderWidth: StyleSheet.hairlineWidth, borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  pill: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)', alignSelf: 'center', marginBottom: 24 },
  title: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: -0.4, marginBottom: 10 },
  sub: { color: 'rgba(255,255,255,0.45)', fontSize: 14, lineHeight: 22, marginBottom: 24, textAlign: 'center' },
  otpInput: {
    backgroundColor: '#111', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    height: 56, textAlign: 'center',
    color: '#fff', fontSize: 24, fontWeight: '700', letterSpacing: 8,
    marginBottom: 16,
  },
  confirmBtn: {
    backgroundColor: '#FF3B30', borderRadius: 14,
    height: 54, alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  confirmText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancel: { alignItems: 'center', paddingVertical: 14 },
  cancelText: { color: 'rgba(255,255,255,0.45)', fontSize: 14 },
});

const pw2 = StyleSheet.create({
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#111', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    height: 56, marginBottom: 12, paddingHorizontal: 16,
  },
  input: {
    flex: 1, color: '#fff', fontSize: 15,
    autoCapitalize: 'none',
  } as any,
  eye: { paddingLeft: 12 },
  eyeText: { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '600' },
});
