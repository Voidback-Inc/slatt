import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Alert, Modal, Share, Animated,
  Image, Linking, Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { loadConversations, deleteConversation, clearHistory, setPendingResume, type Conversation } from '@/lib/history';
import { supabase } from '@/lib/supabase';
import { FREE_DAILY_LIMIT } from '@/lib/constants';
import { type Strings } from '@/lib/i18n';
import { useLanguage } from '@/lib/useLanguage';
import type { Profile } from '@/lib/supabase';

const T = {
  bg: '#000',
  surface: '#0C0C0C',
  border: 'rgba(255,255,255,0.07)',
  text: '#FFF',
  muted: 'rgba(255,255,255,0.45)',
  faint: 'rgba(255,255,255,0.18)',
  teach: '#34C759',
  ask: '#1D9BF0',
  pro: '#F5C842',
};

const GRAD_USER: [string, string] = ['#1D9BF0', '#8B5CF6'];

type TFn = (key: keyof Strings) => string;

function dayLabel(ts: number, t: TFn): string {
  const d = new Date(ts);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yestStart = todayStart - 86400000;
  const convStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (convStart >= todayStart) return t('today');
  if (convStart >= yestStart) return t('yesterday');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function groupConversations(convs: Conversation[], t: TFn): { label: string; items: Conversation[] }[] {
  const map = new Map<string, Conversation[]>();
  for (const conv of convs) {
    const label = dayLabel(conv.createdAt, t);
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(conv);
  }
  return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  const anim = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.75, duration: 750, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.35, duration: 750, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View style={[sk.card, { opacity: anim }]}>
      <View style={sk.accent} />
      <View style={sk.body}>
        <View style={sk.line1} />
        <View style={sk.line2} />
        <View style={sk.line3} />
      </View>
    </Animated.View>
  );
}

const sk = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 2,
    backgroundColor: '#0B0B0B', borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden', height: 72,
  },
  accent: { width: 3, alignSelf: 'stretch', borderTopLeftRadius: 16, borderBottomLeftRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)' },
  body: { flex: 1, paddingVertical: 14, paddingHorizontal: 14, gap: 6 },
  line1: { height: 12, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 6, width: '65%' },
  line2: { height: 10, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 5, width: '85%' },
  line3: { height: 9, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 4, width: '40%' },
});

// ── Link preview ──────────────────────────────────────────────────────────────

const SCREEN_W = Dimensions.get('window').width;
const SUPABASE_URL_LPC = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;

function extractFirstPreviewURL(text: string): string | null {
  const matches = text.match(URL_RE) ?? [];
  return matches.find(u =>
    !u.includes('supabase.co/storage') &&
    !u.includes('supabase.co/auth') &&
    u.startsWith('https://')
  ) ?? null;
}

type LPCPreviewData = {
  type: 'youtube' | 'spotify' | 'apple_music' | 'twitter' | 'link';
  url: string;
  title?: string;
  description?: string;
  image?: string;
  author?: string;
  siteName?: string;
} | null;

const lpcCache = new Map<string, LPCPreviewData>();

const LPC_TYPE_META: Record<string, { color: string; label: string; icon: string }> = {
  youtube:     { color: '#FF0000', label: 'YouTube',     icon: '▶' },
  spotify:     { color: '#1DB954', label: 'Spotify',     icon: '♫' },
  apple_music: { color: '#FC3C44', label: 'Apple Music', icon: '♫' },
  twitter:     { color: '#1D9BF0', label: 'X (Twitter)', icon: '𝕏' },
  link:        { color: 'rgba(255,255,255,0.35)', label: '', icon: '↗' },
};

