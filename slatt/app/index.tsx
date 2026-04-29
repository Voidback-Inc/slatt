import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

// Initial loading screen shown while Supabase session is resolving.
// AuthGate in _layout.tsx immediately replaces this with login or chat.
export default function Index() {
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar style="light" />
    </View>
  );
}
