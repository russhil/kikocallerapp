// NOTE: react-native-html-to-pdf@1.3.0 exports a NAMED `generatePDF` (no default
// export); a default import + `.convert` is undefined → the receipt fails.
import { generatePDF } from 'react-native-html-to-pdf';
import { formatPrice, formatProductPrice } from './whatsappHelper';

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const h = d.getHours() % 12 || 12;
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${
    months[d.getMonth()]
  } ${d.getFullYear()}, ${h}:${m} ${d.getHours() >= 12 ? 'PM' : 'AM'}`;
}

export async function generateInvoicePDF(order, storeSettings = {}) {
  const { shopName, gstNumber, storeAddress, storeEmail, storePhone } =
    storeSettings;
  const storeDisplay = shopName || order.storeName || 'Store';

  let itemsHtml = '';
  const products = order.products || [];
  let subtotal = 0;

  products.forEach((p, i) => {
    const qty = p.quantity || 1;
    const price = p.price || 0;
    const total = qty * price;
    subtotal += total;

    itemsHtml += `
      <tr>
        <td class="text-center">${i + 1}</td>
        <td>${p.name}</td>
        <td class="text-center">${qty}</td>
        <td class="text-right">${formatProductPrice(price) || '-'}</td>
        <td class="text-right">${total > 0 ? formatPrice(total) : '-'}</td>
      </tr>
    `;
  });

  const finalTotal =
    order.totalAmount && order.totalAmount > 0 ? order.totalAmount : subtotal;

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; color: #333; margin: 0; padding: 20px; }
        .invoice-box { max-width: 800px; margin: auto; padding: 10px; }
        .header { display: flex; justify-content: space-between; margin-bottom: 30px; border-bottom: 2px solid #ddd; padding-bottom: 20px; }
        .store-details h1 { font-size: 24px; margin: 0 0 5px 0; color: #111; }
        .store-details p { margin: 2px 0; color: #555; }
        .order-meta { text-align: right; }
        .order-meta h2 { font-size: 20px; margin: 0 0 5px 0; color: #666; }
        .order-meta p { margin: 2px 0; font-weight: bold; }
        
        .details-section { display: flex; justify-content: space-between; margin-bottom: 30px; }
        .details-box { width: 48%; }
        .details-box h3 { font-size: 14px; text-transform: uppercase; color: #888; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 10px; }
        .details-box p { margin: 3px 0; }
        
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background-color: #f8f8f8; padding: 10px; text-align: left; font-size: 12px; text-transform: uppercase; border-bottom: 2px solid #ddd; }
        td { padding: 10px; border-bottom: 1px solid #eee; }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        
        .summary-box { width: 40%; float: right; margin-top: 10px; }
        .summary-row { display: flex; justify-content: space-between; padding: 5px 0; }
        .summary-total { font-size: 18px; font-weight: bold; border-top: 2px solid #333; padding-top: 10px; margin-top: 5px; }
        
        .footer { clear: both; text-align: center; margin-top: 50px; padding-top: 20px; border-top: 1px solid #eee; color: #888; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="invoice-box">
        <div class="header">
          <div class="store-details">
            <h1>${storeDisplay}</h1>
            ${
              storeAddress
                ? `<p>${storeAddress.replace(/\n/g, '<br>')}</p>`
                : ''
            }
            ${storePhone ? `<p>Phone: ${storePhone}</p>` : ''}
            ${storeEmail ? `<p>Email: ${storeEmail}</p>` : ''}
            ${gstNumber ? `<p><strong>GST:</strong> ${gstNumber}</p>` : ''}
          </div>
          <div class="order-meta">
            <h2>RECEIPT</h2>
            <p>Order ID: #${order.orderId}</p>
            <p>Date: ${formatDate(order.createdAt)}</p>
          </div>
        </div>

        <div class="details-section">
          <div class="details-box">
            <h3>Bill To</h3>
            <p><strong>${order.customerName || 'Customer'}</strong></p>
            ${order.customerPhone ? `<p>Phone: ${order.customerPhone}</p>` : ''}
          </div>
          <div class="details-box">
            <h3>Delivery To</h3>
            ${
              order.address
                ? `<p>${order.address.replace(/\n/g, '<br>')}</p>`
                : '<p>Same as billing / Pickup</p>'
            }
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th class="text-center" style="width: 5%">#</th>
              <th style="width: 45%">Item Description</th>
              <th class="text-center" style="width: 15%">Qty</th>
              <th class="text-right" style="width: 15%">Unit Price</th>
              <th class="text-right" style="width: 20%">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="summary-box">
          ${
            subtotal > 0 && finalTotal !== subtotal
              ? `
          <div class="summary-row">
            <span>Subtotal</span>
            <span>${formatPrice(subtotal)}</span>
          </div>
          `
              : ''
          }
          <div class="summary-row summary-total">
            <span>Grand Total</span>
            <span>${finalTotal > 0 ? formatPrice(finalTotal) : '-'}</span>
          </div>
        </div>

        <div class="footer">
          <p><strong>Thank you for shopping with us!</strong></p>
          <p>Powered by Kiko AI Order Taker</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const options = {
    html: htmlContent,
    fileName: `Order_${order.orderId}`,
    directory: 'Documents',
    width: 420, // A5 width
    height: 595, // A5 height
  };

  try {
    const file = await generatePDF(options);
    return file.filePath;
  } catch (error) {
    console.error('PDF Generation Error:', error);
    throw error;
  }
}
