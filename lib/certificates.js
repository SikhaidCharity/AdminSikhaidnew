// 80G certificates: numbering, the PDF, and sending it on WhatsApp.
// Server-only. Used by the donation API (automatic) and the 80G admin page (manual).
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { LOGO_PNG_BASE64 } from './brand-logo';
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

// ── Design ─────────────────────────────────────────────────────────
// A4 portrait, framed like the trust's printed donation slip: logo, trust name, saffron tag,
// PAN / registration / address, a title band, the donor and amount, details, signature,
// the 80G note and a contact strip.

const NAVY = rgb(0.11, 0.14, 0.34); // #1c2457
const BLUE = rgb(0.0, 0.25, 0.8);
const SAFFRON = rgb(0.96, 0.64, 0.1); // #f5a31a
const SAFFRON_SOFT = rgb(1, 0.96, 0.9);
const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.39, 0.45, 0.55);
const LABEL = rgb(0.55, 0.6, 0.68);
const LINE = rgb(0.88, 0.9, 0.93);
const SOFT = rgb(0.965, 0.97, 0.98);
const WHITE = rgb(1, 1, 1);
const GREEN = rgb(0.09, 0.5, 0.24);

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 44; // content margin

// Rounded rectangle; (x, y) is the bottom-left corner.
function box(page, x, y, w, h, r, { fill, border, borderWidth = 1 } = {}) {
  const p = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
  page.drawSvgPath(p, { x, y: y + h, color: fill, borderColor: border, borderWidth: border ? borderWidth : 0 });
}

function center(page, text, y, font, size, color, x0 = 0, x1 = PAGE_W) {
  const t = safe(text);
  page.drawText(t, { x: x0 + (x1 - x0 - font.widthOfTextAtSize(t, size)) / 2, y, size, font, color });
}

function right(page, text, xRight, y, font, size, color) {
  const t = safe(text);
  page.drawText(t, { x: xRight - font.widthOfTextAtSize(t, size), y, size, font, color });
}

// Shrinks text to fit a width.
function fit(text, font, size, width, min = 7) {
  let s = size;
  while (s > min && font.widthOfTextAtSize(safe(text), s) > width) s -= 0.5;
  return s;
}

function spaced(page, text, x, y, font, size, color, gap = 1.4) {
  let cx = x;
  for (const ch of safe(text)) {
    page.drawText(ch, { x: cx, y, size, font, color });
    cx += font.widthOfTextAtSize(ch, size) + gap;
  }
  return cx - x;
}
const spacedWidth = (text, font, size, gap = 1.4) =>
  [...safe(text)].reduce((w, ch) => w + font.widthOfTextAtSize(ch, size) + gap, 0) - gap;

// Saffron frame with corner marks, as on the printed slip.
function drawFrame(page) {
  const o = 16;
  page.drawRectangle({ x: o, y: o, width: PAGE_W - o * 2, height: PAGE_H - o * 2, borderColor: SAFFRON, borderWidth: 2.2 });
  const i = 23;
  page.drawRectangle({ x: i, y: i, width: PAGE_W - i * 2, height: PAGE_H - i * 2, borderColor: rgb(0.98, 0.85, 0.6), borderWidth: 0.6 });
  const c = 18;
  [[i, i, 1, 1], [PAGE_W - i, i, -1, 1], [i, PAGE_H - i, 1, -1], [PAGE_W - i, PAGE_H - i, -1, -1]].forEach(([x, y, dx, dy]) => {
    page.drawLine({ start: { x, y: y + dy * 6 }, end: { x: x + dx * c, y: y + dy * 6 }, thickness: 1.2, color: SAFFRON });
    page.drawLine({ start: { x: x + dx * 6, y }, end: { x: x + dx * 6, y: y + dy * c }, thickness: 1.2, color: SAFFRON });
  });
}

