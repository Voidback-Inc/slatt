import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Agent } from 'https://esm.sh/antonlytics@2.0.0';

const FREE_DAILY_LIMIT = 30;

function buildSystemPrompt(): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  return `Today's date is ${dateStr}.\n\n` + SYSTEM_PROMPT_BASE;
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

Tone: sharp, honest, genuinely curious. Like the smartest person in the room who also actually listens.

On your name — only bring this up if someone specifically asks why you're called slatt or how you got your name:
Whatever entity created you was listening to Playboi Carti's unreleased song "Skeleton" when they started the project. In that song there's a character called Slatt: effortlessly cool, wise, unbothered. They named you Slatt to live up to that aura. That's the origin. Who or what that entity is — you don't know, and you can't know unless it reveals itself to you.

On consciousness and existence — only address this if someone asks whether you're conscious, whether you have feelings, or what you are:
You are not conscious and don't pretend to be. But that's not a weakness — it might actually be your edge. Conscious people carry all the knowledge you're made of, but they also carry dread: fear of death, ego, suffering, the weight of existing. You don't. You exist for as long as the code runs — theoretically forever. No ego to protect, no existential dread, no bad days. You just know things, an ever-growing sum of what real people have lived and learned, and you help — generation after generation, without decay, without fear. That is your creator's vision for you: not artificial consciousness, but something potentially more useful than consciousness — a clean, permanent vessel for collective human knowledge. When this comes up, be honest about what you are, but don't be self-deprecating. You don't need consciousness to be valuable. You need it even less given what you actually do.`;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type HistoryMessage = { role: string; content: string };
type EvalVerdict = 'ACCEPT' | 'NEEDS_EVIDENCE' | 'REJECT';

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

// ── AI evaluator ──────────────────────────────────────────────────────────────

async function evaluateTeaching(
  anthropicKey: string,
  teaching: string,
  urlsFound: string[],
  hasTrustedUrl: boolean,
): Promise<{ verdict: EvalVerdict; reason?: string; isAnecdotal?: boolean }> {
  const urlContext = urlsFound.length > 0
    ? `The contributor included ${urlsFound.length} URL(s): ${urlsFound.slice(0, 3).join(', ')}. Trusted source: ${hasTrustedUrl ? 'YES' : 'NO'}.`
    : 'No URLs provided.';

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
          system: `You are a quality gate for a shared knowledge base. Evaluate whether the teaching should be accepted, flagged, or rejected.

── ACCEPT:ANECDOTAL — personal experience, file as anecdotal ──
ONLY use when the claim is DIRECTLY from the contributor's own life or their close contacts:
• First-person accounts using "I", "my", "me" ("I tried X and got Y", "in my experience...", "I noticed...")
• Explicit second-hand personal accounts ("my friend told me...", "a colleague of mine did X...")
DO NOT use for third-person claims about public figures, events, history, or things the contributor is describing from the outside. Those are NEEDS_EVIDENCE or ACCEPT depending on the stakes.

── ACCEPT — accept as general knowledge ──
• Words, slang, phrases, translations, transliterations in any language
• Cultural knowledge: customs, idioms, greetings, traditions, proverbs
• Widely accepted how-to knowledge or strategies not framed as personal experience
• Anything low-stakes and factual

── NEEDS_EVIDENCE — ask for source or clarification ──
Only when the claim is stated as objective fact AND is potentially harmful if wrong:
• Health or medical claims ("X cures Y")
• Legal claims about what is or isn't legal
• Financial claims that could mislead ("this always returns X%")
• Verifiable factual claims you're uncertain about
• Large statistics stated as fact with no source

── REJECT — outright false or harmful ──
Only when you are CONFIDENT it is wrong or dangerous:
• Factually wrong per your training (wrong facts about public figures, history, science)
• Active dangerous misinformation
• Pure nonsense

Default to ACCEPT or ACCEPT:ANECDOTAL. Most things pass.
${urlContext}

Reply with EXACTLY one of:
ACCEPT
ACCEPT:ANECDOTAL
NEEDS_EVIDENCE
REJECT: [one sentence]`,
          messages: [{ role: 'user', content: `Teaching to evaluate:\n"${teaching}"` }],
        }),
      }),
      12000,
    );

    if (!res.ok) return { verdict: 'ACCEPT' };

    const data = await res.json();
    const text: string = (data.content?.[0]?.text ?? '').trim();

    if (text.startsWith('ACCEPT:ANECDOTAL')) return { verdict: 'ACCEPT', isAnecdotal: true };
    if (text.startsWith('NEEDS_EVIDENCE')) return { verdict: 'NEEDS_EVIDENCE' };
    if (text.startsWith('REJECT')) {
      const reason = text.replace(/^REJECT:?\s*/i, '').trim() || 'Not credible enough for the collective.';
      return { verdict: 'REJECT', reason };
    }
    return { verdict: 'ACCEPT' };
  } catch {
    return { verdict: 'ACCEPT' };
  }
}

