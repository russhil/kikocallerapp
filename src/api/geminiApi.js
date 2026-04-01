import {BASE_URL} from '../config';

export async function extractOrder(transcript, storeName, token) {
  try {
    const res = await fetch(`${BASE_URL}/api/extract-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({transcript, store_name: storeName}),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.order_json || null;
  } catch (e) {
    return null;
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
      body: JSON.stringify({transcript}),
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

export async function transcribe(audioBase64, languageCode, sampleRateHertz, token) {
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