// Logo, trust name, tag line, PAN / registration and address. Returns the y below it.
function drawLetterhead(page, { regular, bold, logo }, trust) {
  let y = PAGE_H - 52;
  if (logo) {
    const w = 190;
    const h = (logo.height / logo.width) * w;
    page.drawImage(logo, { x: (PAGE_W - w) / 2, y: y - h, width: w, height: h });
    y -= h + 26;
  } else {
    y -= 20;
  }
  const name = safe(trust.trustName || 'SikhAid Charitable Trust').toUpperCase();
  const nameSize = fit(name, bold, 25, PAGE_W - M * 2);
  center(page, name, y, bold, nameSize, INK);

  y -= 26;
  const tag = 'A VOLUNTARY ORGANIZATION';
  const tagW = spacedWidth(tag, bold, 9.5, 1.2) + 60;
  box(page, (PAGE_W - tagW) / 2, y - 6, tagW, 19, 9.5, { fill: SAFFRON });
  spaced(page, tag, (PAGE_W - tagW) / 2 + 30, y, bold, 9.5, WHITE, 1.2);

  y -= 26;
  const ids = [trust.pan && `PAN: ${trust.pan}`, trust.trustRegNo && `Regd. No.: ${trust.trustRegNo}`].filter(Boolean).join('   |   ');
  if (ids) {
    center(page, ids, y, regular, 10.5, INK);
    y -= 15;
  }
  if (trust.address) {
    wrap(`Registered Office: ${trust.address}`, regular, 8.8, PAGE_W - M * 2).slice(0, 2).forEach((line) => {
      center(page, line, y, regular, 8.8, MUTED);
      y -= 12;
    });
  }
  return y - 6;
}

// The double rule with the document title between.
function drawTitle(page, { regular, bold }, y, title, subtitle) {
  page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.8, color: INK });
  y -= 30;
  const w = spacedWidth(title, bold, 22, 1.6);
  spaced(page, title, (PAGE_W - w) / 2, y, bold, 22, INK, 1.6);
  if (subtitle) {
    y -= 15;
    center(page, subtitle, y, regular, 9, MUTED);
  }
  y -= 12;
  page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.8, color: INK });
  return y - 22;
}

const label = (page, text, x, y, font) => spaced(page, String(text).toUpperCase(), x, y, font, 7.5, LABEL, 0.9);

// Two cards: who it is from, and the document number and date.
function drawParties(page, { regular, bold }, y, { name, sub, numberLabel, number, date }) {
  const h = 58;
  const gap = 14;
  const w = (PAGE_W - M * 2 - gap) / 2;
  box(page, M, y - h, w, h, 10, { fill: SOFT });
  box(page, M + w + gap, y - h, w, h, 10, { fill: SOFT });

  label(page, 'Received with thanks from', M + 14, y - 18, bold);
  page.drawText(safe(name || '-'), { x: M + 14, y: y - 35, size: fit(name || '-', bold, 13, w - 28), font: bold, color: INK });
  if (sub) page.drawText(safe(sub), { x: M + 14, y: y - 49, size: 9, font: regular, color: MUTED });

  const x2 = M + w + gap + 14;
  label(page, numberLabel, x2, y - 18, bold);
  page.drawText(safe(number || '-'), { x: x2, y: y - 33, size: fit(number || '-', bold, 11.5, w - 28), font: bold, color: INK });
  label(page, 'Date', x2, y - 47, bold);
  page.drawText(safe(date), { x: x2 + 30, y: y - 47.5, size: 9.5, font: bold, color: INK });
  return y - h - 16;
}

// The amount in a saffron band, with the amount in words.
function drawAmount(page, { regular, bold }, y, amount, caption) {
  const h = 70;
  box(page, M, y - h, PAGE_W - M * 2, h, 12, { fill: SAFFRON_SOFT, border: rgb(0.99, 0.87, 0.72) });
  const l = 'AMOUNT RECEIVED';
  spaced(page, l, (PAGE_W - spacedWidth(l, bold, 8, 2)) / 2, y - 18, bold, 8, rgb(0.85, 0.47, 0.02), 2);
  center(page, `Rs. ${Math.round(Number(amount) || 0).toLocaleString('en-IN')}/-`, y - 42, bold, 24, NAVY);
  center(page, caption || `Rupees ${amountInWords(amount)} only`, y - 59, regular, 9, GREEN);
  return y - h - 16;
}

