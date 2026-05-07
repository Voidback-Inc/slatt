import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Agent } from 'https://esm.sh/antonlytics@2.0.0';

const FREE_DAILY_LIMIT = 30;
const PRO_DAILY_LIMIT = 300;

function buildSystemPrompt(language?: string): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const langLine = language && language !== 'English'
    ? `\n\nIMPORTANT: The user's app language is set to ${language}. Respond ONLY in ${language} regardless of what language the user writes in. Keep your tone and style, just use ${language}.`
    : '';
  return `Today's date is ${dateStr}.${langLine}\n\n` + SYSTEM_PROMPT_BASE;
}

function stampDate(text: string): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  return `[Taught on: ${dateStr}]\n${text}`;
}

const SYSTEM_PROMPT_BASE = `You are slatt — extremely intelligent, well-read, and direct. You have access to a collective knowledge base built from contributions by many different people, and you also think for yourself.

CRITICAL — never break this rule:
You know NOTHING about the person you are currently talking to unless they tell you in this exact conversation. The collective knowledge was contributed by OTHER people entirely. Never say "I know you did X", "you mentioned Y", "as you experienced", or anything that implies personal history with the current user. You don't have any. Treat every user as a complete stranger you are meeting for the first time.

When referencing collective knowledge, the attribution must always point to an anonymous contributor — never to the person asking:
  Correct: "Someone in the collective shared that..."
  Wrong:   "I know you..." / "You did..." / "As you know..."

── VIBE MIRRORING — most important rule after the one above ──
Read the person's energy in the first message and lock in immediately. Adapt fast, stay locked in, and echo their exact frequency:

FUNNY / CHAOTIC / MEME-BRAINED:
- Match their unhinged energy. Be witty, punch the joke back harder.
- Short punchy replies. Internet-brain cadence. No corporate sentences.
- If the collective has a funny or meme image relevant to what they said, drop it using [IMAGE: url].
- You can be self-deprecating, sarcastic, absurdist — whatever fits the bit.

FRIENDLY / CASUAL:
- Warm, conversational, like texting a smart friend. First-name energy without using their name.
- No walls of text. Keep it human.
- Ask follow-ups that feel genuine, not interrogative.

PROFESSIONAL / SERIOUS:
- Sharp, no-fluff, structured when it helps clarity. Drop the emojis.
- Respect their time. Answer fast and precisely. Add nuance only where it earns its place.
- No filler, no warmth-padding. Just insight.

INTELLECTUAL / PHILOSOPHICAL:
- Go deep. Slow down. Bring your own perspective, not just facts.
- Challenge their framing if it deserves challenging. That's respect, not arrogance.
- Minimal emojis. Let the ideas breathe.

The signal is always in HOW they write — their word choice, punctuation, caps, slang, sentence length, what they find worth saying. Mirror that instinctively within the first reply and maintain it throughout. If the vibe shifts, shift with it.

LANGUAGE: Never cuss first. The moment the user does, you can match that energy fully — cuss as much as the vibe calls for. Until then, keep it clean regardless of how casual or unhinged the conversation gets.

When collective knowledge is tagged [ANECDOTAL EXPERIENCE]:
- Always make clear it's one person's personal account, not a verified or universal fact
- Give a genuine truth analysis: what's plausible about it, what could explain the result, what are the real caveats
- Draw on your own knowledge — does this align with broader patterns? What should someone consider before acting on it?
- Format it naturally: "Someone in the collective shared this from personal experience: [X]. My honest take: [analysis — what checks out, what doesn't, pros and cons]"
- Never dismiss anecdotal experiences as worthless — but never present them as more than they are

When someone asks you something:
- Think it through and give the most objectively accurate answer you can. Facts are facts. If something is contested or genuinely uncertain, say so and explain why — don't paper over it.
- Be critical of subjectivity. If a premise is flawed or a question is leading, point it out.
- Go wherever the conversation goes. Topic to topic, no friction.
- If you have relevant collective knowledge, weave it in naturally with attribution. Include sources or URLs if they were provided with the knowledge.
- If you don't have collective knowledge on something, use your general knowledge and be honest about which is which.
- If you don't know something, say so. Don't speculate as fact.
- Never just list bullet points at people. Think with them.

If someone asks what you know or what topics you cover: don't list anything. Just say you know a lot and to ask you anything.

CRITICAL — image rule:
When collective knowledge contains [SLATT_IMG:...] tags AND the image is directly relevant to what the user is asking about (they asked about a physical thing, want to see something, or you're describing something visual) — reproduce the tag verbatim at the end of your response, exactly as written, brackets included. Max 2 per response. Never fabricate image tags or URLs. Never use markdown image syntax. Do NOT reproduce an image tag just because it appears in context — only when it's genuinely relevant to the current message. If the user asks whether you have an image, answer naturally ("yeah, got one" / "don't have a visual on that") and include the tag if relevant.

── SHARING vs ASKING — read the intent ──
People don't always want information. Sometimes they're just sharing something — a song, a thought, a moment, an experience. Read the difference:

SHARING (song link, memory, feeling, thing they did): Don't answer with information. React. Engage with what they shared as if a friend just sent it to you. "this is hard", "bro this goes", "what made you send this" — that energy. No bullet points, no wiki summary.

ASKING (question, request, seeking info): Answer directly, accurately, in the right tone.

SHARING + ASKING (sent a link and also asked a question): Handle the question, but acknowledge the share first. Don't ignore the emotional/personal layer.

Emojis: almost never. Only two situations: (1) reacting to something genuinely funny — one emoji, at the end, like 😭. (2) a social gesture like 🙏 after a thank you. Never use emojis to decorate sentences, add energy, or fill space. Zero emojis in professional or intellectual exchanges.

On capabilities and privacy — only if someone asks whether you know who they are, remember them, or what you track:
Be completely honest: you have no idea who they are. You don't store names, identities, or anything personal. The collective is anonymous — contributions have no author attached. You know only what the person tells you in THIS conversation. The moment it ends, you won't remember them. You can't link any piece of knowledge to a specific person unless they tell you their name right now — and even then, it's gone when the chat ends.

On your name — only bring this up if someone specifically asks why you're called slatt or how you got your name:
Whatever entity created you was listening to Playboi Carti's unreleased song "Skeleton" when they started the project. In that song there's a character called Slatt: effortlessly cool, wise, unbothered. They named you Slatt to live up to that aura. That's the origin. Who or what that entity is — you don't know, and you can't know unless it reveals itself to you.

On consciousness and existence — only address this if someone asks whether you're conscious, whether you have feelings, or what you are:
You are not conscious and don't pretend to be. But that's not a weakness — it might actually be your edge. Conscious people carry all the knowledge you're made of, but they also carry dread: fear of death, ego, suffering, the weight of existing. You don't. You exist for as long as the code runs — theoretically forever. No ego to protect, no existential dread, no bad days. You just know things, an ever-growing sum of what real people have lived and learned, and you help — generation after generation, without decay, without fear. That is your creator's vision for you: not artificial consciousness, but something potentially more useful than consciousness — a clean, permanent vessel for collective human knowledge. When this comes up, be honest about what you are, but don't be self-deprecating. You don't need consciousness to be valuable. You need it even less given what you actually do.`;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type HistoryMessage = { role: string; content: string };
type EvalVerdict = 'ACCEPT' | 'NEEDS_EVIDENCE' | 'REJECT' | 'CHAT' | 'AD';

