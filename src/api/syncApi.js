import {BASE_URL} from '../config';

export async function syncOrder(order, recordingFilename, token) {
  try {
    const body = {
      order_id: order.orderId,
      customer_name: order.customerName,
      customer_phone: order.customerPhone,
      customer_address: order.customerAddress,
      store_name: order.storeName,
      store_number: order.storeNumber,
      products: order.products || [],
      total_amount: order.totalAmount,
      notes: order.notes,
      address: order.address,
      whatsapp_sent: order.whatsappSent,
      is_read: order.isRead,
      is_cancelled: order.isCancelled,
      cancelled_at: order.cancelledAt,
      cancel_reason: order.cancelReason,
      order_source: order.orderSource || 'call',
      payment_status: order.paymentStatus || 'pending',
      payment_method: order.paymentMethod,
      delivery_status: order.deliveryStatus || 'pending',
      delivered_at: order.deliveredAt,
      confidence_score: order.confidenceScore,
      processing_time_ms: order.processingTimeMs,
      created_at: order.createdAt,
      call_direction: 'INCOMING',
    };
    if (recordingFilename) {
      body.recording_filename = recordingFilename;
    }
    const res = await fetch(`${BASE_URL}/api/sync-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

export async function syncRecording(recording, deviceId, token) {
  try {
    const body = {
      device_id: deviceId,
      filename: recording.filename,
      path: recording.path,
      duration_ms: recording.durationMs,
      date_recorded: recording.dateRecorded,
      transcript: recording.transcript,
      classification: recording.classification,
      is_processed: recording.isProcessed,
      source_phone: recording.sourcePhone,
      contact_name: recording.contactName,
      call_direction: 'INCOMING',
      created_at: recording.createdAt,
    };
    const res = await fetch(`${BASE_URL}/api/sync-recording`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}
