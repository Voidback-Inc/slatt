import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Platform, KeyboardAvoidingView,
  ActivityIndicator, Alert, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);

  const signIn = async () => {
    if (!email.trim() || !password) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (error) {
      // Email not confirmed → resend OTP and go to verify
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
      Alert.alert('Enter your email address first');
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

      <SafeAreaView style={s.root}>

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
          <Text style={s.tagline}>COLLECTIVE INTELLIGENCE</Text>
        </View>

        {/* ── Form ── */}
        <View style={s.form}>
          <View style={[s.field, focused === 'email' && s.fieldFocused]}>
            <TextInput
              style={s.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Email address"
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
              placeholder="Password"
              placeholderTextColor={C.placeholder}
              secureTextEntry
              onFocus={() => setFocused('password')}
              onBlur={() => setFocused(null)}
            />
          </View>

          <TouchableOpacity
            style={s.forgotRow}
            onPress={forgotPassword}
            disabled={resetLoading}
          >
            {resetLoading
              ? <ActivityIndicator size="small" color={C.blue} />
              : <Text style={s.forgotText}>Forgot password?</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={signIn}
            disabled={!ready}
            activeOpacity={0.84}
            style={[s.btnOuter, !ready && { opacity: 0.35 }]}
          >
            <LinearGradient
              colors={GRAD}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={s.btn}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.btnText}>Sign in</Text>}
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* ── Footer ── */}
        <View style={s.footer}>
          <Text style={s.footerTxt}>Don't have an account?</Text>
          <Link href="/(auth)/signup" asChild>
            <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={s.footerLink}> Sign up</Text>
            </TouchableOpacity>
          </Link>
        </View>

      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1, paddingHorizontal: 28, justifyContent: 'center',
  },
  hero: { alignItems: 'center', marginBottom: 52 },
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
  tagline: {
    color: C.faint, fontSize: 10, fontWeight: '600', letterSpacing: 3.5,
  },
  form: { gap: 14 },
  field: {
    backgroundColor: C.surface, borderRadius: 14,
    borderWidth: 1, borderColor: C.border,
    height: 56, justifyContent: 'center', paddingHorizontal: 18,
  },
  fieldFocused: {
    borderColor: C.borderFocused,
    backgroundColor: 'rgba(29,155,240,0.04)',
  },
  input: { color: C.text, fontSize: 15, letterSpacing: 0.1 },
  forgotRow: { alignSelf: 'flex-end', marginTop: -4, paddingVertical: 2 },
  forgotText: { color: C.blue, fontSize: 13, fontWeight: '500' },
  btnOuter: { borderRadius: 28, overflow: 'hidden', marginTop: 4 },
  btn: {
    height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
  btnTextDim: { opacity: 0.3 },
  footer: {
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', marginTop: 40,
  },
  footerTxt: { color: C.muted, fontSize: 14 },
  footerLink: { color: C.blue, fontSize: 14, fontWeight: '700' },
});
