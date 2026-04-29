import { useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Alert, Modal, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { loadConversations, deleteConversation, clearHistory, setPendingResume, type Conversation } from '@/lib/history';
import { supabase } from '@/lib/supabase';
import { FREE_DAILY_LIMIT } from '@/lib/constants';
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

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yestStart = todayStart - 86400000;
  const convStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (convStart >= todayStart) return 'Today';
  if (convStart >= yestStart) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function groupConversations(convs: Conversation[]): { label: string; items: Conversation[] }[] {
  const map = new Map<string, Conversation[]>();
  for (const conv of convs) {
    const label = dayLabel(conv.createdAt);
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(conv);
  }
  return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
}

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
  const isAtLimit = profile?.tier === 'free' &&
    (profile.queries_today ?? 0) >= FREE_DAILY_LIMIT;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={md.root}>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          {/* Header */}
          <View style={md.header}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Feather name="chevron-down" size={22} color={T.muted} />
            </TouchableOpacity>
            <Text style={md.title} numberOfLines={1}>{conv.title}</Text>
            <TouchableOpacity
              onPress={() => Share.share({ message: conv.messages.map(m => `${m.role === 'user' ? 'You' : 'slatt'}: ${m.content}`).join('\n\n') })}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Feather name="share" size={18} color={T.muted} />
            </TouchableOpacity>
          </View>

          {/* Messages */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={md.list}
            showsVerticalScrollIndicator={false}
          >
            {conv.messages.map(msg =>
              msg.role === 'user' ? (
                <TouchableOpacity
                  key={msg.id}
                  activeOpacity={0.85}
                  onLongPress={() => Share.share({ message: msg.content })}
                  delayLongPress={400}
                  style={md.userWrap}
                >
                  <LinearGradient
                    colors={GRAD_USER}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={md.userBubble}
                  >
                    <Text style={md.userText}>{msg.content}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  key={msg.id}
                  activeOpacity={1}
                  onLongPress={() => Share.share({ message: msg.content })}
                  delayLongPress={400}
                  style={md.agentBubble}
                >
                  <Text style={md.agentLabel}>slatt</Text>
                  <Text style={md.agentText}>{msg.content}</Text>
                </TouchableOpacity>
              )
            )}
          </ScrollView>

          {/* Continue button */}
          <View style={md.footer}>
            {isAtLimit ? (
              <View style={md.limitWrap}>
                <Text style={md.limitText}>Daily limit reached — upgrade to continue.</Text>
              </View>
            ) : (
              <TouchableOpacity onPress={onContinue} activeOpacity={0.85} style={md.continueOuter}>
                <LinearGradient
                  colors={['#1D9BF0', '#8B5CF6']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={md.continueBtn}
                >
                  <Feather name="message-circle" size={15} color="#fff" />
                  <Text style={md.continueText}>Continue conversation</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
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
  footer: {
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.07)',
  },
  continueOuter: { borderRadius: 16, overflow: 'hidden' },
  continueBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 52,
  },
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
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [selected, setSelected] = useState<Conversation | null>(null);

  const load = useCallback(async () => {
    const [data, { data: { user } }] = await Promise.all([
      loadConversations(),
      supabase.auth.getUser(),
    ]);
    setConvs(data);
    if (user) {
      const { data: p } = await supabase
        .from('profiles')
        .select('id, tier, queries_today, queries_reset_date, stripe_customer_id, stripe_subscription_id')
        .eq('id', user.id)
        .single();
      if (p) setProfile(p as Profile);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleDelete = (id: string) => {
    Alert.alert('Delete conversation', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
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
    Alert.alert('Clear all history', 'Delete all conversations? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear all', style: 'destructive',
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

  const groups = groupConversations(convs);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <Text style={s.title}>History</Text>
        {convs.length > 0 && (
          <TouchableOpacity onPress={handleClearAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={s.clearBtn}>Clear all</Text>
          </TouchableOpacity>
        )}
      </View>

      {convs.length === 0 ? (
        <View style={s.empty}>
          <View style={s.emptyIcon}>
            <Feather name="clock" size={28} color={T.faint} />
          </View>
          <Text style={s.emptyTitle}>No history yet</Text>
          <Text style={s.emptySub}>Your conversations will appear here after your first chat.</Text>
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
                          {lastMsg.role === 'agent' ? 'slatt: ' : 'You: '}{lastMsg.content}
                        </Text>
                      )}
                      <Text style={s.itemMeta}>
                        {timeLabel(conv.createdAt)} · {conv.messages.length} {conv.messages.length === 1 ? 'message' : 'messages'}
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
