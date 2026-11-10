// 80G certificates: numbering, the PDF, and sending it on WhatsApp.
// Server-only. Used by the donation API (automatic) and the 80G admin page (manual).
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createItemWith, readCollection, updateItem } from './local-store';
import { websiteOrigin, websitePath } from './paths';

// ── Numbers and words ──────────────────────────────────────────────

// Indian financial year, April to March: "2026-27".
export function financialYear(date = new Date()) {
  const d = new Date(date);
  const start = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const twoDigits = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`);
const threeDigits = (n) =>
  [n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred` : '', twoDigits(n % 100)].filter(Boolean).join(' ');

// 125000 → "One Lakh Twenty Five Thousand"
export function amountInWords(amount) {
  let n = Math.round(Number(amount) || 0);
  if (n === 0) return 'Zero';
  const parts = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  if (crore) parts.push(`${amountInWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  return parts.join(' ');
}

const rupees = (n) => `Rs. ${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const dateText = (d) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

// ── Settings ───────────────────────────────────────────────────────

export const getTrust = () => readCollection('trust80g');

// The certificate is only valid with the trust's own PAN and 80G registration on it.
export const trustMissing = (trust) =>
  [['Trust PAN', trust.pan], ['80G Registration No.', trust.registrationNo], ['Trust Address', trust.address], ['Signatory Name', trust.signatoryName]]
    .filter(([, value]) => !String(value || '').trim())
    .map(([label]) => label);

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const validPan = (pan) => PAN_RE.test(String(pan || '').toUpperCase());

// ── Creating certificates ──────────────────────────────────────────

const clean = (v, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function cleanCertificateInput(body) {
  const donor = body?.donor || {};
  return {
    donor: {
      name: clean(donor.name, 200),
      pan: clean(donor.pan, 10).toUpperCase(),
      address: clean(donor.address, 500),
      email: clean(donor.email, 200),
      phone: clean(donor.phone, 20),
    },
    amount: Math.round(Number(body?.amount) || 0),
    donationDate: clean(body?.donationDate, 40) || new Date().toISOString(),
    paymentMode: clean(body?.paymentMode, 60) || 'Online',
    paymentRef: clean(body?.paymentRef, 120),
    campaign: clean(body?.campaign, 200) || 'General Fund',
  };
}

export function createCertificate(fields, extra = {}) {
  return createItemWith('certificates', (items) => {
    const fy = financialYear(fields.donationDate);
    // Always one more than the highest number this year, so a deleted certificate's number is never reused.
    const highest = items
      .filter((c) => c.financialYear === fy)
      .reduce((max, c) => Math.max(max, Number(String(c.certNo).split('/').pop()) || 0), 0);
    return {
      ...fields,
      ...extra,
      financialYear: fy,
      certNo: `SA/80G/${fy}/${String(highest + 1).padStart(4, '0')}`,
      whatsapp: { status: 'not-sent' },
    };
  });
}

// Makes the 80G certificate for a donation of the minimum amount or more (once only).
export async function certificateForDonation(donation, trust) {
  const total = Number(donation.grandTotal) || Number(donation.amount) || 0;
  if (total < (Number(trust.minAmount) || 2000)) return null;

  const existing = (await readCollection('certificates')).find((c) => c.donationId === donation.id);
  if (existing) return existing;

  return createCertificate(
    {
      donor: {
        name: donation.donor?.name || '',
        pan: (donation.donor?.pan || '').toUpperCase(),
        address: donation.donor?.address || '',
        email: donation.donor?.email || '',
        phone: donation.donor?.phone || '',
      },
      amount: total,
      donationDate: donation.createdAt,
      paymentMode: donation.isMonthly ? 'Online (monthly)' : 'Online',
      paymentRef: donation.razorpayPaymentId || donation.receiptNo || '',
      campaign: donation.cause || 'General Fund',
    },
    {
      source: 'auto',
      donationId: donation.id,
      receiptNo: donation.receiptNo,
      // Until Razorpay is connected, website donations are test records with no money taken.
      test: donation.paymentStatus === 'simulated',
    }
  );
}

// Runs for every donation the website records:
// under the minimum the donor gets a receipt; at or over it, the receipt and the 80G certificate in one PDF.
export async function afterDonation(donation) {
  const trust = await getTrust();
  await certificateForDonation(donation, trust);
  if (trust.autoSendWhatsApp) await sendForDonation(donation.id, { automatic: true });
}

// ── PDF ────────────────────────────────────────────────────────────

async function loadImage(src) {
  if (!src) return null;
  try {
    if (src.startsWith('/')) {
      // On this computer, read it from the website folder; hosted, fetch it from the website.
      const dir = process.env.WEBSITE_DIR;
      if (dir && existsSync(dir)) {
        const file = websitePath('public', path.normalize(src).replace(/^(\.\.[/\\])+/, ''));
        return await fs.readFile(file);
      }
      const res = await fetch(websiteOrigin() + src);
      return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
    }
    if (/^https:\/\//.test(src)) {
      const res = await fetch(src);
      return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
    }
  } catch {}
  return null;
}

async function embedImage(pdf, bytes) {
  if (!bytes) return null;
  try {
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return await pdf.embedPng(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await pdf.embedJpg(bytes);
  } catch {}
  return null; // WebP and others can't go in a PDF; the name is printed instead.
}

// Standard PDF fonts only cover basic Latin letters.
const safe = (text) =>
  String(text ?? '')
    .replace(/\u20B9/g, 'Rs.')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x20-\x7E]/g, '');

function wrap(text, font, size, width) {
  const lines = [];
  let line = '';
  safe(text).split(/\s+/).forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  return lines;
}

const INK = rgb(0.07, 0.1, 0.29);
const MUTED = rgb(0.36, 0.38, 0.49);
const NAVY = rgb(0.04, 0.12, 0.36);
const LEFT = 50;

// The dark band with the trust's name, address and PAN at the top of every page.
function drawHeader(page, { regular, bold }, trust, subtitle) {
  const { width } = page.getSize();
  page.drawRectangle({ x: 0, y: 741, width, height: 101, color: NAVY });
  page.drawText(safe(trust.trustName), { x: LEFT, y: 800, size: 22, font: bold, color: rgb(1, 1, 1) });
  wrap(trust.address, regular, 9.5, width - LEFT * 2 - 150).slice(0, 2).forEach((line, i) =>
    page.drawText(line, { x: LEFT, y: 782 - i * 12, size: 9.5, font: regular, color: rgb(0.85, 0.89, 1) }));
  page.drawText(safe(`PAN: ${trust.pan || '-'}`), { x: LEFT, y: 752, size: 9.5, font: bold, color: rgb(1, 1, 1) });
  const sub = safe(subtitle);
  page.drawText(sub, { x: width - LEFT - bold.widthOfTextAtSize(sub, 12), y: 803, size: 12, font: bold, color: rgb(1, 1, 1) });
}

function drawFooter(page, { regular, bold }, test) {
  if (test) {
    page.drawText('TEST RECORD: no payment was taken. Not valid as a receipt or for tax purposes.', { x: LEFT, y: 70, size: 10.5, font: bold, color: rgb(0.7, 0.15, 0.12) });
  }
  page.drawText('This is a computer-generated document.', { x: LEFT, y: 46, size: 9, font: regular, color: MUTED });
}

// Page 1: the donation receipt. Every donor gets this.
function drawReceipt(pdf, fonts, r, trust) {
  const { regular, bold } = fonts;
  const page = pdf.addPage([595.28, 841.89]); // A4
  const { width } = page.getSize();
  drawHeader(page, fonts, trust, 'Donation Receipt');

  let y = 700;
  page.drawText('Thank you for your donation', { x: LEFT, y, size: 18, font: bold, color: INK });
  y -= 20;
  page.drawText(safe(`Your seva reaches people in need. Receipt for ${r.donor.name || 'our donor'}.`), { x: LEFT, y, size: 11, font: regular, color: MUTED });

  y -= 38;
  const rows = [
    ['Receipt No.', r.receiptNo],
    ['Date', dateText(r.date)],
    ['Donor', r.donor.name],
    ['Email', r.donor.email],
    ['Phone', r.donor.phone],
    ['PAN', r.donor.pan || 'Not provided'],
    ['Donated Towards', r.cause],
    ['Payment Type', r.paymentType],
    ['Payment Reference', r.paymentRef],
  ];
  rows.forEach(([label, value]) => {
    page.drawText(safe(label), { x: LEFT, y, size: 11, font: regular, color: MUTED });
    page.drawText(safe(value || '-').slice(0, 64), { x: LEFT + 160, y, size: 11, font: bold, color: INK });
    y -= 22;
  });

  y -= 10;
  page.drawLine({ start: { x: LEFT, y }, end: { x: width - LEFT, y }, thickness: 1, color: rgb(0.88, 0.89, 0.93) });
  y -= 30;
  const money = r.tipAmt > 0 ? [['To the cause', r.amount], ['Support to SikhAid', r.tipAmt]] : [];
  money.forEach(([label, value]) => {
    page.drawText(label, { x: LEFT, y, size: 12, font: regular, color: MUTED });
    const text = rupees(value);
    page.drawText(text, { x: width - LEFT - regular.widthOfTextAtSize(text, 12), y, size: 12, font: regular, color: INK });
    y -= 24;
  });
  const total = rupees(r.grandTotal);
  page.drawText('Total', { x: LEFT, y: y - 6, size: 16, font: bold, color: INK });
  page.drawText(total, { x: width - LEFT - bold.widthOfTextAtSize(total, 16), y: y - 6, size: 16, font: bold, color: INK });
  y -= 30;
  page.drawText(safe(`Rupees ${amountInWords(r.grandTotal)} only`), { x: LEFT, y, size: 10.5, font: regular, color: MUTED });

  if (r.hasCertificate) {
    y -= 40;
    page.drawText('Your 80G tax certificate is on the next page.', { x: LEFT, y, size: 11, font: bold, color: NAVY });
  }
  drawFooter(page, fonts, r.test);
}

// Page 2 (donations of the minimum amount or more): the 80G certificate.
async function drawCertificate(pdf, fonts, cert, trust) {
  const { regular, bold } = fonts;
  const ink = INK;
  const muted = MUTED;
  const left = LEFT;
  const page = pdf.addPage([595.28, 841.89]); // A4
  const { width } = page.getSize();
  const textWidth = width - left * 2;
  drawHeader(page, fonts, trust, '80G Certificate');

  let y = 705;
  const title = 'Certificate of Donation under Section 80G';
  page.drawText(title, { x: (width - bold.widthOfTextAtSize(title, 16)) / 2, y, size: 16, font: bold, color: ink });
  y -= 16;
  const sub = 'of the Income Tax Act, 1961';
  page.drawText(sub, { x: (width - regular.widthOfTextAtSize(sub, 10.5)) / 2, y, size: 10.5, font: regular, color: muted });

  y -= 34;
  const rowsTop = [
    ['Certificate No.', cert.certNo],
    ['Date of Issue', dateText(cert.createdAt)],
    ['80G Registration No.', trust.registrationNo || '-'],
    ['Registration Date', trust.registrationDate || '-'],
    ['Valid For', trust.validity || '-'],
  ];
  rowsTop.forEach(([label, value]) => {
    page.drawText(safe(label), { x: left, y, size: 10, font: regular, color: muted });
    page.drawText(safe(value), { x: left + 150, y, size: 10, font: bold, color: ink });
    y -= 17;
  });

  y -= 14;
  page.drawLine({ start: { x: left, y }, end: { x: width - left, y }, thickness: 1, color: rgb(0.88, 0.89, 0.93) });
  y -= 26;

  const sentence =
    `Received with thanks from ${cert.donor.name || '-'}` +
    `${cert.donor.address ? `, ${cert.donor.address}` : ''}` +
    `, a sum of ${rupees(cert.amount)} (Rupees ${amountInWords(cert.amount)} only)` +
    ` by ${cert.paymentMode || 'Online'} on ${dateText(cert.donationDate)}` +
    ` as a donation towards ${cert.campaign || 'General Fund'}.`;
  wrap(sentence, regular, 12, textWidth).forEach((line) => {
    page.drawText(line, { x: left, y, size: 12, font: regular, color: ink });
    y -= 18;
  });

  y -= 16;
  const details = [
    ['Donor Name', cert.donor.name],
    ['Donor PAN', cert.donor.pan || 'Not provided'],
    ['Amount', `${rupees(cert.amount)}`],
    ['Payment Mode', cert.paymentMode],
    ['Payment Reference', cert.paymentRef || '-'],
    ['Donation Date', dateText(cert.donationDate)],
  ];
  page.drawRectangle({ x: left, y: y - details.length * 20 - 6, width: textWidth, height: details.length * 20 + 18, color: rgb(0.96, 0.96, 0.98) });
  y -= 8;
  details.forEach(([label, value]) => {
    page.drawText(safe(label), { x: left + 14, y, size: 10.5, font: regular, color: muted });
    page.drawText(safe(value || '-').slice(0, 70), { x: left + 170, y, size: 10.5, font: bold, color: ink });
    y -= 20;
  });

  y -= 26;
  wrap(trust.deductionNote, regular, 10, textWidth).forEach((line) => {
    page.drawText(line, { x: left, y, size: 10, font: regular, color: muted });
    y -= 14;
  });

  // Signature
  y -= 40;
  const signature = await embedImage(pdf, await loadImage(trust.signatureImage));
  if (signature) {
    const scale = Math.min(140 / signature.width, 50 / signature.height);
    page.drawImage(signature, { x: width - left - 160, y, width: signature.width * scale, height: signature.height * scale });
  }
  y -= 14;
  page.drawText(safe(trust.signatoryName || ''), { x: width - left - 160, y, size: 11, font: bold, color: ink });
  y -= 14;
  page.drawText(safe(trust.signatoryTitle || 'Authorised Signatory'), { x: width - left - 160, y, size: 10, font: regular, color: muted });
  y -= 13;
  page.drawText(safe(`For ${trust.trustName}`), { x: width - left - 160, y, size: 10, font: regular, color: muted });

  drawFooter(page, fonts, cert.test);
}

// What the receipt page shows, from a website donation or a manual 80G entry.
function receiptFrom({ donation, cert }) {
  if (donation) {
    return {
      receiptNo: donation.receiptNo,
      date: donation.createdAt,
      donor: donation.donor || {},
      amount: Number(donation.amount) || 0,
      tipAmt: Number(donation.tipAmt) || 0,
      grandTotal: Number(donation.grandTotal) || Number(donation.amount) || 0,
      cause: donation.cause,
      paymentType: donation.isMonthly ? 'Monthly Recurring' : 'One-Time Donation',
      paymentRef: donation.razorpayPaymentId || '',
      test: donation.paymentStatus === 'simulated',
    };
  }
  return {
    receiptNo: cert.receiptNo || cert.certNo.replace('/80G/', '/RCPT/'),
    date: cert.donationDate,
    donor: cert.donor,
    amount: cert.amount,
    tipAmt: 0,
    grandTotal: cert.amount,
    cause: cert.campaign,
    paymentType: cert.paymentMode,
    paymentRef: cert.paymentRef,
    test: Boolean(cert.test),
  };
}

// One PDF for the donor: the receipt, followed by the 80G certificate when there is one.
export async function donorPdf({ donation, cert }, trust, { withCertificate = true } = {}) {
  const pdf = await PDFDocument.create();
  const fonts = { regular: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold) };
  const includeCert = Boolean(cert && withCertificate);
  const receipt = { ...receiptFrom({ donation, cert }), hasCertificate: includeCert };
  pdf.setTitle(includeCert ? `Receipt and 80G Certificate ${receipt.receiptNo}` : `Donation Receipt ${receipt.receiptNo}`);
  pdf.setAuthor(trust.trustName);
  drawReceipt(pdf, fonts, receipt, trust);
  if (includeCert) await drawCertificate(pdf, fonts, cert, trust);
  return Buffer.from(await pdf.save());
}

export const pdfFileName = ({ donation, cert }, withCertificate = true) => {
  const no = String(cert?.certNo || donation?.receiptNo || 'donation').replace(/[^A-Za-z0-9-]+/g, '-');
  return cert && withCertificate ? `SikhAid-Receipt-and-80G-${no}.pdf` : `SikhAid-Receipt-${no}.pdf`;
};

// ── WhatsApp (Meta WhatsApp Cloud API) ─────────────────────────────
// Needs in .env.local: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEMPLATE_NAME
// and optionally WHATSAPP_TEMPLATE_LANG (default "en"). The template must be approved by Meta,
// have a DOCUMENT header, and a body with two variables: {{1}} donor name, {{2}} amount.

export const whatsappReady = () =>
  Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_TEMPLATE_NAME);

// "98765 43210" → "919876543210"
export function whatsappNumber(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : '';
}

const GRAPH = 'https://graph.facebook.com/v21.0';

async function graph(url, init) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, ...(init.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `WhatsApp returned ${res.status}`);
  return data;
}

