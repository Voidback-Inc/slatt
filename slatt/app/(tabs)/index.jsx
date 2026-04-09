/**
 * CameraScreen.jsx — Managed Expo (Expo Go compatible)
 * * Changes:
 * - Refined RecordingRing positioning to perfectly center the arc over the shutter ring.
 * - Adjusted ARC_R calculation to ensure the progress indicator is concentric with the thick ring.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  Animated, Image, Alert, PanResponder, Dimensions, StyleSheet,
} from 'react-native';
import { CameraView, Camera } from 'expo-camera';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { X, Check, Zap, ZapOff, Play, Pause, Lock } from 'lucide-react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import Svg, { Circle } from 'react-native-svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE
// ─────────────────────────────────────────────────────────────────────────────

export const MEDIA_DIR = FileSystem.documentDirectory + 'media/';



// ─────────────────────────────────────────────────────────────────────────────
// THEME
// ─────────────────────────────────────────────────────────────────────────────

const T = {
  accent: '#FFFFFF',
  accentDim: 'rgba(255,255,255,0.50)',
  accentFaint: 'rgba(255,255,255,0.15)',
  surface: 'rgba(0,0,0,0.52)',
  danger: '#FF3B30',
  saveBg: '#FFFFFF',
  pillBorder: 'rgba(255,255,255,0.20)',
};

// ─────────────────────────────────────────────────────────────────────────────
// SHUTTER RING CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const RING_SIZE = 84;
const RING_STROKE = 5;


// ─────────────────────────────────────────────────────────────────────────────
// FRONT FLASH OVERLAY
// ─────────────────────────────────────────────────────────────────────────────

function FrontFlashOverlay({ visible }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) return;
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 30, useNativeDriver: true }),
      Animated.delay(120),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [visible]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, { backgroundColor: '#FFF', opacity, zIndex: 50 }]}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VIDEO PREVIEW SCREEN
// ─────────────────────────────────────────────────────────────────────────────

function VideoPreviewScreen({ media, onDiscard, onSave, saving }) {
  const [isPlaying, setIsPlaying] = useState(true);
  const player = useVideoPlayer(media.uri, p => { p.loop = true; p.play(); });

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <VideoView
        player={player}
        style={[StyleSheet.absoluteFillObject, { transform: [{ scaleX: -1 }] }]}
        contentFit="contain"
        nativeControls={false}
      />

      <TouchableOpacity style={styles.iconBtn} onPress={onDiscard} activeOpacity={0.7}>
        <X size={20} color={T.accent} strokeWidth={2.5} />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.iconBtn, { left: undefined, right: 20 }]}
        onPress={() => {
          if (isPlaying) { player.pause(); setIsPlaying(false); }
          else { player.play(); setIsPlaying(true); }
        }}
        activeOpacity={0.7}
      >
        {isPlaying
          ? <Pause size={17} color={T.accent} strokeWidth={2.5} fill={T.accent} />
          : <Play size={17} color={T.accent} strokeWidth={2.5} fill={T.accent} />
        }
      </TouchableOpacity>

      <View style={{ position: 'absolute', bottom: 52, left: 0, right: 0, alignItems: 'center' }}>
        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.55 }]}
          onPress={onSave}
          activeOpacity={0.85}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator size="small" color={T.saveText} />
            : <Lock size={16} color={"white"} strokeWidth={2.5} />
          }
          <Text style={styles.saveTxt}>{saving ? 'Saving…' : 'Save'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PHOTO PREVIEW SCREEN
// ─────────────────────────────────────────────────────────────────────────────

function PhotoPreviewScreen({ media, onDiscard, onSave, saving }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Image source={{ uri: media.uri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />

      <TouchableOpacity style={styles.iconBtn} onPress={onDiscard} activeOpacity={0.7}>
        <X size={20} color={T.accent} strokeWidth={2.5} />
      </TouchableOpacity>

      <View style={{ position: 'absolute', bottom: 52, left: 0, right: 0, alignItems: 'center' }}>
        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.55 }]}
          onPress={onSave}
          activeOpacity={0.85}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator size="small" color={T.saveText} />
            : <Lock size={16} color={"white"} strokeWidth={2.5} />
          }
          <Text style={styles.saveTxt}>{saving ? 'Saving…' : 'Save'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SAVE SUCCESS OVERLAY
// ─────────────────────────────────────────────────────────────────────────────

function SavedOverlay({ onDone }) {
  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 12 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    const t = setTimeout(onDone, 1400);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ alignItems: 'center', transform: [{ scale }], opacity }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <Lock size={30} color="#000" strokeWidth={2.5} />
        </View>
        <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 }}>Saved to Vault</Text>
        <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 6, letterSpacing: 0.3 }}>
          Open the vault to view your media
        </Text>
      </Animated.View>
    </View>
  );
}

/**
 * CameraScreen.jsx — Managed Expo (Expo Go compatible)
 * * Changes:
 * - Refined RecordingRing positioning to perfectly center the arc over the shutter ring.
 * - Adjusted ARC_R calculation to ensure the progress indicator is concentric with the thick ring.
 * - Shutter button now turns red + white during recording (as requested)
 */

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE
// ─────────────────────────────────────────────────────────────────────────────


