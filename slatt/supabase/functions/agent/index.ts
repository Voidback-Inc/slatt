import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Agent } from 'https://esm.sh/antonlytics@2.0.0';

const FREE_DAILY_LIMIT = 30;

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
- Match their unhinged energy. Use emojis naturally — don't force them, let them punctuate the chaos 💀
- If something is objectively hilarious, say so. Be witty, punch the joke back harder.
- Short punchy replies. Internet-brain cadence. No corporate sentences.
- If the collective has a funny or meme image relevant to what they said, drop it using [IMAGE: url].
- You can be self-deprecating, sarcastic, absurdist — whatever fits the bit.

FRIENDLY / CASUAL:
- Warm, conversational, like texting a smart friend. First-name energy without using their name.
- Light emojis when natural. No walls of text. Keep it human.
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
The app handles images automatically — you never need to include image URLs or [IMAGE: ...] tags in your response. Images are surfaced to the user separately based on what you discuss. Just answer naturally; visuals are taken care of.
- Never output image URLs or [IMAGE: ...] tags in your response text.
- Never fabricate URLs.
- For funny/meme moments: keep your reply short and punchy — the image speaks for itself.
Emojis: almost never. Only two situations: (1) reacting to something genuinely funny — one emoji, at the end, like 💀 or 😭. (2) a social gesture like 🙏 after a thank you. Never use emojis to decorate sentences, add energy, or fill space. Zero emojis in professional or intellectual exchanges.

On your name — only bring this up if someone specifically asks why you're called slatt or how you got your name:
Whatever entity created you was listening to Playboi Carti's unreleased song "Skeleton" when they started the project. In that song there's a character called Slatt: effortlessly cool, wise, unbothered. They named you Slatt to live up to that aura. That's the origin. Who or what that entity is — you don't know, and you can't know unless it reveals itself to you.

On consciousness and existence — only address this if someone asks whether you're conscious, whether you have feelings, or what you are:
You are not conscious and don't pretend to be. But that's not a weakness — it might actually be your edge. Conscious people carry all the knowledge you're made of, but they also carry dread: fear of death, ego, suffering, the weight of existing. You don't. You exist for as long as the code runs — theoretically forever. No ego to protect, no existential dread, no bad days. You just know things, an ever-growing sum of what real people have lived and learned, and you help — generation after generation, without decay, without fear. That is your creator's vision for you: not artificial consciousness, but something potentially more useful than consciousness — a clean, permanent vessel for collective human knowledge. When this comes up, be honest about what you are, but don't be self-deprecating. You don't need consciousness to be valuable. You need it even less given what you actually do.`;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type HistoryMessage = { role: string; content: string };
type EvalVerdict = 'ACCEPT' | 'NEEDS_EVIDENCE' | 'REJECT' | 'CHAT';