function LinkPreviewCard({ url }: { url: string }) {
  const [data, setData] = useState<LPCPreviewData | 'loading'>(
    lpcCache.has(url) ? (lpcCache.get(url) ?? null) : 'loading'
  );

  useEffect(() => {
    if (lpcCache.has(url)) return;
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { lpcCache.set(url, null); if (!cancelled) setData(null); return; }
      fetch(`${SUPABASE_URL_LPC}/functions/v1/link-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ url }),
      })
        .then(r => r.json())
        .then(d => { lpcCache.set(url, d); if (!cancelled) setData(d); })
        .catch(() => { lpcCache.set(url, null); if (!cancelled) setData(null); });
    });
    return () => { cancelled = true; };
  }, [url]);

  if (data === 'loading') return <View style={lpc.skeleton} />;
  if (!data || (!data.title && !data.image)) return null;

  const meta = LPC_TYPE_META[data.type] ?? LPC_TYPE_META.link;
  const isHorizontal = data.type === 'spotify' || data.type === 'apple_music';
  const isTwitter = data.type === 'twitter';

  return (
    <TouchableOpacity style={lpc.card} onPress={() => Linking.openURL(url)} activeOpacity={0.85}>
      {!isHorizontal && !isTwitter && data.image ? (
        <Image source={{ uri: data.image }} style={lpc.thumbWide} resizeMode="cover" />
      ) : null}
      <View style={[lpc.body, isHorizontal && { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
        {isHorizontal && data.image ? (
          <Image source={{ uri: data.image }} style={lpc.thumbSquare} resizeMode="cover" />
        ) : null}
        <View style={{ flex: 1 }}>
          <View style={lpc.badge}>
            <Text style={[lpc.badgeIcon, { color: meta.color }]}>{meta.icon}</Text>
            {meta.label ? <Text style={[lpc.badgeLabel, { color: meta.color }]}>{meta.label}</Text> : null}
          </View>
          {data.title ? <Text style={lpc.title} numberOfLines={2}>{data.title}</Text> : null}
          {data.author && !isHorizontal ? <Text style={lpc.sub} numberOfLines={1}>{data.author}</Text> : null}
          {data.description && !isHorizontal ? <Text style={lpc.desc} numberOfLines={isTwitter ? 6 : 2}>{data.description}</Text> : null}
          {data.siteName && !meta.label ? <Text style={lpc.site} numberOfLines={1}>{data.siteName}</Text> : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const lpc = StyleSheet.create({
  skeleton: { height: 72, borderRadius: 16, marginTop: 8, backgroundColor: 'rgba(255,255,255,0.04)', width: SCREEN_W - 32 },
  card: { marginTop: 8, borderRadius: 16, overflow: 'hidden', backgroundColor: '#0C0C0C', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)', width: SCREEN_W - 32 },
  thumbWide: { width: '100%', height: 180 },
  thumbSquare: { width: 64, height: 64, borderRadius: 10 },
  body: { padding: 12 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 },
  badgeIcon: { fontSize: 11, fontWeight: '700' },
  badgeLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  title: { color: '#fff', fontSize: 13, fontWeight: '700', lineHeight: 18, marginBottom: 3 },
  sub: { color: 'rgba(255,255,255,0.45)', fontSize: 11, lineHeight: 16 },
  desc: { color: 'rgba(255,255,255,0.45)', fontSize: 11, lineHeight: 16, marginTop: 2 },
  site: { color: 'rgba(255,255,255,0.3)', fontSize: 10, marginTop: 3 },
});

// ── Conversation detail modal ─────────────────────────────────────────────────

function ConversationModal({
  conv,
  profile,
  onClose,
  onContinue,
}: {
  conv: Conversation;
  profile: Profile | null;
  onClose: () => void;
  onContinue: () => void;
}) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const isAtLimit = profile?.tier === 'free' &&
    (profile.queries_today ?? 0) >= FREE_DAILY_LIMIT;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[md.root, { paddingTop: insets.top }]}>
        <View style={md.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="chevron-down" size={22} color={T.muted} />
          </TouchableOpacity>
          <Text style={md.title} numberOfLines={1}>{conv.title}</Text>
          <TouchableOpacity
            onPress={() => Share.share({ message: conv.messages.map(m => `${m.role === 'user' ? t('youPrefix') : 'slatt'}: ${m.content}`).join('\n\n') })}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="share" size={18} color={T.muted} />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={md.list} showsVerticalScrollIndicator={false}>
          {conv.messages.map(msg => {
            const previewUrl = extractFirstPreviewURL(msg.content);
            const displayContent = previewUrl
              ? msg.content.replace(previewUrl, '').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
              : msg.content;
            return msg.role === 'user' ? (
              <View key={msg.id}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onLongPress={() => Share.share({ message: msg.content })}
                  delayLongPress={400}
                  style={md.userWrap}
                >
                  <LinearGradient colors={GRAD_USER} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={md.userBubble}>
                    {!!displayContent && <Text style={md.userText}>{displayContent}</Text>}
                  </LinearGradient>
                </TouchableOpacity>
                {previewUrl && <View style={md.cardWrap}><LinkPreviewCard url={previewUrl} /></View>}
              </View>
            ) : (
              <View key={msg.id}>
                <TouchableOpacity
                  activeOpacity={1}
                  onLongPress={() => Share.share({ message: msg.content })}
                  delayLongPress={400}
                  style={md.agentBubble}
                >
                  <Text style={md.agentLabel}>slatt</Text>
                  {!!displayContent && <Text style={md.agentText}>{displayContent}</Text>}
                </TouchableOpacity>
                {previewUrl && <View style={md.cardWrap}><LinkPreviewCard url={previewUrl} /></View>}
              </View>
            );
          })}
        </ScrollView>

        <View style={[md.footer, { paddingBottom: insets.bottom + 12 }]}>
          {isAtLimit ? (
            <View style={md.limitWrap}>
              <Text style={md.limitText}>{t('dailyLimitMsg')}</Text>
            </View>
          ) : (
            <TouchableOpacity onPress={onContinue} activeOpacity={0.85} style={md.continueOuter}>
              <LinearGradient colors={['#1D9BF0', '#8B5CF6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={md.continueBtn}>
                <Feather name="message-circle" size={15} color="#fff" />
                <Text style={md.continueText}>{t('continueConversation')}</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const md = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.07)',
  },
  title: { flex: 1, color: T.text, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  list: { padding: 16, gap: 10, paddingBottom: 24 },
  userWrap: { alignSelf: 'flex-end', maxWidth: '80%' },
  userBubble: { borderRadius: 20, borderBottomRightRadius: 5, paddingVertical: 11, paddingHorizontal: 16 },
  userText: { color: '#fff', fontSize: 15, lineHeight: 22 },
  agentBubble: {
    alignSelf: 'flex-start', maxWidth: '88%',
    backgroundColor: '#0C0C0C', borderRadius: 20, borderBottomLeftRadius: 5,
    paddingVertical: 12, paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.07)',
  },
  agentLabel: { color: 'rgba(255,255,255,0.18)', fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginBottom: 7 },
  agentText: { color: 'rgba(255,255,255,0.88)', fontSize: 15, lineHeight: 23 },
  cardWrap: { alignSelf: 'flex-start', paddingLeft: 0 },
  footer: {
    paddingHorizontal: 16, paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.07)',
  },
  continueOuter: { borderRadius: 16, overflow: 'hidden' },
  continueBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52 },
  continueText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  limitWrap: {
    backgroundColor: 'rgba(245,200,66,0.08)', borderRadius: 12, padding: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(245,200,66,0.2)',
    alignItems: 'center',
  },
  limitText: { color: T.pro, fontSize: 13, fontWeight: '600', textAlign: 'center' },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function HistoryScreen() {
  const router = useRouter();
  const { lang, t } = useLanguage();
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    return () => { mounted.current = false; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, { data: { user } }] = await Promise.all([
        loadConversations(),
        supabase.auth.getUser(),
      ]);
      if (!mounted.current) return;
      setConvs(data);
      if (user) {
        const { data: p } = await supabase
          .from('profiles')
          .select('id, tier, queries_today, queries_reset_date, stripe_customer_id, stripe_subscription_id')
          .eq('id', user.id)
          .single();
        if (p && mounted.current) setProfile(p as Profile);
      }
    } catch {
      // Auth session gone
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleDelete = (id: string) => {
    Alert.alert(t('deleteConvTitle'), t('deleteConvMsg'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'), style: 'destructive',
        onPress: async () => {
          await deleteConversation(id);
          setConvs(prev => prev.filter(c => c.id !== id));
          if (selected?.id === id) setSelected(null);
        },
      },
    ]);
  };

  const handleClearAll = () => {
    if (convs.length === 0) return;
    Alert.alert(t('clearAllTitle'), t('clearAllMsg'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('clearAll'), style: 'destructive',
        onPress: async () => {
          await clearHistory();
          setConvs([]);
        },
      },
    ]);
  };

  const handleContinue = (conv: Conversation) => {
    setPendingResume(conv);
    setSelected(null);
    router.navigate('/(tabs)/chat');
  };

  const groups = groupConversations(convs, t);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <Text style={s.title}>{t('historyTitle')}</Text>
        {convs.length > 0 && (
          <TouchableOpacity onPress={handleClearAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={s.clearBtn}>{t('clearAll')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 12, paddingBottom: 32 }}>
          <View style={s.skeletonSection}>
            <View style={s.skeletonLabel} />
          </View>
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
          <View style={[s.skeletonSection, { marginTop: 20 }]}>
            <View style={s.skeletonLabel} />
          </View>
          {[4, 5].map(i => <SkeletonCard key={i} />)}
        </ScrollView>
      ) : convs.length === 0 ? (
        <View style={s.empty}>
          <View style={s.emptyIcon}>
            <Feather name="clock" size={28} color={T.faint} />
          </View>
          <Text style={s.emptyTitle}>{t('noHistoryYet')}</Text>
          <Text style={s.emptySub}>{t('noHistorySub')}</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
          {groups.map(group => (
            <View key={group.label}>
              <Text style={s.sectionLabel}>{group.label}</Text>
              {group.items.map(conv => {
                const lastMsg = conv.messages[conv.messages.length - 1];
                const modeColor = conv.messages[0]?.mode === 'ask' ? T.ask : T.teach;
                return (
                  <TouchableOpacity
                    key={conv.id}
                    style={s.item}
                    onPress={() => setSelected(conv)}
                    activeOpacity={0.75}
                  >
                    <View style={[s.itemAccent, { backgroundColor: modeColor }]} />
                    <View style={s.itemBody}>
                      <Text style={s.itemTitle} numberOfLines={1}>{conv.title}</Text>
                      {lastMsg && (
                        <Text style={s.itemPreview} numberOfLines={1}>
                          {lastMsg.role === 'agent' ? 'slatt: ' : `${t('youPrefix')}: `}{lastMsg.content}
                        </Text>
                      )}
                      <Text style={s.itemMeta}>
                        {timeLabel(conv.createdAt)} · {conv.messages.length} {conv.messages.length === 1 ? t('msgSingular') : t('msgPlural')}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleDelete(conv.id)}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      style={s.deleteBtn}
                    >
                      <Feather name="trash-2" size={15} color="rgba(255,255,255,0.18)" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}

      {selected && (
        <ConversationModal
          conv={selected}
          profile={profile}
          onClose={() => setSelected(null)}
          onContinue={() => handleContinue(selected)}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 6, paddingBottom: 16,
  },
  title: { color: '#FFF', fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  clearBtn: { color: 'rgba(255,69,58,0.7)', fontSize: 13, fontWeight: '600' },

  skeletonSection: { paddingHorizontal: 20, paddingBottom: 10 },
  skeletonLabel: { height: 10, width: 80, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 5 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: '#0C0C0C', alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.07)',
    marginBottom: 20,
  },
  emptyTitle: { color: '#FFF', fontSize: 17, fontWeight: '700', marginBottom: 10, textAlign: 'center' },
  emptySub: { color: T.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },

  sectionLabel: {
    color: T.faint, fontSize: 11, fontWeight: '700', letterSpacing: 1.2,
    paddingHorizontal: 20, paddingTop: 24, paddingBottom: 10,
  },
  item: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 2,
    backgroundColor: '#0B0B0B', borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  itemAccent: { width: 3, alignSelf: 'stretch', borderTopLeftRadius: 16, borderBottomLeftRadius: 16 },
  itemBody: { flex: 1, paddingVertical: 14, paddingHorizontal: 14 },
  itemTitle: { color: '#FFF', fontSize: 14, fontWeight: '600', marginBottom: 4, letterSpacing: -0.1 },
  itemPreview: { color: T.muted, fontSize: 13, lineHeight: 18, marginBottom: 6 },
  itemMeta: { color: T.faint, fontSize: 11, fontWeight: '500' },
  deleteBtn: { paddingRight: 16, paddingVertical: 12 },
});
