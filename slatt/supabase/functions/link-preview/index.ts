const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const YT_RE = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const SPOTIFY_RE = /open\.spotify\.com\/(track|album|playlist|artist)\/([a-zA-Z0-9]+)/;
const APPLE_RE = /music\.apple\.com/;
const TWITTER_RE = /(?:twitter\.com|x\.com)\/(\w+)\/status\/(\d+)/;
const STORAGE_RE = /supabase\.co\/storage\/v1\/object\/public\//;

type Preview = {
  type: 'youtube' | 'spotify' | 'apple_music' | 'twitter' | 'link';
  url: string;
  title?: string;
  description?: string;
  image?: string;
  author?: string;
  siteName?: string;
};

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

async function safeFetch(url: string, opts?: RequestInit): Promise<Response> {
  return Promise.race([fetch(url, opts), timeout(6000)]) as Promise<Response>;
}

function parseOG(html: string, baseUrl: string): Omit<Preview, 'type' | 'url'> {
  const get = (prop: string) =>
    html.match(new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))?.[1] ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`, 'i'))?.[1] ??
    '';
  const getName = (name: string) =>
    html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'))?.[1] ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, 'i'))?.[1] ??
    '';

  const title = (get('og:title') || html.match(/<title[^>]*>([^<]{1,120})<\/title>/i)?.[1] || '').trim().slice(0, 120);
  const description = (get('og:description') || getName('description') || '').trim().slice(0, 200);
  let image = get('og:image');
  const siteName = (get('og:site_name') || new URL(baseUrl).hostname.replace(/^www\./, '')).slice(0, 60);

  // Resolve relative image URLs
  if (image && image.startsWith('/')) {
    const base = new URL(baseUrl);
    image = `${base.protocol}//${base.host}${image}`;
  }

  return { title, description, image, siteName };
}

async function youtubePreview(url: string): Promise<Preview> {
  const videoId = url.match(YT_RE)?.[1] ?? '';
  try {
    const res = await safeFetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if (!res.ok) throw new Error('oembed failed');
    const d = await res.json();
    return {
      type: 'youtube', url,
      title: d.title ?? '',
      author: d.author_name ?? '',
      image: videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : (d.thumbnail_url ?? ''),
      siteName: 'YouTube',
    };
  } catch {
    return { type: 'youtube', url, image: videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '', siteName: 'YouTube' };
  }
}

async function spotifyPreview(url: string): Promise<Preview> {
  try {
    const res = await safeFetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error('oembed failed');
    const d = await res.json();
    return { type: 'spotify', url, title: d.title ?? '', image: d.thumbnail_url ?? '', siteName: 'Spotify' };
  } catch {
    return { type: 'spotify', url, siteName: 'Spotify' };
  }
}

async function appleMusicPreview(url: string): Promise<Preview> {
  try {
    const res = await safeFetch(`https://music.apple.com/oembed?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error('oembed failed');
    const d = await res.json();
    return { type: 'apple_music', url, title: d.title ?? '', image: d.thumbnail_url ?? '', siteName: 'Apple Music' };
  } catch {
    return { type: 'apple_music', url, siteName: 'Apple Music' };
  }
}

function twitterPreview(url: string): Preview {
  const m = url.match(TWITTER_RE);
  return {
    type: 'twitter', url,
    title: m ? `@${m[1]}` : 'Post',
    siteName: 'X (Twitter)',
  };
}

async function genericPreview(url: string): Promise<Preview> {
  try {
    const res = await safeFetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Slatt/1.0)', Accept: 'text/html,*/*' },
    });
    if (!res.ok) return { type: 'link', url };
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('text/html')) return { type: 'link', url };
    const html = await res.text();
    return { type: 'link', url, ...parseOG(html, url) };
  } catch {
    return { type: 'link', url };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { url } = await req.json();

    if (!url || typeof url !== 'string' || !url.startsWith('https://')) {
      return new Response(JSON.stringify({ error: 'Invalid URL' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Don't preview Supabase storage URLs — those are handled as images
    if (STORAGE_RE.test(url)) {
      return new Response(JSON.stringify(null), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    let result: Preview;
    if (YT_RE.test(url)) result = await youtubePreview(url);
    else if (SPOTIFY_RE.test(url)) result = await spotifyPreview(url);
    else if (APPLE_RE.test(url)) result = await appleMusicPreview(url);
    else if (TWITTER_RE.test(url)) result = twitterPreview(url);
    else result = await genericPreview(url);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
