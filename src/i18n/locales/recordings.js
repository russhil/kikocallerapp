// Recordings screen strings (English / Hindi / Gujarati).
// Shape: { 'recordings.key': { en, hi, gu } }. Look up via useLang().t('recordings.key').
const recordings = {
  // ---- AppBar + stats ----
  'recordings.title': {
    en: 'Call Recordings',
    hi: 'कॉल रिकॉर्डिंग',
    gu: 'કૉલ રેકોર્ડિંગ',
  },
  'recordings.refresh': { en: 'Refresh', hi: 'रिफ्रेश', gu: 'રિફ્રેશ' },
  'recordings.showing': { en: 'Showing', hi: 'दिख रहे', gu: 'દેખાય છે' },
  'recordings.processed': { en: 'Processed', hi: 'पूरे हुए', gu: 'પૂર્ણ થયા' },
  'recordings.totalFound': {
    en: '{count} total recordings found on device',
    hi: 'डिवाइस पर कुल {count} रिकॉर्डिंग मिलीं',
    gu: 'ડિવાઇસ પર કુલ {count} રેકોર્ડિંગ મળી',
  },
  'recordings.processAllNew': {
    en: 'Process All New ({count})',
    hi: 'सभी नई प्रोसेस करें ({count})',
    gu: 'બધી નવી પ્રોસેસ કરો ({count})',
  },

  // ---- Empty state ----
  'recordings.emptyTitle': {
    en: 'No recordings found',
    hi: 'कोई रिकॉर्डिंग नहीं मिली',
    gu: 'કોઈ રેકોર્ડિંગ મળી નથી',
  },
  'recordings.emptyDesc': {
    en: 'Make sure call recording is enabled\nand audio file permissions are granted',
    hi: 'पक्का करें कि कॉल रिकॉर्डिंग चालू है\nऔर ऑडियो फ़ाइल की अनुमति दी गई है',
    gu: 'ખાતરી કરો કે કૉલ રેકોર્ડિંગ ચાલુ છે\nઅને ઑડિયો ફાઇલની પરવાનગી આપી છે',
  },
  'recordings.scanAgain': {
    en: 'Scan Again',
    hi: 'फिर से स्कैन करें',
    gu: 'ફરી સ્કેન કરો',
  },

  // ---- Pagination footer ----
  'recordings.loadMore': {
    en: 'Load More ({shown} of {total})',
    hi: 'और दिखाएं ({total} में से {shown})',
    gu: 'વધુ બતાવો ({total} માંથી {shown})',
  },
  'recordings.allLoaded': {
    en: 'All {total} recordings loaded',
    hi: 'सभी {total} रिकॉर्डिंग लोड हो गईं',
    gu: 'બધી {total} રેકોર્ડિંગ લોડ થઈ ગઈ',
  },

  // ---- Card labels + buttons ----
  'recordings.personal': { en: 'Personal', hi: 'निजी', gu: 'અંગત' },
  'recordings.viewOrder': {
    en: 'View Order #{orderId}',
    hi: 'ऑर्डर #{orderId} देखें',
    gu: 'ઑર્ડર #{orderId} જુઓ',
  },
  'recordings.processRecording': {
    en: 'Process Recording',
    hi: 'रिकॉर्डिंग प्रोसेस करें',
    gu: 'રેકોર્ડિંગ પ્રોસેસ કરો',
  },
  'recordings.skippedOutgoing': {
    en: 'Skipped (Outgoing Call)',
    hi: 'छोड़ा गया (आउटगोइंग कॉल)',
    gu: 'છોડ્યું (આઉટગોઇંગ કૉલ)',
  },
  'recordings.processManually': {
    en: 'Process Manually',
    hi: 'खुद प्रोसेस करें',
    gu: 'જાતે પ્રોસેસ કરો',
  },
  'recordings.reprocessAsOrder': {
    en: 'Reprocess as Order',
    hi: 'ऑर्डर के रूप में दोबारा प्रोसेस करें',
    gu: 'ઑર્ડર તરીકે ફરી પ્રોસેસ કરો',
  },
  'recordings.process': {
    en: 'Process',
    hi: 'प्रोसेस करें',
    gu: 'પ્રોસેસ કરો',
  },

  // ---- Popups / alerts ----
  'recordings.scanError': {
    en: 'Scan Error',
    hi: 'स्कैन में त्रुटि',
    gu: 'સ્કેન ભૂલ',
  },
  'recordings.scanFailed': {
    en: 'Failed to scan recordings',
    hi: 'रिकॉर्डिंग स्कैन नहीं हो सकीं',
    gu: 'રેકોર્ડિંગ સ્કેન થઈ શકી નથી',
  },
  'recordings.readAudioFailed': {
    en: 'Failed to read audio file: {error}',
    hi: 'ऑडियो फ़ाइल पढ़ नहीं सकी: {error}',
    gu: 'ઑડિયો ફાઇલ વાંચી શકાઈ નથી: {error}',
  },
  'recordings.audioEmpty': {
    en: 'Audio file is empty',
    hi: 'ऑडियो फ़ाइल खाली है',
    gu: 'ઑડિયો ફાઇલ ખાલી છે',
  },
  'recordings.transcribeFailed': {
    en: 'Failed to transcribe audio',
    hi: 'ऑडियो ट्रांसक्राइब नहीं हो सकी',
    gu: 'ઑડિયો ટ્રાન્સક્રાઇબ થઈ શકી નથી',
  },
  'recordings.saveOrderFailed': {
    en: 'Failed to save order: {error}',
    hi: 'ऑर्डर सेव नहीं हो सका: {error}',
    gu: 'ઑર્ડર સેવ થઈ શક્યો નથી: {error}',
  },
  'recordings.orderCreatedTitle': {
    en: 'Order Created',
    hi: 'ऑर्डर बन गया',
    gu: 'ઑર્ડર બની ગયો',
  },
  'recordings.orderCreatedMsg': {
    en: 'Order #{orderId} created successfully!\n\nGo to Home screen to view and share via WhatsApp.',
    hi: 'ऑर्डर #{orderId} सफलतापूर्वक बन गया!\n\nइसे देखने और WhatsApp पर भेजने के लिए होम स्क्रीन पर जाएं।',
    gu: 'ઑર્ડર #{orderId} સફળતાપૂર્વક બની ગયો!\n\nતેને જોવા અને WhatsApp પર મોકલવા માટે હોમ સ્ક્રીન પર જાઓ.',
  },
  'recordings.info': { en: 'Info', hi: 'जानकारी', gu: 'માહિતી' },
  'recordings.noNewRecordings': {
    en: 'No new recordings available to process.',
    hi: 'प्रोसेस करने के लिए कोई नई रिकॉर्डिंग नहीं है।',
    gu: 'પ્રોસેસ કરવા માટે કોઈ નવી રેકોર્ડિંગ નથી.',
  },
  'recordings.processAllTitle': {
    en: 'Process All',
    hi: 'सभी प्रोसेस करें',
    gu: 'બધી પ્રોસેસ કરો',
  },
  'recordings.processAllConfirm': {
    en: 'Process {count} new recordings?\n\nThis may take several minutes.',
    hi: '{count} नई रिकॉर्डिंग प्रोसेस करें?\n\nइसमें कुछ मिनट लग सकते हैं।',
    gu: '{count} નવી રેકોર્ડિંગ પ્રોસેસ કરવી છે?\n\nઆમાં થોડી મિનિટ લાગી શકે છે.',
  },

  // ---- Processing step labels ----
  'recordings.stepReading': {
    en: 'Reading audio...',
    hi: 'ऑडियो पढ़ रहे हैं...',
    gu: 'ઑડિયો વાંચી રહ્યા છીએ...',
  },
  'recordings.stepReadFailed': {
    en: 'Read failed',
    hi: 'पढ़ने में विफल',
    gu: 'વાંચવામાં નિષ્ફળ',
  },
  'recordings.stepTranscribing': {
    en: 'Transcribing...',
    hi: 'ट्रांसक्राइब हो रहा है...',
    gu: 'ટ્રાન્સક્રાઇબ થઈ રહ્યું છે...',
  },
  'recordings.stepFileTooLarge': {
    en: 'File too large',
    hi: 'फ़ाइल बहुत बड़ी है',
    gu: 'ફાઇલ બહુ મોટી છે',
  },
  'recordings.stepTranscriptionFailed': {
    en: 'Transcription failed',
    hi: 'ट्रांसक्रिप्शन विफल',
    gu: 'ટ્રાન્સક્રિપ્શન નિષ્ફળ',
  },
  'recordings.stepClassifying': {
    en: 'Classifying...',
    hi: 'पहचान रहे हैं...',
    gu: 'ઓળખી રહ્યા છીએ...',
  },
  'recordings.stepPersonalCall': {
    en: 'Personal call',
    hi: 'निजी कॉल',
    gu: 'અંગત કૉલ',
  },
  'recordings.stepExtracting': {
    en: 'Extracting order...',
    hi: 'ऑर्डर निकाल रहे हैं...',
    gu: 'ઑર્ડર કાઢી રહ્યા છીએ...',
  },
  'recordings.stepSaving': {
    en: 'Saving order...',
    hi: 'ऑर्डर सेव हो रहा है...',
    gu: 'ઑર્ડર સેવ થઈ રહ્યો છે...',
  },
  'recordings.stepSyncing': {
    en: 'Syncing...',
    hi: 'सिंक हो रहा है...',
    gu: 'સિંક થઈ રહ્યું છે...',
  },
  'recordings.stepDone': { en: 'Done!', hi: 'हो गया!', gu: 'થઈ ગયું!' },
  'recordings.stepNoOrder': {
    en: 'No order found',
    hi: 'कोई ऑर्डर नहीं मिला',
    gu: 'કોઈ ઑર્ડર મળ્યો નથી',
  },
  'recordings.stepSaveFailed': {
    en: 'Save failed',
    hi: 'सेव विफल',
    gu: 'સેવ નિષ્ફળ',
  },
};

export default recordings;
