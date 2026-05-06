import { useEffect, useState, useRef } from 'react';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Text, Animated, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import 'react-native-reanimated';
import { supabase } from '@/lib/supabase';
import { loadLang } from '@/lib/i18n';
import type { Session } from '@supabase/supabase-js';

SplashScreen.preventAutoHideAsync();

function AuthGate({ session }: { session: Session | null }) {
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    const inAuth = segments[0] === '(auth)';
    const inTabs = segments[0] === '(tabs)';
    if (!session && !inAuth) router.replace('/(auth)/login');
    else if (session && !inTabs) router.replace('/(tabs)/chat');
  }, [session, segments]);

  return null;
}

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [splashDone, setSplashDone] = useState(false);

  const wordmarkOpacity = useRef(new Animated.Value(0)).current;
  const wordmarkScale = useRef(new Animated.Value(0.92)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;

  // Animate wordmark in as soon as JS is ready
  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(wordmarkOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.spring(wordmarkScale, {
          toValue: 1,
          tension: 100,
          friction: 12,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(taglineOpacity, {
        toValue: 1,
        duration: 400,
        delay: 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useEffect(() => { loadLang(); }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setInitialized(true);
    }).catch(() => {
      setSession(null);
      setInitialized(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        setSession(session);
        setInitialized(true);
      }
      if (event === 'SIGNED_OUT') setSession(null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!initialized) return;
    SplashScreen.hideAsync();
    // Hold the wordmark for a beat, then fade out
    const t = setTimeout(() => {
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 450,
        useNativeDriver: true,
      }).start(() => setSplashDone(true));
    }, 900);
    return () => clearTimeout(t);
  }, [initialized]);

  return (
    <View style={styles.root}>
      <ThemeProvider value={DarkTheme}>
        {initialized && <AuthGate session={session} />}
        <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
        </Stack>
        <StatusBar style="light" />
      </ThemeProvider>

      {!splashDone && (
        <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
          <Animated.Text style={[styles.wordmark, {
            opacity: wordmarkOpacity,
            transform: [{ scale: wordmarkScale }],
          }]}>
            slatt
          </Animated.Text>
          <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>
            collective intelligence
          </Animated.Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    color: '#fff',
    fontSize: 46,
    fontWeight: '800',
    letterSpacing: -2,
  },
  tagline: {
    color: 'rgba(255,255,255,0.28)',
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 1.5,
    marginTop: 10,
    textTransform: 'uppercase',
  },
});
