// Permission screen strings (en / hi / gu).
// Reuses common.* atoms where they match.
const permission = {
  'permission.title': {
    en: 'Permissions Required',
    hi: 'अनुमतियाँ ज़रूरी हैं',
    gu: 'પરવાનગીઓ જરૂરી છે',
  },
  'permission.subtitle': {
    en: 'Kiko AI needs these permissions to scan\nand process your call recordings',
    hi: 'आपकी कॉल रिकॉर्डिंग को स्कैन और प्रोसेस करने के लिए\nKiko AI को इन अनुमतियों की ज़रूरत है',
    gu: 'તમારી કૉલ રેકોર્ડિંગ સ્કૅન અને પ્રોસેસ કરવા માટે\nKiko AI ને આ પરવાનગીઓની જરૂર છે',
  },
  'permission.progress': {
    en: '{granted} of {total} granted',
    hi: '{total} में से {granted} दी गईं',
    gu: '{total} માંથી {granted} આપી',
  },

  // ---- Permission row status ----
  'permission.granted': { en: 'Granted', hi: 'दी गई', gu: 'આપેલ' },
  'permission.required': { en: 'Required', hi: 'ज़रूरी', gu: 'જરૂરી' },

  // ---- Permission labels & descriptions ----
  'permission.contactsLabel': { en: 'Contacts', hi: 'संपर्क', gu: 'સંપર્કો' },
  'permission.contactsDesc': {
    en: 'Match caller names',
    hi: 'कॉल करने वाले का नाम पहचानें',
    gu: 'કૉલ કરનારનું નામ ઓળખો',
  },
  'permission.phoneStateLabel': {
    en: 'Phone State',
    hi: 'फ़ोन स्थिति',
    gu: 'ફોન સ્થિતિ',
  },
  'permission.phoneStateDesc': {
    en: 'Detect incoming calls',
    hi: 'आने वाली कॉल पहचानें',
    gu: 'આવતી કૉલ ઓળખો',
  },
  'permission.audioLabel': {
    en: 'Audio Files',
    hi: 'ऑडियो फ़ाइलें',
    gu: 'ઑડિયો ફાઇલો',
  },
  'permission.audioDesc': {
    en: 'Access recordings',
    hi: 'रिकॉर्डिंग तक पहुँच',
    gu: 'રેકોર્ડિંગ ઍક્સેસ કરો',
  },
  'permission.notificationsLabel': {
    en: 'Notifications',
    hi: 'सूचनाएँ',
    gu: 'સૂચનાઓ',
  },
  'permission.notificationsDesc': {
    en: 'Processing updates',
    hi: 'प्रोसेसिंग अपडेट',
    gu: 'પ્રોસેસિંગ અપડેટ',
  },
  'permission.storageLabel': { en: 'Storage', hi: 'स्टोरेज', gu: 'સ્ટોરેજ' },
  'permission.storageDesc': {
    en: 'Access recordings',
    hi: 'रिकॉर्डिंग तक पहुँच',
    gu: 'રેકોર્ડિંગ ઍક્સેસ કરો',
  },
  'permission.callerIdLabel': {
    en: 'Caller ID App',
    hi: 'कॉलर ID ऐप',
    gu: 'કૉલર ID ઍપ',
  },
  'permission.callerIdDesc': {
    en: 'Capture caller number in real time',
    hi: 'रियल टाइम में कॉलर नंबर पाएँ',
    gu: 'રિયલ ટાઇમમાં કૉલર નંબર મેળવો',
  },

  // ---- Buttons ----
  'permission.allow': { en: 'Allow', hi: 'अनुमति दें', gu: 'મંજૂરી આપો' },
  'permission.continue': { en: 'Continue', hi: 'आगे बढ़ें', gu: 'આગળ વધો' },
  'permission.grantButton': {
    en: 'Grant Permissions',
    hi: 'अनुमतियाँ दें',
    gu: 'પરવાનગીઓ આપો',
  },
  'permission.setCallerIdButton': {
    en: 'Set as Caller ID App',
    hi: 'कॉलर ID ऐप के रूप में सेट करें',
    gu: 'કૉલર ID ઍપ તરીકે સેટ કરો',
  },
  'permission.openSettingsButton': {
    en: 'Open App Settings',
    hi: 'ऐप सेटिंग्स खोलें',
    gu: 'ઍપ સેટિંગ્સ ખોલો',
  },
};

export default permission;