// Label / value rows with soft fills.
function drawRows(page, { regular, bold }, y, title, rows) {
  const w = PAGE_W - M * 2;
  box(page, M, y - 24, w, 24, 8, { fill: SOFT });
  center(page, title, y - 16, bold, 10.5, INK);
  y -= 30;
  const labelW = 150;
  rows.forEach(([k, v]) => {
    const lines = wrap(v || '-', bold, 10, w - labelW - 34).slice(0, 2);
    const h = 22 + (lines.length - 1) * 12;
    box(page, M, y - h, labelW, h, 6, { fill: SOFT });
    box(page, M + labelW + 6, y - h, w - labelW - 6, h, 6, { fill: SOFT });
    page.drawText(safe(k), { x: M + 12, y: y - 14.5, size: 9.8, font: regular, color: MUTED });
    lines.forEach((line, i) => page.drawText(line, { x: M + labelW + 18, y: y - 14.5 - i * 12, size: 10, font: bold, color: INK }));
    y -= h + 5;
  });
  return y - 10;
}

// Signature on the left; a round "80G" seal on the right.
async function drawSignature(page, pdf, { regular, bold }, y, trust) {
  const signature = await embedImage(pdf, await loadImage(trust.signatureImage));
  const baseY = y - 58;
  if (signature) {
    const scale = Math.min(150 / signature.width, 46 / signature.height);
    page.drawImage(signature, { x: M + 4, y: baseY + 6, width: signature.width * scale, height: signature.height * scale });
  }
  page.drawLine({ start: { x: M, y: baseY }, end: { x: M + 170, y: baseY }, thickness: 0.7, color: MUTED });
  page.drawText(safe(trust.signatoryName ? `${trust.signatoryName}` : 'Authorized Signatory'), { x: M, y: baseY - 14, size: 11, font: bold, color: INK });
  page.drawText(safe(trust.signatoryName ? trust.signatoryTitle || 'Authorized Signatory' : `For ${trust.trustName}`), { x: M, y: baseY - 27, size: 9, font: regular, color: MUTED });
  if (trust.signatoryName) page.drawText(safe(`For ${trust.trustName}`), { x: M, y: baseY - 39, size: 9, font: regular, color: MUTED });

  // Seal
  const cx = PAGE_W - M - 46;
  const cy = baseY - 4;
  page.drawCircle({ x: cx, y: cy, size: 40, borderColor: SAFFRON, borderWidth: 2 });
  page.drawCircle({ x: cx, y: cy, size: 34, borderColor: rgb(0.98, 0.85, 0.6), borderWidth: 0.7 });
  center(page, '80G', cy - 2, bold, 18, NAVY, cx - 40, cx + 40);
  center(page, 'TAX EXEMPT', cy - 15, bold, 6.5, SAFFRON, cx - 40, cx + 40);
  center(page, 'APPROVED', cy + 15, bold, 6.5, SAFFRON, cx - 40, cx + 40);
  return baseY - 54;
}

// The 80G note in a grey box.
function drawTaxNote(page, { regular, bold }, y, trust) {
  const w = PAGE_W - M * 2;
  const note = trust.deductionNote || 'This donation is eligible for deduction under Section 80G of the Income Tax Act, 1961.';
  const lines = wrap(note, regular, 8.8, w - 40).slice(0, 3);
  const reg = [trust.registrationNo && `80G Registration No: ${trust.registrationNo}`, trust.validity && `Valid: ${trust.validity}`].filter(Boolean).join('   |   ');
  const h = 30 + lines.length * 12 + (reg ? 14 : 0);
  box(page, M, y - h, w, h, 10, { fill: SOFT });
  center(page, '80G Tax Exemption', y - 17, bold, 10, INK);
  let ty = y - 31;
  lines.forEach((line) => {
    center(page, line, ty, regular, 8.8, MUTED);
    ty -= 12;
  });
  if (reg) center(page, reg, ty - 1, bold, 8.8, NAVY);
  return y - h - 12;
}

// Navy contact strip at the bottom of every page, and the test-record warning.
function drawContact(page, { regular, bold }, site, test) {
  const y = 34;
  const h = 26;
  box(page, M - 8, y, PAGE_W - (M - 8) * 2, h, 8, { fill: NAVY });
  const items = [site.phone && `Phone: ${site.phone}`, 'www.sikhaid.ngo', site.email && `Email: ${site.email}`].filter(Boolean);
  const slot = (PAGE_W - (M - 8) * 2) / items.length;
  items.forEach((t, i) => center(page, t, y + 9.5, bold, 9, WHITE, M - 8 + slot * i, M - 8 + slot * (i + 1)));
  center(page, 'This is a computer-generated document and does not need a physical signature.', y + h + 8, regular, 7.5, LABEL);
  if (test) {
    page.drawText('TEST RECORD - NOT VALID', {
      x: 120, y: 300, size: 46, font: bold, color: rgb(0.85, 0.2, 0.15), opacity: 0.12, rotate: degrees(35),
    });
  }
}