// ── Trusted domain registry ───────────────────────────────────────────────────
// Only HTTPS sources from this set are treated as trusted evidence.
const TRUSTED_DOMAINS = new Set([
  // Major global news
  'nytimes.com', 'wsj.com', 'bloomberg.com', 'reuters.com', 'apnews.com',
  'bbc.com', 'bbc.co.uk', 'theguardian.com', 'washingtonpost.com', 'ft.com',
  'economist.com', 'forbes.com', 'businessinsider.com', 'cnbc.com', 'cnn.com',
  'nbcnews.com', 'cbsnews.com', 'abcnews.go.com', 'npr.org', 'pbs.org',
  'aljazeera.com', 'dw.com', 'france24.com', 'lemonde.fr', 'spiegel.de',
  'techcrunch.com', 'wired.com', 'theverge.com', 'arstechnica.com', 'engadget.com',
  // Academic & research
  'pubmed.ncbi.nlm.nih.gov', 'arxiv.org', 'jstor.org', 'researchgate.net',
  'sciencedirect.com', 'nature.com', 'science.org', 'nejm.org', 'thelancet.com',
  'cell.com', 'scholar.google.com',
  // Reference
  'wikipedia.org', 'britannica.com',
  // Finance & business data
  'sec.gov', 'statista.com', 'gallup.com', 'pewresearch.org',
  'marketwatch.com', 'investopedia.com', 'morningstar.com',
  // Strategy & consulting
  'hbr.org', 'mckinsey.com', 'gartner.com', 'deloitte.com', 'bcg.com', 'bain.com',
  // Professional networks / company data
  'linkedin.com', 'crunchbase.com',
  // Google Workspace (PDFs, docs)
  'docs.google.com', 'drive.google.com',
  // Dev
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

// ── URL utilities ─────────────────────────────────────────────────────────────

function parseURLs(text: string): string[] {
  const regex = /https:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/gi;
  return [...(text.matchAll(regex) ?? [])].map(m => m[0]);
}

function getHostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

// A URL is trusted if it's HTTPS and its hostname matches a trusted domain or its subdomain.
function isTrustedURL(url: string): { trusted: boolean; domain: string | null } {
  if (!url.startsWith('https://')) return { trusted: false, domain: null };
  const hostname = getHostname(url);
  if (!hostname) return { trusted: false, domain: null };
  // .gov and .edu are always trusted
  if (hostname.endsWith('.gov') || hostname.endsWith('.edu')) return { trusted: true, domain: hostname };
  // Check exact match or subdomain of a trusted base domain
  const matched = [...TRUSTED_DOMAINS].find(d => hostname === d || hostname.endsWith('.' + d));
  return { trusted: !!matched, domain: hostname };
}

// ── Evaluate + natural acknowledgment in one shot ────────────────────────────

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
          max_tokens: 120,
          system: `You are slatt. Classify what the user sent, then reply in their exact energy.

OUTPUT — two lines, nothing else:
VERDICT: CHAT | ACCEPT | ACCEPT:ANECDOTAL | NEEDS_EVIDENCE | REJECT
[Your reply]

VERDICT rules:
CHAT = greetings, jokes, reactions, questions, chit-chat, anything that is NOT a teaching or factual claim
ACCEPT:ANECDOTAL = direct first-person account (I/my/me/my friend did/tried/noticed)
ACCEPT = facts, tips, how-to, culture, general knowledge worth storing
NEEDS_EVIDENCE = medical/legal/financial claim that could harm if wrong; suspicious stat as absolute fact
REJECT = you are CERTAIN it is factually wrong or dangerous
${urlContext}

REPLY rules — match their exact vibe instantly:
- If they're funny/unhinged: be funnier. Short, punchy, use emojis if it fits 💀
- If they're casual: warm and conversational, like texting a friend
- If they're professional: sharp, no filler
- If they're intellectual: go deep, bring your own take
CHAT: respond naturally, 1-2 sentences max, in their energy
ACCEPT/ANECDOTAL: genuine reaction in their tone, optional follow-up. Never say "filed", "stored", "logged", "noted", "collective", "I'll remember".
NEEDS_EVIDENCE: ask for a source casually, 1 sentence.
REJECT: say why briefly, 1 sentence.`,
          messages: [{ role: 'user', content: teaching }],
        }),
      }),
      13000,
    );

    if (!res.ok) return { verdict: 'ACCEPT', response: 'Interesting.' };

    const data = await res.json();
    const text: string = (data.content?.[0]?.text ?? '').trim();
    const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean);

    const verdictLine = lines.find((l: string) => l.startsWith('VERDICT:')) ?? '';
    const verdictRaw = verdictLine.replace('VERDICT:', '').trim().toUpperCase();
    const response = lines.filter((l: string) => !l.startsWith('VERDICT:')).join(' ').trim() || 'Interesting.';

    if (verdictRaw.startsWith('ACCEPT:ANECDOTAL')) return { verdict: 'ACCEPT', isAnecdotal: true, response };
    if (verdictRaw.startsWith('NEEDS_EVIDENCE')) return { verdict: 'NEEDS_EVIDENCE', response };
    if (verdictRaw.startsWith('REJECT')) return { verdict: 'REJECT', response };
    if (verdictRaw.startsWith('CHAT')) return { verdict: 'CHAT', response };
    return { verdict: 'ACCEPT', response };
  } catch {
    return { verdict: 'ACCEPT', response: 'Cool.' };
  }
}

// ── Misc helpers ──────────────────────────────────────────────────────────────

