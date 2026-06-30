import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import STRINGS from './strings';

// Languages offered as the *app* language (UI + order output/display).
// Raw call audio is still auto-detected for transcription.
export const APP_LANGUAGES = [
  { label: 'English', value: 'en' },
  { label: 'हिंदी', value: 'hi' },
  { label: 'ગુજરાતી', value: 'gu' },
];

export const STORAGE_KEY = 'appLanguage';

// Maps the app language to the backend language_code used by /api/translate
// and the optional target_language on /api/extract-order.
export const LANG_TO_CODE = { en: 'en-IN', hi: 'hi-IN', gu: 'gu-IN' };

const DEFAULT_LANG = 'en';

const LanguageContext = createContext({
  lang: DEFAULT_LANG,
  setLang: () => {},
  t: key => key,
  ready: false,
});

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(DEFAULT_LANG);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored && (stored === 'en' || stored === 'hi' || stored === 'gu')) {
          setLangState(stored);
        }
      } catch (e) {
        // ignore — fall back to default
      }
      setReady(true);
    })();
  }, []);

  const setLang = useCallback(async next => {
    if (next !== 'en' && next !== 'hi' && next !== 'gu') return;
    setLangState(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch (e) {
      // ignore
    }
  }, []);

  const t = useCallback(
    (key, params) => {
      const entry = STRINGS[key];
      let str = entry ? entry[lang] ?? entry.en ?? key : key;
      if (params) {
        Object.keys(params).forEach(p => {
          str = str.split(`{${p}}`).join(String(params[p]));
        });
      }
      return str;
    },
    [lang],
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, ready }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  return useContext(LanguageContext);
}

// Non-hook helper for modules outside React (e.g. utils) to read the
// persisted language directly.
export async function getStoredLang() {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'hi' || stored === 'gu') return stored;
  } catch (e) {}
  return DEFAULT_LANG;
}
