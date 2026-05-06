import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Platform, KeyboardAvoidingView,
  ActivityIndicator, Alert, Image, Modal, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { t, LANGUAGES } from '@/lib/i18n';
import { useLanguage } from '@/lib/useLanguage';

const C = {
  bg: '#000',
  surface: '#0C0C0C',
  border: 'rgba(255,255,255,0.07)',
  borderFocused: 'rgba(29,155,240,0.65)',
  text: '#FFFFFF',
  muted: 'rgba(255,255,255,0.45)',
  faint: 'rgba(255,255,255,0.18)',
  placeholder: 'rgba(255,255,255,0.22)',
  blue: '#1D9BF0',
};

const GRAD = ['#1D9BF0', '#8B5CF6'] as const;
const GRAD_RING = ['#1D9BF0', '#8B5CF6', '#EC4899'] as const;
const GRAD_BG = ['rgba(29,155,240,0.13)', 'rgba(139,92,246,0.05)', 'transparent'] as const;

const RING_SIZE = 100;
const LOGO_SIZE = RING_SIZE - 6;

export default function LoginScreen() {
  const router = useRouter();
  const { lang, changeLang } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const [showLangModal, setShowLangModal] = useState(false);

  const signIn = async () => {
    if (!email.trim() || !password) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (error) {
      if (
        error.message.toLowerCase().includes('email not confirmed') ||
        error.message.toLowerCase().includes('not confirmed')
      ) {
        await supabase.auth.resend({ type: 'signup', email: email.trim() });
        router.push({
          pathname: '/(auth)/verify',
          params: { email: email.trim(), type: 'signup' },
        });
      } else {
        Alert.alert('Sign in failed', error.message);
      }
    }
  };

  const forgotPassword = async () => {
    if (!email.trim()) {
      Alert.alert(t('emailAddress'));
      return;
    }
    setResetLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    });
    setResetLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      router.push({
        pathname: '/(auth)/verify',
        params: { email: email.trim(), type: 'email' },
      });
    }
  };

  const ready = !!email.trim() && !!password && !loading;
  const currentLangLabel = LANGUAGES.find(l => l.code === lang)?.nativeName ?? 'English';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient colors={GRAD_BG} locations={[0, 0.4, 0.75]} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={s.root}>

        {/* ── Language picker button (top-right) ── */}
        <TouchableOpacity style={s.langBtn} onPress={() => setShowLangModal(true)} activeOpacity={0.7}>
          <Feather name="globe" size={13} color={C.muted} />
          <Text style={s.langBtnText}>{currentLangLabel}</Text>
          <Feather name="chevron-down" size={12} color={C.muted} />
        </TouchableOpacity>

        {/* ── Hero ── */}
        <View style={s.hero}>
          <View style={s.glowBlob} />
          <LinearGradient colors={GRAD_RING} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.ring}>
            <View style={s.ringInner}>
              <Image source={require('@/assets/images/icon.png')} style={s.logoImg} resizeMode="cover" />
            </View>
          </LinearGradient>
          <Text style={s.wordmark}>slatt</Text>
          <Text style={s.tagline}>{t('collectiveIntelligence')}</Text>
        </View>

        {/* ── Form ── */}
        <View style={s.form}>
          <View style={[s.field, focused === 'email' && s.fieldFocused]}>
            <TextInput
              style={s.input}
              value={email}
              onChangeText={setEmail}
              placeholder={t('emailAddress')}
              placeholderTextColor={C.placeholder}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              onFocus={() => setFocused('email')}
              onBlur={() => setFocused(null)}
            />
          </View>

          <View style={[s.field, focused === 'password' && s.fieldFocused]}>
            <TextInput
              style={s.input}
              value={password}
              onChangeText={setPassword}
              placeholder={t('password')}
              placeholderTextColor={C.placeholder}
              secureTextEntry
              onFocus={() => setFocused('password')}
              onBlur={() => setFocused(null)}
            />
          </View>

          <TouchableOpacity style={s.forgotRow} onPress={forgotPassword} disabled={resetLoading}>
            {resetLoading
              ? <ActivityIndicator size="small" color={C.blue} />
              : <Text style={s.forgotText}>{t('forgotPassword')}</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={signIn}
            disabled={!ready}
            activeOpacity={0.84}
            style={[s.btnOuter, !ready && { opacity: 0.35 }]}
          >
            <LinearGradient colors={GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.btn}>
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.btnText}>{t('signIn')}</Text>}
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* ── Footer ── */}
        <View style={s.footer}>
          <Text style={s.footerTxt}>{t('noAccount')}</Text>
          <Link href="/(auth)/signup" asChild>
            <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={s.footerLink}> {t('signUp')}</Text>
            </TouchableOpacity>
          </Link>
        </View>

      </SafeAreaView>

      {/* ── Language picker modal ── */}
      <Modal visible={showLangModal} transparent animationType="slide" onRequestClose={() => setShowLangModal(false)}>
        <View style={lm.overlay}>
          <View style={lm.card}>
            <View style={lm.pill} />
            <Text style={lm.title}>{t('selectLanguage')}</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              {LANGUAGES.map(l => (
                <TouchableOpacity
                  key={l.code}
                  style={lm.row}
                  onPress={() => { changeLang(l.code); setShowLangModal(false); }}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={lm.native}>{l.nativeName}</Text>
                    <Text style={lm.nameEn}>{l.name}</Text>
                  </View>
                  {lang === l.code && <View style={lm.check} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={lm.cancel} onPress={() => setShowLangModal(false)}>
              <Text style={lm.cancelText}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 28, justifyContent: 'center' },
  langBtn: {
    position: 'absolute', top: Platform.OS === 'ios' ? 56 : 16, right: 20,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)',
  },
  langBtnText: { color: C.muted, fontSize: 12, fontWeight: '500' },
  hero: { alignItems: 'center', marginBottom: 52 },
  glowBlob: { position: 'absolute', top: -20, width: 200, height: 200, borderRadius: 100, backgroundColor: 'transparent' },
  ring: { width: RING_SIZE, height: RING_SIZE, borderRadius: 26, padding: 3, marginBottom: 22, alignItems: 'center', justifyContent: 'center' },
  ringInner: { width: LOGO_SIZE, height: LOGO_SIZE, borderRadius: 23, backgroundColor: '#000', overflow: 'hidden' },
  logoImg: { width: '100%', height: '100%' },
  wordmark: { color: '#FFF', fontSize: 46, fontWeight: '900', letterSpacing: -2, lineHeight: 50, marginBottom: 8 },
  tagline: { color: C.faint, fontSize: 10, fontWeight: '600', letterSpacing: 3.5, textAlign: 'center' },
  form: { gap: 14 },
  field: {
    backgroundColor: C.surface, borderRadius: 14,
    borderWidth: 1, borderColor: C.border,
    height: 56, justifyContent: 'center', paddingHorizontal: 18,
  },
  fieldFocused: { borderColor: C.borderFocused, backgroundColor: 'rgba(29,155,240,0.04)' },
  input: { color: C.text, fontSize: 15, letterSpacing: 0.1 },
  forgotRow: { alignSelf: 'flex-end', marginTop: -4, paddingVertical: 2 },
  forgotText: { color: C.blue, fontSize: 13, fontWeight: '500' },
  btnOuter: { borderRadius: 28, overflow: 'hidden', marginTop: 4 },
  btn: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 40 },
  footerTxt: { color: C.muted, fontSize: 14 },
  footerLink: { color: C.blue, fontSize: 14, fontWeight: '700' },
});

const lm = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' },
  card: {
    backgroundColor: '#0D0D0D', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 20, paddingTop: 14,
    borderWidth: StyleSheet.hairlineWidth, borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  pill: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)', alignSelf: 'center', marginBottom: 20 },
  title: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 16 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  native: { color: '#fff', fontSize: 15, fontWeight: '600' },
  nameEn: { color: 'rgba(255,255,255,0.35)', fontSize: 12, marginTop: 1 },
  check: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1D9BF0' },
  cancel: { alignItems: 'center', paddingVertical: 16, marginTop: 4 },
  cancelText: { color: 'rgba(255,255,255,0.45)', fontSize: 14 },
});
