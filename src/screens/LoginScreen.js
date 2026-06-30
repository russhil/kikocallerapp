import React, { useState, useContext, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  DeviceEventEmitter,
  NativeModules,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Colors,
  FontSizes,
  FontWeights,
  BorderRadius,
  Spacing,
} from '../theme';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { AuthContext } from '../context/AuthContext';
import { useLang } from '../i18n/LanguageContext';
import { BASE_URL } from '../config';
import CustomPopup from '../components/CustomPopup';
import LanguagePills from '../components/LanguagePills';
import {
  trackLoginScreenViewed,
  trackOtpRequested,
  trackOtpVerifyAttempt,
  trackLoginSuccess,
  trackLoginFailed,
  trackSignupStarted,
  trackSignupCompleted,
} from '../utils/analytics';

export default function LoginScreen() {
  const { login } = useContext(AuthContext);
  const { t } = useLang();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [shopkeeperName, setShopkeeperName] = useState('');
  const [shopName, setShopName] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [currentPhone, setCurrentPhone] = useState('');
  const [currentToken, setCurrentToken] = useState('');
  const [popup, setPopup] = useState({
    visible: false,
    title: '',
    message: '',
    icon: 'info',
    buttons: [],
  });
  const scrollRef = useRef(null);

  // v42: Ref to track OTP for auto-verification to bypass state batching
  const pendingOtpRef = useRef(null);
  const showOtpRef = useRef(false);
  const currentPhoneRef = useRef('');

  // Keep refs in sync with state
  useEffect(() => {
    showOtpRef.current = showOtp;
  }, [showOtp]);
  useEffect(() => {
    currentPhoneRef.current = currentPhone;
  }, [currentPhone]);

  useEffect(() => {
    // v42: Start SMS Retriever when OTP screen is shown
    if (showOtp && NativeModules.RecordingMonitorModule?.startSmsRetriever) {
      NativeModules.RecordingMonitorModule.startSmsRetriever()
        .then(() => console.log('SMS Retriever started'))
        .catch(e => console.warn('SMS Retriever start failed:', e));
    }
  }, [showOtp]);

  useEffect(() => {
    // Listen for native OTP event
    const subscription = DeviceEventEmitter.addListener(
      'onOTPReceived',
      newOtp => {
        console.log('OTP Auto-Read Event:', newOtp);
        setOtp(newOtp);
        pendingOtpRef.current = newOtp;

        // v42: Auto-trigger verification using ref (avoids stale closure)
        if (showOtpRef.current && newOtp?.length === 6) {
          // Small delay to let state settle
          setTimeout(() => autoVerifyOtp(newOtp), 300);
        }
      },
    );

    return () => subscription.remove();
  }, []);

  // Scroll down when OTP or signup section appears so keyboard doesn't overlap
  useEffect(() => {
    if (showOtp || showSignup) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
    }
  }, [showOtp, showSignup]);

  // Track login screen view on mount
  useEffect(() => {
    trackLoginScreenViewed();
  }, []);

  const showPopup = (title, message, icon, buttons) => {
    setPopup({
      visible: true,
      title,
      message,
      icon: icon || 'info',
      buttons: buttons || [
        {
          text: t('common.ok'),
          onPress: () => setPopup(p => ({ ...p, visible: false })),
        },
      ],
    });
  };
  const hidePopup = () => setPopup(p => ({ ...p, visible: false }));

  const onSendOtp = async () => {
    if (phone.length !== 10) {
      setStatus(t('login.invalidPhone'));
      return;
    }
    setCurrentPhone(phone);

    // Playstore review bypass
    if (phone === '9619363677') {
      setStatus('');
      setShowOtp(true);
      return;
    }

    setLoading(true);
    setStatus(t('login.sendingOtp'));
    trackOtpRequested(phone);
    try {
      const res = await fetch(`${BASE_URL}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      if (res.ok) {
        setStatus(t('login.otpSent', { phone }));
        setShowOtp(true);
      } else {
        const text = await res.text();
        setStatus(text || t('login.serverError', { code: res.status }));
        trackLoginFailed('otp_send_failed');
      }
    } catch (e) {
      setStatus(t('login.cannotConnect'));
      trackLoginFailed('network_error');
    }
    setLoading(false);
  };

  const onVerifyOtp = async () => {
    // v42: Check both state and ref for the OTP value
    const otpToVerify = pendingOtpRef.current || otp;
    if (otpToVerify.length !== 6) {
      setStatus(t('login.enter6Otp'));
      return;
    }

    // Playstore review bypass
    if (currentPhone === '9619363677' && otpToVerify === '123456') {
      const testToken = 'review_token_9619363677_x3a';
      setCurrentToken(testToken);
      await login(testToken, currentPhone, 'Test Shop', 'Test User');
      return;
    }

    setLoading(true);
    setStatus(t('login.verifyingOtp'));
    trackOtpVerifyAttempt();
    try {
      const res = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: currentPhone, otp: otpToVerify }),
      });
      if (!res.ok) {
        setStatus(t('login.invalidOtp'));
        trackLoginFailed('invalid_otp');
        setLoading(false);
        return;
      }
      const data = await res.json();
      setCurrentToken(data.token || '');
      if (data.is_new_user) {
        setStatus(t('login.welcomeProfile'));
        setShowSignup(true);
        trackSignupStarted();
      } else {
        const user = data.user || {};
        trackLoginSuccess(user.phone || currentPhone);
        await login(
          data.token,
          user.phone || currentPhone,
          user.shop_name || '',
          user.shopkeeper_name || '',
        );
      }
    } catch (e) {
      setStatus(t('common.networkError'));
      trackLoginFailed('network_error');
    }
    setLoading(false);
  };

  // v42: Auto-verify OTP - uses parameter directly to avoid stale closure
  const autoVerifyOtp = async otpValue => {
    if (!otpValue || otpValue.length !== 6) return;
    const phoneToVerify = currentPhoneRef.current;
    if (!phoneToVerify || phoneToVerify.length !== 10) return;

    setLoading(true);
    setStatus(t('login.autoVerifyingOtp'));
    try {
      const res = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneToVerify, otp: otpValue }),
      });
      if (!res.ok) {
        setStatus(t('login.invalidOtp'));
        setLoading(false);
        return;
      }
      const data = await res.json();
      setCurrentToken(data.token || '');
      if (data.is_new_user) {
        setStatus(t('login.welcomeProfile'));
        setShowSignup(true);
      } else {
        const user = data.user || {};
        await login(
          data.token,
          user.phone || phoneToVerify,
          user.shop_name || '',
          user.shopkeeper_name || '',
        );
      }
    } catch (e) {
      setStatus(t('common.networkError'));
    }
    setLoading(false);
  };

  const onSignup = async () => {
    if (!shopkeeperName.trim()) {
      showPopup(t('login.missingInfo'), t('login.pleaseEnterName'), 'warning');
      return;
    }
    if (!shopName.trim()) {
      showPopup(
        t('login.missingInfo'),
        t('login.pleaseEnterShopName'),
        'warning',
      );
      return;
    }
    setLoading(true);
    setStatus(t('login.creatingAccount'));
    try {
      const res = await fetch(`${BASE_URL}/api/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify({
          shop_name: shopName,
          shopkeeper_name: shopkeeperName,
        }),
      });
      if (!res.ok) {
        setStatus(t('login.signupFailed'));
        setLoading(false);
        return;
      }
      const data = await res.json();
      const user = data.user || {};
      trackSignupCompleted(shopName);
      trackLoginSuccess(user.phone || currentPhone);
      await login(
        data.token || currentToken,
        user.phone || currentPhone,
        user.shop_name || shopName,
        user.shopkeeper_name || shopkeeperName,
      );
    } catch (e) {
      setStatus(t('common.networkError'));
      trackLoginFailed('signup_network_error');
    }
    setLoading(false);
  };

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'android' ? 0 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.logoBox}>
            <Icon name="phone-in-talk" size={36} color={Colors.white} />
          </View>
          <Text style={s.title}>{t('app.name')}</Text>
          <Text style={s.subtitle}>{t('app.tagline')}</Text>
          <Text style={s.desc}>{t('login.desc')}</Text>

          <LanguagePills style={{ marginTop: Spacing.lg }} />

          <View style={s.inputWrap}>
            <Text style={s.inputLabel}>{t('common.phoneNumber')}</Text>
            <View style={s.inputRow}>
              <Text style={s.prefix}>+91</Text>
              <TextInput
                style={s.phoneInput}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                maxLength={10}
                placeholder={t('login.phonePlaceholder')}
                placeholderTextColor={Colors.textMuted}
                maxFontSizeMultiplier={1.2}
              />
            </View>
          </View>
          <TouchableOpacity
            style={[s.btn, loading && s.btnDisabled]}
            onPress={onSendOtp}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Text style={s.btnText}>
              {showOtp ? t('login.resendOtp') : t('login.sendOtp')}
            </Text>
          </TouchableOpacity>

          {showOtp && (
            <View
              style={{
                marginTop: Spacing.xl,
                width: '100%',
                paddingTop: Spacing.md,
                borderTopWidth: 1,
                borderTopColor: Colors.divider,
              }}
            >
              <View style={s.inputWrap}>
                <Text style={s.inputLabel}>{t('login.enterOtpLabel')}</Text>
                <TextInput
                  style={s.otpInput}
                  value={otp}
                  onChangeText={setOtp}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder={t('login.otpPlaceholder')}
                  placeholderTextColor={Colors.textMuted}
                  maxFontSizeMultiplier={1.2}
                />
              </View>
              <TouchableOpacity
                style={[s.btn, loading && s.btnDisabled]}
                onPress={onVerifyOtp}
                disabled={loading}
                activeOpacity={0.7}
              >
                <Text style={s.btnText}>{t('login.verifyOtp')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {showSignup && (
            <View style={{ marginTop: Spacing.xxl, width: '100%' }}>
              <View style={s.divider} />
              <Text style={s.sectionTitle}>{t('login.completeProfile')}</Text>
              <View style={s.inputWrap}>
                <Text style={s.inputLabel}>{t('common.yourName')}</Text>
                <TextInput
                  style={s.otpInput}
                  value={shopkeeperName}
                  onChangeText={setShopkeeperName}
                  placeholder={t('login.namePlaceholder')}
                  placeholderTextColor={Colors.textMuted}
                  maxFontSizeMultiplier={1.2}
                />
              </View>
              <View style={s.inputWrap}>
                <Text style={s.inputLabel}>{t('common.shopName')}</Text>
                <TextInput
                  style={s.otpInput}
                  value={shopName}
                  onChangeText={setShopName}
                  placeholder={t('login.shopNamePlaceholder')}
                  placeholderTextColor={Colors.textMuted}
                  maxFontSizeMultiplier={1.2}
                />
              </View>
              <TouchableOpacity
                style={[s.btn, loading && s.btnDisabled]}
                onPress={onSignup}
                disabled={loading}
                activeOpacity={0.7}
              >
                <Text style={s.btnText}>{t('login.createAccount')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {status ? (
            <View style={s.statusBox}>
              <Text style={s.statusText}>{status}</Text>
            </View>
          ) : null}

          {loading && (
            <ActivityIndicator
              color={Colors.primary}
              style={{ marginTop: Spacing.lg }}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <CustomPopup {...popup} onClose={hidePopup} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.xxl, paddingTop: 50, alignItems: 'center' },
  logoBox: {
    width: 80,
    height: 80,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: Colors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  logoText: { fontSize: 36, fontWeight: FontWeights.bold, color: Colors.white },
  title: {
    fontSize: FontSizes.heading,
    fontWeight: FontWeights.extraBold,
    color: Colors.textPrimary,
    marginTop: Spacing.xxl,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.semiBold,
    color: Colors.primary,
    marginTop: Spacing.xs,
  },
  desc: {
    fontSize: FontSizes.body,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: 22,
  },
  inputWrap: { width: '100%', marginTop: Spacing.lg },
  inputLabel: {
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
    fontWeight: FontWeights.medium,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.divider,
    height: 52,
  },
  prefix: {
    paddingLeft: Spacing.lg,
    fontSize: FontSizes.body,
    color: Colors.textSecondary,
    fontWeight: FontWeights.bold,
  },
  phoneInput: {
    flex: 1,
    height: 52,
    paddingHorizontal: Spacing.md,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  otpInput: {
    height: 52,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.divider,
    paddingHorizontal: Spacing.lg,
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
  },
  btn: {
    width: '100%',
    height: 52,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: {
    color: Colors.white,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginVertical: Spacing.lg,
    width: '100%',
  },
  sectionTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  statusBox: {
    width: '100%',
    marginTop: Spacing.xxl,
    padding: Spacing.lg,
    backgroundColor: Colors.primary + '0A',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.primary + '26',
  },
  statusText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
