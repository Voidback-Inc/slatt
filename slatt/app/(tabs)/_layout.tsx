import { Tabs } from 'expo-router';
import { Feather } from "@expo/vector-icons";
import { BlurView } from 'expo-blur';
import { StyleSheet } from 'react-native';



export default function TabLayout() {


  return (
    <Tabs
      screenOptions={{
        tabBarShowLabel: false,
        tabBarActiveTintColor: 'white',
        headerShown: false,
        tabBarBackground: () => (
          <BlurView
            tint="dark" // or "dark" / "extraLight"
            intensity={40} // Adjust this for transparency level
            style={StyleSheet.absoluteFill}
          />
        ),
      }}

    >

      <Tabs.Screen
        name="vault"
        options={{
          tabBarIcon: ({ color }) => <Feather size={28} name="lock" color={color} />,
        }}
      />


      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ color }) => <Feather size={28} name="camera" color={color} />,
        }}
      />


      <Tabs.Screen
        name="settings"
        options={{
          tabBarIcon: ({ color }) => <Feather size={28} name="settings" color={color} />,
        }}
      />



    </Tabs>
  )
}