async function deliver({ phone, name, amount, fileName }, pdfBytes) {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', 'application/pdf');
  form.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), fileName);
  const media = await graph(`${GRAPH}/${phoneId}/media`, { method: 'POST', body: form });

  const sent = await graph(`${GRAPH}/${phoneId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: whatsappNumber(phone),
      type: 'template',
      template: {
        name: process.env.WHATSAPP_TEMPLATE_NAME,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'en' },
        components: [
          { type: 'header', parameters: [{ type: 'document', document: { id: media.id, filename: fileName } }] },
          {
            type: 'body',
            parameters: [
              { type: 'text', text: name || 'Donor' },
              { type: 'text', text: rupees(amount) },
            ],
          },
        ],
      },
    }),
  });
  return sent?.messages?.[0]?.id || '';
}

// Why the 80G page has to wait, or '' if it can go with the receipt.
function certificateBlock(cert, trust) {
  if (trustMissing(trust).length) return 'trust-details-missing';
  if (!validPan(cert.donor.pan)) return 'needs-pan';
  return '';
}

// Why nothing can be sent yet, or '' if it can.
function sendBlock({ phone, test }, automatic) {
  if (test && automatic) return 'test-record';
  if (!whatsappNumber(phone)) return 'no-phone';
  if (!whatsappReady()) return 'not-configured';
  return '';
}

// Builds the donor's PDF and sends it on WhatsApp, then records what happened.
// If the 80G page isn't ready (no donor PAN, or trust details missing) the receipt still goes,
// and the certificate keeps the reason so it can be sent once fixed.
async function sendDocuments({ donation, cert }, automatic) {
  const trust = await getTrust();
  const at = new Date().toISOString();
  const certBlock = cert ? certificateBlock(cert, trust) : '';
  const withCertificate = Boolean(cert && !certBlock);
  const receipt = receiptFrom({ donation, cert });
  const block = sendBlock({ phone: receipt.donor.phone, test: receipt.test }, automatic);

  let status = block ? { status: block, at } : null;
  if (!status) {
    try {
      const messageId = await deliver(
        { phone: receipt.donor.phone, name: receipt.donor.name, amount: receipt.grandTotal, fileName: pdfFileName({ donation, cert }, withCertificate) },
        await donorPdf({ donation, cert }, trust, { withCertificate })
      );
      status = { status: 'sent', at, messageId, included: withCertificate ? 'receipt-and-80g' : 'receipt' };
    } catch (e) {
      status = { status: 'failed', at, error: String(e.message).slice(0, 300) };
    }
  }

  const results = {};
  if (donation) results.donation = await updateItem('donations', donation.id, { whatsapp: status });
  if (cert) {
    const certStatus = status.status === 'sent' && certBlock ? { status: certBlock, at, receiptSent: true } : status;
    results.cert = await updateItem('certificates', cert.id, { whatsapp: certStatus });
  }
  return results;
}

const findById = async (collection, id) => (await readCollection(collection)).find((x) => x.id === id) || null;

// The documents for a website donation: the donation and its certificate, if any.
async function donationDocs(donationId) {
  const donation = await findById('donations', donationId);
  if (!donation) return null;
  const cert = (await readCollection('certificates')).find((c) => c.donationId === donationId) || null;
  return { donation, cert };
}

// The documents for a certificate: its donation when it came from the website, or just itself (manual entry).
async function certificateDocs(certId) {
  const cert = await findById('certificates', certId);
  if (!cert) return null;
  const donation = cert.donationId ? await findById('donations', cert.donationId) : null;
  return { donation, cert };
}

export async function sendForDonation(donationId, { automatic = false } = {}) {
  const docs = await donationDocs(donationId);
  return docs ? sendDocuments(docs, automatic) : null;
}

export async function sendForCertificate(certId, { automatic = false } = {}) {
  const docs = await certificateDocs(certId);
  return docs ? sendDocuments(docs, automatic) : null;
}

// The PDF the admin downloads: exactly what the donor gets.
export async function pdfForDonation(donationId) {
  const docs = await donationDocs(donationId);
  if (!docs) return null;
  return { bytes: await donorPdf(docs, await getTrust()), fileName: pdfFileName(docs) };
}

export async function pdfForCertificate(certId) {
  const docs = await certificateDocs(certId);
  if (!docs) return null;
  return { bytes: await donorPdf(docs, await getTrust()), fileName: pdfFileName(docs) };
}