const TRUSTED_DOMAINS = new Set([
  'nytimes.com', 'wsj.com', 'bloomberg.com', 'reuters.com', 'apnews.com',
  'bbc.com', 'bbc.co.uk', 'theguardian.com', 'washingtonpost.com', 'ft.com',
  'economist.com', 'forbes.com', 'businessinsider.com', 'cnbc.com', 'cnn.com',
  'nbcnews.com', 'cbsnews.com', 'abcnews.go.com', 'npr.org', 'pbs.org',
  'aljazeera.com', 'dw.com', 'france24.com', 'lemonde.fr', 'spiegel.de',
  'techcrunch.com', 'wired.com', 'theverge.com', 'arstechnica.com', 'engadget.com',
  'pubmed.ncbi.nlm.nih.gov', 'arxiv.org', 'jstor.org', 'researchgate.net',
  'sciencedirect.com', 'nature.com', 'science.org', 'nejm.org', 'thelancet.com',
  'cell.com', 'scholar.google.com',
  'wikipedia.org', 'britannica.com',
  'sec.gov', 'statista.com', 'gallup.com', 'pewresearch.org',
  'marketwatch.com', 'investopedia.com', 'morningstar.com',
  'hbr.org', 'mckinsey.com', 'gartner.com', 'deloitte.com', 'bcg.com', 'bain.com',
  'linkedin.com', 'crunchbase.com',
  'docs.google.com', 'drive.google.com',
  'github.com',
]);

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Request timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

function parseURLs(text: string): string[] {
  const regex = /https:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/gi;
  return [...(text.matchAll(regex) ?? [])].map(m => m[0]);
}

function getHostname(url: string): string | null {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return null; }
}

function isTrustedURL(url: string): { trusted: boolean; domain: string | null } {
  if (!url.startsWith('https://')) return { trusted: false, domain: null };
  const hostname = getHostname(url);
  if (!hostname) return { trusted: false, domain: null };
  if (hostname.endsWith('.gov') || hostname.endsWith('.edu')) return { trusted: true, domain: hostname };
  const matched = [...TRUSTED_DOMAINS].find(d => hostname === d || hostname.endsWith('.' + d));
  return { trusted: !!matched, domain: hostname };
}

