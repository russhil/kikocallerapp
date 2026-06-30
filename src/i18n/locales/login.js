// Login / OTP / signup screen strings (en / hi / gu).
// Reuses common.* atoms (phoneNumber, yourName, shopName, ok, networkError) and
// app.* identity keys. Keep "OTP", "WhatsApp", "+91", "AI", "Kiko AI" as-is.
const login = {
  // ---- Header ----
  'login.desc': {
    en: 'AI-powered order extraction\nfrom phone calls',
    hi: 'फ़ोन कॉल से AI द्वारा\nऑर्डर निकालें',
    gu: 'ફોન કૉલમાંથી AI દ્વારા\nઑર્ડર કાઢો',
  },

  // ---- Inputs / placeholders ----
  'login.phonePlaceholder': {
    en: 'Enter 10-digit number',
    hi: '10 अंकों का नंबर डालें',
    gu: '10 અંકનો નંબર નાખો',
  },
  'login.enterOtpLabel': { en: 'Enter OTP', hi: 'OTP डालें', gu: 'OTP નાખો' },
  'login.otpPlaceholder': {
    en: '6-digit OTP',
    hi: '6 अंकों का OTP',
    gu: '6 અંકનો OTP',
  },
  'login.namePlaceholder': {
    en: 'Enter your name',
    hi: 'अपना नाम डालें',
    gu: 'તમારું નામ નાખો',
  },
  'login.shopNamePlaceholder': {
    en: 'Enter shop name',
    hi: 'दुकान का नाम डालें',
    gu: 'દુકાનનું નામ નાખો',
  },

  // ---- Buttons ----
  'login.sendOtp': { en: 'Send OTP', hi: 'OTP भेजें', gu: 'OTP મોકલો' },
  'login.resendOtp': {
    en: 'Resend OTP',
    hi: 'OTP दोबारा भेजें',
    gu: 'OTP ફરી મોકલો',
  },
  'login.verifyOtp': { en: 'Verify OTP', hi: 'OTP जाँचें', gu: 'OTP ચકાસો' },
  'login.createAccount': {
    en: 'Create Account',
    hi: 'खाता बनाएँ',
    gu: 'ખાતું બનાવો',
  },

  // ---- Section title ----
  'login.completeProfile': {
    en: 'Complete Your Profile',
    hi: 'अपनी जानकारी भरें',
    gu: 'તમારી માહિતી ભરો',
  },

  // ---- Status messages ----
  'login.invalidPhone': {
    en: 'Enter a valid 10-digit phone number',
    hi: 'सही 10 अंकों का फ़ोन नंबर डालें',
    gu: 'સાચો 10 અંકનો ફોન નંબર નાખો',
  },
  'login.sendingOtp': {
    en: 'Sending OTP...',
    hi: 'OTP भेजा जा रहा है...',
    gu: 'OTP મોકલાઈ રહ્યો છે...',
  },
  'login.otpSent': {
    en: 'OTP sent to +91 {phone}',
    hi: '+91 {phone} पर OTP भेजा गया',
    gu: '+91 {phone} પર OTP મોકલ્યો',
  },
  'login.serverError': {
    en: 'Server error {code}',
    hi: 'सर्वर त्रुटि {code}',
    gu: 'સર્વર ભૂલ {code}',
  },
  'login.cannotConnect': {
    en: 'Cannot connect to server. Check internet connection.',
    hi: 'सर्वर से कनेक्ट नहीं हो पा रहा। इंटरनेट कनेक्शन जाँचें।',
    gu: 'સર્વર સાથે કનેક્ટ થઈ શકતું નથી. ઇન્ટરનેટ કનેક્શન તપાસો.',
  },
  'login.enter6Otp': {
    en: 'Enter the 6-digit OTP',
    hi: '6 अंकों का OTP डालें',
    gu: '6 અંકનો OTP નાખો',
  },
  'login.verifyingOtp': {
    en: 'Verifying OTP...',
    hi: 'OTP जाँचा जा रहा है...',
    gu: 'OTP ચકાસાઈ રહ્યો છે...',
  },
  'login.invalidOtp': {
    en: 'Invalid OTP. Please try again.',
    hi: 'गलत OTP। कृपया फिर से कोशिश करें।',
    gu: 'ખોટો OTP. કૃપા કરી ફરી પ્રયાસ કરો.',
  },
  'login.welcomeProfile': {
    en: 'Welcome! Please complete your profile.',
    hi: 'स्वागत है! कृपया अपनी जानकारी भरें।',
    gu: 'સ્વાગત છે! કૃપા કરી તમારી માહિતી ભરો.',
  },
  'login.autoVerifyingOtp': {
    en: 'Auto-verifying OTP...',
    hi: 'OTP अपने आप जाँचा जा रहा है...',
    gu: 'OTP આપમેળે ચકાસાઈ રહ્યો છે...',
  },
  'login.creatingAccount': {
    en: 'Creating your account...',
    hi: 'आपका खाता बनाया जा रहा है...',
    gu: 'તમારું ખાતું બનાવાઈ રહ્યું છે...',
  },
  'login.signupFailed': {
    en: 'Signup failed. Please try again.',
    hi: 'साइनअप विफल। कृपया फिर से कोशिश करें।',
    gu: 'સાઇનઅપ નિષ્ફળ. કૃપા કરી ફરી પ્રયાસ કરો.',
  },

  // ---- Popup (Missing Info) ----
  'login.missingInfo': {
    en: 'Missing Info',
    hi: 'जानकारी अधूरी है',
    gu: 'માહિતી અધૂરી છે',
  },
  'login.pleaseEnterName': {
    en: 'Please enter your name',
    hi: 'कृपया अपना नाम डालें',
    gu: 'કૃપા કરી તમારું નામ નાખો',
  },
  'login.pleaseEnterShopName': {
    en: 'Please enter your shop name',
    hi: 'कृपया दुकान का नाम डालें',
    gu: 'કૃપા કરી દુકાનનું નામ નાખો',
  },
};

export default login;
