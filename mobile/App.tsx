import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { AuthScreen } from './src/screens/AuthScreen';
import { UsersScreen } from './src/screens/UsersScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { CallScreen } from './src/screens/CallScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { UserProfileScreen } from './src/screens/UserProfileScreen';
import { IncomingCallModal } from './src/components/IncomingCallModal';
import { ActivityIndicator, View } from 'react-native';

import { InAppNotificationBanner } from './src/components/InAppNotificationBanner';

import { MainBottomTabs } from './src/components/MainBottomTabs';

const Stack = createNativeStackNavigator();

function NavigationRoot() {
  const { user, loading } = useAuth();
  const navigationRef = React.useRef<any>(null);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#0f172a',
        }}
      >
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
        }}
      >
        {!user ? (
          <Stack.Screen name="Auth" component={AuthScreen} />
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={MainBottomTabs} />
            <Stack.Screen name="Chat" component={ChatScreen} />
            <Stack.Screen name="Call" component={CallScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="UserProfile" component={UserProfileScreen} />
          </>
        )}
      </Stack.Navigator>
      {user && (
        <>
          <InAppNotificationBanner navigation={navigationRef.current} />
          <IncomingCallModal navigation={navigationRef.current} />
        </>
      )}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationRoot />
    </AuthProvider>
  );
}