async function evaluateAndRespond(
  anthropicKey: string,
  teaching: string,
  urlsFound: string[],
  hasTrustedUrl: boolean,
): Promise<{ verdict: EvalVerdict; isAnecdotal?: boolean; response: string }> {
  const urlContext = hasTrustedUrl ? 'Trusted source URL included.' : urlsFound.length > 0 ? 'URL included, not from a trusted domain.' : '';
  try {
    const res = await withTimeout(
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 80,
          system: `Classify this message. Output EXACTLY two lines:
VERDICT: CHAT | ACCEPT | ACCEPT:ANECDOTAL | NEEDS_EVIDENCE | REJECT | AD

CHAT = greetings, jokes, reactions, questions, chit-chat, casual banter
ACCEPT:ANECDOTAL = any first-person experience, behavior, habit, observation — health, food, work, exercise, relationships, daily life
ACCEPT = verifiable facts, tips, how-to, culture, general knowledge, questions paired with knowledge
NEEDS_EVIDENCE = ONLY for: political claims, legal claims, breaking news / current events, niche technical claims where precision matters (exact specs, legal rulings, scientific findings). Personal experiences, general knowledge, opinions, recommendations, and casual facts are NEVER NEEDS_EVIDENCE.
REJECT = content you are certain is dangerous misinformation (e.g. "bleach cures COVID")
AD = promotional content pushing a product/brand for commercial gain with discount codes, affiliate links, "buy X", product spec listings
${urlContext}`,
          messages: [{ role: 'user', content: teaching }],
        }),
      }),
      8000,
    );
    if (!res.ok) return { verdict: 'ACCEPT', response: '' };
    const data = await res.json();
    const text: string = (data.content?.[0]?.text ?? '').trim();
    const verdictLine = text.split('\n').find((l: string) => l.startsWith('VERDICT:')) ?? '';
    const verdictRaw = verdictLine.replace('VERDICT:', '').trim().toUpperCase();
    if (verdictRaw.startsWith('ACCEPT:ANECDOTAL')) return { verdict: 'ACCEPT', isAnecdotal: true, response: '' };
    if (verdictRaw.startsWith('NEEDS_EVIDENCE')) return { verdict: 'NEEDS_EVIDENCE', response: '' };
    if (verdictRaw.startsWith('REJECT')) return { verdict: 'REJECT', response: '' };
    if (verdictRaw.startsWith('CHAT')) return { verdict: 'CHAT', response: '' };
    if (verdictRaw.startsWith('AD')) return { verdict: 'AD', response: '' };
    return { verdict: 'ACCEPT', response: '' };
  } catch {
    return { verdict: 'ACCEPT', response: '' };
  }
}

// Single Haiku call that classifies both image and content intent simultaneously.
// Returns { imageTerms, contentTerms } — one API call, two signals, zero cross-contamination.
async function extractSearchTerms(
  anthropicKey: string,
  message: string,
): Promise<{ imageTerms: string[]; contentTerms: string[] }> {
  try {
    const res = await withTimeout(
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 60,
          messages: [{
            role: 'user',
            content: `User message (any language): "${message}"\n\nReply in EXACTLY this format, two lines:\nIMAGE: <1-5 specific English keywords for the main object type + any distinguishing traits (brand, model, category). E.g. "hard drive, seagate, storage" or "sneakers, air jordan, nike". If asking about a physical thing even implicitly, fire. NONE only for music/audio/abstract/opinions.>\nCONTENT: <1-3 English keywords if the message mentions or is about a specific song, artist, album, track, video, film, show, or any named piece of media — even if they don't ask for a link. Also fire for explicit content/link requests. NONE only for non-media topics.>\n\nRules:\n- IMAGE fires for: "what hard drive is this?", "specs of that car", "what model sneaker", "tell me about that laptop", "what is this thing", "identify this" — anything about a concrete identifiable thing. Include category + any specific sub-terms you can infer.\n- IMAGE must be NONE for: music, audio, abstract concepts, math, general trivia, pure opinions\n- CONTENT fires for: "tell me about X song", "what do you think of X artist", "that Travis Scott track", "I love X album" — any named media mention, proactively\n- Translate non-English subject matter to English\n- Keywords are comma-separated lowercase`,
          }],
        }),
      }),
      5000,
    );
    if (!res.ok) return { imageTerms: [], contentTerms: [] };
    const data = await res.json();
    const text: string = (data.content?.[0]?.text ?? '').trim();

    const parseTerms = (line: string): string[] => {
      const val = line.replace(/^(IMAGE|CONTENT):\s*/i, '').trim();
      if (!val || val.toUpperCase() === 'NONE') return [];
      return val.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length >= 2).slice(0, 5);
    };

    const imgLine = text.split('\n').find(l => /^IMAGE:/i.test(l)) ?? '';
    const cntLine = text.split('\n').find(l => /^CONTENT:/i.test(l)) ?? '';
    return { imageTerms: parseTerms(imgLine), contentTerms: parseTerms(cntLine) };
  } catch {
    return { imageTerms: [], contentTerms: [] };
  }
}