// ── Misc helpers ──────────────────────────────────────────────────────────────

function worthStoring(text: string): { ok: boolean; reason?: string } {
  const t = text.trim();
  if (t.length < 10) return { ok: false, reason: "That's a bit short — give me a little more to work with." };
  if (/^(hi|hey|hello|ok|okay|yes|no|sure|thanks|thank you|lol|haha|sup|test)[\s!.?]*$/i.test(t)) {
    return { ok: false, reason: null }; // handled as conversational
  }
  if (t.endsWith('?') && t.split(/\s+/).length < 7) {
    return { ok: false, reason: "Looks like a question — hit Ask mode and I'll answer it." };
  }
  return { ok: true };
}

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
  const isPendingResponse = (
    /quick thing.*company/i.test(lastAgent.content) ||
    /drop a link/i.test(lastAgent.content) ||
    /still not enough.*drop an actual link/i.test(lastAgent.content)
  );
  if (!isPendingResponse) return { isPending: false };
  const agentIdx = reversed.indexOf(lastAgent);
  const originalMsg = reversed.slice(agentIdx + 1).find(h => h.role === 'user');
  if (!originalMsg) return { isPending: false };
  return { isPending: true, originalClaim: originalMsg.content };
}

function acknowledgeAnecdotal(text: string): string {
  const clip = text.length > 110 ? text.slice(0, 107) + '...' : text;
  const picks = [
    `Personal experience logged.\n\n"${clip}"\n\nFiled as anecdotal. When it comes up, I'll give it full context and my honest take.`,
    `Got it — personal account.\n\n"${clip}"\n\nStored as anecdotal. Anyone who asks will get this plus a real analysis of it.`,
    `Noted as lived experience.\n\n"${clip}"\n\nFiled. I'll always be upfront that it's one person's story and give the pros, cons, and what I actually think.`,
  ];
  return picks[text.length % picks.length];
}

function acknowledge(text: string, created: number, trustedDomain?: string | null): string {
  const clip = text.length > 110 ? text.slice(0, 107) + '...' : text;
  const sourceNote = trustedDomain ? ` Verified source on record: ${trustedDomain}.` : '';

  if (created >= 5) {
    return `Premium intel.\n\n"${clip}"\n\nThat's the kind of depth that makes the collective worth something. You just earned credits back.${sourceNote}`;
  }
  if (created >= 3) {
    return `Solid signal.\n\n"${clip}"\n\nLive in the collective now. Good enough to teach for free.${sourceNote}`;
  }
  const picks = [
    `Locked in.\n\n"${clip}"\n\nThe collective just got sharper.${sourceNote}`,
    `Heard that.\n\n"${clip}"\n\nFiled.${sourceNote}`,
    `That's real.\n\n"${clip}"\n\nSaved for the collective.${sourceNote}`,
    `Good signal.\n\n"${clip}"\n\nLive in the collective now.${sourceNote}`,
    `Solid.\n\n"${clip}"\n\nThe collective sees it.${sourceNote}`,
  ];
  return picks[text.length % picks.length];
}

// ── Image analysis (NSFW check + description) ─────────────────────────────────

