import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import '@/global.css';





export const unstable_settings = {
  anchor: '(tabs)',
};




export default function RootLayout() {

  const router = useRouter();


  return (
    <GluestackUIProvider mode="dark">
      <ThemeProvider value={DarkTheme}>
        <Stack
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />

          <Stack.Screen
            name="(modals)/DatasetSelect"
            options={{
              presentation: 'modal',
              headerTitle: 'Pick Dataset',
            }}
          />


          <Stack.Screen
            name="(auth)"
            options={{
              headerShown: false
            }}
          />


        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </GluestackUIProvider>
  );
}
