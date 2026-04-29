import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Platform, KeyboardAvoidingView,
  ActivityIndicator, Alert, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';

const C = {
  bg: '#000',
  surface: '#0C0C0C',
  border: 'rgba(255,255,255,0.07)',
  text: '#FFFFFF',
  muted: 'rgba(255,255,255,0.45)',
  faint: 'rgba(255,255,255,0.18)',
  blue: '#1D9BF0',
  purple: '#8B5CF6',
};

const GRAD = ['#1D9BF0', '#8B5CF6'] as const;
const GRAD_RING = ['#1D9BF0', '#8B5CF6', '#EC4899'] as const;
const GRAD_BG = ['rgba(29,155,240,0.10)', 'rgba(139,92,246,0.04)', 'transparent'] as const;

const RING_SIZE = 72;
const LOGO_SIZE = RING_SIZE - 4;
const OTP_LENGTH = 8;
const RESEND_SECONDS = 60;

// ── Hidden-input OTP display ─────────────────────────────────────────────────

function OtpBoxes({
  value,
  onChange,
  onFilled,
}: {
  value: string;
  onChange: (v: string) => void;
  onFilled: (value: string) => void;
}) {
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, []);

  const handleChange = (text: string) => {
    const cleaned = text.replace(/\D/g, '').slice(0, OTP_LENGTH);
    onChange(cleaned);
    if (cleaned.length === OTP_LENGTH) onFilled(cleaned);
  };

  return (
    <TouchableOpacity
      onPress={() => inputRef.current?.focus()}
      activeOpacity={1}
      style={box.row}
    >
      {Array.from({ length: OTP_LENGTH }).map((_, i) => {
        const filled = i < value.length;
        const active = i === value.length;
        return (
          <View
            key={i}
            style={[
              box.cell,
              filled && box.cellFilled,
              active && box.cellActive,
            ]}
          >
            {filled ? (
              <Text style={box.digit}>{value[i]}</Text>
            ) : (
              active && <View style={box.cursor} />
            )}
          </View>
        );
      })}

      {/* Hidden real input */}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        keyboardType="number-pad"
        maxLength={OTP_LENGTH}
        caretHidden
        style={box.hidden}
      />
    </TouchableOpacity>
  );
}

const box = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    position: 'relative',
  },
  cell: {
    width: 34,
    height: 52,
    borderRadius: 10,
    backgroundColor: '#0C0C0C',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellFilled: {
    borderColor: 'rgba(139,92,246,0.7)',
    backgroundColor: 'rgba(139,92,246,0.06)',
  },
  cellActive: {
    borderColor: '#1D9BF0',
    backgroundColor: 'rgba(29,155,240,0.06)',
  },
  digit: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0,
  },
  cursor: {
    width: 2,
    height: 24,
    borderRadius: 1,
    backgroundColor: '#1D9BF0',
  },
  hidden: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
    top: 0,
    left: 0,
  },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function VerifyScreen() {
  const router = useRouter();
  const { email, type } = useLocalSearchParams<{ email: string; type: string }>();

  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const verify = useCallback(async (code: string) => {
    if (code.length !== OTP_LENGTH || loading) return;
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: (type as 'signup' | 'email_change' | 'email') ?? 'signup',
    });
    setLoading(false);

    if (error) {
      Alert.alert('Invalid code', 'That code is wrong or expired. Try again or resend.');
      setOtp('');
    }
    // On success AuthGate in _layout.tsx auto-navigates to /(tabs)/chat
  }, [email, type, loading]);

  const resend = async () => {
    if (resendLoading || cooldown > 0) return;
    setResendLoading(true);
    const { error } = await supabase.auth.resend({
      type: (type as 'signup' | 'email_change') ?? 'signup',
      email,
    });
    // Note: 'email' (magic link) type cannot be resent via resend(); the button stays hidden for that flow
    setResendLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setOtp('');
      setCooldown(RESEND_SECONDS);
    }
  };

  const maskedEmail = email
    ? email.replace(/(.{2}).+(@.+)/, '$1•••$2')
    : '';

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

        {/* ── Back button ── */}
        <TouchableOpacity style={s.back} onPress={() => router.back()}>
          <ChevronLeft size={22} color={C.muted} strokeWidth={2} />
        </TouchableOpacity>

        {/* ── Content ── */}
        <View style={s.content}>

          {/* Small logo */}
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

          <Text style={s.title}>Check your email</Text>
          <Text style={s.subtitle}>
            We sent an 8-digit code to{'\n'}
            <Text style={s.emailHighlight}>{maskedEmail}</Text>
          </Text>

          {/* OTP boxes */}
          <View style={s.otpWrap}>
            <OtpBoxes
              value={otp}
              onChange={setOtp}
              onFilled={verify}
            />
          </View>

          {/* Verify button */}
          <TouchableOpacity
            onPress={() => verify(otp)}
            disabled={otp.length < OTP_LENGTH || loading}
            activeOpacity={0.84}
            style={s.btnOuter}
          >
            <LinearGradient
              colors={otp.length === OTP_LENGTH ? GRAD : (['#141414', '#141414'] as const)}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={s.btn}
            >
              {loading
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={[s.btnText, otp.length < OTP_LENGTH && s.btnTextDim]}>
                    Verify
                  </Text>}
            </LinearGradient>
          </TouchableOpacity>

          {/* Resend — only for signup / email_change flows */}
          {type !== 'email' && (
            <View style={s.resendRow}>
              <Text style={s.resendTxt}>Didn't get a code? </Text>
              <TouchableOpacity
                onPress={resend}
                disabled={resendLoading || cooldown > 0}
              >
                {resendLoading
                  ? <ActivityIndicator size="small" color={C.blue} />
                  : (
                    <Text style={[s.resendLink, cooldown > 0 && s.resendLinkDisabled]}>
                      {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                    </Text>
                  )}
              </TouchableOpacity>
            </View>
          )}

        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  back: {
    paddingTop: Platform.OS === 'ios' ? 8 : 16,
    paddingHorizontal: 20,
    paddingBottom: 8,
    alignSelf: 'flex-start',
  },

  content: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -40,
  },

  ring: {
    width: RING_SIZE, height: RING_SIZE, borderRadius: 20,
    padding: 2.5, marginBottom: 28,
    alignItems: 'center', justifyContent: 'center',
  },
  ringInner: {
    width: LOGO_SIZE, height: LOGO_SIZE, borderRadius: 17.5,
    backgroundColor: '#000', overflow: 'hidden',
  },
  logoImg: { width: '100%', height: '100%' },

  title: {
    color: '#FFF', fontSize: 28, fontWeight: '800',
    letterSpacing: -0.8, marginBottom: 10, textAlign: 'center',
  },
  subtitle: {
    color: C.muted, fontSize: 15, textAlign: 'center',
    lineHeight: 22, marginBottom: 40,
  },
  emailHighlight: {
    color: '#FFF', fontWeight: '600',
  },

  otpWrap: { marginBottom: 32, width: '100%' },

  btnOuter: {
    borderRadius: 28, overflow: 'hidden',
    width: '100%', marginBottom: 24,
  },
  btn: {
    height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
  btnTextDim: { opacity: 0.3 },

  resendRow: { flexDirection: 'row', alignItems: 'center' },
  resendTxt: { color: C.muted, fontSize: 14 },
  resendLink: { color: C.blue, fontSize: 14, fontWeight: '700' },
  resendLinkDisabled: { color: C.faint },
});
