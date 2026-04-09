import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, Image, TouchableOpacity,
  TouchableWithoutFeedback, ActivityIndicator, Alert,
  StyleSheet, Dimensions, Modal, StatusBar, Animated,
  SafeAreaView, Platform, PanResponder,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  X, Trash2, Play, Pause, Lock, Eye, Image as ImageIcon,
  Film, CheckCircle, Download, Volume2, VolumeX,
  ArrowDown,
} from 'lucide-react-native';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

function getMediaDir() {
  return FileSystem.documentDirectory + 'media/';
}

const { width: W, height: H } = Dimensions.get('window');
const COLS = 3;
const GAP = 1.5;
const THUMB = (W - GAP * (COLS + 1)) / COLS;

const T = {
  bg: '#000',
  bgSurface: '#0D0D0D',
  bgCard: '#161616',
  accent: '#FFF',
  accentDim: 'rgba(255,255,255,0.38)',
  accentSub: 'rgba(255,255,255,0.16)',
  danger: '#FF3B30',
  border: 'rgba(255,255,255,0.08)',
  tabActive: '#FFF',
  tabInactive: 'rgba(255,255,255,0.32)',
  toolbar: 'rgba(0,0,0,0.72)',
};

// ─────────────────────────────────────────────────────────────────────────────
// LOAD FILES
// ─────────────────────────────────────────────────────────────────────────────

async function loadMediaFiles() {
  const dir = getMediaDir();
  try {
    const dirInfo = await FileSystem.getInfoAsync(dir);
    if (!dirInfo.exists) return [];
    const names = await FileSystem.readDirectoryAsync(dir);
    const media = names.filter(n => /\.(jpg|mp4)$/i.test(n));
    const withMeta = await Promise.all(media.map(async name => {
      const uri = dir + name;
      const info = await FileSystem.getInfoAsync(uri, { md5: false });
      return { uri, name, isVideo: /\.mp4$/i.test(name), modTime: info.modificationTime ?? 0 };
    }));
    return withMeta.sort((a, b) => b.modTime - a.modTime);
  } catch { return []; }
}

// ─────────────────────────────────────────────────────────────────────────────
// RE-AUTH HELPER — called before any destructive / export action
// ─────────────────────────────────────────────────────────────────────────────

async function reAuthenticate() {
  try {
    const [hw, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Confirm your identity to save',
      fallbackLabel: 'Use Passcode',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
      ...(hw && enrolled ? { biometricsSecurityLevel: 'strong' } : {}),
    });
    return result.success;
  } catch { return false; }
}

// ─────────────────────────────────────────────────────────────────────────────
// DOWNLOAD TO CAMERA ROLL
// ─────────────────────────────────────────────────────────────────────────────

