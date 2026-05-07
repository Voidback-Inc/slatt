import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { StyleSheet, View } from 'react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarShowLabel: false,
        tabBarActiveTintColor: '#fff',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.3)',
        headerShown: false,
        tabBarBackground: () => (
          <BlurView tint="dark" intensity={50} style={StyleSheet.absoluteFill} />
        ),
        tabBarStyle: {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: 'rgba(255,255,255,0.06)',
          backgroundColor: 'transparent',
        },
      }}
    >
      <Tabs.Screen
        name="chat"
        options={{
          tabBarIcon: ({ color }) => <Feather size={23} name="message-circle" color={color} />,
        }}
      />
      <Tabs.Screen
        name="camera"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <View style={{
              width: 46, height: 46, borderRadius: 23,
              backgroundColor: focused ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 1.5,
              borderColor: focused ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)',
            }}>
              <Feather size={20} name="camera" color={color} />
            </View>
          ),
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          tabBarIcon: ({ color }) => <Feather size={22} name="clock" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarIcon: ({ color }) => <Feather size={22} name="settings" color={color} />,
        }}
      />
    </Tabs>
  );
}
