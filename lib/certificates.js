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
    // Keep the middle dot and bullet: the built-in fonts have them.
    .replace(/[^\x20-\x7E\u00B7\u2022]/g, '');

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
// Page 1 is the receipt card from the website; page 2 is the 80G slip as the trust prints it.

const NAVY = rgb(0.11, 0.14, 0.34); // #1c2457
const SAFFRON = rgb(0.96, 0.64, 0.1); // #f5a31a
const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.39, 0.45, 0.55);
const LABEL = rgb(0.55, 0.6, 0.68);
const LINE = rgb(0.88, 0.9, 0.93);
const WHITE = rgb(1, 1, 1);
const GREEN = rgb(0.09, 0.5, 0.24);

const PAGE_W = 595.28;
const PAGE_H = 841.89;

// Rounded rectangle; (x, y) is the bottom-left corner.
function box(page, x, y, w, h, r, { fill, border, borderWidth = 1 } = {}) {
  const p = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
  page.drawSvgPath(p, { x, y: y + h, color: fill, borderColor: border, borderWidth: border ? borderWidth : 0 });
}

function center(page, text, y, font, size, color, x0 = 0, x1 = PAGE_W) {
  const t = safe(text);
  page.drawText(t, { x: x0 + (x1 - x0 - font.widthOfTextAtSize(t, size)) / 2, y, size, font, color });
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

const PAGE_BG = rgb(0.945, 0.953, 0.973); // #f1f3f8
const PEACH = rgb(0.996, 0.957, 0.925);
const PEACH_LINE = rgb(0.98, 0.89, 0.8);
const ORANGE_TEXT = rgb(0.85, 0.47, 0.02);
const GREEN_SOFT = rgb(0.86, 0.99, 0.91);
const DASH = rgb(0.84, 0.86, 0.89);

const IST = { timeZone: 'Asia/Kolkata' };
// "10-Nov-2026 · 23:18"
function receiptWhen(d) {
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '-';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { ...IST, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.day}-${p.month}-${p.year} · ${p.hour}:${p.minute}`;
}
// "02/11/2026"
const slipDate = (d) => new Date(d).toLocaleDateString('en-GB', { ...IST, day: '2-digit', month: '2-digit', year: 'numeric' });
const indian = (n) => Math.round(Number(n) || 0).toLocaleString('en-IN');

function dashedLine(page, x0, x1, y) {
  for (let x = x0; x < x1; x += 7) page.drawLine({ start: { x, y }, end: { x: Math.min(x + 4, x1), y }, thickness: 1, color: DASH });
}

// Page 1: the donation receipt, laid out like the receipt on the website.
function drawReceipt(pdf, fonts, r, trust, site) {
  const { regular, bold, logo } = fonts;
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: PAGE_BG });

  const W = 380;
  const X = (PAGE_W - W) / 2;
  const TOP = PAGE_H - 56;
  const H = 568;
  box(page, X, TOP - H, W, H, 22, { fill: WHITE });
  const cx = PAGE_W / 2;
  let y = TOP - 26;

  // Round logo
  page.drawCircle({ x: cx, y: y - 28, size: 28, color: WHITE, borderColor: rgb(0.95, 0.64, 0.23), borderWidth: 2.5 });
  if (logo) {
    const lw = 40;
    page.drawImage(logo, { x: cx - lw / 2, y: y - 28 - (logo.height / logo.width) * lw / 2, width: lw, height: (logo.height / logo.width) * lw });
  }
  y -= 74;
  center(page, trust.trustName || 'SikhAid Charitable Trust', y, bold, 14, NAVY);
  y -= 16;
  const regd = [trust.trustRegNo && `Regd No: ${trust.trustRegNo}`, 'Section 80G Tax-Exempt NGO'].filter(Boolean).join(' · ');
  center(page, regd, y, regular, 9, MUTED);

  // Green tick
  y -= 26;
  page.drawCircle({ x: cx, y, size: 14, color: GREEN_SOFT });
  page.drawSvgPath('M -6 0 L -2 4 L 6 -5', { x: cx, y, borderColor: rgb(0.09, 0.64, 0.29), borderWidth: 2.6 });
  y -= 38;
  center(page, 'Donation Successful', y, bold, 22, INK);
  y -= 17;
  center(page, 'Thank you for standing with humanity', y, regular, 10.5, MUTED);

  // Tear line with punched edges
  const tear = (ty) => {
    dashedLine(page, X + 16, X + W - 16, ty);
    page.drawCircle({ x: X, y: ty, size: 10, color: PAGE_BG });
    page.drawCircle({ x: X + W, y: ty, size: 10, color: PAGE_BG });
  };
  y -= 24;
  tear(y);

  // Amount
  y -= 22;
  const ax = X + 24;
  const aw = W - 48;
  box(page, ax, y - 82, aw, 82, 14, { fill: PEACH, border: PEACH_LINE });
  const al = 'AMOUNT PAID';
  spaced(page, al, cx - spacedWidth(al, bold, 8.5, 2.2) / 2, y - 20, bold, 8.5, ORANGE_TEXT, 2.2);
  center(page, `Rs. ${indian(r.grandTotal)}`, y - 50, bold, 28, NAVY);
  center(page, 'Secured via Razorpay', y - 70, bold, 10, GREEN);
  y -= 82 + 26;

  // Facts, two columns
  const col2 = cx + 6;
  const fact = (lbl, value, x, fy, mono) => {
    spaced(page, lbl.toUpperCase(), x, fy, bold, 7.5, LABEL, 1.6);
    const v = safe(value || '-');
    const font = mono ? fonts.mono : regular;
    page.drawText(v, { x, y: fy - 16, size: fit(v, font, mono ? 10 : 11.5, W / 2 - 34), font, color: INK });
  };
  fact('Payment ID', r.paymentRef || r.receiptNo, ax, y, true);
  fact('Date & Time', receiptWhen(r.date), col2, y);
  y -= 44;
  fact('Donor', r.donor.name || 'Anonymous', ax, y);
  const last4 = String(r.donor.phone || '').replace(/\D/g, '').slice(-4);
  if (last4) spaced(page, `•••• ${last4}`, ax, y - 31, regular, 10, MUTED, 1.6);
  fact('Cause / Campaign', r.cause || 'General Fund', col2, y);
  y -= 56;
  fact('Type', r.paymentType, ax, y);
  fact('Mode', 'Secure Online', col2, y);
  y -= 38;
  const note = r.hasCertificate
    ? 'Your 80G tax exemption certificate is on the next page.'
    : `For 80G certificate call/WhatsApp ${site.phone || ''} - receipt will be sent.`;
  wrap(note, regular, 9, aw).slice(0, 2).forEach((line) => {
    page.drawText(line, { x: ax, y, size: 9, font: r.hasCertificate ? bold : regular, color: r.hasCertificate ? GREEN : MUTED });
    y -= 12;
  });

  y -= 12;
  tear(y);
  y -= 24;
  const ft = 'sikhaid.ngo · Regd NGO · 80G Exempt';
  spaced(page, ft, cx - spacedWidth(ft, bold, 10, 0.9) / 2, y, bold, 10, NAVY, 0.9);
  y -= 15;
  center(page, 'This is a system-generated official receipt. No physical signature required.', y, regular, 8, LABEL);

  if (r.test) {
    page.drawText('TEST RECORD - NOT VALID', { x: 130, y: 300, size: 40, font: bold, color: rgb(0.85, 0.2, 0.15), opacity: 0.12, rotate: degrees(35) });
  }
}

// Page 2 (donations of the minimum amount or more): the 80G certificate.
// Concept: a navy side panel holds the trust's credentials under a large "80G"; the main area is a
// certificate with the donor's name in script, a ledger with dotted leaders, a saffron rosette,
// and a tear-off donor counterfoil at the bottom.
async function drawCertificate(pdf, fonts, cert, trust, site) {
  const { regular, bold, logo, script } = fonts;
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const DEEP = rgb(0.07, 0.1, 0.3);
  const SIDE_TEXT = rgb(0.82, 0.86, 0.97);
  const LEADER = rgb(0.75, 0.78, 0.84);
  const CREAM = rgb(1, 0.976, 0.94);

  // ── Side panel ──
  const SW = 176;
  page.drawRectangle({ x: 0, y: 0, width: SW, height: PAGE_H, color: DEEP });
  // Diagonal light stripes, low on the panel (the white box trims them at the panel's edge)
  for (let k = 0; k < 7; k += 1) {
    page.drawLine({ start: { x: -40 + k * 34, y: 0 }, end: { x: 60 + k * 34, y: 140 }, thickness: 10, color: rgb(0.1, 0.14, 0.38) });
  }
  page.drawRectangle({ x: SW, y: 0, width: PAGE_W - SW, height: 160, color: WHITE });
  page.drawRectangle({ x: SW, y: 0, width: 5, height: PAGE_H, color: SAFFRON });
  const sx = 24;
  const sw = SW - 48;
  let y = PAGE_H - 34;
  if (logo) {
    box(page, sx - 4, y - 50, sw + 8, 50, 10, { fill: WHITE });
    const lw = sw - 12;
    const lh = (logo.height / logo.width) * lw;
    page.drawImage(logo, { x: sx + 2, y: y - 25 - lh / 2, width: lw, height: lh });
    y -= 50;
  }
  y -= 70;
  page.drawText('80G', { x: sx - 3, y, size: 66, font: bold, color: SAFFRON });
  y -= 18;
  ['TAX EXEMPTION', 'CERTIFICATE'].forEach((t) => {
    spaced(page, t, sx, y, bold, 8.5, WHITE, 1.8);
    y -= 12;
  });
  y -= 16;
  page.drawLine({ start: { x: sx, y }, end: { x: sx + 40, y }, thickness: 2, color: SAFFRON });
  y -= 24;

  const sideBlock = (lbl, value) => {
    if (!value) return;
    spaced(page, lbl, sx, y, bold, 6.8, SAFFRON, 1.4);
    y -= 13;
    wrap(value, bold, 9.5, sw).slice(0, 4).forEach((line) => {
      page.drawText(line, { x: sx, y, size: 9.5, font: bold, color: WHITE });
      y -= 12;
    });
    y -= 12;
  };
  sideBlock('TRUST PAN', trust.pan);
  sideBlock('REGD. NO.', trust.trustRegNo);
  sideBlock('80G REGISTRATION NO.', trust.registrationNo);
  sideBlock('VALIDITY', trust.validity);
  if (trust.address) {
    spaced(page, 'REGISTERED OFFICE', sx, y, bold, 6.8, SAFFRON, 1.4);
    y -= 13;
    wrap(trust.address, regular, 8.6, sw).slice(0, 4).forEach((line) => {
      page.drawText(line, { x: sx, y, size: 8.6, font: regular, color: SIDE_TEXT });
      y -= 11;
    });
  }

  // Contacts at the bottom of the panel
  let cy = 196;
  spaced(page, 'REACH US', sx, cy, bold, 6.8, SAFFRON, 1.4);
  cy -= 15;
  [site.phone, 'www.sikhaid.ngo', site.email].filter(Boolean).forEach((t) => {
    page.drawText(safe(t), { x: sx, y: cy, size: fit(t, regular, 9, sw), font: regular, color: WHITE });
    cy -= 13;
  });

  // ── Main area ──
  const X0 = SW + 40;
  const X1 = PAGE_W - 36;
  const MW = X1 - X0;
  y = PAGE_H - 46;
  page.drawText(safe(trust.trustName || 'SikhAid Charitable Trust'), { x: X0, y, size: 12.5, font: bold, color: DEEP });
  page.drawText('A Voluntary Organization', { x: X0, y: y - 13, size: 8.5, font: regular, color: MUTED });

  // Rosette (top right)
  const rx = X1 - 40;
  const ry = PAGE_H - 78;
  page.drawSvgPath('M -16 0 L -28 64 L -14 54 L -4 68 L 4 6 Z', { x: rx, y: ry, color: rgb(0.86, 0.52, 0.06) });
  page.drawSvgPath('M 16 0 L 28 64 L 14 54 L 4 68 L -4 6 Z', { x: rx, y: ry, color: rgb(0.86, 0.52, 0.06) });
  for (let a = 0; a < 360; a += 15) {
    const rad = (a * Math.PI) / 180;
    page.drawCircle({ x: rx + 34 * Math.cos(rad), y: ry + 34 * Math.sin(rad), size: 7, color: SAFFRON });
  }
  page.drawCircle({ x: rx, y: ry, size: 34, color: SAFFRON });
  page.drawCircle({ x: rx, y: ry, size: 27, color: WHITE });
  page.drawCircle({ x: rx, y: ry, size: 24, borderColor: SAFFRON, borderWidth: 0.8 });
  center(page, '80G', ry - 5, bold, 15, DEEP, rx - 30, rx + 30);
  center(page, 'APPROVED', ry + 9, bold, 5.5, rgb(0.86, 0.52, 0.06), rx - 30, rx + 30);
  center(page, 'SIKHAID', ry - 15, bold, 5.5, rgb(0.86, 0.52, 0.06), rx - 30, rx + 30);

  // Title
  y -= 86;
  page.drawText('Certificate', { x: X0, y, size: 46, font: script, color: DEEP });
  y -= 24;
  spaced(page, 'OF DONATION', X0 + 4, y, bold, 12, SAFFRON, 4);
  y -= 22;
  page.drawText(safe(`No. ${cert.certNo || '-'}`), { x: X0 + 4, y, size: 9.5, font: bold, color: MUTED });
  const issued = `Issued ${dateText(cert.createdAt || cert.donationDate)}`;
  page.drawText(safe(issued), { x: X1 - regular.widthOfTextAtSize(safe(issued), 9.5), y, size: 9.5, font: regular, color: MUTED });

  // Presented to
  y -= 44;
  page.drawText('Presented with gratitude to', { x: X0, y, size: 10.5, font: regular, color: MUTED });
  y -= 36;
  const donor = safe(cert.donor.name || 'Our Donor');
  page.drawText(donor, { x: X0, y, size: fit(donor, script, 32, MW), font: script, color: DEEP });
  y -= 12;
  page.drawLine({ start: { x: X0, y }, end: { x: X1, y }, thickness: 0.8, color: SAFFRON });
  y -= 24;
  const purpose = cert.campaign && cert.campaign !== 'General Fund' ? cert.campaign : 'its General Fund';
  wrap(`for a generous contribution to ${trust.trustName || 'SikhAid Charitable Trust'} towards ${purpose}, received on ${dateText(cert.donationDate)}. Your kindness feeds, heals and shelters families in need.`, regular, 10.5, MW)
    .slice(0, 3).forEach((line) => {
      page.drawText(line, { x: X0, y, size: 10.5, font: regular, color: INK });
      y -= 15;
    });

  // Amount highlight
  y -= 16;
  box(page, X0, y - 58, MW, 58, 10, { fill: CREAM });
  page.drawRectangle({ x: X0, y: y - 58, width: 4, height: 58, color: SAFFRON });
  spaced(page, 'AMOUNT RECEIVED', X0 + 18, y - 18, bold, 7.5, rgb(0.85, 0.47, 0.02), 1.8);
  page.drawText(`Rs. ${indian(cert.amount)}/-`, { x: X0 + 18, y: y - 44, size: 24, font: bold, color: DEEP });
  const words = `Rupees ${amountInWords(cert.amount)} only`;
  const wl = wrap(words, regular, 8.8, 170).slice(0, 3);
  wl.forEach((line, k) => {
    page.drawText(line, { x: X1 - 14 - regular.widthOfTextAtSize(line, 8.8), y: y - 22 - k * 11 - (3 - wl.length) * 5, size: 8.8, font: regular, color: GREEN });
  });
  y -= 58 + 26;

  // Ledger with dotted leaders
  const ledger = [
    ['Donor PAN', cert.donor.pan || 'Not provided'],
    ['Mode of Payment', cert.paymentMode || 'Online'],
    ['Transaction No.', cert.paymentRef || '-'],
    ['Date of Donation', dateText(cert.donationDate)],
  ];
  if (cert.donor.address) ledger.push(['Donor Address', cert.donor.address]);
  ledger.forEach(([k, v]) => {
    const vt = safe(v).slice(0, 60);
    const vs = fit(vt, bold, 10.5, MW - 140);
    const vw = bold.widthOfTextAtSize(vt, vs);
    page.drawText(k, { x: X0, y, size: 10, font: regular, color: MUTED });
    const startX = X0 + regular.widthOfTextAtSize(k, 10) + 8;
    for (let dx = startX; dx < X1 - vw - 8; dx += 4) page.drawCircle({ x: dx, y: y + 3, size: 0.6, color: LEADER });
    page.drawText(vt, { x: X1 - vw, y, size: vs, font: bold, color: INK });
    y -= 22;
  });

  // Signature
  y -= 10;
  const signature = await embedImage(pdf, await loadImage(trust.signatureImage));
  const sigY = y - 40;
  if (signature) {
    const scale = Math.min(140 / signature.width, 40 / signature.height);
    page.drawImage(signature, { x: X0 + 4, y: sigY + 4, width: signature.width * scale, height: signature.height * scale });
  }
  page.drawLine({ start: { x: X0, y: sigY }, end: { x: X0 + 160, y: sigY }, thickness: 0.8, color: MUTED });
  page.drawText(safe(trust.signatoryName || 'Authorized Signatory'), { x: X0, y: sigY - 14, size: 10.5, font: bold, color: INK });
  page.drawText(safe(trust.signatoryName ? trust.signatoryTitle || 'Authorized Signatory' : `For ${trust.trustName}`), { x: X0, y: sigY - 26, size: 8.5, font: regular, color: MUTED });
  const note = trust.deductionNote || 'This donation is eligible for deduction under Section 80G of the Income Tax Act, 1961.';
  wrap(note, regular, 8, 170).slice(0, 4).forEach((line, k) => {
    page.drawText(line, { x: X1 - regular.widthOfTextAtSize(line, 8), y: sigY - 2 - k * 10, size: 8, font: regular, color: MUTED });
  });

  // ── Tear-off counterfoil ──
  const fy = 118;
  for (let dx = X0 - 18; dx < PAGE_W; dx += 7) page.drawLine({ start: { x: dx, y: fy }, end: { x: dx + 3.5, y: fy }, thickness: 0.9, color: LEADER });
  page.drawText('cut here', { x: X1 - 30, y: fy + 4, size: 6.5, font: regular, color: LEADER });
  // Scissors mark: two rings and blades
  page.drawCircle({ x: X0 - 26, y: fy + 4, size: 2.6, borderColor: MUTED, borderWidth: 0.8 });
  page.drawCircle({ x: X0 - 26, y: fy - 4, size: 2.6, borderColor: MUTED, borderWidth: 0.8 });
  page.drawLine({ start: { x: X0 - 23.5, y: fy + 3 }, end: { x: X0 - 12, y: fy - 2 }, thickness: 0.8, color: MUTED });
  page.drawLine({ start: { x: X0 - 23.5, y: fy - 3 }, end: { x: X0 - 12, y: fy + 2 }, thickness: 0.8, color: MUTED });

  const ch = 66;
  const cyTop = fy - 18;
  box(page, X0, cyTop - ch, MW, ch, 10, { fill: rgb(0.965, 0.97, 0.985) });
  spaced(page, 'DONOR COUNTERFOIL', X0 + 14, cyTop - 16, bold, 7, DEEP, 1.6);
  const cols = [
    ['CERTIFICATE NO.', cert.certNo || '-'],
    ['DONOR', cert.donor.name || '-'],
    ['AMOUNT', `Rs. ${indian(cert.amount)}/-`],
    ['DATE', slipDate(cert.donationDate)],
  ];
  const shares = [0.32, 0.3, 0.2, 0.18];
  cols.forEach(([k, v], idx) => {
    const cw = (MW - 28) * shares[idx];
    const x = X0 + 14 + (MW - 28) * shares.slice(0, idx).reduce((a, b) => a + b, 0);
    spaced(page, k, x, cyTop - 36, bold, 6, LABEL, 1);
    const vt = safe(v);
    page.drawText(vt, { x, y: cyTop - 50, size: fit(vt, bold, 9.5, cw - 8), font: bold, color: INK });
  });
  center(page, 'Computer-generated certificate. No physical signature required.', 30, regular, 7, LABEL, X0, X1);

  if (cert.test) {
    page.drawText('TEST RECORD - NOT VALID', { x: 210, y: 320, size: 38, font: bold, color: rgb(0.85, 0.2, 0.15), opacity: 0.12, rotate: degrees(35) });
  }
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
    mono: await pdf.embedFont(StandardFonts.CourierBold),
    script: await pdf.embedFont(StandardFonts.TimesRomanBoldItalic),
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