async function downloadToPhotos(uri) {
  // 1. Re-auth
  const authed = await reAuthenticate();
  if (!authed) return;

  // 2. Media library permission
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permission denied', 'Allow access to Photos to save media.');
    return;
  }

  // 3. Save
  try {
    await MediaLibrary.saveToLibraryAsync(uri);
    Alert.alert('Saved', 'Saved to your Photos library.');
  } catch (e) {
    Alert.alert('Save failed', e?.message ?? 'Could not save to Photos.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FORMAT TIME
// ─────────────────────────────────────────────────────────────────────────────

const fmtTime = s => {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = String(Math.floor(s % 60)).padStart(2, '0');
  return `${m}:${sec}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// VIDEO LIGHTBOX — custom controls, scrubber, download
// ─────────────────────────────────────────────────────────────────────────────

function VideoLightbox({ item, onClose, onDelete }) {
  const slideAnim = useRef(new Animated.Value(H)).current;
  const ctrlOpacity = useRef(new Animated.Value(1)).current;
  const ctrlTimer = useRef(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const durationRef = useRef(0);
  const scrubRef = useRef(false);

  const player = useVideoPlayer(item.uri, p => {
    p.loop = false;
    p.muted = false;
    p.play();
  });

  useEffect(() => {
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 200 }).start();
  }, []);

  // Duration
  useEffect(() => {
    const sub = player.addListener('statusChange', () => {
      const d = player.duration ?? 0;
      if (d > 0 && durationRef.current === 0) {
        durationRef.current = d;
        setDuration(d);
      }
    });
    return () => sub.remove();
  }, [player]);

  // Progress poll
  useEffect(() => {
    const id = setInterval(() => {
      if (scrubRef.current) return;
      const t = player.currentTime ?? 0;
      setCurrentTime(t);
      if (durationRef.current > 0 && t >= durationRef.current - 0.1) {
        player.currentTime = 0;
        player.pause();
        setIsPlaying(false);
      }
    }, 100);
    return () => clearInterval(id);
  }, [player]);

  // Mute sync
  useEffect(() => { player.muted = isMuted; }, [isMuted, player]);

  const showControls = () => {
    Animated.timing(ctrlOpacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    if (ctrlTimer.current) clearTimeout(ctrlTimer.current);
    ctrlTimer.current = setTimeout(() => {
      Animated.timing(ctrlOpacity, { toValue: 0, duration: 400, useNativeDriver: true }).start();
    }, 3000);
  };

  const togglePlay = () => {
    if (isPlaying) { player.pause(); setIsPlaying(false); }
    else { player.play(); setIsPlaying(true); }
    showControls();
  };

  const close = () => {
    player.pause();
    Animated.timing(slideAnim, { toValue: H, duration: 240, useNativeDriver: true }).start(onClose);
  };

  const SCRUB_W = W - 80;
  const scrubPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: e => {
      scrubRef.current = true;
      setScrubbing(true);
      player.pause();
      const x = Math.min(SCRUB_W, Math.max(0, e.nativeEvent.locationX));
      const ratio = x / SCRUB_W;
      const t = ratio * durationRef.current;
      player.currentTime = t;
      setCurrentTime(t);
    },
    onPanResponderMove: e => {
      const x = Math.min(SCRUB_W, Math.max(0, e.nativeEvent.locationX));
      const ratio = x / SCRUB_W;
      const t = ratio * durationRef.current;
      player.currentTime = t;
      setCurrentTime(t);
    },
    onPanResponderRelease: () => {
      scrubRef.current = false;
      setScrubbing(false);
      player.play();
      setIsPlaying(true);
    },
  })).current;

  const handleDownload = async () => {
    setDownloading(true);
    await downloadToPhotos(item.uri);
    setDownloading(false);
  };

  const handleDelete = () => {
    Alert.alert('Delete', 'Remove this video from your vault?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { close(); onDelete(item.uri); } },
    ]);
  };

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000', transform: [{ translateY: slideAnim }] }]}>
        <StatusBar hidden />

        {/* Video */}
        <TouchableWithoutFeedback onPress={togglePlay}>
          <View style={{ flex: 1 }}>
            <VideoView
              player={player}
              style={StyleSheet.absoluteFillObject}
              contentFit="contain"
              nativeControls={false}
            />
          </View>
        </TouchableWithoutFeedback>

        {/* Controls overlay */}
        <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: ctrlOpacity }]} pointerEvents="box-none">

          {/* Top bar */}
          <View style={vl.topBar}>
            <TouchableOpacity style={vl.iconBtn} onPress={close} activeOpacity={0.8}>
              <X size={18} color="#fff" strokeWidth={2.5} />
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={vl.iconBtn} onPress={() => setIsMuted(m => !m)} activeOpacity={0.8}>
                {isMuted
                  ? <VolumeX size={18} color="#fff" strokeWidth={2} />
                  : <Volume2 size={18} color="#fff" strokeWidth={2} />
                }
              </TouchableOpacity>
              <TouchableOpacity style={vl.iconBtn} onPress={handleDownload} activeOpacity={0.8} disabled={downloading}>
                {downloading
                  ? <ActivityIndicator size={14} color="#fff" />
                  : <ArrowDown size={18} color="#fff" strokeWidth={2.5} />
                }
              </TouchableOpacity>
              <TouchableOpacity style={vl.iconBtn} onPress={handleDelete} activeOpacity={0.8}>
                <Trash2 size={16} color={T.danger} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Centre play button */}
          {!isPlaying && (
            <View style={vl.centrePlay} pointerEvents="none">
              <View style={vl.centrePlayCircle}>
                <Play size={32} color="#fff" fill="#fff" strokeWidth={0} />
              </View>
            </View>
          )}

          {/* Bottom controls */}
          <View style={vl.bottomBar}>
            <Text style={vl.timeText}>{fmtTime(currentTime)}</Text>

            {/* Scrubber */}
            <View style={[vl.scrubTrack, { width: SCRUB_W }]} {...scrubPan.panHandlers}>
              {/* Track bg */}
              <View style={{ position: 'absolute', left: 0, right: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, top: 9 }} />
              {/* Progress fill */}
              <View style={{ position: 'absolute', left: 0, width: `${progress * 100}%`, height: 3, backgroundColor: '#FFF', borderRadius: 2, top: 9 }} />
              {/* Thumb */}
              <View style={[vl.scrubThumb, { left: `${progress * 100}%`, marginLeft: -8 }]} />
            </View>

            <Text style={vl.timeText}>{fmtTime(duration)}</Text>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const vl = StyleSheet.create({
  topBar: {
    position: 'absolute', top: Platform.OS === 'ios' ? 56 : 28, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  centrePlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
  },
  centrePlayCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center', justifyContent: 'center',
    paddingLeft: 4,
  },
  bottomBar: {
    position: 'absolute', bottom: Platform.OS === 'ios' ? 48 : 24,
    left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, gap: 10,
    backgroundColor: 'transparent',
  },
  timeText: {
    color: 'rgba(255,255,255,0.7)', fontSize: 11, fontVariant: ['tabular-nums'],
    letterSpacing: 0.3, minWidth: 36,
  },
  scrubTrack: {
    flex: 1, height: 20, justifyContent: 'center',
  },
  scrubThumb: {
    position: 'absolute', top: 4,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#FFF',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4, shadowRadius: 2,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// PHOTO LIGHTBOX — swipe-down dismiss, double-tap zoom, toolbar
// ─────────────────────────────────────────────────────────────────────────────

function PhotoLightbox({ item, onClose, onDelete }) {
  const slideAnim = useRef(new Animated.Value(H)).current;
  const bgOpacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const [zoomed, setZoomed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showToolbar, setShowToolbar] = useState(true);
  const toolbarTimer = useRef(null);
  const lastTap = useRef(0);

  useEffect(() => {
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 200 }).start();
  }, []);

  const close = () => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: H, duration: 240, useNativeDriver: true }),
      Animated.timing(bgOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(onClose);
  };

  // Swipe down to dismiss
  const swipePan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => !zoomed && Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => {
      if (g.dy < 0) return;
      translateY.setValue(g.dy);
      bgOpacity.setValue(Math.max(0, 1 - g.dy / 300));
    },
    onPanResponderRelease: (_, g) => {
      if (g.dy > 100 || g.vy > 0.8) {
        close();
      } else {
        Animated.parallel([
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
          Animated.timing(bgOpacity, { toValue: 1, duration: 160, useNativeDriver: true }),
        ]).start();
      }
    },
  })).current;

  const handleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      // Double tap — toggle zoom
      if (zoomed) {
        Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
        setZoomed(false);
      } else {
        Animated.spring(scale, { toValue: 2.2, useNativeDriver: true }).start();
        setZoomed(true);
      }
    } else {
      // Single tap — toggle toolbar
      setShowToolbar(v => !v);
    }
    lastTap.current = now;
  };

  const handleDownload = async () => {
    setDownloading(true);
    await downloadToPhotos(item.uri);
    setDownloading(false);
  };

  const handleDelete = () => {
    Alert.alert('Delete', 'Remove this photo from your vault?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { close(); onDelete(item.uri); } },
    ]);
  };

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000', opacity: bgOpacity, transform: [{ translateY: slideAnim }] }]}>
        <StatusBar hidden />

        <Animated.View
          style={[StyleSheet.absoluteFillObject, { transform: [{ translateY }] }]}
          {...swipePan.panHandlers}
        >
          <TouchableWithoutFeedback onPress={handleTap}>
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Animated.Image
                source={{ uri: item.uri }}
                style={{ width: W, height: H, transform: [{ scale }] }}
                resizeMode="contain"
              />
            </View>
          </TouchableWithoutFeedback>
        </Animated.View>

        {/* Top bar */}
        {showToolbar && (
          <View style={pl.topBar}>
            <TouchableOpacity style={pl.iconBtn} onPress={close} activeOpacity={0.8}>
              <X size={18} color="#fff" strokeWidth={2.5} />
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={pl.iconBtn} onPress={handleDownload} activeOpacity={0.8} disabled={downloading}>
                {downloading
                  ? <ActivityIndicator size={14} color="#fff" />
                  : <ArrowDown size={18} color="#fff" strokeWidth={2.5} />
                }
              </TouchableOpacity>
              <TouchableOpacity style={pl.iconBtn} onPress={handleDelete} activeOpacity={0.8}>
                <Trash2 size={16} color={T.danger} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Swipe-down hint line */}
        <View style={pl.swipeHint} />
      </Animated.View>
    </Modal>
  );
}

const pl = StyleSheet.create({
  topBar: {
    position: 'absolute', top: Platform.OS === 'ios' ? 56 : 28, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16,
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  swipeHint: {
    position: 'absolute', top: Platform.OS === 'ios' ? 12 : 8,
    alignSelf: 'center',
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// LOCK SCREEN
// ─────────────────────────────────────────────────────────────────────────────

function LockScreen({ onUnlock, reason, failed }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={ls.container}>
      <StatusBar barStyle="light-content" />
      <Animated.View style={[ls.iconWrap, { transform: [{ scale: pulseAnim }] }]}>
        <View style={ls.iconRing}>
          <Eye size={40} color={T.accent} strokeWidth={1.5} />
        </View>
      </Animated.View>
      <Text style={ls.title}>Private Vault</Text>
      <Text style={ls.subtitle}>
        {failed ? (reason ?? 'Authentication failed.') : "Only you can see what's in here."}
      </Text>
      <TouchableOpacity style={ls.unlockBtn} onPress={onUnlock} activeOpacity={0.85}>
        <Lock size={16} color={T.bg} strokeWidth={2.5} />
        <Text style={ls.unlockTxt}>Unlock with Face ID</Text>
      </TouchableOpacity>
      {failed && <Text style={ls.retryNote}>Tap above to try again</Text>}
    </View>
  );
}

const ls = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: T.bg,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40,
  },
  iconWrap: { marginBottom: 32 },
  iconRing: {
    width: 96, height: 96, borderRadius: 48,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { color: T.accent, fontSize: 22, fontWeight: '700', letterSpacing: 0.4, marginBottom: 10 },
  subtitle: { color: T.accentDim, fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 40 },
  unlockBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: T.accent, paddingHorizontal: 36, paddingVertical: 16, borderRadius: 50,
  },
  unlockTxt: { color: T.bg, fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
  retryNote: { color: T.accentDim, fontSize: 12, marginTop: 20, letterSpacing: 0.3 },
});

// ─────────────────────────────────────────────────────────────────────────────
// THUMBNAIL
// ─────────────────────────────────────────────────────────────────────────────
function Thumb({ item, selected, selecting, onPress, onLongPress }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [thumbUri, setThumbUri] = useState(item.uri);
  const [loading, setLoading] = useState(false);

  // Automatically generate a proper video frame when it's a video
  useEffect(() => {
    let isMounted = true;

    const extractThumbnail = async () => {
      if (!item.isVideo || !item.uri) return;

      // Skip if we already have a generated thumbnail on this item
      if (item.thumbUri) {
        setThumbUri(item.thumbUri);
        return;
      }

      setLoading(true);
      try {
        const { uri: generatedUri } = await VideoThumbnails.getThumbnailAsync(item.uri, {
          time: 500,           // extract frame at 0.5 seconds (feels more natural)
          quality: 0.85,
        });

        if (isMounted) {
          setThumbUri(generatedUri);
          // Optional: attach it to the item so it doesn't regenerate next render
          // item.thumbUri = generatedUri;
        }
      } catch (error) {
        console.warn('Thumbnail generation failed:', error);
        // Fallback: keep the original uri (Image will try its best)
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    extractThumbnail();

    return () => { isMounted = false; };
  }, [item.isVideo, item.uri]);

  const handleLongPress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.92, duration: 100, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
    onLongPress?.();
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={handleLongPress}
      delayLongPress={350}
      activeOpacity={0.88}
      style={{ width: THUMB, height: THUMB }}
    >
      <Animated.View style={{ flex: 1, transform: [{ scale: scaleAnim }] }}>
        <Image
          source={{ uri: thumbUri }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
        />

        {item.isVideo && (
          <View style={th.videoBadge}>
            <Play size={8} color="#fff" fill="#fff" strokeWidth={0} />
          </View>
        )}

        {/* Overlay when selecting */}
        {selecting && !selected && (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
        )}

        {selecting && selected && (
          <View style={th.checkWrap}>
            <CheckCircle size={20} color={T.accent} fill="rgba(0,0,0,0.7)" strokeWidth={2} />
          </View>
        )}

        {selected && (
          <View
            style={[StyleSheet.absoluteFillObject, { borderWidth: 2, borderColor: T.accent }]}
            pointerEvents="none"
          />
        )}

        {/* Small loading indicator while generating thumbnail */}
        {loading && item.isVideo && (
          <View style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }
          ]}>
            <ActivityIndicator size="small" color="#fff" />
          </View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}


const th = StyleSheet.create({
  videoBadge: {
    position: 'absolute', bottom: 6, right: 6,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center', justifyContent: 'center',
  },
  checkWrap: { position: 'absolute', top: 6, right: 6 },
});

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────

const TABS = ['All', 'Photos', 'Videos'];

export default function MediaVaultScreen() {
  const router = useRouter();

  const [authState, setAuthState] = useState('idle');
  const [authReason, setAuthReason] = useState(null);
  const [allFiles, setAllFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [selecting, setSelecting] = useState(false);
  const [tab, setTab] = useState('All');

  const files = allFiles.filter(f => {
    if (tab === 'Photos') return !f.isVideo;
    if (tab === 'Videos') return f.isVideo;
    return true;
  });

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authenticate = useCallback(async () => {
    setAuthState('pending');
    setAuthReason(null);
    try {
      const [hw, enrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock your vault',
        fallbackLabel: 'Use Passcode',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
        ...(hw && enrolled ? { biometricsSecurityLevel: 'strong' } : {}),
      });
      if (result.success) {
        setAuthState('ok');
      } else {
        setAuthState('failed');
        setAuthReason(result.error === 'user_cancel' ? 'Authentication cancelled.' : null);
      }
    } catch (e) {
      setAuthState('failed');
      setAuthReason(e?.message ?? null);
    }
  }, []);

  useEffect(() => { authenticate(); }, []);

  const reload = useCallback(() => {
    if (authState !== 'ok') return;
    setLoading(true);
    loadMediaFiles().then(f => { setAllFiles(f); setLoading(false); });
  }, [authState]);

  useEffect(() => { reload(); }, [authState]);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  // ── Selection ─────────────────────────────────────────────────────────────
  const toggleSelect = useCallback(uri => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(uri) ? next.delete(uri) : next.add(uri);
      return next;
    });
  }, []);

  const cancelSelection = useCallback(() => {
    setSelecting(false);
    setSelected(new Set());
  }, []);

  const deleteSelected = useCallback(() => {
    if (!selected.size) return;
    Alert.alert(
      'Delete',
      `Permanently delete ${selected.size} item${selected.size > 1 ? 's' : ''}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            await Promise.all([...selected].map(u => FileSystem.deleteAsync(u, { idempotent: true })));
            setAllFiles(prev => prev.filter(f => !selected.has(f.uri)));
            cancelSelection();
          },
        },
      ]
    );
  }, [selected, cancelSelection]);

  // Called from lightbox delete button
  const handleDeleteOne = useCallback(uri => {
    FileSystem.deleteAsync(uri, { idempotent: true }).then(() => {
      setAllFiles(prev => prev.filter(f => f.uri !== uri));
    });
  }, []);

  // ── Pending / failed states ───────────────────────────────────────────────
  if (authState === 'idle' || authState === 'pending') {
    return (
      <View style={{ flex: 1, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <StatusBar barStyle="light-content" />
        <Eye size={40} color={T.accentDim} strokeWidth={1.5} />
        <ActivityIndicator color={T.accent} />
      </View>
    );
  }

  if (authState === 'failed') {
    return <LockScreen onUnlock={authenticate} reason={authReason} failed />;
  }

  // ── Authenticated ─────────────────────────────────────────────────────────
  const isEmpty = !loading && files.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <StatusBar barStyle="light-content" />

      <SafeAreaView style={{ backgroundColor: T.bg }}>
        {/* Header */}
        <View style={g.header}>
          {selecting ? (
            <>
              <TouchableOpacity onPress={cancelSelection} activeOpacity={0.7} style={g.headerBtn}>
                <Text style={{ color: T.accentDim, fontSize: 14 }}>Cancel</Text>
              </TouchableOpacity>
              <Text style={g.headerTitle}>
                {selected.size > 0 ? `${selected.size} Selected` : 'Select Items'}
              </Text>
              <TouchableOpacity
                onPress={deleteSelected}
                activeOpacity={0.7}
                style={[g.headerBtn, { opacity: selected.size > 0 ? 1 : 0 }]}
                disabled={selected.size === 0}
              >
                <Trash2 size={18} color={T.danger} strokeWidth={2} />
              </TouchableOpacity>
            </>
          ) : (
            <>
            </>
          )}
        </View>

        {/* Tab bar */}
        <View style={g.tabs}>
          {TABS.map(t => (
            <TouchableOpacity
              key={t} onPress={() => setTab(t)} activeOpacity={0.7}
              style={[g.tab, tab === t && g.tabActive]}
            >
              <Text style={[g.tabTxt, tab === t && g.tabTxtActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>

      {/* Grid */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={T.accent} size="large" />
        </View>
      ) : isEmpty ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
          <View style={g.emptyIconWrap}>
            {tab === 'Videos'
              ? <Film size={32} color={T.accentDim} strokeWidth={1.5} />
              : <ImageIcon size={32} color={T.accentDim} strokeWidth={1.5} />
            }
          </View>
          <Text style={g.emptyTitle}>Nothing here yet</Text>
          <Text style={g.emptySub}>
            {tab === 'Videos' ? 'Videos you save will appear here.'
              : tab === 'Photos' ? 'Photos you save will appear here.'
                : 'Save a photo or video from the camera.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={files}
          keyExtractor={item => item.uri}
          numColumns={COLS}
          contentContainerStyle={{ padding: GAP, gap: GAP }}
          columnWrapperStyle={{ gap: GAP }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Thumb
              item={item}
              selected={selected.has(item.uri)}
              selecting={selecting}
              onPress={() => {
                if (selecting) { toggleSelect(item.uri); return; }
                setPreview(item);
              }}
              onLongPress={() => {
                if (!selecting) setSelecting(true);
                toggleSelect(item.uri);
              }}
            />
          )}
        />
      )}

      {/* Selection count pill */}
      {selecting && selected.size > 0 && (
        <View style={g.countPill}>
          <Text style={g.countTxt}>{selected.size} selected</Text>
        </View>
      )}

      {/* Lightboxes */}
      {preview?.isVideo && (
        <VideoLightbox
          item={preview}
          onClose={() => setPreview(null)}
          onDelete={uri => { setPreview(null); handleDeleteOne(uri); }}
        />
      )}
      {preview && !preview.isVideo && (
        <PhotoLightbox
          item={preview}
          onClose={() => setPreview(null)}
          onDelete={uri => { setPreview(null); handleDeleteOne(uri); }}
        />
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL STYLES
// ─────────────────────────────────────────────────────────────────────────────

const g = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10,
  },
  headerBtn: {
    width: 44, height: 36, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    color: T.accent, fontSize: 15, fontWeight: '700', letterSpacing: 0.4,
  },
  tabs: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 10,
    backgroundColor: T.bgCard, borderRadius: 10, padding: 3,
  },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: 'rgba(255,255,255,0.12)' },
  tabTxt: { color: T.tabInactive, fontSize: 13, fontWeight: '600' },
  tabTxtActive: { color: T.tabActive },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: T.bgCard,
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  emptyTitle: { color: T.accent, fontSize: 17, fontWeight: '600', marginBottom: 8 },
  emptySub: { color: T.accentDim, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  countPill: {
    position: 'absolute', bottom: 36, alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: T.border,
    paddingHorizontal: 18, paddingVertical: 8, borderRadius: 50,
  },
  countTxt: { color: T.accent, fontSize: 13, fontWeight: '600' },
});
