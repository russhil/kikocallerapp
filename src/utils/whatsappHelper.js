import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Share from 'react-native-share';

// Fall back to the saved shop name if an order has no storeName (e.g. older
// orders fetched from the backend before storeName was mapped).
async function ensureStoreName(order) {
  if (order && order.storeName) return order;
  try {
    const shopName = await AsyncStorage.getItem('shopName');
    if (shopName) return { ...order, storeName: shopName };
  } catch (e) {}
  return order;
}

export function formatPrice(amount) {
  if (!amount || amount === 0) return '';
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

export function formatProductPrice(price) {
  if (!price || price === 0) return '';
  return `₹${Math.round(price)}`;
}

export function composeMessage(order) {
  const lines = [];
  lines.push(`*Order #${order.orderId}*`);
  lines.push(`Store: ${order.storeName || ''}`);
  if (order.customerName) lines.push(`Customer: ${order.customerName}`);
  if (order.customerPhone) lines.push(`Phone: ${order.customerPhone}`);
  lines.push('');
  lines.push('*Items:*');

  const products = order.products || [];
  products.forEach((p, i) => {
    const priceStr = formatProductPrice(p.price);
    if (priceStr) {
      lines.push(`${i + 1}. ${p.name} – Qty: ${p.quantity} – ${priceStr}`);
    } else {
      lines.push(`${i + 1}. ${p.name} – Qty: ${p.quantity}`);
    }
  });

  lines.push('');
  if (order.totalAmount && order.totalAmount !== 0) {
    lines.push(`*Total: ${formatPrice(order.totalAmount)}*`);
  } else {
    lines.push('*Total: As per invoice*');
  }

  if (order.address) {
    lines.push('');
    lines.push(`Delivery: ${order.address}`);
  }
  if (order.notes) {
    lines.push('');
    lines.push(`Notes: ${order.notes}`);
  }

  lines.push('');
  lines.push('Processed automatically by Kiko');
  lines.push('https://ordertaker.kiko.live/english');

  return lines.join('\n').trimEnd();
}

export async function sendWhatsApp(order) {
  order = await ensureStoreName(order);
  const message = composeMessage(order);
  const encoded = encodeURIComponent(message);
  let phone = order.customerPhone;
  if (phone) {
    phone = phone.replace(/[^\d]/g, '');
    if (phone.length === 10) phone = '91' + phone;
    await Linking.openURL(
      `https://api.whatsapp.com/send?phone=${phone}&text=${encoded}`,
    );
  } else {
    await Linking.openURL(`https://api.whatsapp.com/send?text=${encoded}`);
  }
}

export async function shareOrderViaWhatsApp(order) {
  order = await ensureStoreName(order);
  const message = composeMessage(order);
  const encoded = encodeURIComponent(message);
  await Linking.openURL(`https://api.whatsapp.com/send?text=${encoded}`);
}

// Share a generated PDF receipt — tries WhatsApp directly, falls back to the
// system share sheet if WhatsApp isn't available.
export async function shareReceiptViaWhatsApp(
  order,
  pdfPath,
  storeSettings = {},
) {
  const storeDisplay = storeSettings.shopName || order.storeName || 'Store';
  const defaultMessage = `Thank you for your order with ${storeDisplay}.
Your order has been confirmed.
Please find your receipt attached.
Thank you for choosing us!`;

  let phone = order.customerPhone || '';
  if (phone) {
    phone = phone.replace(/[^\d]/g, '');
    if (phone.length === 10) phone = '91' + phone;
  }

  const url = pdfPath.startsWith('file://') ? pdfPath : `file://${pdfPath}`;
  try {
    await Share.shareSingle({
      title: 'Share Receipt',
      message: defaultMessage,
      url,
      social: Share.Social.WHATSAPP,
      whatsAppNumber: phone || undefined,
    });
  } catch (error) {
    console.log('Direct WhatsApp share failed, trying fallback', error);
    try {
      await Share.open({
        title: 'Share Receipt',
        message: defaultMessage,
        url,
      });
    } catch (e) {
      console.log('Share fallback failed', e);
    }
  }
}
