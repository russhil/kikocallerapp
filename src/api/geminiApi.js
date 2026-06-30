import { BASE_URL } from '../config';

export async function extractOrder(
  transcript,
  storeName,
  token,
  targetLanguage,
) {
  try {
    const body = { transcript, store_name: storeName };
    // Additive: only send target_language when a non-English language is chosen.
    if (
      targetLanguage &&
      targetLanguage !== 'en' &&
      targetLanguage !== 'en-IN'
    ) {
      body.target_language = targetLanguage;
    }
    const res = await fetch(`${BASE_URL}/api/extract-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.order_json || null;
  } catch (e) {
    return null;
  }
}

// Batch-translate short strings into targetLanguage using a plain text
// translation service (Google Translate) — NOT the LLM. Fast, cheap, reliable
// script, and runs client-side so it needs no auth token. Returns an array the
// same length/order as `texts`; on any failure or for English, returns the
// originals so callers can fall back gracefully.
async function translateOne(text, tl) {
  if (!text) return text;
  try {
    const url =
      'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' +
      encodeURIComponent(tl) +
      '&dt=t&q=' +
      encodeURIComponent(text);
    const res = await fetch(url);
    if (!res.ok) return text;
    const data = await res.json();
    // data[0] = [[translatedSegment, originalSegment, ...], ...]
    const segs = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : [];
    const out = segs.map(s => (s && s[0]) || '').join('');
    return out || text;
  } catch (e) {
    return text;
  }
}

export async function translateTexts(texts, targetLanguage, _token) {
  if (!texts || texts.length === 0) return texts || [];
  const tl = (targetLanguage || 'en').split('-')[0]; // 'gu' | 'hi' | 'en'
  if (!tl || tl === 'en') return texts;
  try {
    return await Promise.all(texts.map(txt => translateOne(txt, tl)));
  } catch (e) {
    return texts;
  }
}

export async function classify(transcript, token) {
  try {
    const res = await fetch(`${BASE_URL}/api/classify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ transcript }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.classification) return null;
    return {
      classification: data.classification,
      confidence: data.confidence || 0.5,
    };
  } catch (e) {
    return null;
  }
}

export async function transcribe(
  audioBase64,
  languageCode,
  sampleRateHertz,
  token,
) {
  try {
    const res = await fetch(`${BASE_URL}/api/transcribe-gemini`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        audio_base64: audioBase64,
        language_code: languageCode || 'hi-IN',
        sample_rate_hertz: sampleRateHertz || 16000,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.transcript || null;
  } catch (e) {
    return null;
  }
}
