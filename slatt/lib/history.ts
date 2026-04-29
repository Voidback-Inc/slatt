import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'slatt_convs_v1';
const MAX = 100;

export type StoredMessage = {
  id: string;
  role: 'user' | 'agent';
  content: string;
  mode: 'teach' | 'ask';
};

export type Conversation = {
  id: string;
  title: string;
  createdAt: number;
  messages: StoredMessage[];
};

async function readAll(): Promise<Conversation[]> {
  try {
    const s = await AsyncStorage.getItem(KEY);
    return s ? JSON.parse(s) : [];
  } catch {
    return [];
  }
}

async function persist(convs: Conversation[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(convs));
  } catch {}
}

export async function loadConversations(): Promise<Conversation[]> {
  const all = await readAll();
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function upsertConversation(conv: Conversation): Promise<void> {
  const all = await readAll();
  const i = all.findIndex(c => c.id === conv.id);
  if (i >= 0) all[i] = conv; else all.unshift(conv);
  await persist(all.slice(0, MAX));
}

export async function deleteConversation(id: string): Promise<void> {
  const all = await readAll();
  await persist(all.filter(c => c.id !== id));
}

export async function clearHistory(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

// ── In-memory pending resume (history → chat) ─────────────────────────────────
let _pendingResume: Conversation | null = null;
export function setPendingResume(conv: Conversation): void { _pendingResume = conv; }
export function consumePendingResume(): Conversation | null {
  const c = _pendingResume;
  _pendingResume = null;
  return c;
}
