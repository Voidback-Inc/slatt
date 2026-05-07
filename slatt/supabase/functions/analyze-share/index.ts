import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Agent } from 'https://esm.sh/antonlytics@2.0.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FREE_DAILY_LIMIT = 30;
const PRO_DAILY_LIMIT = 300;
const VIDEO_CREDIT_COST = 3;

const TIKTOK_RE = /tiktok\.com\//;
const INSTAGRAM_RE = /instagram\.com\/(reel|p)\//;
const TWITTER_RE = /(?:twitter\.com|x\.com)\/\w+\/status\/\d+/;
const YOUTUBE_RE = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)/;
const URL_RE = /https?:\/\/[^\s]+/;

function isVideoUrl(url: string): boolean {
  return TIKTOK_RE.test(url) || /instagram\.com\/reel\//.test(url) || YOUTUBE_RE.test(url);
}

function extractUrl(text: string): string | null {
  return text.match(URL_RE)?.[0]?.replace(/[.,;:!?)'"\]]+$/, '') ?? null;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function safeFetch(url: string, opts?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

type Meta = { platform: string; title: string; author: string; thumbnail: string; text: string };

async function fetchTikTok(url: string): Promise<Meta> {
  try {
    const res = await safeFetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error('oembed failed');
    const d = await res.json();
    return { platform: 'TikTok', title: d.title ?? '', author: d.author_name ?? '', thumbnail: d.thumbnail_url ?? '', text: d.title ?? '' };
  } catch {
    return { platform: 'TikTok', title: '', author: '', thumbnail: '', text: '' };
  }
}

async function fetchInstagram(url: string): Promise<Meta> {
  try {
    const res = await safeFetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Slatt/1.0; +https://slatt.app)', Accept: 'text/html,*/*' },
    });
    if (!res.ok) throw new Error('failed');
    const html = await res.text();
    const og = (prop: string) =>
      html.match(new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))?.[1] ??
      html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`, 'i'))?.[1] ?? '';
    return { platform: 'Instagram', title: og('og:title'), author: '', thumbnail: og('og:image'), text: og('og:description') };
  } catch {
    return { platform: 'Instagram', title: '', author: '', thumbnail: '', text: '' };
  }
}

async function fetchTwitter(url: string): Promise<Meta> {
  try {
    const res = await safeFetch(`https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&format=json&omit_script=true`);
    if (!res.ok) throw new Error('oembed failed');
    const d = await res.json();
    const tweetText = (d.html ?? '')
      .match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1]
      ?.replace(/<a\s[^>]*>[\s\S]*?<\/a>/gi, '')
      ?.replace(/<[^>]+>/g, '')
      ?.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'")
      .trim() ?? '';
    const handle = d.author_url?.split('/').pop() ?? '';
    return { platform: 'X (Twitter)', title: d.author_name ?? '', author: handle ? `@${handle}` : '', thumbnail: '', text: tweetText.slice(0, 560) };
  } catch {
    return { platform: 'X (Twitter)', title: '', author: '', thumbnail: '', text: '' };
  }
}

async function fetchYoutube(url: string): Promise<Meta> {
  try {
    const videoId = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1] ?? '';
    const res = await safeFetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    const d = res.ok ? await res.json() : {};
    return {
      platform: 'YouTube', title: d.title ?? '', author: d.author_name ?? '',
      thumbnail: videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : (d.thumbnail_url ?? ''),
      text: d.title ?? '',
    };
  } catch {
    return { platform: 'YouTube', title: '', author: '', thumbnail: '', text: '' };
  }
}

async function fetchGeneric(url: string): Promise<Meta> {
  try {
    const res = await safeFetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Slatt/1.0)', Accept: 'text/html,*/*' },
    });
    if (!res.ok) return { platform: new URL(url).hostname.replace(/^www\./, ''), title: '', author: '', thumbnail: '', text: '' };
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('text/html')) return { platform: new URL(url).hostname.replace(/^www\./, ''), title: '', author: '', thumbnail: '', text: '' };
    const html = await res.text();
    const og = (prop: string) =>
      html.match(new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))?.[1] ?? '';
    const nm = (name: string) =>
      html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'))?.[1] ?? '';
    let thumb = og('og:image');
    if (thumb && thumb.startsWith('/')) {
      const base = new URL(url);
      thumb = `${base.protocol}//${base.host}${thumb}`;
    }
    return {
      platform: new URL(url).hostname.replace(/^www\./, ''),
      title: (og('og:title') || html.match(/<title[^>]*>([^<]{1,120})<\/title>/i)?.[1] || '').trim().slice(0, 120),
      author: '',
      thumbnail: thumb,
      text: (og('og:description') || nm('description') || '').trim().slice(0, 300),
    };
  } catch {
    return { platform: '', title: '', author: '', thumbnail: '', text: '' };
  }
}

