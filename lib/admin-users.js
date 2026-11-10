// Admin panel accounts, sign-in sessions and permissions (local development).
// Accounts live in .local-data/admin-users.json (git-ignored). Passwords are stored only as scrypt hashes.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { changeCollection, readCollection } from './local-store';
import { COLLECTION_SECTIONS, READ_ALSO, ROLES, SECTION_KEYS, canUse, canUseAny, isFullAdmin } from './admin-sections';

export const SESSION_COOKIE = 'sa_local_admin';
export const SESSION_HOURS = 12;
const MIN_PASSWORD = 8;

// ---------- passwords ----------
function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(password), salt, 64);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

function passwordMatches(password, stored) {
  const [kind, saltHex, hashHex] = String(stored || '').split(':');
  if (kind !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

// Used when the ID is wrong, so a wrong ID takes as long as a wrong password.
const DUMMY_HASH = hashPassword(randomBytes(8).toString('hex'));

// ---------- accounts ----------
const normEmail = (email) => String(email || '').trim().toLowerCase();
const cleanText = (value, max = 120) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const looksLikeEmail = (email) => /^[^\s@]+@[^\s@]+$/.test(email) && email.length <= 200;

export class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// What the browser may see about an account: never the password hash.
export const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  sections: u.role === 'admin' ? SECTION_KEYS : u.sections || [],
  owner: Boolean(u.owner),
  active: u.active !== false,
  createdAt: u.createdAt,
  updatedAt: u.updatedAt,
  lastLoginAt: u.lastLoginAt || null,
  createdBy: u.createdBy || '',
});

const envConfigured = () => Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD);

