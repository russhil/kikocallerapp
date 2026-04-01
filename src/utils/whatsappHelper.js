import {Linking} from 'react-native';

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

  return lines.join('\n').trimEnd();
}

export async function sendWhatsApp(order) {
  const message = composeMessage(order);
  const encoded = encodeURIComponent(message);
  let phone = order.customerPhone;
  if (phone) {
    phone = phone.replace(/[^\d]/g, '');
    if (phone.length === 10) phone = '91' + phone;
    await Linking.openURL(`https://api.whatsapp.com/send?phone=${phone}&text=${encoded}`);
  } else {
    await Linking.openURL(`https://api.whatsapp.com/send?text=${encoded}`);
  }
}

export async function shareOrderViaWhatsApp(order) {
  const message = composeMessage(order);
  const encoded = encodeURIComponent(message);
  await Linking.openURL(`https://api.whatsapp.com/send?text=${encoded}`);
}
