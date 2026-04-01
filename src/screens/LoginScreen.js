import React, {useState, useContext, useRef, useEffect} from 'react';
import {View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, DeviceEventEmitter} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Colors, FontSizes, FontWeights, BorderRadius, Spacing} from '../theme';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {AuthContext} from '../context/AuthContext';
import {BASE_URL} from '../config';
import CustomPopup from '../components/CustomPopup';

export default function LoginScreen() {
  const {login} = useContext(AuthContext);
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
  const [popup, setPopup] = useState({visible: false, title: '', message: '', icon: 'info', buttons: []});
  const scrollRef = useRef(null);
  
  // v30: Ref to track OTP for auto-verification to bypass state batching
  const pendingOtpRef = useRef(null);

  useEffect(() => {
    // Listen for native OTP event
    const subscription = DeviceEventEmitter.addListener('onOTPReceived', (newOtp) => {
      console.log('OTP Auto-Read Event:', newOtp);
      setOtp(newOtp);
      pendingOtpRef.current = newOtp;
      
      // Auto-trigger verification if we are on the OTP screen
      if (showOtp) {
        onVerifyOtp();
      }
    });

    return () => subscription.remove();
  }, [showOtp]);

  // Scroll down when OTP or signup section appears so keyboard doesn't overlap
  useEffect(() => {
    if (showOtp || showSignup) {
      setTimeout(() => scrollRef.current?.scrollToEnd({animated: true}), 200);
    }
  }, [showOtp, showSignup]);

  const showPopup = (title, message, icon, buttons) => {
    setPopup({visible: true, title, message, icon: icon || 'info', buttons: buttons || [{text: 'OK', onPress: () => setPopup(p => ({...p, visible: false}))}]});
  };
  const hidePopup = () => setPopup(p => ({...p, visible: false}));

  const onSendOtp = async () => {
    if (phone.length !== 10) { setStatus('Enter a valid 10-digit phone number'); return; }
    setCurrentPhone(phone);
    setLoading(true);
    setStatus('Sending OTP...');
    try {
      const res = await fetch(`${BASE_URL}/api/auth/send-otp`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({phone}),
      });
      if (res.ok) { setStatus(`OTP sent to +91 ${phone}`); setShowOtp(true); }
      else { const text = await res.text(); setStatus(text || `Server error ${res.status}`); }
    } catch (e) { setStatus('Cannot connect to server. Check internet connection.'); }
    setLoading(false);
  };

  const onVerifyOtp = async () => {
    // v30: Check both state and ref for the OTP value
    const otpToVerify = pendingOtpRef.current || otp;
    if (otpToVerify.length !== 6) { setStatus('Enter the 6-digit OTP'); return; }
    
    setLoading(true);
    setStatus('Verifying OTP...');
    try {
      const res = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({phone: currentPhone, otp: otpToVerify}),
      });
      if (!res.ok) { setStatus('Invalid OTP. Please try again.'); setLoading(false); return; }
      const data = await res.json();
      setCurrentToken(data.token || '');
      if (data.is_new_user) { setStatus('Welcome! Please complete your profile.'); setShowSignup(true); }
      else { const user = data.user || {}; await login(data.token, user.phone || currentPhone, user.shop_name || '', user.shopkeeper_name || ''); }
    } catch (e) { setStatus('Network error. Please try again.'); }
    setLoading(false);
  };

  const onSignup = async () => {
    if (!shopkeeperName.trim()) { showPopup('Missing Info', 'Please enter your name', 'warning'); return; }
    if (!shopName.trim()) { showPopup('Missing Info', 'Please enter your shop name', 'warning'); return; }
    setLoading(true);
    setStatus('Creating your account...');
    try {
      const res = await fetch(`${BASE_URL}/api/auth/signup`, {
        method: 'POST', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${currentToken}`},
        body: JSON.stringify({shop_name: shopName, shopkeeper_name: shopkeeperName}),
      });
      if (!res.ok) { setStatus('Signup failed. Please try again.'); setLoading(false); return; }
      const data = await res.json();
      const user = data.user || {};
      await login(data.token || currentToken, user.phone || currentPhone, user.shop_name || shopName, user.shopkeeper_name || shopkeeperName);
    } catch (e) { setStatus('Network error. Please try again.'); }
    setLoading(false);
  };

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'android' ? 0 : 0}>
        <ScrollView ref={scrollRef} style={{flex: 1}} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={s.logoBox}><Icon name="phone-in-talk" size={36} color={Colors.white} /></View>
          <Text style={s.title}>Kiko AI</Text>
          <Text style={s.subtitle}>Call Order Taker</Text>
          <Text style={s.desc}>AI-powered order extraction{'\n'}from phone calls</Text>

          <View style={s.inputWrap}>
            <Text style={s.inputLabel}>Phone Number</Text>
            <View style={s.inputRow}>
              <Text style={s.prefix}>+91</Text>
              <TextInput style={s.phoneInput} value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={10} placeholder="Enter 10-digit number" placeholderTextColor={Colors.textMuted} maxFontSizeMultiplier={1.2}/>
            </View>
          </View>
          <TouchableOpacity style={[s.btn, loading && s.btnDisabled]} onPress={onSendOtp} disabled={loading} activeOpacity={0.7}>
            <Text style={s.btnText}>{showOtp ? 'Resend OTP' : 'Send OTP'}</Text>
          </TouchableOpacity>

          {showOtp && (
            <View style={{marginTop: Spacing.xl, width: '100%', paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.divider}}>
              <View style={s.inputWrap}>
                <Text style={s.inputLabel}>Enter OTP</Text>
                <TextInput style={s.otpInput} value={otp} onChangeText={setOtp} keyboardType="number-pad" maxLength={6} placeholder="6-digit OTP" placeholderTextColor={Colors.textMuted} maxFontSizeMultiplier={1.2}/>
              </View>
              <TouchableOpacity style={[s.btn, loading && s.btnDisabled]} onPress={onVerifyOtp} disabled={loading} activeOpacity={0.7}>
                <Text style={s.btnText}>Verify OTP</Text>
              </TouchableOpacity>
            </View>
          )}

          {showSignup && (
            <View style={{marginTop: Spacing.xxl, width: '100%'}}>
              <View style={s.divider}/>
              <Text style={s.sectionTitle}>Complete Your Profile</Text>
              <View style={s.inputWrap}>
                <Text style={s.inputLabel}>Your Name</Text>
                <TextInput style={s.otpInput} value={shopkeeperName} onChangeText={setShopkeeperName} placeholder="Enter your name" placeholderTextColor={Colors.textMuted} maxFontSizeMultiplier={1.2}/>
              </View>
              <View style={s.inputWrap}>
                <Text style={s.inputLabel}>Shop Name</Text>
                <TextInput style={s.otpInput} value={shopName} onChangeText={setShopName} placeholder="Enter shop name" placeholderTextColor={Colors.textMuted} maxFontSizeMultiplier={1.2}/>
              </View>
              <TouchableOpacity style={[s.btn, loading && s.btnDisabled]} onPress={onSignup} disabled={loading} activeOpacity={0.7}>
                <Text style={s.btnText}>Create Account</Text>
              </TouchableOpacity>
            </View>
          )}

          {status ? (
            <View style={s.statusBox}>
              <Text style={s.statusText}>{status}</Text>
            </View>
          ) : null}

          {loading && <ActivityIndicator color={Colors.primary} style={{marginTop: Spacing.lg}}/>}
        </ScrollView>
      </KeyboardAvoidingView>
      <CustomPopup {...popup} onClose={hidePopup}/>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.background},
  content: {padding: Spacing.xxl, paddingTop: 50, alignItems: 'center'},
  logoBox: {width: 80, height: 80, borderRadius: 22, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: Colors.primary, shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: {width: 0, height: 6}},
  logoText: {fontSize: 36, fontWeight: FontWeights.bold, color: Colors.white},
  title: {fontSize: FontSizes.heading, fontWeight: FontWeights.extraBold, color: Colors.textPrimary, marginTop: Spacing.xxl, letterSpacing: -0.5},
  subtitle: {fontSize: FontSizes.lg, fontWeight: FontWeights.semiBold, color: Colors.primary, marginTop: Spacing.xs},
  desc: {fontSize: FontSizes.body, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 22},
  inputWrap: {width: '100%', marginTop: Spacing.lg},
  inputLabel: {fontSize: FontSizes.sm, color: Colors.textMuted, marginBottom: Spacing.xs, fontWeight: FontWeights.medium},
  inputRow: {flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceLight, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: Colors.divider, height: 52},
  prefix: {paddingLeft: Spacing.lg, fontSize: FontSizes.body, color: Colors.textSecondary, fontWeight: FontWeights.bold},
  phoneInput: {flex: 1, height: 52, paddingHorizontal: Spacing.md, fontSize: FontSizes.body, color: Colors.textPrimary},
  otpInput: {height: 52, backgroundColor: Colors.surfaceLight, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: Colors.divider, paddingHorizontal: Spacing.lg, fontSize: FontSizes.body, color: Colors.textPrimary},
  btn: {width: '100%', height: 52, borderRadius: BorderRadius.lg, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', marginTop: Spacing.lg},
  btnDisabled: {opacity: 0.6},
  btnText: {color: Colors.white, fontSize: FontSizes.lg, fontWeight: FontWeights.bold},
  divider: {height: 1, backgroundColor: Colors.divider, marginVertical: Spacing.lg, width: '100%'},
  sectionTitle: {fontSize: FontSizes.xl, fontWeight: FontWeights.bold, color: Colors.textPrimary, marginBottom: Spacing.lg, textAlign: 'center'},
  statusBox: {width: '100%', marginTop: Spacing.xxl, padding: Spacing.lg, backgroundColor: Colors.primary + '0A', borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.primary + '26'},
  statusText: {fontSize: FontSizes.sm, color: Colors.textSecondary, textAlign: 'center'},
});
