import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Platform, KeyboardAvoidingView,
  ActivityIndicator, Modal, Keyboard, Pressable, Linking, Share,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  FadeInDown, FadeIn,
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import * as WebBrowser from 'expo-web-browser';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { upsertConversation, consumePendingResume } from '@/lib/history';
import { FREE_DAILY_LIMIT, STRIPE_MONTHLY_LABEL, STRIPE_ANNUAL_LABEL, STRIPE_ANNUAL_SAVE } from '@/lib/constants';
import type { Profile } from '@/lib/supabase';

const T = {
  bg: '#000',
  surface: '#0C0C0C',
  border: 'rgba(255,255,255,0.07)',
  borderInput: 'rgba(255,255,255,0.10)',
  text: '#FFF',
  muted: 'rgba(255,255,255,0.45)',
  faint: 'rgba(255,255,255,0.18)',
  teach: '#34C759',
  ask: '#1D9BF0',
  pro: '#F5C842',
  errorBg: 'rgba(255,69,58,0.10)',
  errorText: '#FF6B6B',
};

const GRAD_USER: [string, string] = ['#1D9BF0', '#8B5CF6'];
const GRAD_SEND: [string, string] = ['#1D9BF0', '#8B5CF6'];
const GRAD_SEND_OFF: [string, string] = ['#161616', '#161616'];

// ── Query ring (free plan) ────────────────────────────────────────────────────

function QueryRing({ left, total, onPress }: { left: number; total: number; onPress: () => void }) {
  const size = 28;
  const stroke = 2.8;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, left) / total);
  const color = left > total * 0.5 ? '#34C759' : left > total * 0.2 ? '#FF9F0A' : '#FF453A';

  return (
    <TouchableOpacity onPress={onPress} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={`${circ}`} strokeDashoffset={`${offset}`}
          strokeLinecap="round"
        />
      </Svg>
    </TouchableOpacity>
  );
}

// ── Pro badge ─────────────────────────────────────────────────────────────────

function ProBadge() {
  return (
    <LinearGradient
      colors={['#F5C842', '#FF9F0A']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
      style={pb.wrap}
    >
      <Text style={pb.zap}>⚡</Text>
      <Text style={pb.text}>PRO</Text>
    </LinearGradient>
  );
}

const pb = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
  },
  zap: { fontSize: 9, lineHeight: 13 },
  text: { color: '#000', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
});

type Mode = 'teach' | 'ask';

type Message = {
  id: string;
  role: 'user' | 'agent';
  content: string;
  mode: Mode;
  isError?: boolean;
};

function detectMode(text: string): Mode {
  const t = text.trim();
  if (t.endsWith('?')) return 'ask';
  if (/^(what|who|where|when|why|how|which|is|are|was|were|do|does|did|can|could|should|would|tell me|show me|give me|explain|describe|list|find)/i.test(t)) return 'ask';
  return 'teach';
}

// ── Markdown renderer ────────────────────────────────────────────────────────