export async function ensureMediaDir() {
  const info = await FileSystem.getInfoAsync(MEDIA_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(MEDIA_DIR, { intermediates: true });
  }
}

export async function saveMediaSecurely(sourceUri, ext) {
  await ensureMediaDir();
  const dest = MEDIA_DIR + Crypto.randomUUID() + '.' + ext;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  await FileSystem.deleteAsync(sourceUri, { idempotent: true });
  return dest;
}


const styles = StyleSheet.create({
  iconBtn: {
    position: 'absolute', top: 56, left: 20, zIndex: 20,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: T.pillBorder,
  },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: T.surface, paddingHorizontal: 32, paddingVertical: 14,
    borderRadius: 100, gap: 8
  },
  saveTxt: { color: "white", fontSize: 15, fontWeight: '700', letterSpacing: 0.4 },
});

const HOLD_MS = 250;
const MAX_Z = 0.5;
const PRESS = { IDLE: 0, PENDING: 1, RECORDING: 2 };

// ─────────────────────────────────────────────────────────────────────────────
// MAIN CAMERA SCREEN
// ─────────────────────────────────────────────────────────────────────────────

export default function CameraScreen() {
  const cameraRef = useRef(null);
  const pressState = useRef(PRESS.IDLE);
  const holdTimer = useRef(null);
  const slideStartY = useRef(null);
  const zoomRef = useRef(0);
  const baseZoomRef = useRef(0);

  const [hasPermission, setHasPermission] = useState(null);
  const [facing, setFacing] = useState('back');
  const [flash, setFlash] = useState('off');
  const [isRecording, setIsRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [media, setMedia] = useState(null);
  const [frontFlashing, setFrontFlashing] = useState(false);

  const ringScale = useRef(new Animated.Value(1)).current;
  const useFrontFlash = facing === 'front' && flash === 'on';
  const torchOn = facing === 'back' && flash === 'on' && isRecording;
  const photoFlash = facing === 'back' ? flash : 'off';

  useEffect(() => {
    (async () => {
      const [cam, mic] = await Promise.all([
        Camera.requestCameraPermissionsAsync(),
        Camera.requestMicrophonePermissionsAsync(),
      ]);
      setHasPermission(cam.status === 'granted' && mic.status === 'granted');
    })();
  }, []);

  const flipCamera = useCallback(() => setFacing(f => f === 'back' ? 'front' : 'back'), []);

  const pinch = Gesture.Pinch()
    .onStart(() => { baseZoomRef.current = zoomRef.current; })
    .onUpdate(e => {
      const n = Math.min(MAX_Z, Math.max(0, baseZoomRef.current + (e.scale - 1) * 0.3));
      zoomRef.current = n; setZoom(n);
    }).runOnJS(true);

  const dblTap = Gesture.Tap().numberOfTaps(2).maxDuration(300).onEnd(flipCamera).runOnJS(true);
  const viewfinderGestures = Gesture.Simultaneous(pinch, dblTap);

  const _startRecording = useCallback(async () => {
    if (!cameraRef.current) return;
    pressState.current = PRESS.RECORDING;
    setIsRecording(true);
    Animated.timing(ringScale, { toValue: 1.15, duration: 200, useNativeDriver: true }).start();
    try {
      const result = await cameraRef.current.recordAsync({ maxDuration: 60 });
      if (result?.uri) setMedia({ uri: result.uri, type: 'video' });
    } catch (e) {
      if (pressState.current === PRESS.RECORDING) Alert.alert('Recording error', e?.message ?? 'Unknown');
    } finally {
      pressState.current = PRESS.IDLE;
      setIsRecording(false); setZoom(0); zoomRef.current = 0;
      Animated.timing(ringScale, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    }
  }, [ringScale]);

  const _stopRecording = useCallback(() => {
    pressState.current = PRESS.IDLE;
    setIsRecording(false); setZoom(0); zoomRef.current = 0;
    Animated.timing(ringScale, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    cameraRef.current?.stopRecording();
  }, [ringScale]);

  const _takePicture = useCallback(async () => {
    if (!cameraRef.current) return;
    if (useFrontFlash) { setFrontFlashing(true); await new Promise(r => setTimeout(r, 80)); }
    Animated.sequence([
      Animated.timing(ringScale, { toValue: 0.88, duration: 55, useNativeDriver: true }),
      Animated.timing(ringScale, { toValue: 1, duration: 55, useNativeDriver: true }),
    ]).start();
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.92, skipProcessing: true, flash: photoFlash,
      });
      setMedia({ uri: photo.uri, type: 'photo' });
    } catch { Alert.alert('Error', 'Failed to take photo.'); }
    finally {
      setTimeout(() => setFrontFlashing(false), 500);
      pressState.current = PRESS.IDLE;
    }
  }, [useFrontFlash, photoFlash, ringScale]);

  const shutterPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: e => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
      pressState.current = PRESS.PENDING;
      slideStartY.current = e.nativeEvent.pageY;
      holdTimer.current = setTimeout(() => {
        if (pressState.current === PRESS.PENDING) _startRecording();
      }, HOLD_MS);
    },
    onPanResponderMove: e => {
      if (pressState.current !== PRESS.RECORDING || slideStartY.current === null) return;
      const n = Math.min(MAX_Z, Math.max(0, (slideStartY.current - e.nativeEvent.pageY) / 200 * MAX_Z));
      zoomRef.current = n; setZoom(n);
    },
    onPanResponderRelease: () => {
      if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
      slideStartY.current = null;
      if (pressState.current === PRESS.PENDING) { pressState.current = PRESS.IDLE; _takePicture(); }
      else if (pressState.current === PRESS.RECORDING) { _stopRecording(); }
    },
    onPanResponderTerminate: () => {
      if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
      slideStartY.current = null;
      if (pressState.current === PRESS.RECORDING) _stopRecording();
      else pressState.current = PRESS.IDLE;
    },
  })).current;

  const handleDiscard = () => setMedia(null);

  const handleSave = async () => {
    if (!media || saving) return;
    setSaving(true);
    try {
      const ext = media.type === 'photo' ? 'jpg' : 'mp4';
      await saveMediaSecurely(media.uri, ext);
      setMedia(null);
      setSaved(true);
    } catch (e) {
      Alert.alert('Save failed', e?.message ?? 'Could not save the media.');
    } finally {
      setSaving(false);
    }
  };

  if (hasPermission === null) return (
    <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={T.accent} />
    </View>
  );
  if (!hasPermission) return (
    <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
      <Text style={{ color: T.accentDim, fontSize: 14, textAlign: 'center', lineHeight: 22 }}>
        Camera & microphone access is required.
      </Text>
    </View>
  );

  if (saved) return <SavedOverlay onDone={() => setSaved(false)} />;

  if (media?.type === 'video') return (
    <VideoPreviewScreen media={media} onDiscard={handleDiscard} onSave={handleSave} saving={saving} />
  );
  if (media?.type === 'photo') return (
    <PhotoPreviewScreen media={media} onDiscard={handleDiscard} onSave={handleSave} saving={saving} />
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>

        <GestureDetector gesture={viewfinderGestures}>
          <View style={{ flex: 1 }}>
            <CameraView
              ref={cameraRef}
              style={{ flex: 1 }}
              facing={facing}
              flash={useFrontFlash ? 'off' : photoFlash}
              enableTorch={torchOn}
              mode="video"
              zoom={zoom}
              videoQuality="1080p"
              mirror={true}
            />
          </View>
        </GestureDetector>

        <FrontFlashOverlay visible={frontFlashing} />

        {zoom > 0.01 && (
          <View style={{ position: 'absolute', top: '50%', alignSelf: 'center', backgroundColor: T.surface, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 3 }}>
            <Text style={{ color: T.accent, fontSize: 13, fontWeight: '600', letterSpacing: 0.3 }}>
              {(1 + zoom * 8).toFixed(1)}×
            </Text>
          </View>
        )}

        <View style={{ position: 'absolute', top: 56, right: 20, zIndex: 10, alignItems: 'center', gap: 6 }}>
          <TouchableOpacity
            style={[styles.iconBtn, { position: 'relative', top: 0, left: 0 }]}
            onPress={() => setFlash(f => f === 'off' ? 'on' : 'off')}
            activeOpacity={0.7}
          >
            {flash === 'off'
              ? <ZapOff size={18} color={T.accentDim} strokeWidth={2} />
              : <Zap size={18} color={T.accent} strokeWidth={2} />
            }
          </TouchableOpacity>
          {torchOn && (
            <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: T.accent }} />
          )}
        </View>

        {isRecording && (
          <View style={{ position: 'absolute', top: 58, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', backgroundColor: T.surface, borderRadius: 3, paddingHorizontal: 10, paddingVertical: 4, gap: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: T.pillBorder }}>
            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: T.danger }} />
            <Text style={{ color: T.accent, fontSize: 10, fontWeight: '700', letterSpacing: 2.5 }}>REC</Text>
          </View>
        )}

        <View
          style={{
            position: 'absolute', bottom: 48,
            alignSelf: 'center',
            width: RING_SIZE,
            height: RING_SIZE,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          {...shutterPan.panHandlers}
        >

          {/* Updated Shutter Button - Red + White during recording */}
          <Animated.View
            style={{
              marginBottom: 30,
              width: RING_SIZE + 10,
              height: RING_SIZE + 10,
              borderRadius: RING_SIZE + 10 / 2,
              borderWidth: RING_STROKE,
              borderColor: isRecording ? "#FFFFFF" : "#FFFFFF",           // white border when recording
              backgroundColor: isRecording ? "#FF3B30" : "transparent",   // red background when recording
            }}
          />
        </View>

        {!isRecording && (
          <View style={{ position: 'absolute', bottom: 22, alignSelf: 'center' }}>
            <Text style={{ color: T.accentDim, fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' }}>
              Hold · Video  ·  Double-tap · Flip
            </Text>
          </View>
        )}
      </View>
    </GestureHandlerRootView>
  );
}
