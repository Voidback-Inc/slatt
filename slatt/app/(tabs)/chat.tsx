import { useState, useRef, useEffect, useCallback, memo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Platform, KeyboardAvoidingView, Alert,
  ActivityIndicator, Modal, Keyboard, Pressable, Linking, Share,
  Animated as RNAnimated, PanResponder, Image, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  FadeInDown, FadeIn,
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/lib/supabase';
import { upsertConversation, consumePendingResume } from '@/lib/history';
import { FREE_DAILY_LIMIT, STRIPE_MONTHLY_LABEL, STRIPE_ANNUAL_LABEL, STRIPE_ANNUAL_SAVE } from '@/lib/constants';
import { setupIAP, purchasePlan, type PlanKey } from '@/lib/iap';
import { useProfile } from '@/lib/useProfile';
import { PRIVACY_POLICY, TERMS_OF_SERVICE } from '@/lib/legal';
import { t, getLangName } from '@/lib/i18n';
import { useLanguage } from '@/lib/useLanguage';

const SCREEN_W = Dimensions.get('window').width;

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

// ── Query ring ────────────────────────────────────────────────────────────────

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

// ── Swipeable message wrapper ─────────────────────────────────────────────────

function SwipeableMessage({ onReply, children }: { onReply: () => void; children: React.ReactNode }) {
  const translateX = useRef(new RNAnimated.Value(0)).current;
  const triggered = useRef(false);
  const onReplyRef = useRef(onReply);
  onReplyRef.current = onReply;

  const iconOpacity = translateX.interpolate({ inputRange: [0, 40], outputRange: [0, 1], extrapolate: 'clamp' });
  const iconScale = translateX.interpolate({ inputRange: [0, 40], outputRange: [0.5, 1], extrapolate: 'clamp' });

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, { dx, dy }) => dx > 8 && Math.abs(dx) > Math.abs(dy) * 1.5,
    onPanResponderGrant: () => { triggered.current = false; },
    onPanResponderMove: (_, { dx }) => {
      if (dx <= 0) return;
      const v = Math.min(dx * 0.6, 52);
      translateX.setValue(v);
      if (v >= 40 && !triggered.current) {
        triggered.current = true;
        onReplyRef.current();
      }
    },
    onPanResponderRelease: () => {
      RNAnimated.spring(translateX, { toValue: 0, useNativeDriver: true, tension: 200, friction: 14 }).start();
      triggered.current = false;
    },
    onPanResponderTerminate: () => {
      RNAnimated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      triggered.current = false;
    },
  })).current;

  return (
    <View>
      <RNAnimated.View style={[sr.icon, { opacity: iconOpacity, transform: [{ scale: iconScale }] }]}>
        <Feather name="corner-up-left" size={15} color="rgba(255,255,255,0.35)" />
      </RNAnimated.View>
      <RNAnimated.View style={{ transform: [{ translateX }] }} {...pan.panHandlers}>
        {children}
      </RNAnimated.View>
    </View>
  );
}

const sr = StyleSheet.create({
  icon: { position: 'absolute', left: 6, top: 0, bottom: 0, justifyContent: 'center', width: 28 },
});

// ── Types ─────────────────────────────────────────────────────────────────────

type Mode = 'teach' | 'ask';

type Message = {
  id: string;
  role: 'user' | 'agent';
  content: string;
  mode: Mode;
  isError?: boolean;
  isPending?: boolean;
  replyToId?: string;
  imageUri?: string;
  images?: { url: string; description: string }[];
};

type PendingImage = { uri: string; base64: string; mimeType: string };

// ── Image gallery (ask responses) ─────────────────────────────────────────────