// On first run the account from .env.local becomes the owner. After that, the ID and
// password are changed from Settings, and .env.local is no longer used for sign-in.
function seeded(users) {
  if (users.length > 0 || !envConfigured()) return null;
  const now = new Date().toISOString();
  return [
    {
      id: randomBytes(8).toString('hex'),
      name: process.env.ADMIN_NAME || 'Admin',
      email: normEmail(process.env.ADMIN_EMAIL),
      role: 'admin',
      sections: [],
      owner: true,
      active: true,
      passwordHash: hashPassword(process.env.ADMIN_PASSWORD),
      sessionVersion: 1,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

async function allUsers() {
  const users = await readCollection('users');
  if (users.length === 0 && envConfigured()) {
    return changeCollection('users', (current) => {
      const data = seeded(current) || current;
      return { data, result: data };
    });
  }
  return users;
}

export async function isConfigured() {
  return (await allUsers()).length > 0;
}

function cleanSections(list) {
  return Array.isArray(list) ? [...new Set(list.filter((s) => SECTION_KEYS.includes(s)))] : [];
}

function checkPassword(password) {
  if (String(password || '').length < MIN_PASSWORD) {
    throw new UserError(`The password needs at least ${MIN_PASSWORD} characters.`);
  }
}

// ---------- sign-in sessions ----------
let secretPromise;
function sessionSecret() {
  // Hosted: SESSION_SECRET (a long random text) in the server settings.
  if (!secretPromise && process.env.SESSION_SECRET) secretPromise = Promise.resolve(process.env.SESSION_SECRET);
  if (!secretPromise) {
    const file = path.join(process.cwd(), '.local-data', 'session-secret');
    secretPromise = fs.readFile(file, 'utf8').then(
      (text) => text.trim(),
      async (e) => {
        if (e.code !== 'ENOENT') throw e;
        const secret = randomBytes(32).toString('hex');
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, secret, { mode: 0o600 });
        return secret;
      },
    );
  }
  return secretPromise;
}

const sign = (secret, text) => createHmac('sha256', secret).update(text).digest('hex');

export async function sessionFor(user) {
  const exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  const body = `${user.id}.${exp}`;
  return `${body}.${sign(await sessionSecret(), `${body}.${user.sessionVersion || 1}`)}`;
}

// The signed-in account for this request, or null. A changed password, a removed account
// or a switched-off account ends its sessions straight away.
export async function currentUser(request) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const [id, exp, sig] = String(token || '').split('.');
  if (!id || !exp || !sig || Number(exp) < Date.now()) return null;
  const user = (await allUsers()).find((u) => u.id === id);
  if (!user || user.active === false) return null;
  const expected = Buffer.from(sign(await sessionSecret(), `${id}.${exp}.${user.sessionVersion || 1}`));
  const given = Buffer.from(sig);
  return given.length === expected.length && timingSafeEqual(given, expected) ? user : null;
}

export async function signIn(email, password) {
  const id = normEmail(email);
  const user = (await allUsers()).find((u) => u.email === id);
  const ok = passwordMatches(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok) throw new UserError('Wrong ID or password.', 401);
  if (user.active === false) throw new UserError('This account has been switched off. Please ask an admin.', 403);
  return changeCollection('users', (users) => {
    const data = users.map((u) => (u.id === user.id ? { ...u, lastLoginAt: new Date().toISOString() } : u));
    return { data, result: data.find((u) => u.id === user.id) };
  });
}

// ---------- permission checks for API routes ----------
export const notSignedIn = () => Response.json({ error: 'Please sign in' }, { status: 401 });
export const noAccess = () => Response.json({ error: 'You do not have access to this section.' }, { status: 403 });

// Returns { user } when the request may use any of these sections, or { response } to send back.
export async function guard(request, sections) {
  const user = await currentUser(request);
  if (!user) return { response: notSignedIn() };
  if (sections && !canUseAny(user, sections)) return { response: noAccess() };
  return { user };
}

export function sectionsForCollection(collection, { write }) {
  const base = COLLECTION_SECTIONS[collection] || [];
  return write ? base : [...base, ...(READ_ALSO[collection] || [])];
}

// File uploads are for anyone who can edit some content.
export const UPLOAD_SECTIONS = ['blogs', 'campaigns', 'content', 'hero-bg', '80g', 'settings'];

// ---------- user management (full admins only) ----------
export async function listUsers() {
  return (await allUsers()).map(publicUser);
}

function applyRole(target, input) {
  const role = Object.hasOwn(ROLES, input.role) ? input.role : target.role || 'editor';
  const sections = role === 'admin' ? [] : cleanSections(input.sections ?? target.sections);
  if (role === 'editor' && sections.length === 0) throw new UserError('Pick at least one section this user can open.');
  return { role, sections };
}

export function createUser(actor, input) {
  const email = normEmail(input.email);
  if (!looksLikeEmail(email)) throw new UserError('Please enter a valid email ID.');
  checkPassword(input.password);
  const name = cleanText(input.name) || email.split('@')[0];
  const access = applyRole({}, input);
  return changeCollection('users', (users) => {
    if (users.some((u) => u.email === email)) throw new UserError('A user with this email ID already exists.');
    const now = new Date().toISOString();
    const user = {
      id: randomBytes(8).toString('hex'),
      name,
      email,
      ...access,
      owner: false,
      active: input.active !== false,
      passwordHash: hashPassword(input.password),
      sessionVersion: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: actor.email,
    };
    return { data: [...users, user], result: publicUser(user) };
  });
}

export function updateUser(actor, id, input) {
  return changeCollection('users', (users) => {
    const index = users.findIndex((u) => u.id === id);
    if (index === -1) throw new UserError('User not found.', 404);
    const target = users[index];
    if (target.owner) throw new UserError('The main account can only be changed by its owner, from Settings.', 403);
    if (target.id === actor.id) throw new UserError('Change your own account from Settings.', 403);

    const next = { ...target, ...applyRole(target, input), updatedAt: new Date().toISOString() };
    if (input.name !== undefined) next.name = cleanText(input.name) || target.name;
    if (input.email !== undefined) {
      const email = normEmail(input.email);
      if (!looksLikeEmail(email)) throw new UserError('Please enter a valid email ID.');
      if (users.some((u) => u.id !== id && u.email === email)) throw new UserError('A user with this email ID already exists.');
      next.email = email;
    }
    if (input.active !== undefined) next.active = Boolean(input.active);
    if (input.password) {
      checkPassword(input.password);
      next.passwordHash = hashPassword(input.password);
    }
    // Any change to sign-in or access signs that user out, so the new rules apply at once.
    const signOut = input.password || next.active !== target.active || next.email !== target.email
      || next.role !== target.role || next.sections.join() !== (target.sections || []).join();
    if (signOut) next.sessionVersion = (target.sessionVersion || 1) + 1;

    const data = users.slice();
    data[index] = next;
    return { data, result: publicUser(next) };
  });
}

export function deleteUser(actor, id) {
  return changeCollection('users', (users) => {
    const target = users.find((u) => u.id === id);
    if (!target) throw new UserError('User not found.', 404);
    if (target.owner) throw new UserError('The main account cannot be removed.', 403);
    if (target.id === actor.id) throw new UserError('You cannot remove your own account.', 403);
    return { data: users.filter((u) => u.id !== id), result: { deleted: id } };
  });
}

// ---------- your own account (Settings) ----------
export function updateOwnAccount(actor, input) {
  return changeCollection('users', (users) => {
    const index = users.findIndex((u) => u.id === actor.id);
    if (index === -1) throw new UserError('Account not found.', 404);
    const me = users[index];
    const next = { ...me, updatedAt: new Date().toISOString() };
    if (input.name !== undefined) next.name = cleanText(input.name) || me.name;

    const email = input.email !== undefined ? normEmail(input.email) : me.email;
    const changingLogin = email !== me.email || Boolean(input.newPassword);
    if (changingLogin && !passwordMatches(input.currentPassword || '', me.passwordHash)) {
      throw new UserError('Your current password is not correct.');
    }
    if (email !== me.email) {
      if (!looksLikeEmail(email)) throw new UserError('Please enter a valid email ID.');
      if (users.some((u) => u.id !== me.id && u.email === email)) throw new UserError('A user with this email ID already exists.');
      next.email = email;
    }
    if (input.newPassword) {
      checkPassword(input.newPassword);
      next.passwordHash = hashPassword(input.newPassword);
    }
    // A new ID or password ends sessions on other devices; this browser gets a fresh one.
    if (changingLogin) next.sessionVersion = (me.sessionVersion || 1) + 1;

    const data = users.slice();
    data[index] = next;
    return { data, result: next };
  });
}

export { canUse, isFullAdmin };