function parseInline(text: string, baseStyle: object): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|https?:\/\/\S+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const raw = m[0];
    if (raw.startsWith('**')) {
      parts.push(<Text key={key++} style={[baseStyle, { fontWeight: '800' }]}>{raw.slice(2, -2)}</Text>);
    } else if (raw.startsWith('*')) {
      parts.push(<Text key={key++} style={[baseStyle, { fontStyle: 'italic' }]}>{raw.slice(1, -1)}</Text>);
    } else if (raw.startsWith('`')) {
      parts.push(
        <Text key={key++} style={[baseStyle, { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13, backgroundColor: 'rgba(255,255,255,0.07)', color: '#a8ff78' }]}>
          {raw.slice(1, -1)}
        </Text>
      );
    } else {
      // URL — strip trailing punctuation that isn't part of the URL
      const url = raw.replace(/[.,;:!?)'"\]]+$/, '');
      const trailing = raw.slice(url.length);
      parts.push(
        <Text key={key++} style={[baseStyle, { color: '#1D9BF0', textDecorationLine: 'underline' }]} onPress={() => Linking.openURL(url)}>
          {url}
        </Text>
      );
      if (trailing) parts.push(trailing);
    }
    last = m.index + raw.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function MarkdownText({ text, style }: { text: string; style: object }) {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  lines.forEach((line, i) => {
    if (!line.trim()) {
      nodes.push(<View key={`sp-${i}`} style={{ height: 6 }} />);
      return;
    }
    const isBullet = /^[-•*]\s/.test(line);
    const content = isBullet ? line.replace(/^[-•*]\s+/, '') : line;
    const inline = parseInline(content, style);
    nodes.push(
      <View key={i} style={isBullet ? { flexDirection: 'row', gap: 6 } : undefined}>
        {isBullet && <Text style={[style, { marginTop: 1 }]}>•</Text>}
        <Text style={[style, isBullet && { flex: 1 }]}>{inline}</Text>
      </View>
    );
  });
  return <View style={{ gap: 2 }}>{nodes}</View>;
}

// ── Typing indicator ─────────────────────────────────────────────────────────

function TypingDots() {
  const d1 = useSharedValue(0.3);
  const d2 = useSharedValue(0.3);
  const d3 = useSharedValue(0.3);

  useEffect(() => {
    const anim = () =>
      withRepeat(
        withSequence(withTiming(1, { duration: 360 }), withTiming(0.3, { duration: 360 })),
        -1,
        false,
      );
    d1.value = anim();
    const t2 = setTimeout(() => { d2.value = anim(); }, 130);
    const t3 = setTimeout(() => { d3.value = anim(); }, 260);
    return () => { clearTimeout(t2); clearTimeout(t3); };
  }, []);

  const s1 = useAnimatedStyle(() => ({ opacity: d1.value }));
  const s2 = useAnimatedStyle(() => ({ opacity: d2.value }));
  const s3 = useAnimatedStyle(() => ({ opacity: d3.value }));

  return (
    <View style={td.row}>
      <Text style={td.label}>slatt</Text>
      <View style={td.dots}>
        <Animated.View style={[td.dot, s1]} />
        <Animated.View style={[td.dot, s2]} />
        <Animated.View style={[td.dot, s3]} />
      </View>
    </View>
  );
}

const td = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingBottom: 10,
  },
  label: { color: T.faint, fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: T.muted },
});

// ── Paywall modal ─────────────────────────────────────────────────────────────

