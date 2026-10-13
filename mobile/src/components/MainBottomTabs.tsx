import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { UsersScreen } from '../screens/UsersScreen';
import { CallsScreen } from '../screens/CallsScreen';
import { ChatsScreen } from '../screens/ChatsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { Home, Phone, MessageSquare, User } from 'lucide-react-native';
import { View, StyleSheet, Platform } from 'react-native';

const Tab = createBottomTabNavigator();

export const MainBottomTabs = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: true,
        tabBarActiveTintColor: '#818cf8',
        tabBarInactiveTintColor: '#64748b',
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      {/* 1. Ana Ekran (Home - Kullanıcılar & Hikaye Şeridi) */}
      <Tab.Screen
        name="HomeTab"
        component={UsersScreen}
        options={{
          tabBarLabel: 'Ana Sayfa',
          tabBarIcon: ({ color, focused }) => (
            <View style={focused ? styles.activeIconIndicator : null}>
              <Home size={22} color={color} />
            </View>
          ),
        }}
      />

      {/* 2. Aramalar (Calls - Geçmiş ve Kayıtlar) */}
      <Tab.Screen
        name="CallsTab"
        component={CallsScreen}
        options={{
          tabBarLabel: 'Aramalar',
          tabBarIcon: ({ color, focused }) => (
            <View style={focused ? styles.activeIconIndicator : null}>
              <Phone size={22} color={color} />
            </View>
          ),
        }}
      />

      {/* 3. Mesajlar (Chats - Tüm Sohbetler & Arama) */}
      <Tab.Screen
        name="ChatsTab"
        component={ChatsScreen}
        options={{
          tabBarLabel: 'Mesajlar',
          tabBarIcon: ({ color, focused }) => (
            <View style={focused ? styles.activeIconIndicator : null}>
              <MessageSquare size={22} color={color} />
            </View>
          ),
        }}
      />

      {/* 4. Profil (Instagram Style Vitrin & Fotoğraflar) */}
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profil',
          tabBarIcon: ({ color, focused }) => (
            <View style={focused ? styles.activeIconIndicator : null}>
              <User size={22} color={color} />
            </View>
          ),
        }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#0a0d16',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    height: Platform.OS === 'ios' ? 88 : 64,
    paddingBottom: Platform.OS === 'ios' ? 26 : 8,
    paddingTop: 8,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  activeIconIndicator: {
    transform: [{ scale: 1.08 }],
  },
});