const ImageGallery = memo(function ImageGallery({
  images: rawImages,
}: {
  images: { url: string; description: string }[];
}) {
  // Deduplicate by URL before rendering
  const seen = new Set<string>();
  const images = rawImages.filter(img => { if (seen.has(img.url)) return false; seen.add(img.url); return true; });
  const [activeIdx, setActiveIdx] = useState(0);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [savingUrl, setSavingUrl] = useState<string | null>(null);
  const CARD_W = SCREEN_W * 0.72;

  const handleSave = useCallback(async (url: string) => {
    if (savingUrl) return;
    const { granted } = await MediaLibrary.requestPermissionsAsync();
    if (!granted) {
      Alert.alert(t('permissionNeeded'), t('permissionPhotoMsg'));
      return;
    }
    setSavingUrl(url);
    try {
      const rawExt = url.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
      const ext = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(rawExt) ? rawExt : 'jpg';
      const cacheDir = FileSystem.cacheDirectory ?? 'file:///tmp/';
      const localUri = cacheDir + `slatt_${Date.now()}.${ext}`;
      const { uri } = await FileSystem.downloadAsync(url, localUri);
      const asset = await MediaLibrary.createAssetAsync(uri);
      // Album creation requires full library access — don't fail the save if it errors
      try { await MediaLibrary.createAlbumAsync('slatt', asset, false); } catch {}
      Alert.alert(t('saved'), t('savedMsg'));
    } catch (e) {
      Alert.alert('Error', t('couldNotSave'));
    } finally {
      setSavingUrl(null);
    }
  }, [savingUrl]);

  if (!images.length) return null;

  return (
    <View style={ig.wrap}>
      {images.length > 1 && (
        <View style={ig.swipeHint}>
          <Feather name="chevrons-right" size={11} color="rgba(255,255,255,0.3)" />
          <Text style={ig.swipeText}>swipe for more</Text>
        </View>
      )}
      <View style={ig.scrollWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={CARD_W + 10}
          snapToAlignment="start"
          style={ig.scroll}
          contentContainerStyle={{ paddingRight: 16, gap: 10 }}
          onScroll={e => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / (CARD_W + 10));
            setActiveIdx(Math.max(0, Math.min(idx, images.length - 1)));
          }}
          scrollEventThrottle={16}
        >
          {images.map((img, i) => (
            <TouchableOpacity
              key={i}
              activeOpacity={0.92}
              onPress={() => setViewerUrl(img.url)}
              style={[ig.card, { width: CARD_W }]}
            >
              <Image source={{ uri: img.url }} style={ig.img} resizeMode="cover" />
              <TouchableOpacity
                style={ig.saveBtn}
                onPress={() => handleSave(img.url)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {savingUrl === img.url
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Feather name="download" size={14} color="#fff" />}
              </TouchableOpacity>
              <View style={ig.caption}>
                <Text style={ig.captionText} numberOfLines={2}>{img.description}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      {images.length > 1 && (
        <View style={ig.dots}>
          {images.map((_, i) => (
            <View key={i} style={[ig.dot, i === activeIdx && ig.dotActive]} />
          ))}
        </View>
      )}

      {/* Full-screen image viewer */}
      <Modal visible={viewerUrl !== null} transparent animationType="fade" onRequestClose={() => setViewerUrl(null)}>
        <View style={ig.viewerOverlay}>
          <TouchableOpacity style={ig.viewerClose} onPress={() => setViewerUrl(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="x" size={22} color="#fff" />
          </TouchableOpacity>
          {viewerUrl && (
            <Image source={{ uri: viewerUrl }} style={ig.viewerImg} resizeMode="contain" />
          )}
          {viewerUrl && (
            <TouchableOpacity style={ig.viewerSaveBtn} onPress={() => handleSave(viewerUrl)} activeOpacity={0.8}>
              {savingUrl === viewerUrl
                ? <ActivityIndicator size="small" color="#fff" />
                : <><Feather name="download" size={16} color="#fff" /><Text style={ig.viewerSaveText}>Save</Text></>}
            </TouchableOpacity>
          )}
        </View>
      </Modal>
    </View>
  );
});

const ig = StyleSheet.create({
  wrap: { marginTop: 8, width: SCREEN_W - 32 },
  scrollWrap: { height: 228, overflow: 'hidden' },
  scroll: { flex: 1 },
  card: {
    borderRadius: 16, overflow: 'hidden',
    backgroundColor: '#111',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)',
  },
  img: { width: '100%', height: 172 },
  saveBtn: {
    position: 'absolute', top: 10, right: 10,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  caption: { padding: 10, paddingTop: 8 },
  captionText: { color: 'rgba(255,255,255,0.65)', fontSize: 11, lineHeight: 16 },
  swipeHint: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  swipeText: { color: 'rgba(255,255,255,0.28)', fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 8 },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(255,255,255,0.2)' },
  dotActive: { backgroundColor: 'rgba(255,255,255,0.65)', width: 14 },
  viewerOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.93)',
    alignItems: 'center', justifyContent: 'center',
  },
  viewerClose: { position: 'absolute', top: 56, right: 20, zIndex: 10 },
  viewerImg: { width: SCREEN_W, height: SCREEN_W },
  viewerSaveBtn: {
    position: 'absolute', bottom: 60,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 22, paddingVertical: 12,
    borderRadius: 24, borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  viewerSaveText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});

function detectMode(text: string): Mode {
  const t = text.trim();
  if (t.endsWith('?')) return 'ask';
  if (/^(what|who|where|when|why|how|which|is|are|was|were|do|does|did|can|could|should|would|tell me|show me|give me|explain|describe|list|find)/i.test(t)) return 'ask';
  return 'teach';
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

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
      parts.push(<Text key={key++} style={[baseStyle, { fontWeight: '800', color: '#fff' }]}>{raw.slice(2, -2)}</Text>);
    } else if (raw.startsWith('*')) {
      parts.push(<Text key={key++} style={[baseStyle, { fontStyle: 'italic' }]}>{raw.slice(1, -1)}</Text>);
    } else if (raw.startsWith('`')) {
      parts.push(
        <Text key={key++} style={[baseStyle, { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13, backgroundColor: 'rgba(255,255,255,0.07)', color: '#a8ff78' }]}>
          {raw.slice(1, -1)}
        </Text>
      );
    } else {
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

// ── Typing indicator ──────────────────────────────────────────────────────────

function TypingDots() {
  const d1 = useSharedValue(0.3);
  const d2 = useSharedValue(0.3);
  const d3 = useSharedValue(0.3);

  useEffect(() => {
    const anim = () =>
      withRepeat(
        withSequence(withTiming(1, { duration: 360 }), withTiming(0.3, { duration: 360 })),
        -1, false,
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 10 },
  label: { color: T.faint, fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: T.muted },
});

// ── Paywall modal ─────────────────────────────────────────────────────────────

const PRO_FEATURES = [
  `Unlimited queries per day (Free plan: ${FREE_DAILY_LIMIT}/day)`,
  'Access all collective knowledge — answers from real Pro member teachings',
  'Teach the collective — your insights reach every Pro member',
];

function PaywallModal({
  visible, queriesLeft, onClose, onUpgrade, checkoutLoading,
}: {
  visible: boolean;
  queriesLeft: number;
  onClose: () => void;
  onUpgrade: (plan: 'monthly' | 'annual') => void;
  checkoutLoading: 'monthly' | 'annual' | null;
}) {
  const [legalModal, setLegalModal] = useState<'terms' | 'privacy' | null>(null);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={pw.overlay}>
        <View style={pw.card}>
          <View style={pw.pill} />
          <Text style={pw.title}>slatt Pro</Text>
          <Text style={pw.sub}>
            {queriesLeft === 0
              ? `You've used all ${FREE_DAILY_LIMIT} free daily queries.`
              : `${queriesLeft} of ${FREE_DAILY_LIMIT} free queries left today.`}
            {' '}Upgrade for unlimited access.
          </Text>

          <View style={pw.features}>
            {PRO_FEATURES.map(f => (
              <View key={f} style={pw.featureRow}>
                <Text style={pw.featureCheck}>✓</Text>
                <Text style={pw.featureText}>{f}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            onPress={() => onUpgrade('monthly')}
            disabled={checkoutLoading !== null}
            activeOpacity={0.85}
            style={[pw.btnOuter, checkoutLoading !== null && { opacity: 0.6 }]}
          >
            <LinearGradient colors={GRAD_SEND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={pw.btnGrad}>
              {checkoutLoading === 'monthly'
                ? <ActivityIndicator color="#fff" size="small" />
                : (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={pw.btnSubLabel}>slatt Pro · Monthly</Text>
                    <Text style={pw.btnTextPrimary}>{STRIPE_MONTHLY_LABEL}</Text>
                    <Text style={pw.btnSub}>Auto-renews monthly · Cancel anytime</Text>
                  </View>
                )}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => onUpgrade('annual')}
            disabled={checkoutLoading !== null}
            activeOpacity={0.85}
            style={[pw.btnOuter, checkoutLoading !== null && { opacity: 0.6 }]}
          >
            <View style={pw.btnAnnual}>
              {checkoutLoading === 'annual'
                ? <ActivityIndicator color={T.text} size="small" />
                : (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={pw.btnSubLabelMuted}>slatt Pro · Annual</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={pw.btnText}>{STRIPE_ANNUAL_LABEL}</Text>
                      <View style={pw.badge}>
                        <Text style={pw.badgeText}>{STRIPE_ANNUAL_SAVE}</Text>
                      </View>
                    </View>
                    <Text style={pw.btnSubMuted}>Auto-renews annually · Cancel anytime</Text>
                  </View>
                )}
            </View>
          </TouchableOpacity>

          <Text style={pw.legal}>
            Payment is charged to your Apple ID account at confirmation of purchase. Subscription automatically renews unless cancelled at least 24 hours before the end of the current period. Manage or cancel in Settings → Apple ID → Subscriptions.{'\n'}
            <Text style={pw.legalLink} onPress={() => setLegalModal('terms')}>{t('termsOfService')}</Text>
            {'  ·  '}
            <Text style={pw.legalLink} onPress={() => setLegalModal('privacy')}>{t('privacyPolicy')}</Text>
          </Text>

          <TouchableOpacity style={pw.dismiss} onPress={onClose}>
            <Text style={pw.dismissText}>{t('maybeLater')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={legalModal !== null} transparent animationType="slide" onRequestClose={() => setLegalModal(null)}>
        <View style={pw.legalOverlay}>
          <View style={pw.legalCard}>
            <View style={pw.legalHeader}>
              <Text style={pw.legalTitle}>{legalModal === 'terms' ? t('termsOfService') : t('privacyPolicy')}</Text>
              <TouchableOpacity onPress={() => setLegalModal(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={pw.legalDone}>{t('done')}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={pw.legalText}>
                {legalModal === 'terms' ? TERMS_OF_SERVICE : PRIVACY_POLICY}
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const pw = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' },
  card: {
    backgroundColor: '#0D0D0D', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingTop: 14,
    borderWidth: StyleSheet.hairlineWidth, borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  pill: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)', alignSelf: 'center', marginBottom: 20 },
  title: { color: T.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.5, marginBottom: 6 },
  sub: { color: T.muted, fontSize: 14, lineHeight: 20, marginBottom: 16 },
  features: { gap: 8, marginBottom: 20 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureCheck: { color: T.teach, fontSize: 14, fontWeight: '700', width: 16 },
  featureText: { color: 'rgba(255,255,255,0.75)', fontSize: 14, lineHeight: 20 },
  btnOuter: { borderRadius: 16, overflow: 'hidden', marginBottom: 10 },
  btnGrad: { minHeight: 54, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  btnSubLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600', marginBottom: 2 },
  btnSubLabelMuted: { color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: '600', marginBottom: 2 },
  btnTextPrimary: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.1 },
  btnSub: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 2 },
  btnAnnual: {
    minHeight: 54, paddingVertical: 10, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 16,
  },
  btnText: { color: T.text, fontSize: 15, fontWeight: '600' },
  btnSubMuted: { color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 2 },
  badge: { backgroundColor: 'rgba(245,200,66,0.14)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { color: T.pro, fontSize: 10, fontWeight: '700' },
  legal: {
    color: 'rgba(255,255,255,0.25)', fontSize: 11, lineHeight: 16,
    textAlign: 'center', paddingHorizontal: 4, marginBottom: 4,
  },
  legalLink: { color: 'rgba(255,255,255,0.45)', fontWeight: '600', textDecorationLine: 'underline' },
  dismiss: { alignItems: 'center', paddingVertical: 14 },
  dismissText: { color: T.muted, fontSize: 14 },
  legalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  legalCard: {
    backgroundColor: '#0D0D0D', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: '85%',
    borderWidth: StyleSheet.hairlineWidth, borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  legalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  legalTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  legalDone: { color: T.ask, fontSize: 14, fontWeight: '600' },
  legalText: {
    color: 'rgba(255,255,255,0.55)', fontSize: 11, lineHeight: 17,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    paddingBottom: 40,
  },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Mode>('teach');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const { profile, reloadProfile } = useProfile();
  const { lang } = useLanguage();
  const [showPaywall, setShowPaywall] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<PlanKey | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const convIdRef = useRef<string | null>(null);
  const lastSentRef = useRef<{ text: string; mode: Mode } | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const teardown = setupIAP();
    return teardown;
  }, []);

  useFocusEffect(useCallback(() => {
    const conv = consumePendingResume();
    if (conv) {
      const resumed: Message[] = conv.messages.map(m => ({ ...m, isError: false }));
      setMessages(resumed);
      convIdRef.current = conv.id;
    }
  }, []));

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {},
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {},
    );
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    if (input.length > 2) setMode(detectMode(input));
  }, [input]);

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
        .filter(m => !m.isError && !m.isPending)
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
    if ((!text && !pendingImage) || sending) return;
    if (isAtLimit) { setShowPaywall(true); return; }

    lastSentRef.current = { text: text || '(image)', mode };
    const capturedReply = replyTo;
    const capturedImage = pendingImage;
    setReplyTo(null);
    setPendingImage(null);

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text || '📷 Image',
      mode,
      replyToId: capturedReply?.id,
      imageUri: capturedImage?.uri,
    };
    const placeholderMsg: Message | null = capturedImage && mode === 'teach' ? {
      id: `p-${Date.now()}`,
      role: 'agent',
      content: t('filingImage'),
      mode,
      isPending: true,
    } : null;
    const withUser = placeholderMsg ? [...messages, userMsg, placeholderMsg] : [...messages, userMsg];
    setMessages(withUser);
    setInput('');
    setSending(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const history = messages.slice(-8).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      }));

      const messageForAgent = capturedReply
        ? `[Replying to: "${capturedReply.content.slice(0, 200)}"]\n\n${text}`
        : text;

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/agent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            action: mode,
            message: messageForAgent || (capturedImage ? '(image)' : ''),
            history,
            language: getLangName(),
            ...(capturedImage ? {
              imageBase64: capturedImage.base64,
              imageMimeType: capturedImage.mimeType,
            } : {}),
          }),
        },
      );

      if (res.status === 429) {
        if (mounted.current) setShowPaywall(true);
        reloadProfile();
        return;
      }

      let json: any = {};
      try { json = await res.json(); } catch { }
      if (!res.ok) throw new Error(json.error ?? json.message ?? `Server error ${res.status}`);

      const rawContent = mode === 'teach'
        ? (json.message ?? 'Got it, teaching the collective.')
        : (json.response ?? '...');
      // Safety net: strip any [IMAGE: ...] tags that leaked through from the edge function
      const content = rawContent
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[(?:IMAGE|image|Image):\s*[^\]]*\]/g, '')
        .replace(/\n{3,}/g, '\n\n').trim() || '...';

      const agentMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'agent',
        content,
        mode,
        images: json.images?.length ? json.images : undefined,
      };
      const final = [...withUser.filter(m => !m.isPending), agentMsg];
      if (mounted.current) {
        setMessages(final);
        persistConversation(final);
      }
      reloadProfile();

    } catch (err) {
      if (!mounted.current) return;
      const msg = err instanceof Error ? err.message : 'Unable to connect. Check your connection.';
      setMessages(prev => [
        ...prev.filter(m => !m.isPending),
        { id: `e-${Date.now()}`, role: 'agent', content: msg, mode, isError: true },
      ]);
    } finally {
      if (mounted.current) setSending(false);
    }
  }, [input, mode, sending, isAtLimit, messages, replyTo, reloadProfile]);

  const newChat = () => {
    setMessages([]);
    setInput('');
    setMode('teach');
    setReplyTo(null);
    setPendingImage(null);
    convIdRef.current = null;
  };

  const pickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('permissionNeeded'), t('permissionMsg'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.35,
      base64: true,
      exif: false,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (!asset.base64) {
        Alert.alert(t('permissionNeeded'), 'Could not read image data. Try a different image.');
        return;
      }
      const rawMime = asset.mimeType ?? 'image/jpeg';
      const safeMime = /heic|heif|webp/i.test(rawMime) ? 'image/jpeg' : rawMime;
      setPendingImage({
        uri: asset.uri,
        base64: asset.base64,
        mimeType: safeMime,
      });
    }
  }, []);

  const handleUpgrade = async (plan: PlanKey) => {
    setCheckoutLoading(plan);
    try {
      await purchasePlan(plan);
      if (mounted.current) setShowPaywall(false);
      await reloadProfile();
    } catch (e: any) {
      if (!e?.userCancelled && mounted.current) {
        Alert.alert('Purchase failed', e?.message ?? 'Something went wrong. Please try again.');
      }
    } finally {
      if (mounted.current) setCheckoutLoading(null);
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
            {profile === null && (
              <View style={s.headerSkeleton} />
            )}
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
              <Text style={s.emptyTagline}>{t('collectiveIntelligence')}</Text>
              <Text style={s.emptySub}>{t('emptySub')}</Text>
              <View style={s.hints}>
                <View style={s.hintCard}>
                  <View style={[s.hintDot, { backgroundColor: T.teach }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.hintMode, { color: T.teach }]}>{t('teachLabel')}</Text>
                    <Text style={s.hintEx}>{t('teachExample')}</Text>
                  </View>
                </View>
                <View style={s.hintCard}>
                  <View style={[s.hintDot, { backgroundColor: T.ask }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.hintMode, { color: T.ask }]}>{t('askLabel')}</Text>
                    <Text style={s.hintEx}>{t('askExample')}</Text>
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
            {messages.map(msg => {
              const replyMsg = msg.replyToId ? messages.find(m => m.id === msg.replyToId) : undefined;

              return msg.role === 'user' ? (
                <SwipeableMessage key={msg.id} onReply={() => setReplyTo(msg)}>
                  <Animated.View entering={FadeInDown.duration(220)} style={s.msgUserWrap}>
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
                        {replyMsg && (
                          <View style={s.replyQuote}>
                            <Text style={s.replyQuoteLabel}>{replyMsg.role === 'user' ? 'You' : 'slatt'}</Text>
                            <Text style={s.replyQuoteText} numberOfLines={2}>{replyMsg.content}</Text>
                          </View>
                        )}
                        {msg.imageUri && (
                          <Image source={{ uri: msg.imageUri }} style={s.msgImage} resizeMode="cover" />
                        )}
                        {msg.content !== '📷 Image' && (
                          <Text style={s.msgTextUser}>{msg.content}</Text>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  </Animated.View>
                </SwipeableMessage>
              ) : (
                <View key={msg.id}>
                  <SwipeableMessage onReply={msg.isError ? () => {} : () => setReplyTo(msg)}>
                    <Animated.View
                      entering={FadeInDown.duration(220)}
                      style={[s.msgAgent, msg.isError && s.msgAgentError]}
                    >
                      <Text style={s.agentLabel}>{msg.isError ? '⚠  error' : 'slatt'}</Text>
                      {replyMsg && (
                        <View style={[s.replyQuote, s.replyQuoteAgent]}>
                          <Text style={s.replyQuoteLabel}>{replyMsg.role === 'user' ? 'You' : 'slatt'}</Text>
                          <Text style={s.replyQuoteText} numberOfLines={2}>{replyMsg.content}</Text>
                        </View>
                      )}
                      {msg.isError ? (
                        <>
                          <Text style={[s.msgTextAgent, s.msgTextError]}>{msg.content}</Text>
                          <TouchableOpacity onPress={retryLast} style={s.retryBtn} activeOpacity={0.7}>
                            <Feather name="refresh-cw" size={11} color="#FF6B6B" />
                            <Text style={s.retryText}>Retry</Text>
                          </TouchableOpacity>
                        </>
                      ) : msg.isPending ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <ActivityIndicator size="small" color={T.muted} />
                          <Text style={[s.msgTextAgent, { color: T.muted }]}>{msg.content}</Text>
                        </View>
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
                  </SwipeableMessage>
                  {msg.images && msg.images.length > 0 && (
                    <ImageGallery images={msg.images} />
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}

        {/* ── Typing indicator ── */}
        {sending && (
          <Animated.View entering={FadeIn.duration(180)}>
            <TypingDots />
          </Animated.View>
        )}

        {/* ── Reply banner ── */}
        {replyTo && (
          <View style={s.replyBanner}>
            <View style={s.replyBannerAccent} />
            <View style={{ flex: 1 }}>
              <Text style={s.replyBannerTo}>{replyTo.role === 'user' ? 'You' : 'slatt'}</Text>
              <Text style={s.replyBannerMsg} numberOfLines={1}>{replyTo.content}</Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={15} color={T.muted} />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Input area ── */}
        <View style={[s.inputWrap, { paddingBottom: 20 }]}>
          {pendingImage && (
            <View style={s.imagePreviewWrap}>
              <Image source={{ uri: pendingImage.uri }} style={s.imagePreview} resizeMode="cover" />
              <TouchableOpacity
                style={s.imagePreviewRemove}
                onPress={() => setPendingImage(null)}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Feather name="x" size={12} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
          <View style={s.inputRow}>
            <TouchableOpacity onPress={pickImage} style={s.imageBtn} activeOpacity={0.7}>
              <Feather name="image" size={20} color={pendingImage ? T.ask : T.muted} />
            </TouchableOpacity>
            <TextInput
              style={s.input}
              value={input}
              onChangeText={setInput}
              placeholder={pendingImage ? t('captionPlaceholder') : mode === 'teach' ? t('sharePlaceholder') : t('askPlaceholder')}
              placeholderTextColor={T.faint}
              multiline
              maxLength={2000}
              returnKeyType="default"
            />
            <TouchableOpacity
              onPress={send}
              disabled={(!input.trim() && !pendingImage) || sending}
              activeOpacity={0.8}
              style={[s.sendOuter, ((!input.trim() && !pendingImage) || sending) && { opacity: 0.35 }]}
            >
              <LinearGradient
                colors={GRAD_SEND}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.sendBtn}
              >
                {sending
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.sendIcon}>↑</Text>}
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
  headerSkeleton: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)' },

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

  replyQuote: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 8, borderLeftWidth: 2, borderLeftColor: 'rgba(255,255,255,0.3)',
    paddingHorizontal: 10, paddingVertical: 6, marginBottom: 6,
  },
  replyQuoteAgent: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderLeftColor: 'rgba(255,255,255,0.15)',
    marginBottom: 8,
  },
  replyQuoteLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '700', marginBottom: 2 },
  replyQuoteText: { color: 'rgba(255,255,255,0.65)', fontSize: 12, lineHeight: 17 },

  replyBanner: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10, gap: 10,
    backgroundColor: '#080808',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.06)',
  },
  replyBannerAccent: { width: 2, height: 32, borderRadius: 2, backgroundColor: T.ask },
  replyBannerTo: { color: T.ask, fontSize: 11, fontWeight: '700', marginBottom: 2 },
  replyBannerMsg: { color: T.muted, fontSize: 12, lineHeight: 16 },

  msgImage: { width: '100%', height: 180, borderRadius: 12, marginBottom: 6 },

  inputWrap: {
    paddingHorizontal: 14, paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: T.border,
  },
  imagePreviewWrap: { marginBottom: 8, alignSelf: 'flex-start' },
  imagePreview: { width: 72, height: 72, borderRadius: 12 },
  imagePreviewRemove: {
    position: 'absolute', top: -6, right: -6,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center',
  },
  imageBtn: { paddingBottom: 11, paddingRight: 2 },
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
});