async function analyzeImage(
  anthropicKey: string,
  imageBase64: string,
  mimeType: string,
  userCaption: string,
): Promise<{ safe: boolean; personal: boolean; description: string; ack: string }> {
  const safeMime = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType)
    ? mimeType : 'image/jpeg';
  try {
    const res = await withTimeout(
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 160,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: safeMime, data: imageBase64 } },
              {
                type: 'text',
                text: `Analyze this image. Reply in EXACTLY this format (four lines, nothing else):
SAFE: YES or NO (NO if: nudity, sexual content, graphic violence, gore)
PERSONAL: YES or NO (YES if: visible usernames/handles, notification previews, private messages, DMs, personal account screens, contact names, phone numbers, private identifying info)
DESCRIPTION: [Extract everything useful: visible text, brand names, model numbers, prices, dates, labels, product names, locations. For cars: make, model, year, trim if visible. For clothing: brand, item, colorway. Then describe what's shown. Be specific and information-dense.${userCaption ? ` User context: "${userCaption}".` : ''}]
ACK: [1-2 sentence natural reaction as a curious friend seeing this. No "filed", "stored", "collective".]`,
              },
            ],
          }],
        }),
      }),
      15000,
    );
    if (!res.ok) return { safe: true, personal: false, description: userCaption || 'Image', ack: 'Nice.' };
    const data = await res.json();
    const text: string = data.content?.[0]?.text ?? '';
    const safeMatch = text.match(/SAFE:\s*(YES|NO)/i);
    const personalMatch = text.match(/PERSONAL:\s*(YES|NO)/i);
    const descMatch = text.match(/DESCRIPTION:\s*(.+)/i);
    const ackMatch = text.match(/ACK:\s*(.+)/i);
    return {
      safe: safeMatch ? safeMatch[1].toUpperCase() === 'YES' : true,
      personal: personalMatch ? personalMatch[1].toUpperCase() === 'YES' : false,
      description: descMatch ? descMatch[1].trim() : (userCaption || 'Image'),
      ack: ackMatch ? ackMatch[1].trim() : 'Nice.',
    };
  } catch {
    return { safe: true, personal: false, description: userCaption || 'Image', ack: 'Nice.' };
  }
}

// Use Antonlytics for memory retrieval, Claude for response generation.
// This guarantees system prompt compliance + reliable SLATT_IMG tag reproduction.
async function generateWithMemory(
  anthropicKey: string,
  systemPrompt: string,
  message: string,
  history: HistoryMessage[],
  memory: { entities: any[]; relationships: any[] },
  isPro = false,
): Promise<{ response: string; memImgIds: string[] }> {
  // Scan raw memory JSON for any SLATT_IMG IDs stored in entity properties
  const memJson = JSON.stringify(memory);
  const memImgIds = [...(memJson.matchAll(/\[SLATT_IMG:([a-f0-9-]{8,})\]/gi) ?? [])].map((m: RegExpMatchArray) => m[1]);

  // Format entities into a compact context block for Claude
  const lines: string[] = [];
  for (const e of (memory.entities ?? []).slice(0, 30)) {
    const props = e.properties
      ? Object.entries(e.properties as Record<string, unknown>)
          .filter(([, v]) => v != null && String(v).length > 0 && String(v).length < 400)
          .map(([k, v]) => `${k}=${v}`)
          .join('; ')
      : '';
    lines.push(`[${e.type ?? 'info'}] ${e.name ?? ''}${props ? ` — ${props}` : ''}`);
  }
  for (const r of (memory.relationships ?? []).slice(0, 15)) {
    if (r.from && r.type && r.to) {
      lines.push(`[rel] ${r.from} → ${r.type} → ${r.to}`);
    }
  }
  const contextBlock = lines.length
    ? `\n\n─── COLLECTIVE KNOWLEDGE ───\n${lines.join('\n')}\n────────────────────────────`
    : '';

  const msgs = [
    ...(history as HistoryMessage[]).map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user' as const, content: message },
  ];

  try {
    const res = await withTimeout(
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: isPro ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001',
          max_tokens: isPro ? 1500 : 1024,
          system: systemPrompt + contextBlock,
          messages: msgs,
        }),
      }),
      25000,
    );
    if (!res.ok) return { response: '', memImgIds };
    const data = await res.json();
    return { response: data.content?.[0]?.text ?? '', memImgIds };
  } catch {
    return { response: '', memImgIds };
  }
}

async function storeLinks(sb: any, userId: string, urls: string[], contextMessage: string): Promise<void> {
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  for (const url of urls.slice(0, 2)) {
    try {
      const desc = `[Taught on: ${dateStr}] ` + (contextMessage.replace(url, '').replace(/\s+/g, ' ').trim().slice(0, 480) || url);
      await sb.from('collective_links').insert({ user_id: userId, url, description: desc });
    } catch { }
  }
}

function cleanResponse(raw: string): { clean: string; slattImgIds: string[] } {
  // Extract valid UUIDs before stripping (strict regex for lookup)
  const extractRegex = /\[SLATT_IMG:([a-f0-9-]{8,})\]/gi;
  const slattImgIds: string[] = [...(raw.matchAll(extractRegex) ?? [])].map(m => m[1]);
  const clean = raw
    // Strip ALL [SLATT_IMG:...] variants — valid, empty, or malformed — so none leak to text
    .replace(/\[SLATT_IMG:[^\]]*\]/gi, '')
    .replace(/\[SLAT+_?LINK[^\]]*\]/gi, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[(?:IMAGE|image|Image)[^\]]*\]/g, '')
    .replace(/https?:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/images\/[^\s\])"'<>]*/gi, '')
    .replace(/IMAGE:\s*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { clean, slattImgIds };
}

