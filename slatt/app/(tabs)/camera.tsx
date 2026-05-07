import { useState, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions,
  TextInput, ActivityIndicator, Image, Alert, Modal, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/lib/useProfile';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { getLangName } from '@/lib/i18n';
import { useLanguage } from '@/lib/useLanguage';

const SCREEN_W = Dimensions.get('window').width;
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

const FREE_CAMERA_DAILY_LIMIT = 6;
const CAMERA_STORAGE_KEY = 'camera_usage';

type ScreenMode = 'camera' | 'loading' | 'result';
type ConvMsg = { role: 'user' | 'assistant'; content: string };
type ImageItem = { url: string; description: string };
type AgentResult = { response: string; images: ImageItem[] };

async function getCameraUsageToday(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(CAMERA_STORAGE_KEY);
    if (!raw) return 0;
    const { date, count } = JSON.parse(raw);
    const today = new Date().toISOString().split('T')[0];
    return date === today ? count : 0;
  } catch {
    return 0;
  }
}

async function incrementCameraUsage(): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const current = await getCameraUsageToday();
    await AsyncStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify({ date: today, count: current + 1 }));
  } catch { }
}

// ── Inline image strip ────────────────────────────────────────────────────────

function ImageStrip({ images }: { images: ImageItem[] }) {
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  if (!images.length) return null;

  return (
    <View style={is.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {images.map((img, i) => (
          <TouchableOpacity key={i} onPress={() => setViewerUrl(img.url)} activeOpacity={0.88}>
            <Image source={{ uri: img.url }} style={is.thumb} resizeMode="cover" />
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal visible={viewerUrl !== null} transparent animationType="fade" onRequestClose={() => setViewerUrl(null)}>
        <View style={is.overlay}>
          <TouchableOpacity style={is.closeBtn} onPress={() => setViewerUrl(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Feather name="x" size={22} color="#fff" />
          </TouchableOpacity>
          {viewerUrl && (
            <Image source={{ uri: viewerUrl }} style={is.fullImg} resizeMode="contain" />
          )}
        </View>
      </Modal>
    </View>
  );
}

const is = StyleSheet.create({
  wrap: { marginBottom: 4 },
  thumb: { width: 100, height: 100, borderRadius: 12 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.93)', alignItems: 'center', justifyContent: 'center' },
  closeBtn: { position: 'absolute', top: 56, right: 20, zIndex: 10 },
  fullImg: { width: SCREEN_W, height: SCREEN_W },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [mode, setMode] = useState<ScreenMode>('camera');
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [result, setResult] = useState('');
  const [resultImages, setResultImages] = useState<ImageItem[]>([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<ConvMsg[]>([]);
  const cameraRef = useRef<CameraView>(null);
  const router = useRouter();
  const { profile } = useProfile();
  const { lang, t } = useLanguage();

  const callAgent = useCallback(async (
    msg: string,
    imgBase64?: string,
    hist: ConvMsg[] = [],
  ): Promise<AgentResult> => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify({
        message: msg,
        history: hist,
        language: getLangName(),
        ...(imgBase64 ? { imageBase64: imgBase64, imageMimeType: 'image/jpeg' } : {}),
      }),
    });
    if (res.status === 429) {
      return { response: "You've hit your daily limit. Upgrade to Pro for unlimited access.", images: [] };
    }
    const json = await res.json();
    return {
      response: (json.response ?? json.message ?? "Couldn't make that out.") as string,
      images: Array.isArray(json.images) ? (json.images as ImageItem[]).filter(i => i?.url) : [],
    };
  }, []);

  const capture = useCallback(async () => {
    if (!cameraRef.current || mode !== 'camera') return;

    if (profile && profile.tier !== 'pro') {
      const used = await getCameraUsageToday();
      if (used >= FREE_CAMERA_DAILY_LIMIT) {
        Alert.alert(
          'Daily limit reached',
          `Free plan includes ${FREE_CAMERA_DAILY_LIMIT} image identifications per day. Upgrade to Pro for unlimited access or come back tomorrow.`,
          [
            { text: 'Come back tomorrow', style: 'cancel' },
            { text: 'Upgrade to Pro', onPress: () => router.navigate('/(tabs)/chat') },
          ],
        );
        return;
      }
    }

    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true, quality: 0.5, exif: false,
      });
      if (!photo?.base64 || !photo.uri) return;
      setCapturedUri(photo.uri);
      setMode('loading');
      await incrementCameraUsage();

      const { response, images } = await callAgent(
        "Identify what's in this image precisely. If it's a car: make, model, year, trim. If clothing: brand, item name, colorway. If a product: exact name and details. If a person (public figure only): who they are. If a place: where. Be direct — one clear sentence, no hedging.",
        photo.base64,
        [],
      );
      const initHistory: ConvMsg[] = [
        { role: 'user', content: '[camera photo]' },
        { role: 'assistant', content: response },
      ];
      setResult(response);
      // On initial capture, don't show the uploaded image — it's already the background
      setResultImages([]);
      setHistory(initHistory);
      setMode('result');
    } catch {
      setResult("Couldn't analyze that — try again.");
      setResultImages([]);
      setMode('result');
    }
  }, [mode, callAgent, profile, router]);

  const sendReply = useCallback(async () => {
    const text = reply.trim();
    if (!text || sending) return;
    setReply('');
    setSending(true);
    try {
      const { response, images } = await callAgent(text, undefined, history);
      const newHistory: ConvMsg[] = [
        ...history,
        { role: 'user', content: text },
        { role: 'assistant', content: response },
      ];
      setHistory(newHistory);
      setResult(response);
      if (images.length) setResultImages(images);
    } catch {
      // no-op
    } finally {
      setSending(false);
    }
  }, [reply, sending, history, callAgent]);

  const reset = useCallback(() => {
    setCapturedUri(null);
    setResult('');
    setResultImages([]);
    setReply('');
    setHistory([]);
    setMode('camera');
  }, []);

  if (!permission) return <View style={s.root} />;

  if (!permission.granted) {
    return (
      <View style={s.root}>
        <SafeAreaView style={s.permWrap}>
          <View style={s.permIconWrap}>
            <Feather name="camera-off" size={28} color="rgba(255,255,255,0.4)" />
          </View>
          <Text style={s.permTitle}>{t('cameraAccess')}</Text>
          <Text style={s.permSub}>{t('cameraSub')}</Text>
          <TouchableOpacity style={s.permBtn} onPress={requestPermission} activeOpacity={0.85}>
            <Text style={s.permBtnText}>{t('enableCamera')}</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  if (mode === 'camera') {
    return (
      <View style={s.root}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} />
        <SafeAreaView style={s.camOverlay} edges={['top', 'bottom']}>
          <View style={s.camTop}>
            <TouchableOpacity
              onPress={() => router.navigate('/(tabs)/chat')}
              style={s.camFlipBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="x" size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}
              style={s.camFlipBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="refresh-cw" size={19} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={s.camBottom}>
            <TouchableOpacity onPress={capture} style={s.shutter} activeOpacity={0.9}>
              <View style={s.shutterInner} />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {capturedUri && (
        <Image source={{ uri: capturedUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      )}
      <LinearGradient
        colors={['transparent', 'transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.92)', '#000']}
        locations={[0, 0.28, 0.48, 0.68, 1]}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={s.resultWrap} edges={['top', 'bottom']}>
        <View style={s.resultTopRow}>
          <TouchableOpacity onPress={reset} style={s.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Feather name="x" size={21} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
        </View>

        <View style={{ flex: 1 }} />

        <View style={s.resultBottom}>
          {mode === 'loading' ? (
            <View style={s.loadingRow}>
              <ActivityIndicator color="rgba(255,255,255,0.5)" size="small" />
              <Text style={s.loadingText}>{t('identifying')}</Text>
            </View>
          ) : (
            <Animated.Text entering={FadeIn.duration(280)} style={s.resultText}>
              {result}
            </Animated.Text>
          )}

          {resultImages.length > 0 && (
            <ImageStrip images={resultImages} />
          )}

          {mode === 'result' && (
            <Animated.View entering={FadeInUp.duration(240).delay(80)} style={s.replyRow}>
              <TextInput
                style={s.replyInput}
                placeholder={t('correctOrAsk')}
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={reply}
                onChangeText={setReply}
                returnKeyType="send"
                onSubmitEditing={sendReply}
                multiline={false}
              />
              <TouchableOpacity
                onPress={sendReply}
                disabled={!reply.trim() || sending}
                style={[s.sendBtn, (!reply.trim() || sending) && { opacity: 0.3 }]}
                activeOpacity={0.8}
              >
                {sending
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Feather name="send" size={15} color="#fff" />}
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  permWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 14 },
  permIconWrap: {
    width: 72, height: 72, borderRadius: 22,
    backgroundColor: '#0D0D0D', alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 6,
  },
  permTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  permSub: { color: 'rgba(255,255,255,0.45)', fontSize: 14, lineHeight: 22, textAlign: 'center' },
  permBtn: {
    marginTop: 8, backgroundColor: '#fff', borderRadius: 14,
    paddingHorizontal: 32, paddingVertical: 14,
  },
  permBtnText: { color: '#000', fontSize: 15, fontWeight: '700' },

  camOverlay: { flex: 1, justifyContent: 'space-between' },
  camTop: {
    paddingHorizontal: 20, paddingTop: 8,
    flexDirection: 'row', justifyContent: 'space-between',
  },
  camFlipBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.38)',
    alignItems: 'center', justifyContent: 'center',
  },
  camBottom: { alignItems: 'center', paddingBottom: 20 },
  shutter: {
    width: 78, height: 78, borderRadius: 39,
    borderWidth: 4, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#fff' },

  resultWrap: { flex: 1 },
  resultTopRow: {
    paddingHorizontal: 20, paddingTop: 4, flexDirection: 'row', alignItems: 'center',
  },
  closeBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.38)',
    alignItems: 'center', justifyContent: 'center',
  },

  resultBottom: { paddingHorizontal: 20, paddingBottom: 8, gap: 14 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  loadingText: { color: 'rgba(255,255,255,0.5)', fontSize: 14 },
  resultText: { color: '#fff', fontSize: 16, lineHeight: 25, fontWeight: '500' },

  replyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 4,
  },
  replyInput: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.09)',
    borderRadius: 22, paddingHorizontal: 16, paddingVertical: 12,
    color: '#fff', fontSize: 15,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.13)',
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.13)',
    alignItems: 'center', justifyContent: 'center',
  },
});