async function thumbnailBase64(url: string): Promise<{ data: string; mediaType: string } | null> {
  try {
    const res = await safeFetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    if (bytes.length > 3 * 1024 * 1024) return null; // skip if > 3MB
    const mediaType = (res.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim();
    return { data: uint8ToBase64(bytes), mediaType };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
  const ANTONLYTICS_API_KEY = Deno.env.get('ANTONLYTICS_API_KEY')!;
  const ANTONLYTICS_PROJECT_ID = Deno.env.get('ANTONLYTICS_PROJECT_ID')!;
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authErr || !user) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: cors });

  try {
    const { url: rawUrl, text: rawText, language } = await req.json();

    // Rate limiting & profile
    let { data: profile } = await supabase.from('profiles').select('tier, queries_today, queries_reset_date').eq('id', user.id).single();
    if (!profile) {
      const { data: created } = await supabase.from('profiles').insert({ id: user.id }).select('tier, queries_today, queries_reset_date').single();
      profile = created;
    }
    if (!profile) return new Response(JSON.stringify({ error: 'Profile error' }), { status: 500, headers: cors });

    const today = new Date().toISOString().split('T')[0];
    if (profile.queries_reset_date < today) {
      await supabase.from('profiles').update({ queries_today: 0, queries_reset_date: today }).eq('id', user.id);
      profile.queries_today = 0;
    }

    const dailyLimit = profile.tier === 'pro' ? PRO_DAILY_LIMIT : FREE_DAILY_LIMIT;

    // Extract URL from text if needed (TikTok/Instagram sometimes send "Title text\nURL")
    const detectedUrl: string | null = rawUrl ?? (rawText ? extractUrl(rawText) : null);
    const plainText: string | null = rawText && !detectedUrl ? rawText : null;

    const isVideo = detectedUrl ? isVideoUrl(detectedUrl) : false;
    const creditCost = isVideo ? VIDEO_CREDIT_COST : 1;

    if (profile.queries_today + creditCost > dailyLimit) {
      return new Response(JSON.stringify({ error: 'limit_reached' }), { status: 429, headers: cors });
    }

    // Fetch metadata
    let meta: Meta = { platform: '', title: '', author: '', thumbnail: '', text: '' };
    if (detectedUrl) {
      if (TIKTOK_RE.test(detectedUrl)) meta = await fetchTikTok(detectedUrl);
      else if (INSTAGRAM_RE.test(detectedUrl)) meta = await fetchInstagram(detectedUrl);
      else if (TWITTER_RE.test(detectedUrl)) meta = await fetchTwitter(detectedUrl);
      else if (YOUTUBE_RE.test(detectedUrl)) meta = await fetchYoutube(detectedUrl);
      else meta = await fetchGeneric(detectedUrl);
    } else if (plainText) {
      meta = { platform: 'text', title: '', author: '', thumbnail: '', text: plainText };
    }

    // Fetch thumbnail for vision
    let thumb: { data: string; mediaType: string } | null = null;
    if (meta.thumbnail) thumb = await thumbnailBase64(meta.thumbnail);

    // Build Claude prompt
    const langLine = language && language !== 'English' ? `\nRespond ONLY in ${language}.` : '';
    const contentDesc = [
      meta.platform && meta.platform !== 'text' && `Platform: ${meta.platform}`,
      meta.author && `Creator: ${meta.author}`,
      meta.title && `Title: ${meta.title}`,
      meta.text && `Caption: ${meta.text}`,
      detectedUrl && `URL: ${detectedUrl}`,
    ].filter(Boolean).join('\n');

    const promptText = `Analyze this shared content and give a sharp, concise breakdown: what it is, what it's about, the key people/topics/entities involved, and your honest take. Keep it under 4 sentences. No intro phrase.${langLine}\n\n${contentDesc || rawText || ''}`;

    const userContent: any[] = thumb
      ? [
          { type: 'image', source: { type: 'base64', media_type: thumb.mediaType, data: thumb.data } },
          { type: 'text', text: promptText },
        ]
      : [{ type: 'text', text: promptText }];

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 350,
        system: `You are slatt — intelligent, direct, no fluff. Analyze content people share and give real insight.${langLine}`,
        messages: [{ role: 'user', content: userContent }],
      }),
    });

    const claudeData = claudeRes.ok ? await claudeRes.json() : null;
    const analysis = claudeData?.content?.[0]?.text ?? 'Could not analyze this content.';

    // Store to collective memory (fire-and-forget)
    if (ANTONLYTICS_API_KEY && ANTONLYTICS_PROJECT_ID) {
      const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const ingestText = [
        `[Taught on: ${dateStr}]`,
        detectedUrl ? `[MEDIA_URL: ${detectedUrl}]` : '',
        contentDesc || rawText || '',
        `Analysis: ${analysis}`,
      ].filter(Boolean).join('\n');
      const agent = new Agent({ apiKey: ANTONLYTICS_API_KEY, projectId: ANTONLYTICS_PROJECT_ID });
      agent.ingest(ingestText).catch(() => {});
    }

    // Deduct credits
    await supabase.from('profiles').update({ queries_today: profile.queries_today + creditCost }).eq('id', user.id);

    return new Response(JSON.stringify({
      analysis,
      platform: meta.platform,
      title: meta.title,
      author: meta.author,
      thumbnail: meta.thumbnail,
      isVideo,
      creditCost,
      url: detectedUrl,
    }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
