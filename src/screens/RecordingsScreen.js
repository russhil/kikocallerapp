import React, {useState, useEffect, useCallback, useRef} from 'react';
import {View, Text, TouchableOpacity, FlatList, RefreshControl, StyleSheet, ActivityIndicator, NativeModules} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation, useFocusEffect} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Colors, FontSizes, FontWeights, BorderRadius, Spacing} from '../theme';
import {BASE_URL} from '../config';
import {syncOrder, syncRecording} from '../api/syncApi';
import CustomPopup from '../components/CustomPopup';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const {RecordingMonitorModule} = NativeModules;

// Native Logging Bridge
const nativeLog = (tag, message) => {
  try {
    console.log(`[${tag}] ${message}`);
    RecordingMonitorModule?.logToNative(tag, String(message));
  } catch (e) {}
};

const nativeError = (tag, message) => {
  try {
    console.error(`[${tag}] ${message}`);
    RecordingMonitorModule?.logToNative(tag, String(message));
  } catch (e) {}
};

export default function RecordingsScreen() {
  const nav = useNavigation();
  const [recordings, setRecordings] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [processingIds, setProcessingIds] = useState(new Set());
  const [processingSteps, setProcessingSteps] = useState({});
  const [popup, setPopup] = useState({visible: false, title: '', message: '', icon: 'info', buttons: []});
  const processingRef = useRef(new Set());

  const showPopup = (title, message, icon, buttons) => {
    setPopup({visible: true, title, message, icon: icon || 'info', buttons: buttons || [{text: 'OK', onPress: () => setPopup(p => ({...p, visible: false}))}]});
  };
  const hidePopup = () => setPopup(p => ({...p, visible: false}));

  useFocusEffect(useCallback(() => { scanRecordings(); }, []));

  const scanRecordings = async () => {
    setScanning(true);
    try {
      const savedRaw = await AsyncStorage.getItem('recordingsState');
      const savedState = savedRaw ? JSON.parse(savedRaw) : {};
      const files = await RecordingMonitorModule.scanRecordings();
      const list = (files || []).map(f => {
        const prev = savedState[f.path] || {};
        return {
          filename: f.filename, path: f.path, size: f.size,
          lastModified: f.lastModified, durationMs: f.durationMs || 0,
          isOld: f.isOld || false,
          isProcessed: prev.isProcessed || false,
          classification: prev.classification || null,
          transcript: prev.transcript || null,
          orderId: prev.orderId || null,
        };
      });
      setRecordings(list);
      // Auto-process unprocessed NEW recordings one at a time
      const unprocessedNew = list.filter(r => !r.isProcessed && !r.isOld);
      for (const r of unprocessedNew) {
        await processRecording(r, false, true);
      }
    } catch (e) {
      showPopup('Scan Error', e.message || 'Failed to scan recordings', 'error');
    }
    setScanning(false);
  };

  const saveRecordingState = async (path, updates) => {
    try {
      const raw = await AsyncStorage.getItem('recordingsState');
      const state = raw ? JSON.parse(raw) : {};
      state[path] = {...(state[path] || {}), ...updates};
      await AsyncStorage.setItem('recordingsState', JSON.stringify(state));
    } catch (e) {}
  };

  const processRecording = async (recording, forceOrder = false, isAutoProcess = false) => {
    if (processingRef.current.has(recording.path)) return;
    if (forceOrder) {
      // Clear previous state for reprocessing
      await saveRecordingState(recording.path, {isProcessed: false, classification: null, orderId: null});
    }
    processingRef.current.add(recording.path);

    setProcessingIds(prev => { const n = new Set(prev); n.add(recording.path); return n; });

    const updateStep = (step) => {
      setProcessingSteps(prev => ({...prev, [recording.path]: step}));
      setRecordings(prev => prev.map(r => r.path === recording.path ? {...r, processingStep: step} : r));
    };
    
    const notifId = Math.floor(Math.random() * 100000);

    try {
      let callPhone = null;
      let callName = null;
      let callDirection = null;
      try {
        const callInfo = await RecordingMonitorModule.findCallInfoForTimestamp(recording.lastModified);
        if (callInfo) {
          callPhone = callInfo.phone;
          callName = callInfo.contactName;
          callDirection = callInfo.direction;
        }
      } catch (e) {}

      if (isAutoProcess && callDirection && callDirection !== 'INCOMING') {
        await saveRecordingState(recording.path, {isProcessed: true, classification: 'SKIPPED_DIRECTION'});
        setRecordings(prev => prev.map(r => r.path === recording.path ? {...r, isProcessed: true, classification: 'SKIPPED_DIRECTION', processingStep: null} : r));
        return;
      }

      const callerDisplay = callName || callPhone || recording.filename || 'Unknown';
      try { await RecordingMonitorModule.showNotification('Processing Call', `Analyzing audio from ${callerDisplay}...`, notifId); } catch(e){}

      const token = await AsyncStorage.getItem('authToken');
      const lang = (await AsyncStorage.getItem('defaultLanguage')) || 'auto';
      const shopName = (await AsyncStorage.getItem('shopName')) || '';

      // Step 1: Get raw audio base64 (M4A/MP4/AMR) skipping native PCM decode
      updateStep('Reading audio...');
      let base64;
      try {
        base64 = await RecordingMonitorModule.getFileBase64(recording.path);
      } catch (e) {
        updateStep('Read failed');
        showPopup('Error', 'Failed to read audio file: ' + (e.message || e), 'error');
        return;
      }

      if (!base64 || base64.length === 0) {
        updateStep('Read failed');
        showPopup('Error', 'Audio file is empty', 'error');
        return;
      }

      // Step 2: Transcribe via backend - try Multipart first, then Base64 fallback
      updateStep('Transcribing...');
      let transcript;
      try {
        // Try multipart upload to dedicated endpoint
        const formData = new FormData();
        formData.append('audio_file', {
          uri: recording.path.startsWith('file://') ? recording.path : `file://${recording.path}`,
          type: 'audio/mp4',
          name: recording.filename || 'audio.m4a'
        });
        formData.append('language_code', lang);

        const res = await fetch(`${BASE_URL}/api/transcribe-gemini-multipart`, {
          method: 'POST',
          headers: token ? {Authorization: `Bearer ${token}`} : {},
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          if (data.transcript && data.transcript.trim().length > 0) {
            transcript = data.transcript;
            nativeLog('Rec_Transcribe', `Multipart success: ${transcript.substring(0, 50)}...`);
          }
        } else if (res.status === 413) {
            updateStep('File too large');
            nativeError('Rec_Transcribe', 'Multipart payload too large (413)');
        } else {
             const errText = await res.text().catch(() => 'N/A');
             nativeError('Rec_Transcribe', `Multipart failed: ${res.status} - ${errText}`);
        }
      } catch (e) {
        nativeError('Rec_Transcribe', `Multipart error: ${e.message}`);
      }

      // Fallback: Base64 via transcribe-raw-audio (uses correct mime_type)
      if (!transcript) {
        try {
          nativeLog('Rec_Transcribe', 'Falling back to Base64 transcription...');
          const res = await fetch(`${BASE_URL}/api/transcribe-raw-audio`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})},
            body: JSON.stringify({audio_base64: base64, mime_type: 'audio/mp4', language_code: lang}),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.transcript && data.transcript.trim().length > 0) {
              transcript = data.transcript;
              nativeLog('Rec_Transcribe', `Base64 success: ${transcript.substring(0, 50)}...`);
            }
          } else {
            const errText = await res.text().catch(() => 'N/A');
            nativeError('Rec_Transcribe', `Base64 failed: ${res.status} - ${errText}`);
          }
        } catch (e) {
          nativeError('Rec_Transcribe', `Base64 error: ${e.message}`);
        }
      }

      if (!transcript) {
        updateStep('Transcription failed');
        showPopup('Error', 'Failed to transcribe audio', 'error');
        return;
      }

      // Step 3: Classify
      let classification = forceOrder ? 'ORDER_CALL' : null;
      if (!forceOrder) {
        updateStep('Classifying...');
        try {
          const res = await fetch(`${BASE_URL}/api/classify`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})},
            body: JSON.stringify({transcript}),
          });
          const data = await res.json();
          classification = data.classification;
          const confidence = data.confidence || 0.5;
          if (classification === 'PERSONAL_CALL' && confidence >= 0.7) {
            updateStep('Personal call');
            await saveRecordingState(recording.path, {isProcessed: true, classification, transcript});
            setRecordings(prev => prev.map(r => r.path === recording.path ? {...r, isProcessed: true, classification, transcript, processingStep: null} : r));
            return;
          }
          // Low confidence personal or order call - proceed to extraction
          if (classification === 'PERSONAL_CALL' && confidence < 0.7) classification = 'UNCERTAIN';
        } catch (e) {
          classification = 'UNCERTAIN';
        }
      }

      // Step 4: Extract order
      updateStep('Extracting order...');
      let orderJson;
      try {
        const res = await fetch(`${BASE_URL}/api/extract-order`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})},
          body: JSON.stringify({
             transcript: transcript + "\n\n(IMPORTANT: Extract the full delivery address if mentioned and map it to 'address')", 
             store_name: shopName
          }),
        });
        const data = await res.json();
        orderJson = data.order_json;
      } catch (e) {}

      if (orderJson) {
        updateStep('Saving order...');
        try {
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
          const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          let seq = parseInt(await AsyncStorage.getItem(`seq_${datePart}`) || '1', 10);
          await AsyncStorage.setItem(`seq_${datePart}`, (seq + 1).toString());
          const nextNumId = `${datePart}-${seq.toString().padStart(3, '0')}`;

          // Extract contact name from filename (many brands embed it, e.g. "Record_Call_John_9876543210.m4a")
          let fileNameContact = null;
          try {
            const fn = recording.filename || '';
            // Remove extension
            const base = fn.replace(/\.[^.]+$/, '');
            // Remove common prefixes and separators
            const cleaned = base
              .replace(/^(Record|Call|Recording|CallRecording|call_recording|CALL|REC|record)[_\- ]*/i, '')
              .replace(/^(Call|call)[_\- ]*/i, '');
            // Split by common delimiters
            const parts = cleaned.split(/[_\-\s]+/);
            // Find parts that look like a name (not a number, not a date, not a timestamp)
            const nameParts = parts.filter(p => {
              if (!p || p.length < 2) return false;
              if (/^\d+$/.test(p)) return false; // pure digits = phone/date
              if (/^\d{4}(0[1-9]|1[0-2])/.test(p)) return false; // date pattern
              if (/^(in|out|incoming|outgoing|missed|am|pm)$/i.test(p)) return false;
              return /^[a-zA-Z\u0900-\u097F\u0980-\u09FF]/.test(p); // starts with letter (latin or devanagari)
            });
            if (nameParts.length > 0) {
              fileNameContact = nameParts.join(' ');
            }
          } catch (e) {}

          // Priority: filename contact > call log contact > extracted from transcript > phone number
          const customerName = fileNameContact || callName || orderData.customer_name || callPhone || 'Unknown';

          const newOrder = {
            orderId: `${shopName ? shopName.substring(0, 3).toUpperCase() : 'ORD'}-${nextNumId}`,
            recordingId: recording.path,
            customerName,
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
            createdAt: recording.lastModified || Date.now(),
          };

          orders.unshift(newOrder);
          await AsyncStorage.setItem('orders', JSON.stringify(orders));
          await saveRecordingState(recording.path, {isProcessed: true, classification: 'ORDER_CALL', transcript, orderId: newOrder.orderId});
          setRecordings(prev => prev.map(r => r.path === recording.path ? {...r, isProcessed: true, classification: 'ORDER_CALL', transcript, orderId: newOrder.orderId, processingStep: null} : r));
          
          updateStep('Syncing...');
          try {
            const recSyncObj = {
                filename: recording.filename,
                path: recording.path,
                durationMs: recording.duration ? Math.floor(recording.duration * 1000) : 0,
                dateRecorded: recording.lastModified,
                transcript: transcript,
                classification: 'ORDER_CALL',
                isProcessed: true,
                sourcePhone: callPhone,
                contactName: callName,
                createdAt: Date.now()
            };
            await syncRecording(recSyncObj, "manual-process", token);
            await syncOrder(newOrder, recording.filename, token);
          } catch(syncErr) {
            nativeLog(TAG, 'Sync error: ' + syncErr.message);
          }

          updateStep('Done!');
          try { await RecordingMonitorModule.showNotification('Order Created!', `Order #${newOrder.orderId} from ${customerName}`, notifId); } catch(e){}
          showPopup('Order Created', `Order #${newOrder.orderId} created successfully!\n\nGo to Home screen to view and share via WhatsApp.`, 'check');
        } catch (e) {
          updateStep('Save failed');
          showPopup('Error', 'Failed to save order: ' + (e.message || ''), 'error');
        }
      } else {
        // No order found in the recording - mark as personal call
        await saveRecordingState(recording.path, {isProcessed: true, classification: 'PERSONAL_CALL', transcript});
        setRecordings(prev => prev.map(r => r.path === recording.path ? {...r, isProcessed: true, classification: 'PERSONAL_CALL', transcript, processingStep: null} : r));
        updateStep('No order found');
        try { await RecordingMonitorModule.showNotification('Call Processed', `Marked as Personal Call`, notifId); } catch(e){}
      }
    } catch (e) {
      updateStep('Error');
      try { await RecordingMonitorModule.showNotification('Processing Failed', `Failed to process ${recording.filename}`, Math.floor(Math.random() * 100000)); } catch(err){}
    } finally {
      processingRef.current.delete(recording.path);
      setProcessingIds(prev => { const n = new Set(prev); n.delete(recording.path); return n; });
      setTimeout(() => {
        setProcessingSteps(prev => { const n = {...prev}; delete n[recording.path]; return n; });
        setRecordings(prev => prev.map(r => r.path === recording.path ? {...r, processingStep: null} : r));
      }, 2000);
    }
  };

  const processAll = () => {
    const unprocessedNew = recordings.filter(r => !r.isProcessed && !r.isOld);
    if (unprocessedNew.length === 0) { showPopup('Info', 'No new recordings available to process.', 'info'); return; }
    showPopup('Process All', `Process ${unprocessedNew.length} new recording${unprocessedNew.length > 1 ? 's' : ''}?\n\nThis may take several minutes.`, 'question', [
      {text: 'Cancel', style: 'outline', onPress: hidePopup},
      {text: 'Process', onPress: async () => { hidePopup(); for (const r of unprocessedNew) { await processRecording(r); } }},
    ]);
  };

  const formatDuration = (ms) => { if (!ms || ms <= 0) return ''; const s = Math.round(ms / 1000); const m = Math.floor(s / 60); const sec = s % 60; return m > 0 ? `${m}m ${sec}s` : `${sec}s`; };
  const formatDate = (ts) => { if (!ts) return ''; const d = new Date(ts); const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; const h = d.getHours() % 12 || 12; const m = String(d.getMinutes()).padStart(2, '0'); return `${d.getDate()} ${months[d.getMonth()]}, ${h}:${m} ${d.getHours() >= 12 ? 'PM' : 'AM'}`; };
  const formatSize = (b) => { if (!b) return ''; if (b < 1024) return b + ' B'; if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'; return (b / 1048576).toFixed(1) + ' MB'; };

  const renderRecording = ({item: r}) => {
    const isProcessing = processingIds.has(r.path);
    const step = processingSteps[r.path];
    const isOrder = r.classification === 'ORDER_CALL';

    return (
      <View style={s.card}>
        <View style={s.cardRow}>
          <View style={[s.iconCircle, {backgroundColor: r.isProcessed ? (isOrder ? Colors.success + '14' : Colors.textMuted + '14') : Colors.primary + '14'}]}>
            <Icon name={r.isProcessed ? (isOrder ? 'check' : 'minus') : 'microphone'} size={20} color={r.isProcessed ? (isOrder ? Colors.success : Colors.textMuted) : Colors.primary} />
          </View>
          <View style={{flex: 1, marginLeft: 12}}>
            <Text style={s.filename} numberOfLines={1} maxFontSizeMultiplier={1.2}>{r.filename}</Text>
            <Text style={s.filePath} numberOfLines={1} maxFontSizeMultiplier={1.1} ellipsizeMode="middle">{r.path}</Text>
            <Text style={s.metaText} maxFontSizeMultiplier={1.2}>
              {formatDate(r.lastModified)}{r.durationMs > 0 ? ` · ${formatDuration(r.durationMs)}` : ''} · {formatSize(r.size)}
            </Text>
          </View>
          {r.isProcessed && r.classification && r.classification !== 'SKIPPED_DIRECTION' && (
            <View style={[s.badge, {backgroundColor: isOrder ? Colors.success + '14' : Colors.textMuted + '14'}]}>
              <Text style={[s.badgeText, {color: isOrder ? Colors.success : Colors.textMuted}]}>
                {isOrder ? 'Order' : 'Personal'}
              </Text>
            </View>
          )}
        </View>

        {r.orderId && (
          <TouchableOpacity style={s.orderLink} onPress={() => nav.navigate('OrderDetail', {orderId: r.orderId})} hitSlop={{top: 8, bottom: 8}}>
            <Text style={s.orderLinkText}>View Order #{r.orderId}</Text>
            <Text style={s.orderLinkArrow}>→</Text>
          </TouchableOpacity>
        )}

        {isProcessing && step && (
          <View style={s.progressRow}>
            <ActivityIndicator size="small" color={Colors.primary}/>
            <Text style={s.stepText}>{step}</Text>
          </View>
        )}

        {!r.isProcessed && !isProcessing && (
          <TouchableOpacity style={s.processBtn} onPress={() => processRecording(r, false, false)} activeOpacity={0.7}>
            <Text style={s.processBtnText}>Process Recording</Text>
          </TouchableOpacity>
        )}

        {r.isProcessed && r.classification === 'SKIPPED_DIRECTION' && !isProcessing && (
          <View style={s.skippedCont}>
            <Text style={s.skippedText}>Skipped (Outgoing Call)</Text>
            <TouchableOpacity style={s.manualOverrideBtn} onPress={() => processRecording(r, false, false)} activeOpacity={0.7}>
               <Text style={s.manualOverrideText}>Process Manually</Text>
            </TouchableOpacity>
          </View>
        )}

        {r.isProcessed && !isOrder && r.classification !== 'SKIPPED_DIRECTION' && !isProcessing && (
          <TouchableOpacity style={s.reprocessBtn} onPress={() => processRecording(r, true, false)} activeOpacity={0.7}>
            <Text style={s.reprocessBtnText}>Reprocess as Order</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const processed = recordings.filter(r => r.isProcessed).length;
  const unprocessed = recordings.length - processed;
  const unprocessedNew = recordings.filter(r => !r.isProcessed && !r.isOld).length;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* AppBar */}
      <View style={s.appBar}>
        <TouchableOpacity onPress={() => nav.goBack()} style={s.backBtn} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
          <Icon name="arrow-left" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.appBarTitle}>Call Recordings</Text>
        <View style={{flex: 1}}/>
        <TouchableOpacity style={s.scanBtnHeader} onPress={scanRecordings} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
          <Text style={s.scanBtnText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* Stats bar */}
      <View style={s.statsBar}>
        <View style={s.statItem}><Text style={s.statNum}>{recordings.length}</Text><Text style={s.statLabel}>Total</Text></View>
        <View style={s.statDivider}/>
        <View style={s.statItem}><Text style={[s.statNum, {color: Colors.success}]}>{processed}</Text><Text style={s.statLabel}>Processed</Text></View>
        <View style={s.statDivider}/>
        <View style={s.statItem}><Text style={[s.statNum, {color: Colors.primary}]}>{unprocessed}</Text><Text style={s.statLabel}>Pending</Text></View>
      </View>

      {unprocessedNew > 0 && (
        <TouchableOpacity style={s.processAllBtn} onPress={processAll} activeOpacity={0.7}>
          <Text style={s.processAllText}>Process All New ({unprocessedNew})</Text>
        </TouchableOpacity>
      )}

      {recordings.length === 0 && !scanning ? (
        <View style={s.emptyState}>
          <View style={s.emptyIcon}><Icon name="microphone-off" size={40} color={Colors.primary} style={{opacity: 0.5}} /></View>
          <Text style={s.emptyTitle}>No recordings found</Text>
          <Text style={s.emptyDesc}>Make sure call recording is enabled{'\n'}and audio file permissions are granted</Text>
          <TouchableOpacity style={s.emptyBtn} onPress={scanRecordings} activeOpacity={0.7}>
            <Text style={s.emptyBtnText}>Scan Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={recordings}
          keyExtractor={item => item.path}
          renderItem={renderRecording}
          refreshControl={<RefreshControl refreshing={scanning} onRefresh={scanRecordings} colors={[Colors.primary]}/>}
          contentContainerStyle={{padding: Spacing.sm, paddingBottom: 30}}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={false}
          initialNumToRender={10}
          windowSize={10}
        />
      )}

      <CustomPopup {...popup} onClose={hidePopup}/>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.background},
  appBar: {flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, paddingHorizontal: Spacing.lg, paddingVertical: 14, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4},
  backBtn: {width: 40, height: 40, borderRadius: BorderRadius.md, backgroundColor: Colors.surfaceLight, justifyContent: 'center', alignItems: 'center', marginRight: 8},
  backIcon: {fontSize: 20, color: Colors.textPrimary, fontWeight: FontWeights.bold},
  appBarTitle: {fontSize: FontSizes.xl, fontWeight: FontWeights.bold, color: Colors.textPrimary},
  scanBtnHeader: {backgroundColor: Colors.primary + '14', borderRadius: BorderRadius.md, paddingHorizontal: 14, paddingVertical: 8},
  scanBtnText: {fontSize: FontSizes.sm, fontWeight: FontWeights.semiBold, color: Colors.primary},
  statsBar: {flexDirection: 'row', backgroundColor: Colors.surface, paddingVertical: 14, paddingHorizontal: Spacing.lg, marginTop: 1, alignItems: 'center'},
  statItem: {flex: 1, alignItems: 'center'},
  statNum: {fontSize: FontSizes.xl, fontWeight: FontWeights.bold, color: Colors.textPrimary},
  statLabel: {fontSize: FontSizes.xs, color: Colors.textMuted, marginTop: 2},
  statDivider: {width: 1, height: 30, backgroundColor: Colors.divider},
  processAllBtn: {backgroundColor: Colors.primary, margin: Spacing.lg, marginBottom: 0, borderRadius: BorderRadius.lg, paddingVertical: 14, alignItems: 'center'},
  processAllText: {color: Colors.white, fontSize: FontSizes.body, fontWeight: FontWeights.bold},
  card: {backgroundColor: Colors.surface, marginHorizontal: Spacing.sm, marginVertical: 4, borderRadius: BorderRadius.xl, padding: Spacing.lg, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: {width: 0, height: 2}, borderWidth: 0.5, borderColor: Colors.divider + '80'},
  cardRow: {flexDirection: 'row', alignItems: 'center'},
  iconCircle: {width: 42, height: 42, borderRadius: BorderRadius.md, justifyContent: 'center', alignItems: 'center'},
  iconChar: {fontSize: 18, fontWeight: FontWeights.bold},
  filename: {fontSize: FontSizes.body, fontWeight: FontWeights.medium, color: Colors.textPrimary},
  filePath: {fontSize: FontSizes.xs - 1, color: Colors.primary, marginTop: 2, marginBottom: 1, opacity: 0.8},
  metaText: {fontSize: FontSizes.xs, color: Colors.textMuted, marginTop: 3},
  badge: {paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8},
  badgeText: {fontSize: FontSizes.xs, fontWeight: FontWeights.bold},
  orderLink: {flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: Colors.primary + '0D', borderRadius: BorderRadius.md},
  orderLinkText: {fontSize: FontSizes.sm, color: Colors.primary, fontWeight: FontWeights.semiBold, flex: 1},
  orderLinkArrow: {fontSize: 16, color: Colors.primary, fontWeight: FontWeights.bold},
  progressRow: {flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: Colors.primary + '0D', borderRadius: BorderRadius.md},
  stepText: {fontSize: FontSizes.sm, color: Colors.primary, marginLeft: 10, fontWeight: FontWeights.medium},
  processBtn: {backgroundColor: Colors.primary, borderRadius: BorderRadius.lg, paddingVertical: 12, alignItems: 'center', marginTop: 12},
  processBtnText: {color: Colors.white, fontSize: FontSizes.body, fontWeight: FontWeights.bold},
  reprocessBtn: {borderWidth: 1.5, borderColor: Colors.primary + '4D', borderRadius: BorderRadius.lg, paddingVertical: 10, alignItems: 'center', marginTop: 10},
  reprocessBtnText: {color: Colors.primary, fontSize: FontSizes.sm, fontWeight: FontWeights.semiBold},
  skippedCont: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, backgroundColor: Colors.surfaceLight, padding: 8, borderRadius: BorderRadius.md},
  skippedText: {fontSize: FontSizes.xs, color: Colors.textSecondary, fontStyle: 'italic', flex: 1},
  manualOverrideBtn: {backgroundColor: Colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: BorderRadius.md},
  manualOverrideText: {color: Colors.white, fontSize: FontSizes.xs, fontWeight: FontWeights.bold},
  emptyState: {flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40},
  emptyIcon: {width: 80, height: 80, borderRadius: 20, backgroundColor: Colors.primary + '10', justifyContent: 'center', alignItems: 'center'},
  emptyIconText: {fontSize: 32, fontWeight: FontWeights.bold, color: Colors.primary, opacity: 0.5},
  emptyTitle: {fontSize: FontSizes.xl, fontWeight: FontWeights.bold, color: Colors.textPrimary, marginTop: Spacing.xxl},
  emptyDesc: {fontSize: FontSizes.body, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 22},
  emptyBtn: {backgroundColor: Colors.primary, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.xxxl, paddingVertical: 14, marginTop: Spacing.xxl},
  emptyBtnText: {fontSize: FontSizes.body, fontWeight: FontWeights.bold, color: Colors.white},
});
