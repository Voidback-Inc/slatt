import { supabase } from './supabase';

export type StoredMessage = {
  id: string;
  role: 'user' | 'agent';
  content: string;
  mode: 'teach' | 'ask';
  imageUri?: string;
  images?: { url: string; description: string }[];
  links?: { url: string; description: string }[];
};

export type Conversation = {
  id: string;
  title: string;
  createdAt: number;
  messages: StoredMessage[];
};

export async function loadConversations(): Promise<Conversation[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data, error: loadErr } = await supabase
      .from('conversations')
      .select('id, title, created_at, messages')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (loadErr) console.warn('[history] load failed:', loadErr.message, loadErr.code);
    if (!data) return [];
    const rows = data.map((row: any) => ({
      id: row.id as string,
      title: row.title as string,
      createdAt: row.created_at as number,
      messages: (row.messages ?? []) as StoredMessage[],
    }));
    console.log('[history] loaded', rows.length, 'conversations for', user.id);
    return rows;
  } catch {
    return [];
  }
}

export async function upsertConversation(conv: Conversation): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    // Strip local file:// imageUri — ephemeral paths are useless in DB
    const messages = conv.messages.map(m => {
      if (!m.imageUri || m.imageUri.startsWith('http')) return m;
      const { imageUri: _drop, ...rest } = m;
      return rest;
    });
    const { error } = await supabase.from('conversations').upsert({
      id: conv.id,
      user_id: user.id,
      title: conv.title,
      created_at: conv.createdAt,
      messages,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      console.warn('[history] upsert failed:', error.message, error.code, error.details);
    } else {
      console.log('[history] upsert ok:', conv.id, 'msgs:', messages.length);
    }
  } catch (e) {
    console.warn('[history] upsert error:', e);
  }
}

export async function deleteConversation(id: string): Promise<void> {
  try {
    await supabase.from('conversations').delete().eq('id', id);
  } catch {}
}

export async function clearHistory(): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('conversations').delete().eq('user_id', user.id);
  } catch {}
}

// ── In-memory pending resume (history → chat) ─────────────────────────────────
let _pendingResume: Conversation | null = null;
export function setPendingResume(conv: Conversation): void { _pendingResume = conv; }
export function consumePendingResume(): Conversation | null {
  const c = _pendingResume;
  _pendingResume = null;
  return c;
}