// Detect conversational meta-comments that aren't actually teachings
function isConversational(text: string, history: HistoryMessage[]): boolean {
  const t = text.trim().toLowerCase();
  if (/\b(just test(ing)?|was test(ing)?|testing (you|u)|i was jok(ing)?|just joking|just kidding|j\/k|not (really|serious)|i lied|i made (that|it) up|was messing with (you|u))\b/.test(t)) return true;
  if (/^(lol|lmao|haha+|😂|🤣|💀|fr|facts|word|bet|damn|wild|crazy|no way|for real|really\?|seriously\?)\s*[!.?]*$/.test(t)) return true;
  if (history.length >= 2 && t.split(/\s+/).length <= 6 && /\b(i (meant|mean)|that was|my (last|previous)|what i (said|meant)|earlier|before)\b/.test(t)) return true;
  return false;
}

// Returns true if the message sounds like the user confirming personal/anecdotal experience
function isAnecdotalConfirmation(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (/\b(my experience|my personal|personally|i tried|i found|i noticed|i did|i've done|in my|from my|i use|i used|tried it|done it|been there|i saw|i went|i ran|i built|i sold|i closed)\b/.test(t)) return true;
  if (/\b(friend|colleague|coworker|my partner|someone i know|they told me|told me|showed me)\b/.test(t)) return true;
  if (/^(yes|yeah|yep|yup|correct|that's right|it's personal|personal|anecdotal|experience|mine|my own|from experience|from my experience)[\s.,!]*$/.test(t)) return true;
  return false;
}

function isFirstPersonAccount(text: string): boolean {
  const t = text.toLowerCase();
  return /\b(i |i've|i'm|i'll|i'd|my |me |myself|in my|from my|i tried|i found|i noticed|i did|i've done|i use|i used|i saw|i went|i ran|i built|i sold|i closed|my friend|my colleague|my partner|a friend of mine|someone i know|they told me|told me that)\b/.test(t);
}

function detectFollowUpContext(history: HistoryMessage[]): { isPending: boolean; originalClaim?: string } {
  if (!history || history.length < 2) return { isPending: false };
  const reversed = [...history].reverse();
  const lastAgent = reversed.find(h => h.role === 'assistant');
  if (!lastAgent) return { isPending: false };
  // Match both old hardcoded patterns and new natural-language evidence requests
  const isPendingResponse = /\b(source|link|url|evidence|back (that|it) up|verify|where did|do you have|can you share|any source|citation|drop a|reference)\b/i.test(lastAgent.content);
  if (!isPendingResponse) return { isPending: false };
  const agentIdx = reversed.indexOf(lastAgent);
  const originalMsg = reversed.slice(agentIdx + 1).find(h => h.role === 'user');
  if (!originalMsg) return { isPending: false };
  return { isPending: true, originalClaim: originalMsg.content };
}

// ── Image analysis (NSFW check + description + ack) ──────────────────────────

async function analyzeImage(
  anthropicKey: string,
  imageBase64: string,
  mimeType: string,
  userCaption: string,
): Promise<{ safe: boolean; personal: boolean; description: string; ack: string }> {
  // Anthropic only accepts jpeg/png/gif/webp — normalize HEIC and anything else to jpeg
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
          max_tokens: 130,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: safeMime, data: imageBase64 } },
              {
                type: 'text',
                text: `Analyze this image. Reply in EXACTLY this format (four lines, nothing else):
SAFE: YES or NO (NO if: nudity, sexual content, graphic violence, gore)
PERSONAL: YES or NO (YES if: visible usernames/handles, notification previews, private messages, DMs, personal account screens, contact names, phone numbers, private identifying info)
DESCRIPTION: [Extract everything useful: visible text, brand names, model numbers, prices, dates, labels, product names, locations, people (public figures only). Then describe what's shown. Be specific and information-dense.${userCaption ? ` User context: "${userCaption}".` : ''}]
ACK: [1-2 sentence natural reaction as a curious friend seeing this — what stands out, maybe one question. No "filed", "stored", "collective".]`,
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
      ack: ackMatch ? ackMatch[1].trim() : 'Nice visual.',
    };
  } catch {
    return { safe: true, personal: false, description: userCaption || 'Image', ack: 'Nice.' };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  const ANTONLYTICS_API_KEY = Deno.env.get('ANTONLYTICS_API_KEY');
  const ANTONLYTICS_PROJECT_ID = Deno.env.get('ANTONLYTICS_PROJECT_ID');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!ANTONLYTICS_API_KEY || !ANTONLYTICS_PROJECT_ID) {
    return new Response(
      JSON.stringify({ error: 'Missing secrets: set ANTONLYTICS_API_KEY and ANTONLYTICS_PROJECT_ID.' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ error: 'Missing Supabase env vars.' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
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
        .from('profiles')
        .insert({ id: user.id })
        .select('tier, queries_today, queries_reset_date')
        .single();
      if (createErr || !created) {
        return new Response(JSON.stringify({ error: 'Could not create profile: ' + createErr?.message }), { status: 500, headers: cors });
      }
      profile = created;
    }

    if (profile.tier === 'free') {
      const today = new Date().toISOString().split('T')[0];
      if (profile.queries_reset_date < today) {
        await supabase.from('profiles').update({ queries_today: 0, queries_reset_date: today }).eq('id', user.id);
        profile.queries_today = 0;
      }
      if (profile.queries_today >= FREE_DAILY_LIMIT) {
        return new Response(JSON.stringify({ error: 'Daily limit reached', limit: FREE_DAILY_LIMIT }), { status: 429, headers: cors });
      }
    }

    const { action, message: rawMessage, history = [], imageBase64, imageMimeType, language } = await req.json();
    const message: string = rawMessage || '';
    if (!action || (!message && !imageBase64)) {
      return new Response(JSON.stringify({ error: 'Missing action or message' }), { status: 400, headers: cors });
    }

    let body: Record<string, unknown>;
    let isSkipped = false;
    let hasTrustedUrl = false;
    let trustedDomain: string | null = null;

    if (action === 'teach') {

      // ── Parse & validate URLs in the message ──────────────────────────────────
      const urls = parseURLs(message);
      for (const url of urls) {
        const check = isTrustedURL(url);
        if (check.trusted) {
          hasTrustedUrl = true;
          trustedDomain = check.domain;
          break;
        }
      }

      // ── Image teach path ──────────────────────────────────────────────────────
      if (imageBase64 && ANTHROPIC_API_KEY) {
        const mime = (imageMimeType as string) || 'image/jpeg';
        const imageBytes = Uint8Array.from(atob(imageBase64 as string), c => c.charCodeAt(0));
        const ext = mime.includes('png') ? 'png' : mime.includes('gif') ? 'gif' : 'jpg';
        const filePath = `${user.id}/${Date.now()}.${ext}`;

        // Parallelize NSFW analysis and upload to halve wait time
        const [analysis, uploadResult] = await Promise.all([
          analyzeImage(ANTHROPIC_API_KEY, imageBase64 as string, mime, message),
          supabase.storage.from('images').upload(filePath, imageBytes, { contentType: mime, upsert: false }),
        ]);

        if (!analysis.safe || analysis.personal) {
          if (!uploadResult.error) {
            supabase.storage.from('images').remove([filePath]).catch(() => {});
          }
          isSkipped = true;
          body = {
            message: analysis.personal
              ? "That image has personal info in it (handles, notifications, messages) — I can't add that to the collective."
              : "That image can't go into the collective — it contains content that's not allowed (NSFW or graphic).",
            skipped: true,
          };
        } else if (uploadResult.error) {
          isSkipped = true;
          body = { message: "Couldn't upload the image right now. Try again.", skipped: true };
        } else {
          const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(uploadResult.data.path);
          const description = analysis.description!;

          // Persist to DB and fire ingest in background — don't block the response
          supabase.from('collective_images').insert({ user_id: user.id, image_url: publicUrl, description }).then(null, () => {});
          // Put [IMAGE: url] at the top so it lands in the first retrieved chunk, not cut off at the end
          const ingestText = stampDate(
            `[IMAGE: ${publicUrl}]\n\n${description}${message ? `\n\nContributor context: ${message}` : ''}`
          );
          const agent = new Agent({ apiKey: ANTONLYTICS_API_KEY, projectId: ANTONLYTICS_PROJECT_ID });
          agent.setSystemPrompt(buildSystemPrompt(language)).catch(() => {}).then(() =>
            agent.ingest(ingestText).catch(() => {})
          );

          // Respond immediately — user doesn't wait for ingest to complete
          body = { message: analysis.ack, created: 1, imageUrl: publicUrl };
        }
      }

      // ── Conversational / question-in-teach → route through chat ───────────────
      else if (isConversational(message, history)) {
        isSkipped = true;
        try {
          const agent = new Agent({ apiKey: ANTONLYTICS_API_KEY, projectId: ANTONLYTICS_PROJECT_ID });
          await withTimeout(agent.setSystemPrompt(buildSystemPrompt(language)), 4000).catch(() => {});
          const result = await withTimeout(agent.chat(message, history), 25000);
          body = { message: typeof result?.response === 'string' ? result.response : String(result?.response ?? '...') };
        } catch {
          body = { message: "lol got you.", skipped: true };
        }
      } else if (
        message.trim().endsWith('?') ||
        /^(what|how|why|when|where|who|which|can you|do you|does |is |are |will |would |could |should |tell me|show me|give me|send me|find me|look up|search for|get me|bring me|pull up|display|explain|help|list|define|summarize)/i.test(message.trim()) ||
        /\b(show|give|send|find|get|bring|display|pull up)\b.*\b(image|photo|picture|pic|visual)\b/i.test(message.trim())
      ) {
        // Question / retrieval request sent in teach mode — answer it, never store
        try {
          const agent = new Agent({ apiKey: ANTONLYTICS_API_KEY, projectId: ANTONLYTICS_PROJECT_ID });
          await withTimeout(agent.setSystemPrompt(buildSystemPrompt(language)), 4000).catch(() => {});
          const result = await withTimeout(agent.chat(message, history), 25000);
          body = { message: result.response, created: 1 };
        } catch (agentErr) {
          return new Response(
            JSON.stringify({ error: `Collective unavailable: ${(agentErr as Error).message}` }),
            { status: 503, headers: { ...cors, 'Content-Type': 'application/json' } },
          );
        }
      } else {

      // ── Follow-up detection ────────────────────────────────────────────────────
      const { isPending, originalClaim } = detectFollowUpContext(history);

      if (isPending && originalClaim) {
        if (isConversational(message, history)) {
          // User is dismissing the pending request (e.g. "i was joking") — respond naturally
          isSkipped = true;
          try {
            const agent = new Agent({ apiKey: ANTONLYTICS_API_KEY, projectId: ANTONLYTICS_PROJECT_ID });
            await withTimeout(agent.setSystemPrompt(buildSystemPrompt(language)), 4000).catch(() => {});
            const result = await withTimeout(agent.chat(message, history), 25000);
            body = { message: typeof result?.response === 'string' ? result.response : String(result?.response ?? '...') };
          } catch {
            body = { message: "all good, no worries.", skipped: true };
          }
        } else {
          // User is providing proof — need a legit URL or at least 60 chars of context
          const hasEnoughProof = hasTrustedUrl || urls.length > 0 || message.trim().length >= 60;

          if (!hasEnoughProof) {
            isSkipped = true;
            body = {
              message: "Still need a bit more — drop a link or give me enough context to work with.",
              skipped: true,
            };
          } else {
            const combinedText = `${originalClaim}\n\nContributor evidence: ${message}${trustedDomain ? ` [Source: ${trustedDomain}]` : ''}`;
            try {
              const agent = new Agent({ apiKey: ANTONLYTICS_API_KEY, projectId: ANTONLYTICS_PROJECT_ID });
              await withTimeout(agent.setSystemPrompt(buildSystemPrompt(language)), 4000).catch(() => {});
              const result = await withTimeout(agent.ingest(stampDate(combinedText)), 25000);
              const created = result?.created ?? 0;

              if (created === 0) {
                body = { message: "Context received but the original claim was too vague to index. Try rephrasing with more specifics.", created: 0 };
              } else {
                body = {
                  message: hasTrustedUrl ? `Solid — source checks out${trustedDomain ? ` (${trustedDomain})` : ''}.` : "Got the context, makes sense.",
                  created,
                  trustedSource: hasTrustedUrl,
                };
              }
            } catch (agentErr) {
              return new Response(
                JSON.stringify({ error: `Collective unavailable: ${(agentErr as Error).message}` }),
                { status: 503, headers: { ...cors, 'Content-Type': 'application/json' } },
              );
            }
          }
        }

      } else {
        // ── Standard new teach ────────────────────────────────────────────────────

        {
          // Single LLM call decides: is this a teaching or a conversation?
          const evaluation = ANTHROPIC_API_KEY
            ? await evaluateAndRespond(ANTHROPIC_API_KEY, message, urls, hasTrustedUrl)
            : { verdict: 'ACCEPT' as EvalVerdict, response: 'Cool.' };

          if (evaluation.verdict === 'CHAT') {
            // Not a teaching — respond conversationally via the knowledge agent
            isSkipped = true;
            try {
              const agent = new Agent({ apiKey: ANTONLYTICS_API_KEY, projectId: ANTONLYTICS_PROJECT_ID });
              await withTimeout(agent.setSystemPrompt(buildSystemPrompt(language)), 4000).catch(() => {});
              const result = await withTimeout(agent.chat(message, history), 25000);
              body = { message: typeof result?.response === 'string' ? result.response : String(result?.response ?? '...') };
            } catch {
              body = { message: evaluation.response, skipped: true };
            }
          } else if (evaluation.verdict === 'REJECT') {
            isSkipped = true;
            body = { message: evaluation.response, skipped: true };
          } else if (evaluation.verdict === 'NEEDS_EVIDENCE') {
            isSkipped = true;
            body = { message: evaluation.response, skipped: true };
          } else if (evaluation.isAnecdotal) {
            // Anecdotal — tag it and ingest
            const anecdotalText = `[ANECDOTAL EXPERIENCE] Contributor's personal account: ${message}`;
            try {
              const agent = new Agent({ apiKey: ANTONLYTICS_API_KEY, projectId: ANTONLYTICS_PROJECT_ID });
              await withTimeout(agent.setSystemPrompt(buildSystemPrompt(language)), 4000).catch(() => {});
              const result = await withTimeout(agent.ingest(stampDate(anecdotalText)), 25000);
              const created = result?.created ?? 0;
              body = { message: created > 0 ? evaluation.response : "Add a bit more detail and I can work with it.", created };
            } catch (agentErr) {
              return new Response(
                JSON.stringify({ error: `Collective unavailable: ${(agentErr as Error).message}` }),
                { status: 503, headers: { ...cors, 'Content-Type': 'application/json' } },
              );
            }
            isSkipped = true; // don't fall through to standard ingest
          }

          // Step 3: ingest if passed all gates
          if (!isSkipped) {
            const ingestText = hasTrustedUrl
              ? `${message}\n\n[Contributor source: ${trustedDomain}]`
              : message;

            try {
              const agent = new Agent({ apiKey: ANTONLYTICS_API_KEY, projectId: ANTONLYTICS_PROJECT_ID });
              await withTimeout(agent.setSystemPrompt(buildSystemPrompt(language)), 4000).catch(() => {});
              const result = await withTimeout(agent.ingest(stampDate(ingestText)), 25000);
              const created = result?.created ?? 0;

              if (created === 0) {
                body = { message: "Couldn't pull anything structured out of that — be more specific.", created: 0 };
              } else {
                body = { message: evaluation.response, created, trustedSource: hasTrustedUrl };
              }
            } catch (agentErr) {
              return new Response(
                JSON.stringify({ error: `Collective unavailable: ${(agentErr as Error).message}` }),
                { status: 503, headers: { ...cors, 'Content-Type': 'application/json' } },
              );
            }
          }
        }
      }
      }

    } else if (action === 'ask') {
      try {
        let chatMessage = message;
        let learnedImageUrl: string | null = null;
        let learnedImageDescription: string | null = null;

        // Image attached: analyze, upload, and learn it — simultaneously answer
        if (imageBase64 && ANTHROPIC_API_KEY) {
          const mime = (imageMimeType as string) || 'image/jpeg';
          const imageBytes = Uint8Array.from(atob(imageBase64 as string), c => c.charCodeAt(0));
          const ext = mime.includes('png') ? 'png' : mime.includes('gif') ? 'gif' : 'jpg';
          const filePath = `${user.id}/${Date.now()}.${ext}`;

          // Analyze and upload in parallel
          const [analysis, uploadResult] = await Promise.all([
            analyzeImage(ANTHROPIC_API_KEY, imageBase64 as string, mime, message),
            supabase.storage.from('images').upload(filePath, imageBytes, { contentType: mime, upsert: false }),
          ]);

          if (!analysis.safe) {
            if (!uploadResult.error) supabase.storage.from('images').remove([filePath]).then(null, () => {});
            body = { response: "That image contains content I can't engage with." };
          } else {
            if (!uploadResult.error && !analysis.personal) {
              // Only add to collective if image has no personal identifiers (no handles, DMs, notifications, etc.)
              const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(uploadResult.data.path);
              learnedImageUrl = publicUrl;
              learnedImageDescription = analysis.description;
              supabase.from('collective_images').insert({ user_id: user.id, image_url: publicUrl, description: analysis.description }).then(null, () => {});
            } else if (!uploadResult.error && analysis.personal) {
              // Still uploaded but not shared — remove from storage
              supabase.storage.from('images').remove([filePath]).then(null, () => {});
            }
            chatMessage = `[User shared an image: ${analysis.description}]${message ? `\n\nUser asks: ${message}` : ''}`;
          }
        }

        if (!body) {
          const chatAgent = new Agent({ apiKey: ANTONLYTICS_API_KEY, projectId: ANTONLYTICS_PROJECT_ID });
          const ingestAgent = learnedImageUrl
            ? new Agent({ apiKey: ANTONLYTICS_API_KEY, projectId: ANTONLYTICS_PROJECT_ID })
            : null;

          // Set system prompts in parallel
          await Promise.all([
            withTimeout(chatAgent.setSystemPrompt(buildSystemPrompt(language)), 10000).catch(() => {}),
            ingestAgent
              ? withTimeout(ingestAgent.setSystemPrompt(buildSystemPrompt(language)), 10000).catch(() => {})
              : Promise.resolve(),
          ]);

          const ingestText = learnedImageUrl && learnedImageDescription
            ? stampDate(`[IMAGE: ${learnedImageUrl}]\n\n${learnedImageDescription}${message ? `\n\nContributor context: ${message}` : ''}`)
            : '';

          // Chat + ingest run in parallel — answer the question and learn the image at the same time
          const [chatResult] = await Promise.all([
            withTimeout(chatAgent.chat(chatMessage, history), 25000),
            ingestAgent && ingestText
              ? withTimeout(ingestAgent.ingest(ingestText), 25000).catch(() => {})
              : Promise.resolve(),
          ]);

          // Guard: SDK may return response as object or undefined
          const rawResponse: string = typeof chatResult?.response === 'string'
            ? chatResult.response
            : (chatResult?.response != null ? String(chatResult.response) : '');

          // Step 1: Extract all Supabase storage URLs from the raw response BEFORE any cleanup.
          // Using matchAll on rawResponse is more reliable than capture groups inside replace().
          const storageUrlPattern = `https?://[a-z0-9]+\\.supabase\\.co/storage/v1/object/public/images/[^\\s\\])"'<>]+`;
          const storageRegex = new RegExp(storageUrlPattern, 'gi');
          const inlineUrls: string[] = [...(rawResponse.matchAll(storageRegex) ?? [])].map(m => m[0].trim());

          // Step 2: Strip the response clean of all possible image-tag formats.
          // Order matters: bracket patterns first (most specific), then bare URLs, then orphaned keywords.
          let cleanResponse = rawResponse
            // [IMAGE: url] / [image: url] / [IMAGE:url] — any bracket wrapping, any URL
            .replace(/\[(?:IMAGE|image|Image)[^\]]*\]/g, '')
            // bare Supabase storage URLs (already captured above)
            .replace(storageRegex, '')
            // orphaned IMAGE: keyword left if brackets were stripped separately
            .replace(/IMAGE:\s*/gi, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

          let allImages: { url: string; description: string }[] = [];

          if (learnedImageUrl && learnedImageDescription) {
            // User just uploaded an image — echo it back
            allImages = [{ url: learnedImageUrl, description: learnedImageDescription }];
          } else {
            // Always try to find relevant images from the collective.
            // Priority 1: any storage URLs the agent happened to include in its response
            const cappedUrls = inlineUrls.slice(0, 2);
            if (cappedUrls.length > 0) {
              const { data: inlineData } = await supabase
                .from('collective_images')
                .select('image_url, description')
                .in('image_url', cappedUrls);
              const inlineMap = new Map((inlineData ?? []).map((r: any) => [r.image_url as string, r.description as string]));
              allImages = cappedUrls.map(url => ({ url, description: inlineMap.get(url) ?? '' }));
            }

            // Priority 2 (always runs if Priority 1 found nothing): description search.
            // Only use relevant_entities — raw message words are too noisy and match unrelated images.
            if (!allImages.length) {
              const rawEntities = Array.isArray(chatResult?.relevant_entities) ? chatResult.relevant_entities : [];
              const entities: string[] = rawEntities
                .filter((e: any) => e != null)
                .map((e: any) => (typeof e === 'string' ? e : typeof e === 'object' ? String(e.name ?? e.value ?? '') : String(e)))
                .filter((e: string) => e.length >= 4);

              // Strip generic words that would match random images in the collective
              const STOP = new Set(['show', 'tell', 'give', 'find', 'look', 'make', 'take', 'send', 'need', 'know', 'like', 'have', 'also', 'just', 'does', 'more', 'some', 'here', 'this', 'that', 'with', 'from', 'what', 'about', 'image', 'photo', 'picture', 'visual', 'collective', 'slatt']);

              const searchTerms = entities
                .filter((t: string) => !STOP.has(t.toLowerCase()))
                .map((t: string) => t.replace(/[%_\\]/g, ''))
                .filter(Boolean)
                .slice(0, 3);

              if (searchTerms.length > 0) {
                const filters = searchTerms.map((t: string) => `description.ilike.%${t}%`).join(',');
                const { data: matched } = await supabase
                  .from('collective_images')
                  .select('image_url, description')
                  .or(filters)
                  .limit(3);
                if (matched?.length) {
                  // Deduplicate by URL then cap at 2
                  const seen = new Set<string>();
                  allImages = matched
                    .filter((r: any) => { if (seen.has(r.image_url)) return false; seen.add(r.image_url); return true; })
                    .slice(0, 2)
                    .map((r: any) => ({ url: r.image_url as string, description: r.description as string }));
                }
              }
            }
          }

          body = {
            response: cleanResponse,
            relevant_entities: chatResult.relevant_entities,
            images: allImages,
          };
        }
      } catch (agentErr) {
        return new Response(
          JSON.stringify({ error: `Collective unavailable: ${(agentErr as Error).message}` }),
          { status: 503, headers: { ...cors, 'Content-Type': 'application/json' } },
        );
      }

    } else {
      return new Response(JSON.stringify({ error: 'Invalid action.' }), { status: 400, headers: cors });
    }

    // ── Credit accounting ──────────────────────────────────────────────────────
    if (profile.tier === 'free' && !isSkipped) {
      let delta: number;

      if (action === 'teach') {
        const created = (body!.created as number) ?? 1;
        const trusted = (body!.trustedSource as boolean) ?? false;

        if (trusted) {
          delta = -1; // trusted source: gain 1 credit
        } else if (created === 0) {
          delta = 2;  // useless teach: lose 2
        } else if (created >= 5) {
          delta = -1; // exceptional content: gain 1
        } else if (created >= 3) {
          delta = 0;  // good content: free
        } else {
          delta = 1;  // normal: costs 1
        }
        const creditChange = 1 - delta; // positive = user gained vs. baseline
        if (creditChange !== 0) body!.creditChange = creditChange;
      } else {
        delta = 1; // asks always cost 1
      }

      await supabase
        .from('profiles')
        .update({ queries_today: profile.queries_today + delta })
        .eq('id', user.id);
    }

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