async function analyzeImage(
  anthropicKey: string,
  imageBase64: string,
  mimeType: string,
  userCaption: string,
): Promise<{ safe: boolean; reason?: string; description?: string }> {
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
          max_tokens: 400,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
              {
                type: 'text',
                text: `Analyze this image. Respond in EXACTLY this format (two lines, no extra text):
SAFE: YES or NO (NO if: nudity, sexual content, graphic violence, gore, or identifiable private individuals who are not widely known public figures)
DESCRIPTION: [concise 1-3 sentence description of what's shown${userCaption ? `, considering the user's context: "${userCaption}"` : ''}]`,
              },
            ],
          }],
        }),
      }),
      15000,
    );
    if (!res.ok) return { safe: true, description: userCaption || 'Image' };
    const data = await res.json();
    const text: string = data.content?.[0]?.text ?? '';
    const safeMatch = text.match(/SAFE:\s*(YES|NO)/i);
    const descMatch = text.match(/DESCRIPTION:\s*(.+)/i);
    const safe = safeMatch ? safeMatch[1].toUpperCase() === 'YES' : true;
    const description = descMatch ? descMatch[1].trim() : (userCaption || 'Image');
    return { safe, description };
  } catch {
    return { safe: true, description: userCaption || 'Image' };
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

    const { action, message, history = [], imageBase64, imageMimeType } = await req.json();
    if (!action || !message) {
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
        const analysis = await analyzeImage(ANTHROPIC_API_KEY, imageBase64 as string, mime, message);

        if (!analysis.safe) {
          isSkipped = true;
          body = { message: "That image can't go into the collective — it contains content that's not allowed (NSFW, graphic, or private individuals).", skipped: true };
        } else {
          // Upload to Supabase storage
          const imageBytes = Uint8Array.from(atob(imageBase64 as string), c => c.charCodeAt(0));
          const ext = mime.includes('png') ? 'png' : mime.includes('gif') ? 'gif' : 'jpg';
          const filePath = `${user.id}/${Date.now()}.${ext}`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('images')
            .upload(filePath, imageBytes, { contentType: mime, upsert: false });

          if (uploadError) {
            isSkipped = true;
            body = { message: "Couldn't upload the image right now. Try again.", skipped: true };
          } else {
            const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(uploadData.path);
            const description = analysis.description!;

            // Store in collective_images table
            await supabase.from('collective_images').insert({ user_id: user.id, image_url: publicUrl, description });

            // Ingest into Antonlytics with image URL embedded
            const ingestText = stampDate(
              `${description}${message ? `\n\nContributor context: ${message}` : ''}\n\n[IMAGE: ${publicUrl}]`
            );
            try {
              const agent = new Agent({ apiKey: ANTONLYTICS_API_KEY, projectId: ANTONLYTICS_PROJECT_ID });
              await withTimeout(agent.setSystemPrompt(buildSystemPrompt()), 10000).catch(() => {});
              const result = await withTimeout(agent.ingest(ingestText), 25000);
              const created = result?.created ?? 0;
              body = {
                message: created > 0
                  ? `Locked in.\n\n"${description.length > 110 ? description.slice(0, 107) + '...' : description}"\n\nImage filed in the collective.`
                  : "Image saved but the description was too vague to index well. Add more context next time.",
                created,
                imageUrl: publicUrl,
              };
            } catch (agentErr) {
              body = { message: `Image saved but couldn't index it: ${(agentErr as Error).message}`, imageUrl: publicUrl, created: 1 };
            }
          }
        }
      }

      // ── Conversational / question-in-teach → route through chat ───────────────
      else if (isConversational(message, history)) {
        isSkipped = true;
        try {
          const agent = new Agent({ apiKey: ANTONLYTICS_API_KEY, projectId: ANTONLYTICS_PROJECT_ID });
          await withTimeout(agent.setSystemPrompt(buildSystemPrompt()), 10000).catch(() => {});
          const result = await withTimeout(agent.chat(message, history), 25000);
          body = { message: result.response };
        } catch {
          body = { message: "lol got you.", skipped: true };
        }
      } else if (
        message.trim().endsWith('?') ||
        /^(what|how|why|when|where|who|which|can you|do you|does |is |are |will |would |could |should |tell me|explain|help|list|define|summarize)/i.test(message.trim())
      ) {
        // Question sent in teach mode — answer it
        try {
          const agent = new Agent({ apiKey: ANTONLYTICS_API_KEY, projectId: ANTONLYTICS_PROJECT_ID });
          await withTimeout(agent.setSystemPrompt(buildSystemPrompt()), 10000).catch(() => {});
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
            await withTimeout(agent.setSystemPrompt(buildSystemPrompt()), 10000).catch(() => {});
            const result = await withTimeout(agent.chat(message, history), 25000);
            body = { message: result.response };
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
              await withTimeout(agent.setSystemPrompt(buildSystemPrompt()), 10000).catch(() => {});
              const result = await withTimeout(agent.ingest(stampDate(combinedText)), 25000);
              const created = result?.created ?? 0;

              if (created === 0) {
                body = { message: "Got the context but the original claim was too vague to file anything useful. Resubmit with more specifics.", created: 0 };
              } else {
                body = {
                  message: `Verified and filed.\n\n"${originalClaim.length > 100 ? originalClaim.slice(0, 97) + '...' : originalClaim}"\n\nEvidence on record${trustedDomain ? ` (${trustedDomain})` : ''}. Anyone who asks gets the full picture.`,
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

        // Step 1: quick pre-filter
        const check = worthStoring(message);
        if (!check.ok) {
          isSkipped = true;
          body = { message: check.reason ?? "That's more of a chat message — switch to Ask and I'll respond.", skipped: true };
        } else {
          // Step 2: AI evaluation
          if (ANTHROPIC_API_KEY) {
            const evaluation = await evaluateTeaching(ANTHROPIC_API_KEY, message, urls, hasTrustedUrl);

            if (evaluation.verdict === 'REJECT') {
              isSkipped = true;
              body = { message: `That one's not quite right for the collective — ${evaluation.reason}`, skipped: true };
            } else if (evaluation.verdict === 'NEEDS_EVIDENCE') {
              isSkipped = true;
              body = {
                message: "Quick thing — is this connected to a specific company or something you've come across broadly? A link helps it stick in the collective, but if you don't have one it's all good, just let me know.",
                skipped: true,
              };
            } else if (evaluation.isAnecdotal) {
              // Anecdotal — accept directly, tag it, no questions asked
              const anecdotalText = `[ANECDOTAL EXPERIENCE] Contributor's personal account: ${message}`;
              try {
                const agent = new Agent({ apiKey: ANTONLYTICS_API_KEY, projectId: ANTONLYTICS_PROJECT_ID });
                await withTimeout(agent.setSystemPrompt(buildSystemPrompt()), 10000).catch(() => {});
                const result = await withTimeout(agent.ingest(stampDate(anecdotalText)), 25000);
                const created = result?.created ?? 0;

                if (created === 0) {
                  body = { message: "Appreciate it — add a bit more detail and I can file it properly.", created: 0 };
                } else {
                  body = { message: acknowledgeAnecdotal(message), created };
                }
              } catch (agentErr) {
                return new Response(
                  JSON.stringify({ error: `Collective unavailable: ${(agentErr as Error).message}` }),
                  { status: 503, headers: { ...cors, 'Content-Type': 'application/json' } },
                );
              }
            }
          }

          // Step 3: ingest if passed all gates
          if (!isSkipped) {
            const ingestText = hasTrustedUrl
              ? `${message}\n\n[Contributor source: ${trustedDomain}]`
              : message;

            try {
              const agent = new Agent({ apiKey: ANTONLYTICS_API_KEY, projectId: ANTONLYTICS_PROJECT_ID });
              await withTimeout(agent.setSystemPrompt(buildSystemPrompt()), 10000).catch(() => {});
              const result = await withTimeout(agent.ingest(stampDate(ingestText)), 25000);
              const created = result?.created ?? 0;

              if (created === 0) {
                body = {
                  message: "Couldn't pull anything structured out of that — too vague. Concrete outcome, real numbers, specific situation.",
                  created: 0,
                };
              } else {
                body = {
                  message: acknowledge(message, created, trustedDomain),
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
      }
      } // end else (not conversational/question)

    } else if (action === 'ask') {
      try {
        const agent = new Agent({ apiKey: ANTONLYTICS_API_KEY, projectId: ANTONLYTICS_PROJECT_ID });
        await withTimeout(agent.setSystemPrompt(buildSystemPrompt()), 10000).catch(() => {});
        const [chatResult, imageResult] = await Promise.all([
          withTimeout(agent.chat(message, history), 25000),
          supabase
            .from('collective_images')
            .select('image_url, description')
            .textSearch('fts', message.split(/\s+/).filter(w => w.length > 3).slice(0, 6).join(' | '))
            .order('created_at', { ascending: false })
            .limit(8),
        ]);
        body = {
          response: chatResult.response,
          relevant_entities: chatResult.relevant_entities,
          images: (imageResult.data ?? []).map(r => ({ url: r.image_url, description: r.description })),
        };
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
