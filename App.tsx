import React, { useContext, useState, useEffect } from 'react';
import {
  ActivityIndicator,
  View,
  StatusBar,
  Text,
  NativeModules,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, AuthContext } from './src/context/AuthContext';
import { Colors } from './src/theme';

import LoginScreen from './src/screens/LoginScreen';
import PermissionScreen from './src/screens/PermissionScreen';
import HomeScreen from './src/screens/HomeScreen';
import OrderDetailScreen from './src/screens/OrderDetailScreen';
import EditOrderScreen from './src/screens/EditOrderScreen';
import RecordingsScreen from './src/screens/RecordingsScreen';
import ProcessingStatusScreen from './src/screens/ProcessingStatusScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import HelpButton from './src/components/HelpButton';

const Stack = createNativeStackNavigator();
const { RecordingMonitorModule } = NativeModules;

function AppNavigator() {
  const { isLoggedIn, loading } = useContext(AuthContext);
  const [permGranted, setPermGranted] = useState(false);
  const [permChecked, setPermChecked] = useState(false);

  // Auto-check if permissions are already granted on startup
  // This prevents requiring the user to go through PermissionScreen on every app restart
  useEffect(() => {
    if (isLoggedIn && !permChecked) {
      const checkExistingPermissions = async () => {
        try {
          const corePerms = [
            PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
            PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
          ];
          if (Platform.Version >= 33) {
            corePerms.push(PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO);
          } else {
            corePerms.push(
              PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
            );
          }

          const results = await Promise.all(
            corePerms.map(p => PermissionsAndroid.check(p)),
          );
          const allGranted = results.every(r => r === true);

          if (allGranted) {
            console.log(
              '[App] All permissions already granted, skipping permission screen',
            );
            setPermGranted(true);
          }
        } catch (e) {
          console.warn('[App] Permission check failed:', e);
        }
        setPermChecked(true);
      };
      checkExistingPermissions();
    }
  }, [isLoggedIn, permChecked]);

  // Start background monitoring service once logged in AND permissions granted
  useEffect(() => {
    if (isLoggedIn && permGranted) {
      const startMonitoring = async () => {
        try {
          const running = await RecordingMonitorModule.isMonitorRunning();
          if (!running) {
            console.log('[App] Starting background monitor service...');
            await RecordingMonitorModule.startMonitorService();
            console.log(
              '[App] Background monitor service started successfully',
            );
          } else {
            console.log('[App] Background monitor service already running');
          }
        } catch (e) {
          console.error('[App] Failed to start monitor service:', e);
          // Retry once after a short delay
          setTimeout(async () => {
            try {
              await RecordingMonitorModule.startMonitorService();
              console.log('[App] Background monitor service started on retry');
            } catch (retryErr) {
              console.error(
                '[App] Monitor service retry also failed:',
                retryErr,
              );
            }
          }, 3000);
        }
      };
      startMonitoring();
    }
  }, [isLoggedIn, permGranted]);

  if (loading || (isLoggedIn && !permChecked)) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: Colors.background,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 20,
            backgroundColor: Colors.primary,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text
            style={{ fontSize: 28, fontWeight: '700', color: Colors.white }}
          >
            K
          </Text>
        </View>
        <ActivityIndicator
          color={Colors.primary}
          size="large"
          style={{ marginTop: 20 }}
        />
      </View>
    );
  }

  if (!isLoggedIn) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
      </Stack.Navigator>
    );
  }

  if (!permGranted) {
    return <PermissionScreen onAllGranted={() => setPermGranted(true)} />;
  }

  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
    >
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
      <Stack.Screen name="EditOrder" component={EditOrderScreen} />
      <Stack.Screen name="Recordings" component={RecordingsScreen} />
      <Stack.Screen
        name="ProcessingStatus"
        component={ProcessingStatusScreen}
      />
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <View style={{flex: 1}}>
          <StatusBar barStyle="dark-content" backgroundColor={Colors.surface} />
          <NavigationContainer>
            <AppNavigator />
          </NavigationContainer>
          <HelpButton />
        </View>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
