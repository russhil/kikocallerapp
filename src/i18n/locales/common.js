// Shared glossary of recurring domain terms + UI atoms.
// Reuse these across screens so terminology stays consistent.
const common = {
  // ---- Common UI atoms ----
  'common.ok': { en: 'OK', hi: 'ठीक है', gu: 'બરાબર' },
  'common.cancel': { en: 'Cancel', hi: 'रद्द करें', gu: 'રદ કરો' },
  'common.save': { en: 'Save', hi: 'सेव करें', gu: 'સેવ કરો' },
  'common.delete': { en: 'Delete', hi: 'डिलीट करें', gu: 'ડિલીટ કરો' },
  'common.yes': { en: 'Yes', hi: 'हाँ', gu: 'હા' },
  'common.no': { en: 'No', hi: 'नहीं', gu: 'ના' },
  'common.error': { en: 'Error', hi: 'त्रुटि', gu: 'ભૂલ' },
  'common.success': { en: 'Success', hi: 'सफल', gu: 'સફળ' },
  'common.saved': { en: 'Saved', hi: 'सेव हो गया', gu: 'સેવ થઈ ગયું' },
  'common.retry': {
    en: 'Retry',
    hi: 'फिर से कोशिश करें',
    gu: 'ફરી પ્રયાસ કરો',
  },
  'common.close': { en: 'Close', hi: 'बंद करें', gu: 'બંધ કરો' },
  'common.next': { en: 'Next', hi: 'आगे', gu: 'આગળ' },
  'common.back': { en: 'Back', hi: 'पीछे', gu: 'પાછળ' },
  'common.done': { en: 'Done', hi: 'हो गया', gu: 'થઈ ગયું' },
  'common.loading': {
    en: 'Loading...',
    hi: 'लोड हो रहा है...',
    gu: 'લોડ થઈ રહ્યું છે...',
  },
  'common.warning': { en: 'Warning', hi: 'चेतावनी', gu: 'ચેતવણી' },

  // ---- Common domain terms ----
  'common.order': { en: 'Order', hi: 'ऑर्डर', gu: 'ઓર્ડર' },
  'common.orders': { en: 'Orders', hi: 'ऑर्डर', gu: 'ઓર્ડર' },
  'common.customer': { en: 'Customer', hi: 'ग्राहक', gu: 'ગ્રાહક' },
  'common.product': { en: 'Product', hi: 'सामान', gu: 'સામાન' },
  'common.products': { en: 'Products', hi: 'सामान', gu: 'સામાન' },
  'common.item': { en: 'item', hi: 'आइटम', gu: 'આઇટમ' },
  'common.items': { en: 'items', hi: 'आइटम', gu: 'આઇટમ' },
  'common.quantity': { en: 'Quantity', hi: 'मात्रा', gu: 'જથ્થો' },
  'common.price': { en: 'Price', hi: 'कीमत', gu: 'કિંમત' },
  'common.total': { en: 'Total', hi: 'कुल', gu: 'કુલ' },
  'common.amount': { en: 'Amount', hi: 'राशि', gu: 'રકમ' },
  'common.phone': { en: 'Phone', hi: 'फ़ोन', gu: 'ફોન' },
  'common.phoneNumber': { en: 'Phone Number', hi: 'फ़ोन नंबर', gu: 'ફોન નંબર' },
  'common.name': { en: 'Name', hi: 'नाम', gu: 'નામ' },
  'common.yourName': { en: 'Your Name', hi: 'आपका नाम', gu: 'તમારું નામ' },
  'common.shopName': {
    en: 'Shop Name',
    hi: 'दुकान का नाम',
    gu: 'દુકાનનું નામ',
  },
  'common.date': { en: 'Date', hi: 'तारीख', gu: 'તારીખ' },
  'common.address': { en: 'Address', hi: 'पता', gu: 'સરનામું' },
  'common.notes': { en: 'Notes', hi: 'नोट्स', gu: 'નોંધ' },
  'common.status': { en: 'Status', hi: 'स्थिति', gu: 'સ્થિતિ' },
  'common.logout': { en: 'Logout', hi: 'लॉगआउट', gu: 'લૉગઆઉટ' },
  'common.settings': { en: 'Settings', hi: 'सेटिंग्स', gu: 'સેટિંગ્સ' },
  'common.recordings': { en: 'Recordings', hi: 'रिकॉर्डिंग', gu: 'રેકોર્ડિંગ' },
  'common.whatsapp': { en: 'WhatsApp', hi: 'WhatsApp', gu: 'WhatsApp' },
  'common.sent': { en: 'Sent', hi: 'भेजा गया', gu: 'મોકલ્યું' },
  'common.send': { en: 'Send', hi: 'भेजें', gu: 'મોકલો' },
  'common.cancelled': { en: 'Cancelled', hi: 'रद्द', gu: 'રદ' },
  'common.delivered': {
    en: 'Delivered',
    hi: 'डिलीवर हो गया',
    gu: 'ડિલિવર થયું',
  },
  'common.pending': { en: 'Pending', hi: 'बाकी', gu: 'બાકી' },
  'common.networkError': {
    en: 'Network error. Please try again.',
    hi: 'नेटवर्क त्रुटि। कृपया फिर से कोशिश करें।',
    gu: 'નેટવર્ક ભૂલ. કૃપા કરી ફરી પ્રયાસ કરો.',
  },

  // ---- Caller ID app prompt (shown once after first login) ----
  'callRec.title': {
    en: 'Allow Caller ID App',
    hi: 'कॉलर ID ऐप की अनुमति दें',
    gu: 'કૉલર ID ઍપ મંજૂરી આપો',
  },
  'callRec.msg': {
    en: 'Please set Kiko as your Caller ID app so it can read caller numbers.',
    hi: 'कृपया Kiko को अपने कॉलर ID ऐप के रूप में सेट करें ताकि यह कॉल करने वालों के नंबर पढ़ सके।',
    gu: 'કૃપા કરી Kiko ને તમારી કૉલર ID ઍપ તરીકે સેટ કરો જેથી તે કૉલ કરનારના નંબર વાંચી શકે.',
  },

  // ---- App identity (kept brand-consistent) ----
  'app.name': { en: 'Kiko AI', hi: 'Kiko AI', gu: 'Kiko AI' },
  'app.tagline': {
    en: 'Call Order Taker',
    hi: 'कॉल ऑर्डर टेकर',
    gu: 'કૉલ ઑર્ડર ટેકર',
  },

  // ---- Language selection (used by Settings + Onboarding) ----
  'lang.section': { en: 'APP LANGUAGE', hi: 'ऐप की भाषा', gu: 'ઍપ ભાષા' },
  'lang.fieldLabel': { en: 'App Language', hi: 'ऐप की भाषा', gu: 'ઍપ ભાષા' },
  'lang.chooseTitle': {
    en: 'Choose your language',
    hi: 'अपनी भाषा चुनें',
    gu: 'તમારી ભાષા પસંદ કરો',
  },
  'lang.chooseSubtitle': {
    en: 'You can change this anytime in Settings',
    hi: 'इसे आप कभी भी सेटिंग्स में बदल सकते हैं',
    gu: 'તમે આ ગમે ત્યારે સેટિંગ્સમાં બદલી શકો છો',
  },
  'lang.continue': { en: 'Continue', hi: 'आगे बढ़ें', gu: 'આગળ વધો' },

  // ---- Date-range filter ----
  'date.title': {
    en: 'Filter by date',
    hi: 'तारीख से फ़िल्टर करें',
    gu: 'તારીખ પ્રમાણે ફિલ્ટર કરો',
  },
  'date.today': { en: 'Today', hi: 'आज', gu: 'આજે' },
  'date.last7': { en: 'Last 7 days', hi: 'पिछले 7 दिन', gu: 'છેલ્લા 7 દિવસ' },
  'date.last30': {
    en: 'Last 30 days',
    hi: 'पिछले 30 दिन',
    gu: 'છેલ્લા 30 દિવસ',
  },
  'date.thisMonth': { en: 'This month', hi: 'इस महीने', gu: 'આ મહિને' },
  'date.all': { en: 'All time', hi: 'सभी', gu: 'બધો સમય' },
  'date.custom': { en: 'Custom range', hi: 'कस्टम रेंज', gu: 'કસ્ટમ રેન્જ' },
  'date.selectRange': {
    en: 'Tap a start and end date',
    hi: 'शुरू और आखिरी तारीख चुनें',
    gu: 'શરૂ અને અંતિમ તારીખ પસંદ કરો',
  },
  'date.apply': { en: 'Apply', hi: 'लागू करें', gu: 'લાગુ કરો' },
  'date.clear': { en: 'Clear', hi: 'हटाएं', gu: 'સાફ કરો' },

  // ---- Export (PDF / Excel) report content ----
  'export.reportTitle': {
    en: 'Orders Report',
    hi: 'ऑर्डर रिपोर्ट',
    gu: 'ઓર્ડર રિપોર્ટ',
  },
  'export.generatedOn': {
    en: 'Generated on {date}',
    hi: '{date} को बनाई गई',
    gu: '{date} ના રોજ બનાવેલ',
  },
  'export.totalOrders': {
    en: 'Total orders: {count}',
    hi: 'कुल ऑर्डर: {count}',
    gu: 'કુલ ઓર્ડર: {count}',
  },
  'export.colOrderId': { en: 'Order ID', hi: 'ऑर्डर आईडी', gu: 'ઓર્ડર આઈડી' },
  'export.colDate': { en: 'Date', hi: 'तारीख', gu: 'તારીખ' },
  'export.colCustomer': { en: 'Customer', hi: 'ग्राहक', gu: 'ગ્રાહક' },
  'export.colPhone': { en: 'Phone', hi: 'फ़ोन', gu: 'ફોન' },
  'export.colProducts': { en: 'Products', hi: 'सामान', gu: 'સામાન' },
  'export.colTotal': { en: 'Total', hi: 'कुल', gu: 'કુલ' },
  'export.colStatus': { en: 'Status', hi: 'स्थिति', gu: 'સ્થિતિ' },
};

export default common;
