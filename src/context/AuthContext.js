import React, {createContext, useState, useEffect} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Alert} from 'react-native';
import {BASE_URL} from '../config';

export const AuthContext = createContext({
  isLoggedIn: false,
  token: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({children}) {
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [callRecordingShown, setCallRecordingShown] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const t = await AsyncStorage.getItem('authToken');
        if (t) setToken(t);
      } catch (e) {}
      setLoading(false);
    })();
  }, []);

  const login = async (newToken, phone, shopNameVal, shopkeeperName) => {
    await AsyncStorage.setItem('authToken', newToken);
    await AsyncStorage.setItem('userPhone', phone || '');
    await AsyncStorage.setItem('shopName', shopNameVal || '');
    await AsyncStorage.setItem('shopkeeperName', shopkeeperName || '');

    const installed = await AsyncStorage.getItem('appInstalledAt');
    if (!installed) {
      await AsyncStorage.setItem('appInstalledAt', String(Date.now()));
    }

    setToken(newToken);

    // Fetch past orders from backend
    try {
      const res = await fetch(`${BASE_URL}/api/orders`, {
        headers: { 'Authorization': `Bearer ${newToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.orders && Array.isArray(data.orders)) {
          // Map to app structure
          const appOrders = data.orders.map(o => ({
            orderId: o.order_id,
            createdAt: o.created_at,
            customerPhone: o.customer_phone,
            customerName: o.customer_name,
            totalAmount: o.total_amount,
            isCancelled: o.is_cancelled,
            cancelledAt: o.cancelled_at,
            isRead: true, // Marked as read when fetched from past
            whatsappSent: false,
            products: o.products || [], // Map the products array
            recordingFilename: o.recording_filename,
          }));
          await AsyncStorage.setItem('orders', JSON.stringify(appOrders));
          console.log('[Auth] Fetched and saved', appOrders.length, 'past orders');
        }
      }
    } catch (e) {
      console.log('[Auth] Error fetching past orders:', e);
    }

    // Show call recording popup once
    const shown = await AsyncStorage.getItem('callRecordingPopupShown');
    if (!shown) {
      await AsyncStorage.setItem('callRecordingPopupShown', 'true');
      Alert.alert(
        'Enable Call Recording',
        'Please enable call recording for this tool to work.\n\nकृपया इस टूल के काम करने के लिए कॉल रिकॉर्डिंग सक्षम करें।',
        [{text: 'OK'}]
      );
    }
  };

  const logout = async () => {
    await AsyncStorage.removeItem('authToken');
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{
      isLoggedIn: !!token,
      token,
      loading,
      login,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
