import { NativeModules } from 'react-native';
import { BASE_URL } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncOrder, syncRecording } from '../api/syncApi';

const { RecordingMonitorModule } = NativeModules;

// Custom unified logger
const nativeLog = (tag, message) => {
    try {
        console.log(`[${tag}] ${message}`);
        RecordingMonitorModule.logToNative(tag, String(message));
    } catch (e) {}
};

const nativeError = (tag, message) => {
    try {
        console.error(`[${tag}] ${message}`);
        RecordingMonitorModule.logToNative(tag, String(message));
    } catch (e) {}
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(url, options, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url, options);
            if (res.ok) return res;
            if (res.status >= 500) throw new Error(`Server error: ${res.status}`);
            return res; // Return client errors directly
        } catch (e) {
            nativeError('BG_Fetch', `Fetch failed attempt ${i + 1}/${retries} for ${url} - Error: ${e.message}`);
            if (i === retries - 1) throw e;
            await sleep((i + 1) * 2000); // Exponential backoff
        }
    }
}

/**
 * Background task to scan and sync new recordings
 */
export async function syncBackgroundRecordings(taskData) {
    console.log('Syncing recordings in background...', taskData);
    
    // Prevent overlapping executions
    const isSyncing = await AsyncStorage.getItem('isBgSyncing');
    if (isSyncing === 'true') {
        console.log('Already syncing, skipping...');
        return;
    }
    await AsyncStorage.setItem('isBgSyncing', 'true');

    try {
        // 1. Get token and shop info from storage
        const token = await AsyncStorage.getItem('authToken');
        if (!token) {
            console.log('No auth token found, skipping sync');
            return;
        }

        // 2. Scan for new recordings
        const recordings = await RecordingMonitorModule.scanRecordings();
        if (!recordings || recordings.length === 0) {
            console.log('No recordings found during background scan.');
            return;
        }

        // 3. Process the most recent recording first (v30 strategy)
        const recent = recordings[0];
        
        // Check if recently processed (v30 deduplication)
        const lastProcessed = await AsyncStorage.getItem('lastProcessedRecording');
        if (lastProcessed === recent.path) {
            console.log('Recording already processed in this batch');
            return;
        }

        // Wait slightly to ensure file is fully written on disk before upload
        await sleep(1000); 

        // 4. Get Call Info (Direction)
        let callPhone = null;
        let callName = null;
        let callDirection = null;
        try {
            const callInfo = await RecordingMonitorModule.findCallInfoForTimestamp(recent.lastModified);
            if (callInfo) {
                callPhone = callInfo.phone;
                callName = callInfo.contactName;
                callDirection = callInfo.direction;
            }
        } catch (e) {}

        if (callDirection && callDirection !== 'INCOMING') {
            console.log('Skipping outgoing/missed call auto-process');
            return;
        }

        // Deduplication using phone_number + timestamp
        const dedupKey = `ord_dedup_${callPhone || 'unknown'}_${recent.lastModified}`;
        const isDuplicate = await AsyncStorage.getItem(dedupKey);
        if (isDuplicate) {
             console.log('Skipping processing: Duplicate call/timestamp detected.');
             return;
        }

        // 5 & 6: Upload Audio & Transcribe using Gemini via Multipart
        console.log('[BG] Uploading & Transcribing recording via MULTIPART:', recent.filename);
        const lang = (await AsyncStorage.getItem('defaultLanguage')) || 'hi-IN';
        const shopName = (await AsyncStorage.getItem('shopName')) || '';
        
        let transcript = null;
        let transcribeRes;
        
        // Try dedicated multipart endpoint first
        try {
            const formData = new FormData();
            formData.append('audio_file', {
                uri: recent.path.startsWith('file://') ? recent.path : `file://${recent.path}`,
                type: 'audio/mp4', // backend will inspect actual format
                name: recent.filename || 'recording.m4a'
            });
            formData.append('language_code', lang);
            
            transcribeRes = await fetchWithRetry(`${BASE_URL}/api/transcribe-gemini-multipart`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }, // Content-Type omitted so fetch adds boundary
                body: formData
            });

            console.log('[BG] Transcribe response status:', transcribeRes?.status);
            if (transcribeRes?.ok) {
                const data = await transcribeRes.json();
                if (data.transcript && data.transcript.trim().length > 0) {
                    transcript = data.transcript;
                    console.log('[BG] Transcription success! Len:', transcript.length);
                }
            } else if (transcribeRes?.status === 413) {
                 nativeError('BG_Multipart', `Payload Too Large (413).`);
                 throw new Error("Payload Too Large");
            } else {
                 const tText = await transcribeRes?.text().catch(e=>"none");
                 nativeError('BG_Multipart', `Failed to transcribe. Status: ${transcribeRes?.status}, Response: ${tText}`);
            }
        } catch (e) {
            nativeError('BG_Multipart', `Multipart upload failed: ${e.message}`);
        }

        // Fallback to base64 via transcribe-raw-audio (correct mime_type handling)
        if (!transcript) {
            console.log("[BG] Falling back to Base64 encode via transcribe-raw-audio...");
            try {
                const base64 = await RecordingMonitorModule.getFileBase64(recent.path);
                transcribeRes = await fetchWithRetry(`${BASE_URL}/api/transcribe-raw-audio`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ audio_base64: base64, language_code: lang, mime_type: 'audio/mp4' })
                });
                if (transcribeRes?.ok) {
                    const data = await transcribeRes.json();
                    if (data.transcript && data.transcript.trim().length > 0) transcript = data.transcript;
                    else nativeError('BG_Base64', "Base64 transcription returned empty transcript.");
                } else {
                    const text = await transcribeRes?.text().catch(e=>"none");
                    nativeError('BG_Base64', `Base64 api request failed: ${transcribeRes?.status} msg: ${text}`);
                }
            } catch(e) {
                 nativeError('BG_Base64', `Base64 transcription also failed exception: ${e.message}`);
            }
        }

        if (!transcript) {
            nativeError('BG_Transcribe', `Transcription produced no result. Aborting processing for: ${recent.filename}`);
            try {
                await RecordingMonitorModule.showNotification(
                    'Processing Failed',
                    `Could not transcribe: ${recent.filename}`,
                    Math.floor(Math.random() * 1000)
                );
            } catch (_) {}
            return;
        }

        await AsyncStorage.setItem('lastProcessedRecording', recent.path);

        // 7. Classify
        console.log('Classifying...');
        let classification = 'UNCERTAIN';
        try {
            const res = await fetchWithRetry(`${BASE_URL}/api/classify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ transcript }),
            }, 3);
            const data = await res.json();
            classification = data.classification;
            const confidence = data.confidence || 0.5;
            
            if (classification === 'PERSONAL_CALL' && confidence >= 0.7) {
                console.log('Personal call detected - skipping order extraction.');
                const rawState = await AsyncStorage.getItem('recordingsState');
                const state = rawState ? JSON.parse(rawState) : {};
                state[recent.path] = {...(state[recent.path] || {}), isProcessed: true, classification, transcript};
                await AsyncStorage.setItem('recordingsState', JSON.stringify(state));
                await RecordingMonitorModule.showNotification('Call Processed', `Marked as Personal Call`, Math.floor(Math.random()*1000));
                
                // Set duplicate protector successfully
                await AsyncStorage.setItem(dedupKey, "true");
                
                // Sync to Cloud
                console.log('[BG] Syncing personal call (early exit) to cloud...');
                const recSyncObj = {
                    filename: recent.filename,
                    path: recent.path,
                    durationMs: recent.duration ? Math.floor(recent.duration * 1000) : 0,
                    dateRecorded: recent.lastModified,
                    transcript: transcript,
                    classification: 'PERSONAL_CALL',
                    isProcessed: true,
                    sourcePhone: callPhone,
                    contactName: callName,
                    createdAt: Date.now()
                };
                await syncRecording(recSyncObj, "background-scan", token);
                return;
            }
            if (classification === 'PERSONAL_CALL') classification = 'UNCERTAIN';
        } catch (e) {
            nativeError('BG_Classify', `Classify error: ${e.message || e}`);
        }

        // 8. Extract Order
        console.log('[BG] Extracting order from transcript...');
        let orderJson = null;
        try {
            const res = await fetchWithRetry(`${BASE_URL}/api/extract-order`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    transcript: transcript + "\n\n(IMPORTANT: Extract the full delivery address if mentioned and map it to 'address')", 
                    store_name: shopName
                }),
            }, 3);
            if (res.ok) {
                const data = await res.json();
                orderJson = data.order_json;
            } else {
                const txt = await res?.text().catch(e=>"none");
                nativeError('BG_Extract', `extract-order network error status: ${res?.status} text: ${txt}`);
            }
        } catch (e) {
            nativeError('BG_Extract', `extract-order network error: ${e.message || e}`);
        }

        if (orderJson) {
            console.log('Saving order...');
            let cleanJson = orderJson;
            if (typeof cleanJson === 'string') {
                const start = cleanJson.indexOf('{');
                const end = cleanJson.lastIndexOf('}');
                if (start !== -1 && end !== -1 && end > start) {
                    cleanJson = cleanJson.substring(start, end + 1);
                }
            }
            const orderData = typeof cleanJson === 'string' ? JSON.parse(cleanJson) : cleanJson;
            const ordersRaw = await AsyncStorage.getItem('orders');
            const orders = ordersRaw ? JSON.parse(ordersRaw) : [];
            
            // Generate sequence identifier YYYYMMDD-<seq>
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            let seq = parseInt(await AsyncStorage.getItem(`seq_${dateStr}`) || '1', 10);
            await AsyncStorage.setItem(`seq_${dateStr}`, (seq + 1).toString());
            const paddedSeq = seq.toString().padStart(3, '0');

            const newOrder = {
                orderId: `${dateStr}-${paddedSeq}`,
                recordingId: recent.path,
                customerName: callName || orderData.customer_name || callPhone || 'Unknown',
                customerPhone: callPhone || orderData.customer_phone || '',
                storeName: shopName,
                products: (orderData.products || []).map(p => ({
                    name: p.name || p.product_name || 'Item',
                    quantity: String(p.quantity || p.qty || '1'),
                    price: parseFloat(p.price || p.unit_price || 0),
                })),
                totalAmount: parseFloat(orderData.total_amount || orderData.total || 0),
                notes: orderData.notes || orderData.special_instructions || '',
                address: orderData.address || orderData.delivery_address || orderData.customer_address || orderData.customerAddress || '',
                whatsappSent: false,
                isRead: false,
                isCancelled: false,
                orderSource: 'call',
                paymentStatus: 'pending',
                deliveryStatus: 'pending',
                createdAt: recent.lastModified || Date.now(),
            };

            orders.unshift(newOrder);
            await AsyncStorage.setItem('orders', JSON.stringify(orders));
            
            const rawState = await AsyncStorage.getItem('recordingsState');
            const state = rawState ? JSON.parse(rawState) : {};
            state[recent.path] = {...(state[recent.path] || {}), isProcessed: true, classification: 'ORDER_CALL', transcript, orderId: newOrder.orderId};
            await AsyncStorage.setItem('recordingsState', JSON.stringify(state));
            
            await AsyncStorage.setItem(dedupKey, "true"); // Prevent future duplicates

            // Sync to Cloud
            console.log('[BG] Syncing order to cloud...');
            const recSyncObj = {
                filename: recent.filename,
                path: recent.path,
                durationMs: recent.duration ? Math.floor(recent.duration * 1000) : 0,
                dateRecorded: recent.lastModified,
                transcript: transcript,
                classification: 'ORDER_CALL',
                isProcessed: true,
                sourcePhone: callPhone,
                contactName: callName,
                createdAt: Date.now()
            };
            await syncRecording(recSyncObj, "background-scan", token);
            await syncOrder(newOrder, recent.filename, token);

            await RecordingMonitorModule.showNotification(
                'Order Created!',
                `Order #${newOrder.orderId} from ${newOrder.customerName}`,
                Math.floor(Math.random()*1000)
            );
        } else {
            const rawState = await AsyncStorage.getItem('recordingsState');
            const state = rawState ? JSON.parse(rawState) : {};
            state[recent.path] = {...(state[recent.path] || {}), isProcessed: true, classification: 'PERSONAL_CALL', transcript};
            await AsyncStorage.setItem('recordingsState', JSON.stringify(state));
            
            await AsyncStorage.setItem(dedupKey, "true"); // Set lock
            
            // Sync to Cloud
            console.log('[BG] Syncing personal call to cloud...');
            const recSyncObj = {
                filename: recent.filename,
                path: recent.path,
                durationMs: recent.duration ? Math.floor(recent.duration * 1000) : 0,
                dateRecorded: recent.lastModified,
                transcript: transcript,
                classification: 'PERSONAL_CALL',
                isProcessed: true,
                sourcePhone: callPhone,
                contactName: callName,
                createdAt: Date.now()
            };
            await syncRecording(recSyncObj, "background-scan", token);
            
            await RecordingMonitorModule.showNotification('Call Processed', `Marked as Personal Call`, Math.floor(Math.random()*1000));
        }
    } catch (error) {
        nativeError('BG_Fatal', `Background sync fatal error: ${error.message || error}`);
    } finally {
        await AsyncStorage.setItem('isBgSyncing', 'false');
    }
}