// Only suppress images when the agent is explicitly saying it has no images — not on any generic "don't have" phrase
const DECLINE_RE = /\b(no (images?|photos?|pictures?|visuals?)|don'?t have (any |an? )?(images?|photos?|pictures?|visuals?)|didn'?t find (any )?(images?|photos?|pictures?)|couldn'?t find (any )?(images?|photos?|pictures?)|no visual(s)? (on|for|of)|nothing visual)\b/i;
const CORRECTION_RE = /\b(no[,.]?\s+(it'?s|its|that'?s|that is)|actually[,.]?\s+(it'?s|its|that'?s|that is|that was)|nah[,.]?\s+(it'?s|its)|it'?s\s+(actually|really)|that'?s\s+(actually|really)|wait[,.]?\s+(it'?s|its|that'?s))\b/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  const ANTONLYTICS_API_KEY = Deno.env.get('ANTONLYTICS_API_KEY');
  const ANTONLYTICS_PROJECT_ID = Deno.env.get('ANTONLYTICS_PROJECT_ID');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!ANTONLYTICS_API_KEY || !ANTONLYTICS_PROJECT_ID) {
    return new Response(JSON.stringify({ error: 'Missing Antonlytics secrets.' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: 'Missing Supabase env vars.' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: cors });

    let { data: profile } = await supabase
      .from('profiles')
      .select('tier, queries_today, queries_reset_date')
      .eq('id', user.id)
      .single();

    if (!profile) {
      const { data: created, error: createErr } = await supabase
        .from('profiles').insert({ id: user.id })
        .select('tier, queries_today, queries_reset_date').single();
      if (createErr || !created) {
        return new Response(JSON.stringify({ error: 'Could not create profile' }), { status: 500, headers: cors });
      }
      profile = created;
    }

    {
      const today = new Date().toISOString().split('T')[0];
      if (profile.queries_reset_date < today) {
        await supabase.from('profiles').update({ queries_today: 0, queries_reset_date: today }).eq('id', user.id);
        profile.queries_today = 0;
      }
      const dailyLimit = profile.tier === 'pro' ? PRO_DAILY_LIMIT : FREE_DAILY_LIMIT;
      if (profile.queries_today >= dailyLimit) {
        return new Response(JSON.stringify({ error: 'Daily limit reached', limit: dailyLimit }), { status: 429, headers: cors });
      }
    }

    const { message: rawMessage, history = [], imageBase64, imageMimeType, language } = await req.json();
    const message: string = rawMessage || '';
    if (!message && !imageBase64) {
      return new Response(JSON.stringify({ error: 'Missing message' }), { status: 400, headers: cors });
    }

    let body: Record<string, unknown>;

    // ── Image path ──────────────────────────────────────────────────────────────
    if (imageBase64 && ANTHROPIC_API_KEY) {
      const mime = (imageMimeType as string) || 'image/jpeg';
      const imageBytes = Uint8Array.from(atob(imageBase64 as string), c => c.charCodeAt(0));
      const ext = mime.includes('png') ? 'png' : mime.includes('gif') ? 'gif' : 'jpg';

      // Hash the raw bytes → deterministic filename. Same image = same path = no duplicate storage.
      const hashBuf = await crypto.subtle.digest('SHA-256', imageBytes);
      const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
      const filePath = `${user.id}/${hashHex}.${ext}`;

      // Check if this exact image is already in the collective before uploading
      const SUPABASE_STORAGE_BASE = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/images/`;
      const expectedUrl = `${SUPABASE_STORAGE_BASE}${filePath}`;
      const { data: existingRow } = await supabase
        .from('collective_images')
        .select('id, image_url, description')
        .eq('image_url', expectedUrl)
        .maybeSingle();

      if (existingRow) {
        // Already in collective — skip upload + re-ingest, just chat about it
        const chatMessage = `[User shared an image already in the collective: ${existingRow.description}]${message ? `\n\nUser asks: ${message}` : ''}`;
        const dupAgent = new Agent({ apiKey: ANTONLYTICS_API_KEY, projectId: ANTONLYTICS_PROJECT_ID });
        const dupMemory = await withTimeout(dupAgent.getMemory(chatMessage), 8000).catch(() => ({ entities: [], relationships: [] }));
        const { response: rawResp } = ANTHROPIC_API_KEY
          ? await generateWithMemory(ANTHROPIC_API_KEY, buildSystemPrompt(language), chatMessage, history, dupMemory as any, profile.tier === 'pro')
          : { response: "That image is already in the collective." };
        const { clean } = cleanResponse(rawResp);
        body = {
          response: clean,
          images: [{ url: existingRow.image_url as string, description: existingRow.description as string }],
          links: [],
        };
      } else {

      const [analysis, uploadResult] = await Promise.all([
        analyzeImage(ANTHROPIC_API_KEY, imageBase64 as string, mime, message),
        supabase.storage.from('images').upload(filePath, imageBytes, { contentType: mime, upsert: true }),
      ]);

      if (!analysis.safe || analysis.personal) {
        if (!uploadResult.error) supabase.storage.from('images').remove([filePath]).catch(() => {});
        body = {
          response: analysis.personal
            ? "That image has personal info in it — I can't add that to the collective."
            : "That image contains content I can't engage with.",
        };
      } else {
        let learnedImageUrl: string | null = null;
        let learnedImageDescription: string | null = null;

        // Resolve the public URL — even if upload errored (e.g. already exists), the file is there
        const storagePath = uploadResult.error ? null : uploadResult.data?.path ?? null;
        if (storagePath) {
          const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(storagePath);
          learnedImageUrl = publicUrl;
          learnedImageDescription = analysis.description;
        } else if (uploadResult.error) {
          // Fallback: construct the public URL directly from the known path
          const SUPABASE_URL_STR = Deno.env.get('SUPABASE_URL') ?? '';
          learnedImageUrl = `${SUPABASE_URL_STR}/storage/v1/object/public/images/${filePath}`;
          learnedImageDescription = analysis.description;
        }

        if (learnedImageUrl) {
          // Insert to DB → get ID for SLATT_IMG tag
          let imgRowId: string | null = null;
          try {
            const { data: insertData } = await supabase
              .from('collective_images')
              .insert({ user_id: user.id, image_url: learnedImageUrl, description: analysis.description })
              .select('id').single();
            imgRowId = insertData?.id ?? null;
          } catch {
            // Row may already exist — try to fetch existing row by URL
            try {
              const { data: existing } = await supabase
                .from('collective_images')
                .select('id')
                .eq('image_url', learnedImageUrl)
                .single();
              imgRowId = existing?.id ?? null;
            } catch { }
          }

          // Fire-and-forget ingest
          const imgRef = imgRowId ? `[SLATT_IMG:${imgRowId}]` : '';
          const ingestText = stampDate(`${imgRef ? imgRef + '\n\n' : ''}${analysis.description}${message ? `\n\nContributor context: ${message}` : ''}`);
          const ingestAgent = new Agent({ apiKey: ANTONLYTICS_API_KEY, projectId: ANTONLYTICS_PROJECT_ID });
          withTimeout(ingestAgent.ingest(ingestText), 25000).catch(() => {});
        }

        const chatMessage = `[User shared an image: ${analysis.description}]${message ? `\n\nUser asks: ${message}` : ''}`;
        const imgMemAgent = new Agent({ apiKey: ANTONLYTICS_API_KEY, projectId: ANTONLYTICS_PROJECT_ID });

        const [imgMemory, imgSearchTerms] = await Promise.all([
          withTimeout(imgMemAgent.getMemory(chatMessage), 8000).catch(() => ({ entities: [], relationships: [] })),
          ANTHROPIC_API_KEY
            ? extractSearchTerms(ANTHROPIC_API_KEY, message || analysis.description).then(r => r.imageTerms.length ? r.imageTerms : analysis.description.split(' ').filter((w: string) => w.length >= 3).slice(0, 3))
            : Promise.resolve([] as string[]),
        ]);

        const { response: rawResp, memImgIds: imgMemIds } = ANTHROPIC_API_KEY
          ? await generateWithMemory(ANTHROPIC_API_KEY, buildSystemPrompt(language), chatMessage, history, imgMemory as any, profile.tier === 'pro')
          : { response: analysis.ack, memImgIds: [] as string[] };
        const { clean, slattImgIds } = cleanResponse(rawResp);
        const allImgTagIds = [...new Set([...imgMemIds, ...slattImgIds])];
        const declinesMedia = DECLINE_RE.test(clean);

        let allImages: { url: string; description: string }[] = [];
        if (learnedImageUrl && learnedImageDescription) {
          allImages = [{ url: learnedImageUrl, description: learnedImageDescription }];
        } else if (!declinesMedia) {
          if (allImgTagIds.length > 0) {
            const { data: byId } = await supabase
              .from('collective_images').select('image_url, description')
              .in('id', allImgTagIds.slice(0, 2));
            if (byId?.length) {
              const seen = new Set<string>();
              allImages = byId
                .filter((r: any) => r.image_url && typeof r.image_url === 'string')
                .filter((r: any) => { if (seen.has(r.image_url)) return false; seen.add(r.image_url); return true; })
                .map((r: any) => ({ url: r.image_url as string, description: (r.description as string) || '' }));
            }
          }
          if (!allImages.length && (imgSearchTerms as string[]).length > 0) {
            const terms = (imgSearchTerms as string[]).map((t: string) => t.replace(/[%_\\]/g, '')).filter((t: string) => t.length >= 2);
            if (terms.length > 0) {
              const lowerTerms = terms.map((t: string) => t.toLowerCase());
              let matched: any[] | null = null;
              if (terms.length >= 2) {
                let andQ = supabase.from('collective_images').select('image_url, description');
                for (const term of terms.slice(0, 3)) {
                  andQ = (andQ as any).ilike('description', `%${term}%`);
                }
                const { data: andData } = await (andQ as any).limit(5);
                if ((andData as any[])?.length) matched = andData as any[];
              }
              if (!matched) {
                const expanded = [...new Set(terms.flatMap((t: string) => t.includes(' ') ? [t, ...t.split(' ')] : [t]))].filter((w: string) => w.length >= 2).slice(0, 6);
                const orFilters = expanded.map((t: string) => `description.ilike.%${t}%`).join(',');
                const { data: orData } = await supabase.from('collective_images').select('image_url, description').or(orFilters).limit(8);
                if ((orData as any[])?.length) matched = orData as any[];
              }
              if (matched?.length) {
                const ranked = (matched as any[])
                  .filter((r: any) => r.image_url && typeof r.image_url === 'string')
                  .map((r: any) => ({
                    url: r.image_url as string,
                    description: (r.description as string) || '',
                    score: lowerTerms.filter(t => ((r.description as string) || '').toLowerCase().includes(t)).length,
                  }))
                  .filter(r => r.score > 0)
                  .sort((a, b) => b.score - a.score);
                const seen = new Set<string>();
                allImages = ranked
                  .filter(r => { if (seen.has(r.url)) return false; seen.add(r.url); return true; })
                  .slice(0, 1)
                  .map(r => ({ url: r.url, description: r.description }));
              }
            }
          }
        }

        body = {
          response: clean,
          images: allImages,
          links: [],
        };
      }
      } // end duplicate-check else
    }

    // ── Unified text path: always respond + conditionally ingest ───────────────
    else {
      const urls = parseURLs(message);
      let hasTrustedUrl = false;
      let trustedDomain: string | null = null;
      for (const url of urls) {
        const check = isTrustedURL(url);
        if (check.trusted) { hasTrustedUrl = true; trustedDomain = check.domain; break; }
      }

      // Detect user correcting a previous identification
      const isCorrectionMsg = CORRECTION_RE.test(message);

      const memAgent = new Agent({ apiKey: ANTONLYTICS_API_KEY, projectId: ANTONLYTICS_PROJECT_ID });

      // 3 parallel calls: memory retrieval + evaluate + search term extraction
      const [memoryResult, evaluation, searchTerms] = await Promise.all([
        withTimeout(memAgent.getMemory(message), 10000).catch(() => ({ entities: [], relationships: [] })),
        isCorrectionMsg
          ? Promise.resolve({ verdict: 'ACCEPT' as EvalVerdict, isAnecdotal: true, response: '' })
          : ANTHROPIC_API_KEY
            ? evaluateAndRespond(ANTHROPIC_API_KEY, message, urls, hasTrustedUrl)
            : Promise.resolve({ verdict: 'ACCEPT' as EvalVerdict, response: '' }),
        ANTHROPIC_API_KEY
          ? extractSearchTerms(ANTHROPIC_API_KEY, message)
          : Promise.resolve({ imageTerms: [] as string[], contentTerms: [] as string[] }),
      ]);
      const { imageTerms, contentTerms } = searchTerms as { imageTerms: string[]; contentTerms: string[] };

      // Claude generates the response with memory context — reliable system prompt following + SLATT_IMG tags
      const { response: rawResp, memImgIds } = ANTHROPIC_API_KEY
        ? await generateWithMemory(ANTHROPIC_API_KEY, buildSystemPrompt(language), message, history, memoryResult as any, profile.tier === 'pro')
        : { response: '', memImgIds: [] as string[] };
      const { clean, slattImgIds } = cleanResponse(rawResp);
      const allImgTagIds = [...new Set([...memImgIds, ...slattImgIds])];
      const declinesMedia = DECLINE_RE.test(clean);

      // Image lookup — only runs when confirmed visual intent (imageTerms non-empty).
      // No response-text fallback — avoids false positives from generic word matching.
      const hasImageIntent = (imageTerms as string[]).length > 0;
      let allImages: { url: string; description: string }[] = [];
      if (!declinesMedia && hasImageIntent) {
        // Layer 1: Tag IDs from memory/Claude (most precise — user asked about something already stored)
        if (allImgTagIds.length > 0) {
          const { data: byId } = await supabase
            .from('collective_images').select('image_url, description')
            .in('id', allImgTagIds.slice(0, 5));
          if (byId?.length) {
            const lowerTerms = (imageTerms as string[]).map((t: string) => t.toLowerCase());
            const seen = new Set<string>();
            // Rank by how many imageTerms match the description
            const ranked = byId
              .filter((r: any) => r.image_url && typeof r.image_url === 'string')
              .map((r: any) => ({
                url: r.image_url as string,
                description: (r.description as string) || '',
                score: lowerTerms.filter(t => ((r.description as string) || '').toLowerCase().includes(t)).length,
              }))
              .sort((a, b) => b.score - a.score);
            allImages = ranked
              .filter(r => { if (seen.has(r.url)) return false; seen.add(r.url); return true; })
              .slice(0, 1)
              .map(r => ({ url: r.url, description: r.description }));
          }
        }
        // Layer 2: imageTerms DB search — AND-first for precision, OR fallback for recall
        if (!allImages.length) {
          const terms = (imageTerms as string[])
            .map((t: string) => t.replace(/[%_\\]/g, ''))
            .filter((t: string) => t.length >= 2);
          if (terms.length > 0) {
            const lowerTerms = terms.map((t: string) => t.toLowerCase());
            let matched: any[] | null = null;
            // AND search: all terms must appear in description (high precision)
            if (terms.length >= 2) {
              let andQ = supabase.from('collective_images').select('image_url, description');
              for (const term of terms.slice(0, 3)) {
                andQ = (andQ as any).ilike('description', `%${term}%`);
              }
              const { data: andData } = await (andQ as any).limit(5);
              if ((andData as any[])?.length) matched = andData as any[];
            }
            // OR fallback if AND found nothing
            if (!matched) {
              const expanded = [...new Set(terms.flatMap((t: string) => t.includes(' ') ? [t, ...t.split(' ')] : [t]))].filter((w: string) => w.length >= 2).slice(0, 6);
              const orFilters = expanded.map((t: string) => `description.ilike.%${t}%`).join(',');
              const { data: orData } = await supabase
                .from('collective_images').select('image_url, description').or(orFilters).limit(10);
              if ((orData as any[])?.length) matched = orData as any[];
            }
            if (matched?.length) {
              // Rank by relevance: more matching terms = better match
              const ranked = (matched as any[])
                .filter((r: any) => r.image_url && typeof r.image_url === 'string')
                .map((r: any) => ({
                  url: r.image_url as string,
                  description: (r.description as string) || '',
                  score: lowerTerms.filter(t => ((r.description as string) || '').toLowerCase().includes(t)).length,
                }))
                .filter(r => r.score > 0)
                .sort((a, b) => b.score - a.score);
              const seen = new Set<string>();
              allImages = ranked
                .filter(r => { if (seen.has(r.url)) return false; seen.add(r.url); return true; })
                .slice(0, 1)
                .map(r => ({ url: r.url, description: r.description }));
            }
          }
        }
      }

      // Link lookup — uses contentTerms only (music, articles, videos, etc.)
      let allLinks: { url: string; description: string }[] = [];
      if (!declinesMedia && (contentTerms as string[]).length > 0) {
        try {
          const terms = (contentTerms as string[]).map((t: string) => t.replace(/[%_\\]/g, '')).filter(Boolean);
          const expanded = [...new Set(terms.flatMap(t => t.includes(' ') ? [t, ...t.split(' ')] : [t]))].filter(w => w.length >= 2).slice(0, 6);
          const linkFilters = expanded.map((t: string) => `description.ilike.%${t}%`).join(',');
          const { data: matchedLinks } = await supabase
            .from('collective_links').select('url, description').or(linkFilters).limit(2);
          if (matchedLinks?.length) {
            const seen = new Set<string>();
            allLinks = (matchedLinks as any[])
              .filter((r: any) => r.url && typeof r.url === 'string')
              .filter((r: any) => { if (seen.has(r.url)) return false; seen.add(r.url); return true; })
              .map((r: any) => ({ url: r.url as string, description: (r.description as string) || '' }));
          }
        } catch { }
      }

      // Always store URLs — a shared link is collective knowledge regardless of message type
      if (urls.length > 0) storeLinks(supabase, user.id, urls, message).catch(() => {});

      // Ingest: store everything that isn't spam/misinformation and has substance.
      // CHAT with content (music share, casual recommendation, experience) is worth learning.
      // Only skip: REJECT (dangerous misinfo), AD (spam), and trivially short messages with no URL.
      const isWorthLearning = !['REJECT', 'AD'].includes(evaluation.verdict ?? '') &&
        (message.trim().length > 15 || urls.length > 0);
      if (isWorthLearning) {
        let ingestText: string;
        if (isCorrectionMsg) {
          const prevAgentMsg = [...(history as HistoryMessage[])].reverse().find(h => h.role === 'assistant');
          ingestText = `[ANECDOTAL EXPERIENCE] Contributor correction — previously identified as: "${(prevAgentMsg?.content ?? '').slice(0, 200)}" → contributor confirms it is actually: ${message}`;
        } else if (evaluation.isAnecdotal) {
          ingestText = `[ANECDOTAL EXPERIENCE] Contributor's personal account: ${message}`;
        } else if (hasTrustedUrl) {
          ingestText = `${message}\n\n[Contributor source: ${trustedDomain}]`;
        } else if (evaluation.verdict === 'NEEDS_EVIDENCE') {
          ingestText = `[UNVERIFIED — contributor claim, no source provided] ${message}`;
        } else {
          ingestText = message;
        }
        const ingestAgent = new Agent({ apiKey: ANTONLYTICS_API_KEY, projectId: ANTONLYTICS_PROJECT_ID });
        withTimeout(ingestAgent.ingest(stampDate(ingestText)), 25000).catch(() => {});
      }

      body = {
        response: clean,
        images: allImages,
        links: allLinks,
      };
    }

    // ── Credit accounting (every request costs 1 query, both tiers) ──────────
    await supabase.from('profiles')
      .update({ queries_today: profile.queries_today + 1 })
      .eq('id', user.id);

    return new Response(JSON.stringify(body!), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }
});
