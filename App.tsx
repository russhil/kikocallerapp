import React, {useContext, useState} from 'react';
import {ActivityIndicator, View, StatusBar, Text} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {AuthProvider, AuthContext} from './src/context/AuthContext';
import {Colors} from './src/theme';

import LoginScreen from './src/screens/LoginScreen';
import PermissionScreen from './src/screens/PermissionScreen';
import HomeScreen from './src/screens/HomeScreen';
import OrderDetailScreen from './src/screens/OrderDetailScreen';
import EditOrderScreen from './src/screens/EditOrderScreen';
import RecordingsScreen from './src/screens/RecordingsScreen';
import ProcessingStatusScreen from './src/screens/ProcessingStatusScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Stack = createNativeStackNavigator();

function AppNavigator() {
  const {isLoggedIn, loading} = useContext(AuthContext);
  const [permGranted, setPermGranted] = useState(false);

  if (loading) {
    return (
      <View style={{flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center'}}>
        <View style={{width: 80, height: 80, borderRadius: 20, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center'}}>
          <Text style={{fontSize: 28, fontWeight: '700', color: Colors.white}}>K</Text>
        </View>
        <ActivityIndicator color={Colors.primary} size="large" style={{marginTop: 20}}/>
      </View>
    );
  }

  if (!isLoggedIn) {
    return (
      <Stack.Navigator screenOptions={{headerShown: false}}>
        <Stack.Screen name="Login" component={LoginScreen}/>
      </Stack.Navigator>
    );
  }

  if (!permGranted) {
    return <PermissionScreen onAllGranted={() => setPermGranted(true)}/>;
  }

  return (
    <Stack.Navigator screenOptions={{headerShown: false, animation: 'slide_from_right'}}>
      <Stack.Screen name="Home" component={HomeScreen}/>
      <Stack.Screen name="OrderDetail" component={OrderDetailScreen}/>
      <Stack.Screen name="EditOrder" component={EditOrderScreen}/>
      <Stack.Screen name="Recordings" component={RecordingsScreen}/>
      <Stack.Screen name="ProcessingStatus" component={ProcessingStatusScreen}/>
      <Stack.Screen name="Settings" component={SettingsScreen}/>
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.surface}/>
        <NavigationContainer>
          <AppNavigator/>
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
