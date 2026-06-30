import React, { createContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { BASE_URL } from '../config';
import { validateToken } from '../api/authApi';
import { useLang } from '../i18n/LanguageContext';

export const AuthContext = createContext({
  isLoggedIn: false,
  token: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }) {
  const { t } = useLang();
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [callRecordingShown, setCallRecordingShown] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const storedToken = await AsyncStorage.getItem('authToken');
        if (storedToken) {
          setToken(storedToken);
          // Validate in the background. If the server says the token is stale
          // (401/403) — e.g. issued before a DB migration — clear it so the
          // user re-logs in and sync resumes. Transient network errors keep it.
          validateToken(storedToken).then(async status => {
            if (status === 'invalid') {
              try {
                await AsyncStorage.removeItem('authToken');
              } catch (e) {}
              setToken(null);
            }
          });
        }
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
        headers: { Authorization: `Bearer ${newToken}` },
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
            storeName: o.store_name || '',
            storeNumber: o.store_number || '',
            totalAmount: o.total_amount,
            notes: o.notes || '',
            address: o.address || o.customer_address || '',
            isCancelled: o.is_cancelled,
            cancelledAt: o.cancelled_at,
            isRead: true, // Marked as read when fetched from past
            whatsappSent: false,
            products: o.products || [], // Map the products array
            recordingFilename: o.recording_filename,
          }));
          await AsyncStorage.setItem('orders', JSON.stringify(appOrders));
          console.log(
            '[Auth] Fetched and saved',
            appOrders.length,
            'past orders',
          );
        }
      }
    } catch (e) {
      console.log('[Auth] Error fetching past orders:', e);
    }

    // Show call recording popup once
    const shown = await AsyncStorage.getItem('callRecordingPopupShown');
    if (!shown) {
      await AsyncStorage.setItem('callRecordingPopupShown', 'true');
      Alert.alert(t('callRec.title'), t('callRec.msg'), [
        { text: t('common.ok') },
      ]);
    }
  };

  const logout = async () => {
    await AsyncStorage.removeItem('authToken');
    setToken(null);
  };

  return (
    <AuthContext.Provider
      value={{
        isLoggedIn: !!token,
        token,
        loading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
