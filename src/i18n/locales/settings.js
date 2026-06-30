const settings = {
  // ---- Store details (used on the PDF receipt) ----
  'settings.gstLabel': {
    en: 'GST Number (Optional)',
    hi: 'GST नंबर (वैकल्पिक)',
    gu: 'GST નંબર (વૈકલ્પિક)',
  },
  'settings.gstPlaceholder': {
    en: 'e.g. 27AAAAA0000A1Z5',
    hi: 'जैसे 27AAAAA0000A1Z5',
    gu: 'દા.ત. 27AAAAA0000A1Z5',
  },
  'settings.storeAddressLabel': {
    en: 'Store Address (Optional)',
    hi: 'दुकान का पता (वैकल्पिक)',
    gu: 'દુકાનનું સરનામું (વૈકલ્પિક)',
  },
  'settings.storeAddressPlaceholder': {
    en: 'Enter full address',
    hi: 'पूरा पता लिखें',
    gu: 'પૂરું સરનામું લખો',
  },
  'settings.storeEmailLabel': {
    en: 'Store Email (Optional)',
    hi: 'दुकान का ईमेल (वैकल्पिक)',
    gu: 'દુકાનનું ઇમેઇલ (વૈકલ્પિક)',
  },
  'settings.storeEmailPlaceholder': {
    en: 'contact@shop.com',
    hi: 'contact@shop.com',
    gu: 'contact@shop.com',
  },
  'settings.storePhoneLabel': {
    en: 'Store Phone (Optional)',
    hi: 'दुकान का फ़ोन (वैकल्पिक)',
    gu: 'દુકાનનો ફોન (વૈકલ્પિક)',
  },
  'settings.storePhonePlaceholder': {
    en: '+91...',
    hi: '+91...',
    gu: '+91...',
  },

  // ---- Section headers ----
  'settings.businessSection': { en: 'BUSINESS', hi: 'दुकान', gu: 'દુકાન' },
  'settings.recordingStorageSection': {
    en: 'RECORDING STORAGE',
    hi: 'रिकॉर्डिंग स्टोरेज',
    gu: 'રેકોર્ડિંગ સ્ટોરેજ',
  },
  'settings.processingSection': {
    en: 'PROCESSING',
    hi: 'प्रोसेसिंग',
    gu: 'પ્રોસેસિંગ',
  },

  // ---- Business ----
  'settings.shopNamePlaceholder': {
    en: 'Enter your shop name',
    hi: 'अपनी दुकान का नाम लिखें',
    gu: 'તમારી દુકાનનું નામ લખો',
  },

  // ---- Recording storage ----
  'settings.customFolderPathLabel': {
    en: 'Custom Folder Path (Optional)',
    hi: 'खुद का फ़ोल्डर पाथ (वैकल्पिक)',
    gu: 'કસ્ટમ ફોલ્ડર પાથ (વૈકલ્પિક)',
  },
  'settings.customFolderPathDesc': {
    en: 'Use the Browse button to select your call recording folder, or paste a path manually below.',
    hi: 'अपनी कॉल रिकॉर्डिंग का फ़ोल्डर चुनने के लिए ब्राउज़ बटन दबाएँ, या नीचे पाथ खुद डालें।',
    gu: 'તમારી કૉલ રેકોર્ડિંગનું ફોલ્ડર પસંદ કરવા બ્રાઉઝ બટન દબાવો, અથવા નીચે પાથ જાતે નાખો.',
  },
  'settings.customPathPlaceholder': {
    en: 'e.g. /storage/emulated/0/MyRecordings/',
    hi: 'जैसे /storage/emulated/0/MyRecordings/',
    gu: 'દા.ત. /storage/emulated/0/MyRecordings/',
  },
  'settings.clearPath': { en: 'Clear path', hi: 'पाथ हटाएँ', gu: 'પાથ કાઢો' },

  // ---- Processing ----
  'settings.autoProcessingTitle': {
    en: 'Auto-Processing Active',
    hi: 'ऑटो-प्रोसेसिंग चालू',
    gu: 'ઑટો-પ્રોસેસિંગ ચાલુ',
  },
  'settings.autoProcessingDesc': {
    en: 'Recordings are automatically processed after each call',
    hi: 'हर कॉल के बाद रिकॉर्डिंग अपने आप प्रोसेस हो जाती है',
    gu: 'દરેક કૉલ પછી રેકોર્ડિંગ આપમેળે પ્રોસેસ થાય છે',
  },

  // ---- Buttons ----
  'settings.saveSettings': {
    en: 'Save Settings',
    hi: 'सेटिंग्स सेव करें',
    gu: 'સેટિંગ્સ સેવ કરો',
  },

  // ---- Popups ----
  'settings.savedMessage': {
    en: 'Settings saved successfully!',
    hi: 'सेटिंग्स सेव हो गईं!',
    gu: 'સેટિંગ્સ સેવ થઈ ગઈ!',
  },
  'settings.notSupportedTitle': {
    en: 'Not Supported',
    hi: 'समर्थित नहीं',
    gu: 'સપોર્ટેડ નથી',
  },
  'settings.notSupportedMessage': {
    en: 'Folder picker is not available on this device.',
    hi: 'इस फ़ोन में फ़ोल्डर पिकर उपलब्ध नहीं है।',
    gu: 'આ ફોનમાં ફોલ્ડર પિકર ઉપલબ્ધ નથી.',
  },
  'settings.folderSelectedTitle': {
    en: 'Folder Selected',
    hi: 'फ़ोल्डर चुना गया',
    gu: 'ફોલ્ડર પસંદ થયું',
  },
  'settings.pathSetTo': {
    en: 'Path set to:\n{path}',
    hi: 'पाथ सेट किया गया:\n{path}',
    gu: 'પાથ સેટ થયો:\n{path}',
  },
  'settings.folderPickerFailed': {
    en: 'Failed to open folder picker: ',
    hi: 'फ़ोल्डर पिकर नहीं खुला: ',
    gu: 'ફોલ્ડર પિકર ખૂલ્યું નહીં: ',
  },
  'settings.logoutConfirm': {
    en: 'Are you sure you want to logout?',
    hi: 'क्या आप वाकई लॉगआउट करना चाहते हैं?',
    gu: 'શું તમે ખરેખર લૉગઆઉટ કરવા માંગો છો?',
  },
};

export default settings;
