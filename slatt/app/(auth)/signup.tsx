import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Platform, KeyboardAvoidingView,
  ActivityIndicator, Alert, Image, ScrollView, Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { PRIVACY_POLICY, TERMS_OF_SERVICE } from '@/lib/legal';
import { t, LANGUAGES } from '@/lib/i18n';
import { useLanguage } from '@/lib/useLanguage';

const C = {
  bg: '#000',
  surface: '#0C0C0C',
  border: 'rgba(255,255,255,0.07)',
  borderFocused: 'rgba(139,92,246,0.65)',
  text: '#FFFFFF',
  muted: 'rgba(255,255,255,0.45)',
  faint: 'rgba(255,255,255,0.18)',
  placeholder: 'rgba(255,255,255,0.22)',
  blue: '#1D9BF0',
};

const GRAD = ['#1D9BF0', '#8B5CF6'] as const;
const GRAD_RING = ['#8B5CF6', '#EC4899', '#1D9BF0'] as const;
const GRAD_BG = ['rgba(139,92,246,0.12)', 'rgba(29,155,240,0.05)', 'transparent'] as const;

const RING_SIZE = 100;
const LOGO_SIZE = RING_SIZE - 6;

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  const labels = [t('strengthWeak'), t('strengthFair'), t('strengthGood'), t('strengthStrong')];
  const gradPairs: [string, string][] = [
    ['#FF453A', '#FF6B6B'],
    ['#FF9F0A', '#FFCC02'],
    ['#30D158', '#34C759'],
    ['#1D9BF0', '#8B5CF6'],
  ];
  const pair = gradPairs[Math.min(score - 1, 3)] ?? gradPairs[0];

  return (
    <View style={ps.wrap}>
      <View style={ps.bars}>
        {[0, 1, 2, 3].map(i => (
          <View key={i} style={ps.track}>
            {i < score && (
              <LinearGradient
                colors={pair}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            )}
          </View>
        ))}
      </View>
      <Text style={[ps.label, { color: pair[0] }]}>{labels[score - 1] ?? t('strengthWeak')}</Text>
    </View>
  );
}

const ps = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 2 },
  bars: { flex: 1, flexDirection: 'row', gap: 5 },
  track: {
    flex: 1, height: 3, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden',
  },
  label: { fontSize: 11, fontWeight: '700', minWidth: 38, textAlign: 'right', letterSpacing: 0.3 },
});