function PaywallModal({
  visible, queriesLeft, onClose, onUpgrade, checkoutLoading,
}: {
  visible: boolean;
  queriesLeft: number;
  onClose: () => void;
  onUpgrade: (plan: 'monthly' | 'annual') => void;
  checkoutLoading: 'monthly' | 'annual' | null;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={pw.overlay}>
        <View style={pw.card}>
          <View style={pw.pill} />
          <Text style={pw.title}>Upgrade to Pro</Text>
          <Text style={pw.sub}>
            {queriesLeft === 0
              ? `You've used all ${FREE_DAILY_LIMIT} daily queries.`
              : `${queriesLeft} of ${FREE_DAILY_LIMIT} queries left today.`}
            {'\n'}Go Pro for unlimited access to the collective.
          </Text>

          <TouchableOpacity
            onPress={() => onUpgrade('monthly')}
            disabled={checkoutLoading !== null}
            activeOpacity={0.85}
            style={pw.btnOuter}
          >
            <LinearGradient colors={GRAD_SEND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={pw.btnGrad}>
              {checkoutLoading === 'monthly'
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={pw.btnTextPrimary}>{STRIPE_MONTHLY_LABEL}</Text>}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => onUpgrade('annual')}
            disabled={checkoutLoading !== null}
            activeOpacity={0.85}
            style={pw.btnOuter}
          >
            <View style={pw.btnAnnual}>
              {checkoutLoading === 'annual'
                ? <ActivityIndicator color={T.text} size="small" />
                : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={pw.btnText}>{STRIPE_ANNUAL_LABEL}</Text>
                    <View style={pw.badge}>
                      <Text style={pw.badgeText}>{STRIPE_ANNUAL_SAVE}</Text>
                    </View>
                  </View>
                )}
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={pw.dismiss} onPress={onClose}>
            <Text style={pw.dismissText}>Maybe later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const pw = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' },
  card: {
    backgroundColor: '#0D0D0D', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 28, paddingTop: 14,
    borderWidth: StyleSheet.hairlineWidth, borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  pill: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)', alignSelf: 'center', marginBottom: 24 },
  title: { color: T.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5, marginBottom: 10 },
  sub: { color: T.muted, fontSize: 14, lineHeight: 22, marginBottom: 28 },
  btnOuter: { borderRadius: 16, overflow: 'hidden', marginBottom: 10 },
  btnGrad: { height: 54, alignItems: 'center', justifyContent: 'center' },
  btnTextPrimary: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.1 },
  btnAnnual: {
    height: 54, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 16,
  },
  btnText: { color: T.text, fontSize: 15, fontWeight: '600' },
  badge: { backgroundColor: 'rgba(245,200,66,0.14)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { color: T.pro, fontSize: 10, fontWeight: '700' },
  dismiss: { alignItems: 'center', paddingVertical: 16 },
  dismissText: { color: T.muted, fontSize: 14 },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Mode>('teach');
  const [manualMode, setManualMode] = useState(false);
  const [sending, setSending] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<'monthly' | 'annual' | null>(null);
  const [kbVisible, setKbVisible] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const convIdRef = useRef<string | null>(null);
  const lastSentRef = useRef<{ text: string; mode: Mode } | null>(null);

  // Resume a conversation navigated-to from history
  useFocusEffect(useCallback(() => {
    const conv = consumePendingResume();
    if (conv) {
      const resumed: Message[] = conv.messages.map(m => ({ ...m, isError: false }));
      setMessages(resumed);
      convIdRef.current = conv.id;
    }
  }, []));

  // Track keyboard visibility to adjust input padding dynamically
  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKbVisible(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKbVisible(false),
    );
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => { loadProfile(); }, []);

  useEffect(() => {
    if (!manualMode && input.length > 2) setMode(detectMode(input));
  }, [input, manualMode]);

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('id, tier, queries_today, queries_reset_date, stripe_customer_id, stripe_subscription_id')
      .eq('id', user.id)
      .single();
    if (data) setProfile(data as Profile);
  };

  const queriesLeft = profile?.tier === 'free'
    ? Math.min(FREE_DAILY_LIMIT, Math.max(0, FREE_DAILY_LIMIT - (profile.queries_today ?? 0)))
    : null;

  const isAtLimit = profile?.tier === 'free' && queriesLeft !== null && queriesLeft <= 0;

  const persistConversation = (msgs: Message[]) => {
    if (msgs.length < 2) return;
    if (!convIdRef.current) convIdRef.current = `conv-${Date.now()}`;
    const title = msgs.find(m => m.role === 'user')?.content.slice(0, 80) ?? 'Conversation';
    upsertConversation({
      id: convIdRef.current,
      title,
      createdAt: parseInt(convIdRef.current.replace('conv-', ''), 10),
      messages: msgs
        .filter(m => !m.isError)
        .map(({ id, role, content, mode: m }) => ({ id, role, content, mode: m })),
    }).catch(() => {});
  };

  const retryLast = useCallback(() => {
    if (!lastSentRef.current || sending) return;
    const { text, mode: m } = lastSentRef.current;
    setMessages(prev => {
      const clean = prev.filter(msg => !msg.isError);
      let lastUser = clean.length - 1;
      while (lastUser >= 0 && clean[lastUser].role !== 'user') lastUser--;
      return lastUser >= 0 ? [...clean.slice(0, lastUser), ...clean.slice(lastUser + 1)] : clean;
    });
    setInput(text);
    setMode(m);
  }, [sending]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    if (isAtLimit) { setShowPaywall(true); return; }

    lastSentRef.current = { text, mode };

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: text, mode };
    const withUser = [...messages, userMsg];
    setMessages(withUser);
    setInput('');
    setManualMode(false);
    setSending(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const history = messages.slice(-8).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      }));

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/agent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ action: mode, message: text, history }),
        },
      );

      if (res.status === 429) {
        setShowPaywall(true);
        loadProfile();
        return;
      }

      let json: any = {};
      try { json = await res.json(); } catch { /* non-JSON body (e.g. 502 gateway error) */ }
      if (!res.ok) throw new Error(json.error ?? json.message ?? `Server error ${res.status}`);

      const content = mode === 'teach'
        ? (json.message ?? 'Got it, teaching the collective.')
        : (json.response ?? '...');

      const agentMsg: Message = { id: `a-${Date.now()}`, role: 'agent', content, mode };
      const final = [...withUser, agentMsg];
      setMessages(final);
      persistConversation(final);
      loadProfile();

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to connect. Check your connection.';
      setMessages(prev => [
        ...prev,
        { id: `e-${Date.now()}`, role: 'agent', content: msg, mode, isError: true },
      ]);
    } finally {
      setSending(false);
    }
  }, [input, mode, sending, isAtLimit, messages]);

  const newChat = () => {
    setMessages([]);
    setInput('');
    setManualMode(false);
    setMode('teach');
    convIdRef.current = null;
  };

  const handleUpgrade = async (plan: 'monthly' | 'annual') => {
    setCheckoutLoading(plan);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/checkout`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ plan }),
        },
      );
      const { url } = await res.json();
      if (url) {
        await WebBrowser.openBrowserAsync(url);
        setShowPaywall(false);
        await loadProfile();
      }
    } finally {
      setCheckoutLoading(null);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: T.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* ── Header ── */}
        <View style={s.header}>
          <Text style={s.headerTitle}>slatt</Text>
          <View style={s.headerRight}>
            {profile?.tier === 'pro' && <ProBadge />}
            {profile?.tier === 'free' && queriesLeft !== null && (
              <QueryRing left={queriesLeft} total={FREE_DAILY_LIMIT} onPress={() => setShowPaywall(true)} />
            )}
            {messages.length > 0 && (
              <TouchableOpacity onPress={newChat} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Feather name="edit-2" size={17} color={T.muted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Messages or empty state ── */}
        {messages.length === 0 ? (
          <Pressable style={{ flex: 1 }} onPress={Keyboard.dismiss}>
          <Animated.View entering={FadeIn.duration(400)} style={s.empty}>
            <Text style={s.emptyWordmark}>slatt</Text>
            <Text style={s.emptyTagline}>COLLECTIVE INTELLIGENCE</Text>
            <Text style={s.emptySub}>
              Share what you know or ask what you want to know.{'\n'}
              Every Pro member's insight lives here.
            </Text>
            <View style={s.hints}>
              <View style={s.hintCard}>
                <View style={[s.hintDot, { backgroundColor: T.teach }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.hintMode, { color: T.teach }]}>TEACH</Text>
                  <Text style={s.hintEx}>"Closed a $2M deal by sending proposals as Notion pages."</Text>
                </View>
              </View>
              <View style={s.hintCard}>
                <View style={[s.hintDot, { backgroundColor: T.ask }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.hintMode, { color: T.ask }]}>ASK</Text>
                  <Text style={s.hintEx}>"What's the best way to present a big proposal?"</Text>
                </View>
              </View>
            </View>
          </Animated.View>
          </Pressable>
        ) : (
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={s.list}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            {messages.map(msg =>
              msg.role === 'user' ? (
                <Animated.View key={msg.id} entering={FadeInDown.duration(220)} style={s.msgUserWrap}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onLongPress={() => Share.share({ message: msg.content })}
                    delayLongPress={400}
                  >
                    <LinearGradient
                      colors={GRAD_USER}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={s.msgUser}
                    >
                      <Text style={s.msgTextUser}>{msg.content}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              ) : (
                <Animated.View
                  key={msg.id}
                  entering={FadeInDown.duration(220)}
                  style={[s.msgAgent, msg.isError && s.msgAgentError]}
                >
                  <Text style={s.agentLabel}>{msg.isError ? '⚠  error' : 'slatt'}</Text>
                  {msg.isError ? (
                    <>
                      <Text style={[s.msgTextAgent, s.msgTextError]}>{msg.content}</Text>
                      <TouchableOpacity onPress={retryLast} style={s.retryBtn} activeOpacity={0.7}>
                        <Feather name="refresh-cw" size={11} color="#FF6B6B" />
                        <Text style={s.retryText}>Retry</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity
                      activeOpacity={1}
                      onLongPress={() => Share.share({ message: msg.content })}
                      delayLongPress={400}
                    >
                      <MarkdownText text={msg.content} style={s.msgTextAgent} />
                    </TouchableOpacity>
                  )}
                </Animated.View>
              )
            )}
          </ScrollView>
        )}

        {/* ── Typing indicator ── */}
        {sending && (
          <Animated.View entering={FadeIn.duration(180)}>
            <TypingDots />
          </Animated.View>
        )}

        {/* ── Input area ── */}
        <View style={[s.inputWrap, { paddingBottom: kbVisible ? 4 : 8 }]}>

          {/* Mode selector */}
          <View style={s.modeRow}>
            <TouchableOpacity
              style={[s.modeSeg, mode === 'teach' && s.modeSegTeach]}
              onPress={() => { setMode('teach'); setManualMode(true); }}
              activeOpacity={0.7}
            >
              <View style={[s.modeDot, { backgroundColor: T.teach, opacity: mode === 'teach' ? 1 : 0.3 }]} />
              <Text style={[s.modeSegText, mode === 'teach' && { color: T.teach }]}>TEACH</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.modeSeg, mode === 'ask' && s.modeSegAsk]}
              onPress={() => { setMode('ask'); setManualMode(true); }}
              activeOpacity={0.7}
            >
              <View style={[s.modeDot, { backgroundColor: T.ask, opacity: mode === 'ask' ? 1 : 0.3 }]} />
              <Text style={[s.modeSegText, mode === 'ask' && { color: T.ask }]}>ASK</Text>
            </TouchableOpacity>
          </View>

          {/* SMS-style input row */}
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              value={input}
              onChangeText={setInput}
              placeholder={mode === 'teach' ? 'Share something...' : 'Ask anything...'}
              placeholderTextColor={T.faint}
              multiline
              maxLength={2000}
              returnKeyType="default"
            />
            <TouchableOpacity
              onPress={send}
              disabled={!input.trim() || sending}
              activeOpacity={0.8}
              style={s.sendOuter}
            >
              <LinearGradient
                colors={input.trim() && !sending ? GRAD_SEND : GRAD_SEND_OFF}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.sendBtn}
              >
                {sending
                  ? <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />
                  : <Text style={[s.sendIcon, !input.trim() && s.sendIconOff]}>↑</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

      </SafeAreaView>

      <PaywallModal
        visible={showPaywall}
        queriesLeft={queriesLeft ?? 0}
        onClose={() => setShowPaywall(false)}
        onUpgrade={handleUpgrade}
        checkoutLoading={checkoutLoading}
      />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 6, paddingBottom: 14,
  },
  headerTitle: { color: T.text, fontSize: 18, fontWeight: '900', letterSpacing: -0.4 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },

  // Empty
  empty: { flex: 1, paddingHorizontal: 28, justifyContent: 'center' },
  emptyWordmark: { color: T.text, fontSize: 42, fontWeight: '900', letterSpacing: -2, marginBottom: 4 },
  emptyTagline: { color: T.faint, fontSize: 10, fontWeight: '600', letterSpacing: 3.5, marginBottom: 20 },
  emptySub: { color: T.muted, fontSize: 14, lineHeight: 22, marginBottom: 32 },
  hints: { gap: 10 },
  hintCard: {
    flexDirection: 'row', gap: 14, alignItems: 'flex-start',
    backgroundColor: '#0B0B0B', borderRadius: 16, padding: 16,
    borderWidth: StyleSheet.hairlineWidth, borderColor: T.border,
  },
  hintDot: { width: 8, height: 8, borderRadius: 4, marginTop: 3 },
  hintMode: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 5 },
  hintEx: { color: T.muted, fontSize: 13, lineHeight: 20 },

  // Messages
  list: { padding: 16, paddingBottom: 12, gap: 10 },
  msgUserWrap: { alignSelf: 'flex-end', maxWidth: '80%' },
  msgUser: { borderRadius: 20, borderBottomRightRadius: 5, paddingVertical: 11, paddingHorizontal: 16 },
  msgTextUser: { color: '#fff', fontSize: 15, lineHeight: 22 },
  msgAgent: {
    alignSelf: 'flex-start', maxWidth: '88%',
    backgroundColor: T.surface, borderRadius: 20, borderBottomLeftRadius: 5,
    paddingVertical: 12, paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth, borderColor: T.border,
  },
  msgAgentError: {
    backgroundColor: 'rgba(255,69,58,0.08)',
    borderColor: 'rgba(255,69,58,0.18)',
  },
  agentLabel: { color: T.faint, fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginBottom: 7 },
  msgTextAgent: { color: 'rgba(255,255,255,0.88)', fontSize: 15, lineHeight: 23 },
  msgTextError: { color: T.errorText },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 10, alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8, borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,107,107,0.35)',
    backgroundColor: 'rgba(255,107,107,0.08)',
  },
  retryText: { color: '#FF6B6B', fontSize: 12, fontWeight: '600' },

  // Input
  inputWrap: {
    paddingHorizontal: 14, paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: T.border,
    gap: 6,
  },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeSeg: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: T.border,
  },
  modeSegTeach: { borderColor: 'rgba(52,199,89,0.35)', backgroundColor: 'rgba(52,199,89,0.07)' },
  modeSegAsk: { borderColor: 'rgba(29,155,240,0.35)', backgroundColor: 'rgba(29,155,240,0.07)' },
  modeDot: { width: 6, height: 6, borderRadius: 3 },
  modeSegText: { color: T.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1, backgroundColor: '#0E0E0E', borderRadius: 22,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12,
    color: T.text, fontSize: 15, lineHeight: 21,
    maxHeight: 120,
    borderWidth: StyleSheet.hairlineWidth, borderColor: T.borderInput,
  },
  sendOuter: { borderRadius: 22, overflow: 'hidden' },
  sendBtn: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  sendIcon: { color: '#fff', fontSize: 20, fontWeight: '700', lineHeight: 22 },
  sendIconOff: { opacity: 0.3 },
});
