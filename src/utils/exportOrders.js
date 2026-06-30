// Export the given orders (already translated for display) to PDF or Excel,
// SAVE the file into the device's public Downloads folder, and return info so
// the caller can also offer a Share action. Column headers come from the i18n
// `t` fn so the file is produced in the chosen app language; data values are
// passed in pre-translated.
import { Platform } from 'react-native';
import * as XLSX from 'xlsx';
import ReactNativeBlobUtil from 'react-native-blob-util';
import Share from 'react-native-share';
import { generatePDF } from 'react-native-html-to-pdf';
import { formatPrice } from './whatsappHelper';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PDF_MIME = 'application/pdf';

function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(
    d.getHours(),
  )}:${p(d.getMinutes())}`;
}

function productsText(order) {
  return (order.products || [])
    .map(p => {
      const q = p.quantity ? ` x${p.quantity}` : '';
      return `${p.name || ''}${q}`.trim();
    })
    .filter(Boolean)
    .join(', ');
}

function statusText(order, t) {
  if (order.isCancelled) return t('common.cancelled');
  if (order.deliveryStatus === 'delivered') return t('common.delivered');
  return t('common.pending');
}

function buildRows(orders, t) {
  return orders.map(o => ({
    [t('export.colOrderId')]: o.orderId || '',
    [t('export.colDate')]: fmtDate(o.createdAt),
    [t('export.colCustomer')]: o.customerName || '',
    [t('export.colPhone')]: o.customerPhone || '',
    [t('export.colProducts')]: productsText(o),
    [t('export.colTotal')]: formatPrice(o.totalAmount || 0),
    [t('export.colStatus')]: statusText(o, t),
  }));
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function ts() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(
    d.getHours(),
  )}${p(d.getMinutes())}`;
}

// Copy a generated file into the public Downloads folder. Returns a friendly
// "Download/<file>" label on success, or null if it couldn't be saved there.
async function saveToDownloads(srcPath, fileName, mimeType) {
  const clean = srcPath.replace('file://', '');
  // Android 10+ : MediaStore Downloads (no storage permission needed, shows in Files app)
  try {
    if (
      Platform.OS === 'android' &&
      Number(Platform.Version) >= 29 &&
      ReactNativeBlobUtil.MediaCollection &&
      ReactNativeBlobUtil.MediaCollection.copyToMediaStore
    ) {
      await ReactNativeBlobUtil.MediaCollection.copyToMediaStore(
        { name: fileName, parentFolder: '', mimeType },
        'Download',
        clean,
      );
      return `Download/${fileName}`;
    }
  } catch (e) {
    // fall through to legacy copy
  }
  // Legacy (Android <=9) / fallback: copy straight into the Download dir
  try {
    const dest = `${ReactNativeBlobUtil.fs.dirs.DownloadDir}/${fileName}`;
    await ReactNativeBlobUtil.fs.cp(clean, dest);
    return `Download/${fileName}`;
  } catch (e) {
    return null;
  }
}

async function buildExcel(orders, t) {
  const rows = buildRows(orders, t);
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Orders');
  const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const fileName = `orders_${ts()}.xlsx`;
  const cachePath = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${fileName}`;
  await ReactNativeBlobUtil.fs.writeFile(cachePath, wbout, 'base64');
  return { fileName, cachePath, mimeType: XLSX_MIME };
}

async function buildPdf(orders, t) {
  const cols = [
    t('export.colOrderId'),
    t('export.colDate'),
    t('export.colCustomer'),
    t('export.colPhone'),
    t('export.colProducts'),
    t('export.colTotal'),
    t('export.colStatus'),
  ];
  const headRow = cols.map(c => `<th>${escapeHtml(c)}</th>`).join('');
  const bodyRows = orders
    .map(o => {
      const cells = [
        o.orderId || '',
        fmtDate(o.createdAt),
        o.customerName || '',
        o.customerPhone || '',
        productsText(o),
        formatPrice(o.totalAmount || 0),
        statusText(o, t),
      ];
      return `<tr>${cells.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" />
  <style>
    body { font-family: sans-serif; padding: 16px; color: #111827; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .meta { font-size: 12px; color: #6B7280; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #E5E7EB; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #4F46E5; color: #fff; }
    tr:nth-child(even) td { background: #F9FAFB; }
  </style></head><body>
    <h1>${escapeHtml(t('export.reportTitle'))}</h1>
    <div class="meta">${escapeHtml(
      t('export.generatedOn', { date: fmtDate(Date.now()) }),
    )} &nbsp;•&nbsp; ${escapeHtml(
    t('export.totalOrders', { count: orders.length }),
  )}</div>
    <table><thead><tr>${headRow}</tr></thead><tbody>${bodyRows}</tbody></table>
  </body></html>`;

  const fileBase = `orders_${ts()}`;
  const res = await generatePDF({ html, fileName: fileBase, base64: false });
  const cachePath = res.filePath;
  return { fileName: `${fileBase}.pdf`, cachePath, mimeType: PDF_MIME };
}

// Returns { fileName, cachePath, mimeType, savedTo } — savedTo is the friendly
// Downloads path, or null if it could only be cached (caller can still Share).
export async function exportOrders(format, orders, { t }) {
  const built =
    format === 'excel'
      ? await buildExcel(orders, t)
      : await buildPdf(orders, t);
  const savedTo = await saveToDownloads(
    built.cachePath,
    built.fileName,
    built.mimeType,
  );
  return { ...built, savedTo };
}

export async function shareExportedFile(cachePath, mimeType) {
  const url = cachePath.startsWith('file://')
    ? cachePath
    : `file://${cachePath}`;
  await Share.open({ url, type: mimeType, failOnCancel: false });
}