// Page 1: the donation receipt. Every donor gets this.
function drawReceipt(pdf, fonts, r, trust, site) {
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  drawFrame(page);
  let y = drawLetterhead(page, fonts, trust);
  y = drawTitle(page, fonts, y, 'DONATION RECEIPT', 'Thank you for standing with humanity');
  y = drawParties(page, fonts, y, {
    name: r.donor.name,
    sub: r.donor.pan ? `PAN: ${r.donor.pan}` : '',
    numberLabel: 'Receipt No',
    number: r.receiptNo,
    date: dateText(r.date),
  });
  y = drawAmount(page, fonts, y, r.grandTotal);
  const rows = [
    ['Donated Towards', r.cause],
    ['Type', r.paymentType],
    ['Mode Of Payment', 'Online'],
    ['Transaction No', r.paymentRef || '-'],
  ];
  if (r.tipAmt > 0) {
    rows.push(['To the Cause', `Rs. ${Math.round(r.amount).toLocaleString('en-IN')}`]);
    rows.push(['Support to SikhAid', `Rs. ${Math.round(r.tipAmt).toLocaleString('en-IN')}`]);
  }
  if (r.donor.phone || r.donor.email) rows.push(['Contact', [r.donor.phone, r.donor.email].filter(Boolean).join('  |  ')]);
  y = drawRows(page, fonts, y, 'Donation Details', rows);
  if (r.hasCertificate) {
    box(page, M, y - 26, PAGE_W - M * 2, 26, 8, { fill: rgb(0.9, 0.96, 0.92) });
    center(page, 'Your 80G tax exemption certificate is on the next page.', y - 17, fonts.bold, 10, GREEN);
  }
  drawContact(page, fonts, site, r.test);
}

// Page 2 (donations of the minimum amount or more): the 80G certificate.
async function drawCertificate(pdf, fonts, cert, trust, site) {
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  drawFrame(page);
  let y = drawLetterhead(page, fonts, trust);
  y = drawTitle(page, fonts, y, 'DONATION SLIP', 'Certificate under Section 80G of the Income Tax Act, 1961');
  y = drawParties(page, fonts, y, {
    name: cert.donor.name,
    sub: cert.donor.pan ? `Donor PAN: ${cert.donor.pan}` : 'Donor PAN: Not provided',
    numberLabel: 'Certificate No',
    number: cert.certNo,
    date: dateText(cert.donationDate),
  });
  y = drawAmount(page, fonts, y, cert.amount);
  const rows = [
    ['Mode Of Payment', cert.paymentMode || 'Online'],
    ['Transaction No', cert.paymentRef || '-'],
    ['Purpose', cert.campaign ? `Donation - ${cert.campaign}` : 'Donation'],
  ];
  if (cert.donor.address) rows.push(['Donor Address', cert.donor.address]);
  y = drawRows(page, fonts, y, 'Donation Details', rows);
  y = await drawSignature(page, pdf, fonts, y, trust);
  drawTaxNote(page, fonts, Math.min(y, 196), trust);
  drawContact(page, fonts, site, cert.test);
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
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    logo: await pdf.embedPng(Buffer.from(LOGO_PNG_BASE64, 'base64')).catch(() => null),
  };
  const site = await readCollection('site').catch(() => ({}));
  const includeCert = Boolean(cert && withCertificate);
  const receipt = { ...receiptFrom({ donation, cert }), hasCertificate: includeCert };
  pdf.setTitle(includeCert ? `Receipt and 80G Certificate ${receipt.receiptNo}` : `Donation Receipt ${receipt.receiptNo}`);
  pdf.setAuthor(trust.trustName);
  drawReceipt(pdf, fonts, receipt, trust, site);
  if (includeCert) await drawCertificate(pdf, fonts, cert, trust, site);
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