export default function SignupScreen() {
  const router = useRouter();
  const { lang, changeLang } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const [legalModal, setLegalModal] = useState<'terms' | 'privacy' | null>(null);
  const [showLangModal, setShowLangModal] = useState(false);

  const signUp = async () => {
    if (!email.trim() || !password || !confirm) return;
    if (password !== confirm) { Alert.alert(t('passwordsDontMatch')); return; }
    if (password.length < 8) { Alert.alert(t('passwordTooShort'), t('atLeast8Chars')); return; }

    setLoading(true);
    const { error } = await supabase.auth.signUp({ email: email.trim(), password });
    setLoading(false);

    if (error) {
      Alert.alert('Sign up failed', error.message);
    } else {
      router.push({
        pathname: '/(auth)/verify',
        params: { email: email.trim(), type: 'signup' },
      });
    }
  };

  const ready = !!email.trim() && !!password && !!confirm && !loading;
  const mismatch = confirm.length > 0 && password !== confirm;
  const match = !!confirm && password === confirm;
  const currentLangLabel = LANGUAGES.find(l => l.code === lang)?.nativeName ?? 'English';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient
        colors={GRAD_BG}
        locations={[0, 0.4, 0.75]}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={{ flex: 1 }}>
        {/* ── Language picker button (top-right) ── */}
        <TouchableOpacity style={s.langBtn} onPress={() => setShowLangModal(true)} activeOpacity={0.7}>
          <Feather name="globe" size={13} color={C.muted} />
          <Text style={s.langBtnText}>{currentLangLabel}</Text>
          <Feather name="chevron-down" size={12} color={C.muted} />
        </TouchableOpacity>

        <ScrollView
          contentContainerStyle={s.root}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Hero ── */}
          <View style={s.hero}>
            <View style={s.glowBlob} />
            <LinearGradient
              colors={GRAD_RING}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.ring}
            >
              <View style={s.ringInner}>
                <Image
                  source={require('@/assets/images/icon.png')}
                  style={s.logoImg}
                  resizeMode="cover"
                />
              </View>
            </LinearGradient>
            <Text style={s.wordmark}>slatt</Text>
            <Text style={s.tagline}>{t('createYourAccount')}</Text>
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

            {password.length > 0 && <PasswordStrength password={password} />}

            <View style={[
              s.field,
              focused === 'confirm' && s.fieldFocused,
              mismatch && s.fieldError,
              match && s.fieldValid,
            ]}>
              <TextInput
                style={s.input}
                value={confirm}
                onChangeText={setConfirm}
                placeholder={t('confirmPassword')}
                placeholderTextColor={C.placeholder}
                secureTextEntry
                onFocus={() => setFocused('confirm')}
                onBlur={() => setFocused(null)}
              />
            </View>

            {mismatch && (
              <Text style={s.errorTxt}>{t('passwordsDontMatch')}</Text>
            )}

            <TouchableOpacity
              onPress={signUp}
              disabled={!ready || mismatch}
              activeOpacity={0.84}
              style={[s.btnOuter, (!ready || mismatch) && { opacity: 0.35 }]}
            >
              <LinearGradient
                colors={GRAD}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={s.btn}
              >
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.btnText}>{t('createAccount')}</Text>}
              </LinearGradient>
            </TouchableOpacity>

            <Text style={s.legal}>
              {t('agreePrefix')}{' '}
              <Text style={s.legalLink} onPress={() => setLegalModal('terms')}>{t('termsOfService')}</Text>
              {' '}{t('agreeAnd')}{' '}
              <Text style={s.legalLink} onPress={() => setLegalModal('privacy')}>{t('privacyPolicy')}</Text>.
            </Text>
          </View>

          {/* ── Footer ── */}
          <View style={s.footer}>
            <Text style={s.footerTxt}>{t('haveAccount')}</Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={s.footerLink}> {t('signIn')}</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Legal modal */}
      <Modal visible={legalModal !== null} animationType="slide" transparent onRequestClose={() => setLegalModal(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{legalModal === 'terms' ? t('termsOfService') : t('privacyPolicy')}</Text>
              <TouchableOpacity onPress={() => setLegalModal(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={s.modalClose}>{t('done')}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={s.modalScroll} showsVerticalScrollIndicator={false}>
              <Text style={s.modalText}>
                {legalModal === 'terms' ? TERMS_OF_SERVICE : PRIVACY_POLICY}
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Language picker modal */}
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
  root: {
    paddingHorizontal: 28, paddingTop: 60, paddingBottom: 40,
    justifyContent: 'center', flexGrow: 1,
  },
  langBtn: {
    position: 'absolute', top: Platform.OS === 'ios' ? 56 : 16, right: 20,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)',
    zIndex: 10,
  },
  langBtnText: { color: C.muted, fontSize: 12, fontWeight: '500' },
  hero: { alignItems: 'center', marginBottom: 44 },
  glowBlob: {
    position: 'absolute', top: -20,
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'transparent',
  },
  ring: {
    width: RING_SIZE, height: RING_SIZE, borderRadius: 26,
    padding: 3, marginBottom: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  ringInner: {
    width: LOGO_SIZE, height: LOGO_SIZE, borderRadius: 23,
    backgroundColor: '#000', overflow: 'hidden',
  },
  logoImg: { width: '100%', height: '100%' },
  wordmark: {
    color: '#FFF', fontSize: 46, fontWeight: '900',
    letterSpacing: -2, lineHeight: 50, marginBottom: 8,
  },
  tagline: { color: C.faint, fontSize: 10, fontWeight: '600', letterSpacing: 3.5 },
  form: { gap: 14 },
  field: {
    backgroundColor: C.surface, borderRadius: 14,
    borderWidth: 1, borderColor: C.border,
    height: 56, justifyContent: 'center', paddingHorizontal: 18,
  },
  fieldFocused: { borderColor: C.borderFocused, backgroundColor: 'rgba(139,92,246,0.04)' },
  fieldError: { borderColor: 'rgba(255,69,58,0.7)', backgroundColor: 'rgba(255,69,58,0.04)' },
  fieldValid: { borderColor: 'rgba(48,209,88,0.5)' },
  input: { color: C.text, fontSize: 15, letterSpacing: 0.1 },
  errorTxt: { color: '#FF453A', fontSize: 12, marginTop: -6, marginLeft: 4 },
  btnOuter: { borderRadius: 28, overflow: 'hidden', marginTop: 4 },
  btn: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
  legal: {
    color: 'rgba(255,255,255,0.2)', fontSize: 11,
    textAlign: 'center', lineHeight: 16,
    paddingHorizontal: 8, marginTop: -2,
  },
  footer: {
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', marginTop: 36,
  },
  footerTxt: { color: C.muted, fontSize: 14 },
  footerLink: { color: C.blue, fontSize: 14, fontWeight: '700' },
  legalLink: { color: C.blue, fontSize: 11, fontWeight: '600', textDecorationLine: 'underline' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#0D0D0D', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: '85%',
    borderWidth: StyleSheet.hairlineWidth, borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modalClose: { color: C.blue, fontSize: 14, fontWeight: '600' },
  modalScroll: { flexGrow: 0 },
  modalText: {
    color: 'rgba(255,255,255,0.55)', fontSize: 11, lineHeight: 17,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    paddingBottom: 40,
  },
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
