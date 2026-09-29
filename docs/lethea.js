// LETHEA protokolu (v4) — terminal versiyası (lethea/*.py) ilə eyni format.
// DOM-dan asılı deyil: brauzerdə və Node-da (testlər) işləyir.
//
// Otaq: PBKDF2-SHA256 (300k) → enc/mac açarları; HMAC-SHA256 axın şifrəsi + encrypt-then-MAC.
// İmza: Ed25519. Şəxsi mesaj: X25519. Mümkün olanda brauzerin WebCrypto-su, yoxsa BigInt ehtiyatı.

const te = new TextEncoder();
const td = new TextDecoder();
const subtle = globalThis.crypto.subtle;

// ------------------------------------------------------------------ baytlar
export const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
export const unhex = (h) => Uint8Array.from(h.match(/../g) || [], (x) => parseInt(x, 16));
export const utf8 = (s) => te.encode(s);
export const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
export function b64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (b) => b64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s) => unb64(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
export const randomBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

// ------------------------------------------------------------------ SHA-256 / HMAC (sinxron, sürətli axın şifrəsi üçün)
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
const H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
const W = new Uint32Array(64);

function compress(h, b, o) {
  for (let i = 0; i < 16; i++, o += 4) W[i] = ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  for (let i = 16; i < 64; i++) {
    const x = W[i - 15], y = W[i - 2];
    const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
    const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
    W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
  }
  let a = h[0], bb = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], k = h[7];
  for (let i = 0; i < 64; i++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const t1 = (k + S1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const t2 = (S0 + ((a & bb) ^ (a & c) ^ (bb & c))) >>> 0;
    k = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = bb; bb = a; a = (t1 + t2) >>> 0;
  }
  h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + bb) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
  h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + k) >>> 0;
}

export class SHA256 {
  constructor() { this.h = Uint32Array.from(H0); this.buf = new Uint8Array(64); this.n = 0; this.total = 0; }
  clone() {
    const c = new SHA256();
    c.h.set(this.h); c.buf.set(this.buf); c.n = this.n; c.total = this.total;
    return c;
  }
  update(data) {
    let i = 0;
    this.total += data.length;
    if (this.n) {
      i = Math.min(64 - this.n, data.length);
      this.buf.set(data.subarray(0, i), this.n);
      this.n += i;
      if (this.n < 64) return this;
      compress(this.h, this.buf, 0);
      this.n = 0;
    }
    for (; i + 64 <= data.length; i += 64) compress(this.h, data, i);
    if (i < data.length) { this.buf.set(data.subarray(i), 0); this.n = data.length - i; }
    return this;
  }
  digest() {
    const bits = this.total * 8, n = this.n;
    const pad = new Uint8Array((n < 56 ? 56 : 120) - n + 8);
    pad[0] = 0x80;
    const hi = Math.floor(bits / 2 ** 32), lo = bits >>> 0, e = pad.length;
    pad[e - 8] = hi >>> 24; pad[e - 7] = (hi >>> 16) & 255; pad[e - 6] = (hi >>> 8) & 255; pad[e - 5] = hi & 255;
    pad[e - 4] = lo >>> 24; pad[e - 3] = (lo >>> 16) & 255; pad[e - 2] = (lo >>> 8) & 255; pad[e - 1] = lo & 255;
    this.update(pad);
    const out = new Uint8Array(32);
    for (let i = 0; i < 8; i++) {
      out[4 * i] = this.h[i] >>> 24; out[4 * i + 1] = (this.h[i] >>> 16) & 255;
      out[4 * i + 2] = (this.h[i] >>> 8) & 255; out[4 * i + 3] = this.h[i] & 255;
    }
    return out;
  }
}
export const sha256 = (data) => new SHA256().update(data).digest();

export class Hmac {
  constructor(key) {
    if (key.length > 64) key = sha256(key);
    const ipad = new Uint8Array(64).fill(0x36), opad = new Uint8Array(64).fill(0x5c);
    for (let i = 0; i < key.length; i++) { ipad[i] ^= key[i]; opad[i] ^= key[i]; }
    this.inner = new SHA256().update(ipad);
    this.outer = new SHA256().update(opad);
  }
  mac(msg) { return this.outer.clone().update(this.inner.clone().update(msg).digest()).digest(); }
}
export const hmac = (key, msg) => new Hmac(key).mac(msg);

// ------------------------------------------------------------------ otaq şifrələməsi
export class Room {
  constructor(enc, mac) {
    this.enc = enc; this.macKey = mac;
    this.encH = new Hmac(enc); this.macH = new Hmac(mac);
    this.id = hex(sha256(concat(utf8("room"), mac))).slice(0, 32);
  }
  static async fromPassword(password) {
    const base = await subtle.importKey("raw", utf8(password), "PBKDF2", false, ["deriveBits"]);
    const km = new Uint8Array(await subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: utf8("lethea-chat-v1"), iterations: 300000 }, base, 512));
    return new Room(km.slice(0, 32), km.slice(32));
  }
  xor(nonce, data) {
    const out = new Uint8Array(data.length), ctr = new Uint8Array(24);
    ctr.set(nonce);
    for (let i = 0, blk = 0; i < data.length; i += 32, blk++) {
      let v = blk;
      for (let j = 23; j >= 16; j--) { ctr[j] = v & 255; v = Math.floor(v / 256); }
      const ks = this.encH.mac(ctr);
      const n = Math.min(32, data.length - i);
      for (let j = 0; j < n; j++) out[i + j] = data[i + j] ^ ks[j];
    }
    return out;
  }
  tag(nonce, ct) { return this.macH.mac(concat(nonce, ct)).subarray(0, 16); }
  seal(data, nonce = randomBytes(16)) {
    const ct = this.xor(nonce, data);
    return concat(nonce, ct, this.tag(nonce, ct));
  }
  open(raw) {
    if (raw.length < 32) throw new Error("too short");
    const nonce = raw.subarray(0, 16), ct = raw.subarray(16, raw.length - 16), tag = raw.subarray(raw.length - 16);
    const want = this.tag(nonce, ct);
    let diff = 0;
    for (let i = 0; i < 16; i++) diff |= want[i] ^ tag[i];
    if (diff) throw new Error("bad tag");
    return this.xor(nonce, ct);
  }
  encrypt(obj) { return b64(this.seal(utf8(JSON.stringify(obj)))); }
  decrypt(body) { return JSON.parse(td.decode(this.open(unb64(body)))); }
  member(key) { return hex(this.macH.mac(utf8("member:" + key))).slice(0, 24); }
}

// ------------------------------------------------------------------ Ed25519 / X25519 (BigInt ehtiyatı)
const P = 2n ** 255n - 19n;
const L = 2n ** 252n + 27742317777372353535851937790883648493n;
const md = (a, m = P) => { const r = a % m; return r >= 0n ? r : r + m; };
const pw = (b, e, m = P) => { let r = 1n; b = md(b, m); while (e > 0n) { if (e & 1n) r = r * b % m; b = b * b % m; e >>= 1n; } return r; };
const inv = (x) => pw(x, P - 2n);
const D = md(-121665n * inv(121666n));
const SQRT_M1 = pw(2n, (P - 1n) / 4n);
const ZERO = [0n, 1n, 1n, 0n];
const le2n = (b) => { let n = 0n; for (let i = b.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(b[i]); return n; };
const n2le = (n, len = 32) => { const b = new Uint8Array(len); for (let i = 0; i < len; i++) { b[i] = Number(n & 255n); n >>= 8n; } return b; };

function edAdd(p, q) {
  const a = md((p[1] - p[0]) * (q[1] - q[0])), b = md((p[1] + p[0]) * (q[1] + q[0]));
  const c = md(2n * p[3] * q[3] * D), d = md(2n * p[2] * q[2]);
  const e = b - a, f = d - c, g = d + c, h = b + a;
  return [md(e * f), md(g * h), md(f * g), md(e * h)];
}
function edMul(s, p) { let q = ZERO; while (s > 0n) { if (s & 1n) q = edAdd(q, p); p = edAdd(p, p); s >>= 1n; } return q; }
function recoverX(y, sign) {
  if (y >= P) return null;
  const x2 = md((y * y - 1n) * inv(D * y * y + 1n));
  if (x2 === 0n) return sign ? null : 0n;
  let x = pw(x2, (P + 3n) / 8n);
  if (md(x * x - x2) !== 0n) x = md(x * SQRT_M1);
  if (md(x * x - x2) !== 0n) return null;
  if ((x & 1n) !== sign) x = P - x;
  return x;
}
const GY = md(4n * inv(5n)), GX = recoverX(GY, 0n), G = [GX, GY, 1n, md(GX * GY)];
function compressPt(p) { const zi = inv(p[2]), x = md(p[0] * zi), y = md(p[1] * zi); return n2le(y | ((x & 1n) << 255n)); }
function decompressPt(s) {
  if (s.length !== 32) return null;
  let y = le2n(s); const sign = y >> 255n; y &= (1n << 255n) - 1n;
  const x = recoverX(y, sign);
  return x === null ? null : [x, y, 1n, md(x * y)];
}
const sha512 = async (data) => new Uint8Array(await subtle.digest("SHA-512", data));
async function expand(seed) {
  const h = await sha512(seed);
  let a = le2n(h.subarray(0, 32));
  a &= (1n << 254n) - 8n; a |= 1n << 254n;
  return [a, h.subarray(32)];
}
const hint = async (data) => md(le2n(await sha512(data)), L);
export async function edPublic(seed) { return compressPt(edMul((await expand(seed))[0], G)); }
async function edSignJS(seed, msg) {
  const [a, prefix] = await expand(seed);
  const pub = compressPt(edMul(a, G));
  const r = await hint(concat(prefix, msg));
  const rs = compressPt(edMul(r, G));
  const s = md(r + (await hint(concat(rs, pub, msg))) * a, L);
  return concat(rs, n2le(s));
}
async function edVerifyJS(pub, msg, sig) {
  if (pub.length !== 32 || sig.length !== 64) return false;
  const A = decompressPt(pub), R = decompressPt(sig.subarray(0, 32));
  if (!A || !R) return false;
  const s = le2n(sig.subarray(32));
  if (s >= L) return false;
  const h = await hint(concat(sig.subarray(0, 32), pub, msg));
  const l = edMul(s, G), r = edAdd(R, edMul(h, A));
  return md(l[0] * r[2] - r[0] * l[2]) === 0n && md(l[1] * r[2] - r[1] * l[2]) === 0n;
}
function x25519JS(k, u) {
  const kk = Uint8Array.from(k); kk[0] &= 248; kk[31] &= 127; kk[31] |= 64;
  const kn = le2n(kk), x1 = le2n(u) & ((1n << 255n) - 1n);
  let x2 = 1n, z2 = 0n, x3 = x1, z3 = 1n, swap = 0n;
  for (let t = 254n; t >= 0n; t--) {
    const bit = (kn >> t) & 1n;
    if (swap ^ bit) { [x2, x3] = [x3, x2]; [z2, z3] = [z3, z2]; }
    swap = bit;
    const a = x2 + z2, b = x2 - z2, aa = md(a * a), bb = md(b * b), e = aa - bb;
    const c = x3 + z3, d = x3 - z3, da = md(d * a), cb = md(c * b);
    x3 = md((da + cb) ** 2n); z3 = md(x1 * (da - cb) ** 2n);
    x2 = md(aa * bb); z2 = md(e * (aa + 121665n * e));
  }
  if (swap) { x2 = x3; z2 = z3; }
  return n2le(md(x2 * inv(z2)));
}
export const x25519Public = (priv) => x25519JS(priv, n2le(9n));

// WebCrypto varsa ondan (daha sürətli), yoxsa BigInt ehtiyatı
const ED_PKCS8 = unhex("302e020100300506032b657004220420"), X_PKCS8 = unhex("302e020100300506032b656e04220420");
let native = null;
export function forceFallback(on = true) { native = on ? false : null; }
async function hasNative() {
  if (native === null) {
    try {
      await subtle.importKey("pkcs8", concat(ED_PKCS8, new Uint8Array(32)), { name: "Ed25519" }, false, ["sign"]);
      await subtle.importKey("raw", x25519Public(new Uint8Array(32).fill(1)), { name: "X25519" }, false, []);
      native = true;
    } catch { native = false; }
  }
  return native;
}
export async function edSign(seed, msg) {
  if (await hasNative()) {
    const key = await subtle.importKey("pkcs8", concat(ED_PKCS8, seed), { name: "Ed25519" }, false, ["sign"]);
    return new Uint8Array(await subtle.sign("Ed25519", key, msg));
  }
  return edSignJS(seed, msg);
}
export async function edVerify(pub, msg, sig) {
  if (pub.length !== 32 || sig.length !== 64) return false;
  if (await hasNative()) {
    try {
      const key = await subtle.importKey("raw", pub, { name: "Ed25519" }, false, ["verify"]);
      return await subtle.verify("Ed25519", key, sig, msg);
    } catch { return false; }
  }
  return edVerifyJS(pub, msg, sig);
}
export async function x25519(priv, pub) {
  if (await hasNative()) {
    const k = await subtle.importKey("pkcs8", concat(X_PKCS8, priv), { name: "X25519" }, false, ["deriveBits"]);
    const p = await subtle.importKey("raw", pub, { name: "X25519" }, false, []);
    return new Uint8Array(await subtle.deriveBits({ name: "X25519", public: p }, k, 256));
  }
  return x25519JS(priv, pub);
}

// ------------------------------------------------------------------ imzalı mesajlar və kimlik
export function canonical(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
}
export function signedBytes(room, payload) {
  const body = { ...payload };
  delete body.sig;
  return concat(utf8("lethea-v4\0" + room + "\0"), utf8(canonical(body)));
}
export async function verifyPayload(room, p) {
  try { return await edVerify(unhex(p.pub), signedBytes(room, p), unhex(p.sig)); } catch { return false; }
}
export function fingerprint(pubHex) {
  const h = hex(sha256(unhex(pubHex))).slice(0, 16).toUpperCase();
  return h.match(/..../g).join(" ");
}

export class Identity {
  static async create(seed, dhPriv) {
    const id = new Identity();
    id.seed = seed; id.dhPriv = dhPriv;
    id.pubHex = hex(await edPublic(seed));
    id.dhHex = hex(x25519Public(dhPriv));
    id.fingerprint = fingerprint(id.pubHex);
    return id;
  }
  static generate() { return Identity.create(randomBytes(32), randomBytes(32)); }
  static fromJSON(d) { return Identity.create(unhex(d.sign), unhex(d.dh)); }
  toJSON() { return { sign: hex(this.seed), dh: hex(this.dhPriv) }; }
  exportCode() { return "LID-" + b64url(concat(this.seed, this.dhPriv)); }
  static fromCode(code) {
    code = code.trim();
    if (!code.startsWith("LID-")) throw new Error("kimlik kodu deyil");
    const raw = unb64url(code.slice(4));
    if (raw.length !== 64) throw new Error("kimlik kodu zədəlidir");
    return Identity.create(raw.slice(0, 32), raw.slice(32));
  }
  async sign(room, payload) { return hex(await edSign(this.seed, signedBytes(room, payload))); }
  async dmRoom(room, peerDhHex) {
    const shared = await x25519(this.dhPriv, unhex(peerDhHex));
    if (shared.every((b) => b === 0)) throw new Error("pis açar");
    const info = "lethea-dm-v1|" + room + "|" + [this.dhHex, peerDhHex].sort().join("|");
    return new Room(hmac(shared, utf8(info + "|enc")), hmac(shared, utf8(info + "|mac")));
  }
}

// ------------------------------------------------------------------ dəvət kodları
export function makeInvite(password, name = "") {
  return "L4-" + b64url(utf8(JSON.stringify({ p: password, n: name })));
}
export function parseInvite(code) {
  code = code.trim().replace(/^['"]|['"]$/g, "");
  if (code.includes("#")) code = code.slice(code.lastIndexOf("#") + 1);
  if (!code.startsWith("L4-")) throw new Error("bu, LETHEA dəvət kodu deyil");
  let d;
  try { d = JSON.parse(td.decode(unb64url(code.slice(3)))); } catch { throw new Error("dəvət kodu zədəlidir"); }
  if (!d || typeof d.p !== "string" || !d.p) throw new Error("dəvət kodu zədəlidir");
  return { password: d.p, name: String(d.n || "").slice(0, 32) };
}

// ------------------------------------------------------------------ mətn formatı (HTML)
export const EMOJI = { ":)": "🙂", ":-)": "🙂", ":D": "😄", ";)": "😉", ":(": "🙁", ":'(": "😢", "<3": "❤️",
  ":P": "😛", ":p": "😛", ":o": "😮", ":O": "😮", "xD": "😆", "XD": "😆", ":*": "😘", "B)": "😎" };
export const REACTIONS = { "+1": "👍", "-1": "👎", "<3": "❤️", haha: "😂", wow: "😮", sad: "😢",
  ok: "👌", fire: "🔥", yes: "✅", no: "❌", "100": "💯", pray: "🙏" };
const WC = "\\p{L}\\p{N}_";
const FMT = new RegExp(
  "(?<url>https?://[^\\s<>\"']+)" +
  "|(?<code>`[^`\\n]+`)" +
  `|(?<bold>(?<![${WC}*])\\*(?=\\S)[^*\\n]+?(?<=\\S)\\*(?![${WC}*]))` +
  `|(?<italic>(?<![${WC}_])_(?=\\S)[^_\\n]+?(?<=\\S)_(?![${WC}_]))` +
  `|(?<strike>(?<![${WC}~])~(?=\\S)[^~\\n]+?(?<=\\S)~(?![${WC}~]))` +
  `|(?<mention>(?<![${WC}@])@[${WC}.\\-]+)` +
  "|(?<emoji>(?<!\\S)(?::-?\\)|:D|;\\)|:'?\\(|<3|:[Pp]|:[oO]|[xX]D|:\\*|B\\))(?!\\S))", "gu");
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export function mentions(text, nick) {
  const n = nick.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
  return new RegExp(`(?<![${WC}@])@${n}(?![${WC}.\\-])`, "iu").test(text);
}
export function fmtHTML(text, me) {
  let out = "", pos = 0;
  for (const m of text.matchAll(FMT)) {
    out += esc(text.slice(pos, m.index));
    pos = m.index + m[0].length;
    const g = m.groups, s = m[0];
    if (g.url) out += `<a href="${esc(s)}" target="_blank" rel="noopener noreferrer">${esc(s)}</a>`;
    else if (g.code) out += `<code>${esc(s.slice(1, -1))}</code>`;
    else if (g.bold) out += `<b>${esc(s.slice(1, -1))}</b>`;
    else if (g.italic) out += `<i>${esc(s.slice(1, -1))}</i>`;
    else if (g.strike) out += `<s>${esc(s.slice(1, -1))}</s>`;
    else if (g.mention) out += `<span class="mention${me && s.slice(1).toLowerCase() === me.toLowerCase() ? " me" : ""}">${esc(s)}</span>`;
    else out += EMOJI[s] || esc(s);
  }
  return out + esc(text.slice(pos));
}

// ------------------------------------------------------------------ Supabase
export class HttpError extends Error {
  constructor(status, message) { super(`HTTP ${status} ${message || ""}`.trim()); this.status = status; this.detail = message || ""; }
}
export class Supabase {
  constructor(url, key) { this.url = url.replace(/\/$/, ""); this.key = key; this.skew = 0; this._ttl = null; }
  now() { return Date.now() / 1000 + this.skew; }
  async req(method, path, { query, body, headers = {}, raw = false } = {}) {
    const qs = query ? "?" + new URLSearchParams(query) : "";
    const h = { apikey: this.key, ...headers };
    if (this.key.startsWith("eyJ")) h.Authorization = `Bearer ${this.key}`;
    if (body !== undefined && !(body instanceof Uint8Array)) { h["Content-Type"] = "application/json"; body = JSON.stringify(body); }
    const r = await fetch(this.url + path + qs, { method, headers: h, body });
    const date = r.headers.get("date");
    if (date) this.skew = Date.parse(date) / 1000 - Date.now() / 1000;
    if (!r.ok) {
      let msg = "";
      try { const j = await r.json(); msg = j.message || j.error || ""; } catch { /* boş cavab */ }
      throw new HttpError(r.status, msg);
    }
    if (raw) return new Uint8Array(await r.arrayBuffer());
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  }
  async fetch(room, { after = null, last = 300, limit = null } = {}) {
    const q = { select: "id,body,created_at", room: `eq.${room}` };
    if (after !== null) { q.id = `gt.${after}`; q.order = "id.asc"; if (limit) q.limit = String(limit); }
    else { q.order = "id.desc"; q.limit = String(last); }
    const rows = await this.req("GET", "/rest/v1/messages", { query: q });
    return after !== null ? rows : rows.reverse();
  }
  async fetchBefore(room, before, limit) {
    const rows = await this.req("GET", "/rest/v1/messages", { query: {
      select: "id,body,created_at", room: `eq.${room}`, id: `lt.${before}`, order: "id.desc", limit: String(limit) } });
    return rows.reverse();
  }
  insert(room, body, expiresAt = null) {
    const row = { room, body };
    if (expiresAt) row.expires_at = expiresAt;
    return this.req("POST", "/rest/v1/messages", { body: row, headers: { Prefer: "return=minimal" } });
  }
  async supportsTTL() {
    if (this._ttl === null) {
      try { await this.req("GET", "/rest/v1/messages", { query: { select: "expires_at", limit: "1" } }); this._ttl = true; }
      catch { this._ttl = false; }
    }
    return this._ttl;
  }
  presencePut(room, member, body) {
    return this.req("POST", "/rest/v1/presence", { query: { on_conflict: "room,member" }, body: { room, member, body },
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" } });
  }
  presenceGet(room) {
    return this.req("GET", "/rest/v1/presence", { query: { select: "member,body,updated_at", room: `eq.${room}` } });
  }
  upload(path, bytes) {
    return this.req("POST", `/storage/v1/object/files/${path}`, { body: bytes,
      headers: { "Content-Type": "application/octet-stream", "x-upsert": "false" } });
  }
  download(path) { return this.req("GET", `/storage/v1/object/files/${path}`, { raw: true }); }
  async ping() { const t = performance.now(); await this.req("GET", "/rest/v1/messages", { query: { select: "id", limit: "1" } }); return Math.round(performance.now() - t); }
}

// ------------------------------------------------------------------ Realtime ("qapı zəngi")
export class Realtime {
  constructor(url, key, room, onMessages, onPresence) {
    Object.assign(this, { url, key, room, onMessages, onPresence });
    this.connected = false; this.disabled = false; this.stopped = false; this.delay = 1000; this.ref = 0;
  }
  start() { this.connect(); return this; }
  close() { this.stopped = true; clearInterval(this.hb); try { this.ws?.close(); } catch { /* artıq bağlıdır */ } }
  send(topic, event, payload) { this.ws.send(JSON.stringify({ topic, event, payload, ref: String(++this.ref), join_ref: "1" })); }
  connect() {
    if (this.stopped || this.disabled) return;
    const host = this.url.replace(/^http/, "ws");
    const ws = this.ws = new WebSocket(`${host}/realtime/v1/websocket?apikey=${encodeURIComponent(this.key)}&vsn=1.0.0`);
    const topic = `realtime:lethea-${this.room}`, filter = `room=eq.${this.room}`;
    ws.onopen = () => {
      const payload = { config: { broadcast: { self: false }, presence: { key: "" }, postgres_changes: [
        { event: "INSERT", schema: "public", table: "messages", filter },
        { event: "*", schema: "public", table: "presence", filter }] } };
      if (this.key.startsWith("eyJ")) payload.access_token = this.key;
      this.send(topic, "phx_join", payload);
      this.hb = setInterval(() => { try { this.send("phoenix", "heartbeat", {}); } catch { /* qopub */ } }, 25000);
    };
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data), p = m.payload || {};
      if (m.topic !== topic) return;
      if (m.event === "system") {
        if (p.status === "ok") { this.connected = true; this.delay = 1000; }
        else { if (String(p.message).includes("Unable to subscribe")) this.disabled = true; ws.close(); }
      } else if (m.event === "postgres_changes") {
        (p.data?.table === "messages" ? this.onMessages : this.onPresence)();
      } else if (m.event === "phx_reply" && p.status !== "ok") ws.close();
    };
    ws.onclose = () => {
      this.connected = false; clearInterval(this.hb);
      if (!this.stopped && !this.disabled) { setTimeout(() => this.connect(), this.delay); this.delay = Math.min(this.delay * 2, 30000); }
    };
    ws.onerror = () => { /* onclose işləyəcək */ };
  }
}

// ------------------------------------------------------------------ çat sessiyası (terminaldakı ChatSession-un tərcüməsi)
export const SHOWN = ["msg", "me", "file", "dm"];
const REPLAY_WINDOW = 600, ONLINE_AGE = 25, TYPING_AGE = 7;
const sleepBell = () => {
  let resolve = null, rung = false;
  return {
    ring() { rung = true; if (resolve) resolve(true); },
    wait(ms) {
      if (rung) { rung = false; return Promise.resolve(true); }
      return new Promise((res) => {
        const t = setTimeout(() => { resolve = null; res(false); }, ms);
        resolve = (v) => { clearTimeout(t); resolve = null; rung = false; res(v); };
      });
    },
  };
};
export function parseTTL(s) {
  const m = /^(\d+)\s*(s|sn|m|dəq|deq|h|saat|d|gün|gun)?$/.exec(String(s).trim().toLowerCase());
  if (!m) return null;
  const unit = { s: 1, sn: 1, m: 60, dəq: 60, deq: 60, h: 3600, saat: 3600, d: 86400, gün: 86400, gun: 86400 }[m[2] || "m"];
  return Math.max(60, Math.min(Number(m[1]) * unit, 7 * 86400));
}
export function fmtTTL(sec) {
  for (const [u, n] of [[86400, "gün"], [3600, "saat"], [60, "dəq"]]) if (sec >= u) return `${Math.round(sec / u)} ${n}`;
  return `${Math.floor(sec)} san`;
}

export class ChatCore {
  // cfg: {nick, trust, rooms, ...}; save(): cfg-ni yadda saxlayır; ui: {entry, line, warn, status, error}
  constructor({ db, room, ident, cfg, password, save, ui, realtime = true }) {
    Object.assign(this, { db, room, ident, cfg, password, save, ui, useRealtime: realtime });
    this.nick = cfg.nick;
    this.me = room.member(ident.pubHex);
    if (!cfg.device) { cfg.device = hex(randomBytes(8)); save(); }
    this.dev = cfg.device;
    this.pmember = room.member(`${ident.pubHex}:${this.dev}`); // presence: hər cihazın öz sətri
    this.lastId = 0; this.firstId = null;
    this.entries = new Map(); this.numbers = new Map(); this.nextNo = 1; this.orphans = new Map();
    this.peers = new Map(); this.keys = new Map(); this.lastPub = new Map(); this.idcache = new Map();
    this.warned = new Set();
    cfg.trust ??= {}; this.pins = cfg.trust[room.id] ??= {};
    this.pins[this.nick] ??= [];
    if (!this.pins[this.nick].includes(ident.pubHex)) { this.pins[this.nick].push(ident.pubHex); save(); }
    this.presenceOk = true; this.ttl = null; this.away = false; this.awayReason = "";
    this.typingAt = 0; this.typingPushed = 0; this.needPush = false; this.stopped = false; this.fastPoll = false;
    this.msgBell = sleepBell(); this.presenceBell = sleepBell(); this.rt = null;
  }
  // -- göndərmə
  async send(kind, text = "", extra = {}) {
    const now = Math.floor(this.db.now());
    const p = { v: 4, nick: this.nick, from: this.me, kind, text, ts: now, pub: this.ident.pubHex, ...extra };
    let expires = null;
    if (this.ttl && SHOWN.includes(kind)) { p.exp = now + this.ttl; expires = new Date(p.exp * 1000).toISOString(); }
    p.sig = await this.ident.sign(this.room.id, p);
    await this.db.insert(this.room.id, this.room.encrypt(p), expires);
    this.msgBell.ring();
  }
  // -- qəbul
  decode(row) { try { return [this.room.decrypt(row.body), Date.parse(row.created_at) / 1000]; } catch { return [null, null]; } }
  pin(nick, pub) {
    const pins = this.pins[nick] ??= [];
    if (pins.includes(pub)) return true;
    if (pins.length || nick === this.nick) return false;
    pins.push(pub); this.save();
    return true;
  }
  async classify(m, ts) {
    if (!m.sig) return "unsigned";
    if (typeof m.pub !== "string" || m.from !== this.room.member(m.pub) || !(await verifyPayload(this.room.id, m))) return "bad";
    if (!Number.isInteger(m.ts) || Math.abs(m.ts - ts) > REPLAY_WINDOW) return "bad";
    const nick = String(m.nick ?? "?");
    this.lastPub.set(nick, m.pub);
    if (!this.pin(nick, m.pub)) return "impostor";
    if (m.dh) this.keys.set(nick, { pub: m.pub, dh: m.dh });
    return "ok";
  }
  warn(m, status, live) {
    const nick = String(m.nick ?? "?"), key = `${nick}|${m.pub}|${status}`;
    if (this.warned.has(key)) return;
    if (status === "impostor") {
      this.warned.add(key);
      this.ui.warn(`⚠ DİQQƏT: '${nick}' adı ilə BAŞQA açar yazır (${fingerprint(m.pub)}). Bu, başqası ola bilər! ` +
        `Əgər o, həqiqətən ${nick}-dirsə (yeni cihaz) — ondan soruş, sonra: /trust ${nick}`, "danger");
    } else if (status === "bad") {
      this.warned.add(key);
      this.ui.warn(`⚠ '${nick}' adından saxta və ya təkrarlanmış imzalı mesaj gəldi — göstərilmir`, "danger");
    } else if (status === "unsigned" && live && this.pins[nick]?.length) {
      this.warned.add(key);
      this.ui.warn(`⚠ '${nick}' imzasız yazır — ya köhnə versiyadır, ya da başqasıdır`, "warn");
    }
  }
  async apply(id, m, ts, status, live) {
    const kind = m.kind;
    this.warn(m, status, live);
    if (status === "bad") return null;
    if (SHOWN.includes(kind)) {
      const e = await this.makeEntry(id, m, ts, status);
      if (e && live) this.ui.entry(e, true);
      return e;
    }
    if (["edit", "del", "react"].includes(kind)) {
      if (status === "impostor") return null;
      const e = this.entries.get(m.target);
      if (!e) { if (!this.orphans.has(m.target)) this.orphans.set(m.target, []); this.orphans.get(m.target).push([m, ts, status]); return null; }
      this.applyAction(e, m, ts, status, live);
      return null;
    }
    if (live && (kind === "join" || kind === "leave")) this.ui.line({ kind, nick: String(m.nick ?? "?"), ts, status });
    return null;
  }
  async makeEntry(id, m, ts, status) {
    const e = { id, kind: m.kind, nick: String(m.nick ?? "?"), from: m.from, text: String(m.text ?? "").slice(0, 4000), ts, status,
      mine: m.from === this.me, edited: false, deleted: false, re: m.re ?? null, exp: m.exp ?? null, reactions: new Map() };
    if (m.kind === "file") e.file = m.file && typeof m.file === "object" ? m.file : {};
    if (m.kind === "dm") {
      if (m.to !== this.me && !e.mine) return null;
      e.tonick = String(m.tonick ?? "?");
      e.text = await this.openDM(m, e.mine);
    }
    e.no = this.nextNo++;
    this.numbers.set(e.no, id); this.entries.set(id, e);
    for (const [om, ots, os] of this.orphans.get(id) || []) this.applyAction(e, om, ots, os, false);
    this.orphans.delete(id);
    return e;
  }
  async openDM(m, mine) {
    try {
      const box = await this.ident.dmRoom(this.room.id, mine ? m.todh : m.dh);
      return String(JSON.parse(td.decode(box.open(unb64(m.box)))).text).slice(0, 4000);
    } catch { return null; }
  }
  applyAction(e, m, ts, status, live) {
    const who = String(m.nick ?? "?");
    if (m.kind === "edit" || m.kind === "del") {
      if (e.from !== m.from || e.deleted || (e.status === "ok" && status !== "ok")) return;
      if (m.kind === "edit" && e.kind === "msg") { e.text = String(m.text ?? "").slice(0, 4000); e.edited = true; }
      else if (m.kind === "del") e.deleted = true;
      else return;
    } else {
      const emoji = String(m.emoji ?? "").slice(0, 16);
      if (!emoji || e.deleted) return;
      if (!e.reactions.has(emoji)) e.reactions.set(emoji, new Set());
      e.reactions.get(emoji).add(who);
    }
    if (live) this.ui.update(e, { kind: m.kind, who, ts });
  }
  // -- presence
  isTyping() { return Date.now() / 1000 - this.typingAt < 5; }
  async pushPresence(online = true) {
    const body = { kind: "presence", nick: this.nick, online, typing: online && this.isTyping(), read: this.lastId,
      away: !!this.away, reason: this.awayReason, pub: this.ident.pubHex, dh: this.ident.dhHex, dev: this.dev,
      ts: Math.floor(this.db.now()) };
    body.sig = await this.ident.sign(this.room.id, body);
    await this.db.presencePut(this.room.id, this.pmember, this.room.encrypt(body));
  }
  // presence imzası: bütün sahələr (onlayn, yazır, oxundu) imzalıdır, köhnə nüsxənin təkrarı rədd olunur
  async checkPresence(member, p, updated) {
    const { pub, dev, sig } = p, nick = String(p.nick ?? "?");
    if (![pub, dev, sig].every((x) => typeof x === "string")) return "unsigned";
    const cached = this.idcache.get(member);
    if (cached && cached[0] === sig) return cached[1];
    const ok = member === this.room.member(`${pub}:${dev}`) && Number.isInteger(p.ts) &&
      Math.abs(p.ts - updated) <= 120 && await verifyPayload(this.room.id, p);
    const res = !ok ? "bad" : this.pin(nick, pub) ? "ok" : "impostor";
    if (ok) this.lastPub.set(nick, pub);
    if (res === "ok" && typeof p.dh === "string") this.keys.set(nick, { pub, dh: p.dh });
    this.idcache.set(member, [sig, res]);
    return res;
  }
  async pullPresence() {
    const now = this.db.now(), peers = new Map();
    for (const row of await this.db.presenceGet(this.room.id)) {
      if (row.member === this.pmember) continue;
      let p;
      try { p = this.room.decrypt(row.body); } catch { continue; }
      const updated = Date.parse(row.updated_at) / 1000, nick = String(p.nick ?? "?");
      const id = await this.checkPresence(row.member, p, updated);
      if (id === "bad" || id === "impostor" || (p.pub === this.ident.pubHex && nick === this.nick)) {
        if (id === "impostor") this.warn(p, "impostor", true); // adı oğurlayan başqa açar
        continue; // saxta/təkrar presence və ya mənim eyni adlı digər cihazım
      }
      const age = now - updated, online = !!p.online && age < ONLINE_AGE;
      peers.set(row.member, { nick, online, typing: online && !!p.typing && age < TYPING_AGE,
        read: Number(p.read) || 0, away: !!p.away, reason: String(p.reason || "").slice(0, 60), id });
    }
    this.peers = peers;
  }
  onlinePeers() {
    const byNick = new Map();
    for (const p of this.peers.values()) if (p.online && !byNick.has(p.nick)) byNick.set(p.nick, p);
    return [...byNick.values()].sort((a, b) => a.nick.localeCompare(b.nick));
  }
  typers() { return [...new Set([...this.peers.values()].filter((p) => p.typing).map((p) => p.nick))].sort(); }
  myLast(kinds = SHOWN) {
    const ids = [...this.entries.keys()].sort((a, b) => b - a);
    for (const id of ids) { const e = this.entries.get(id); if (e.mine && kinds.includes(e.kind) && !e.deleted) return id; }
    return null;
  }
  receipt() {
    const mine = this.myLast();
    if (!mine || !this.presenceOk) return null;
    const readers = [...new Set([...this.peers.values()].filter((p) => p.read >= mine).map((p) => p.nick))].sort();
    return readers.length ? { read: true, by: readers } : { read: false, by: [] };
  }
  realtimeOk() { return !!(this.rt && this.rt.connected && !this.fastPoll); }
  typing(text) {
    const now = Date.now() / 1000;
    if (this.away === "auto") { this.away = false; this.needPush = true; this.presenceBell.ring(); }
    this.typingAt = text.trim() && !text.startsWith("/") ? now : 0;
    if (this.typingAt && now - this.typingPushed > 3) { this.typingPushed = now; this.needPush = true; this.presenceBell.ring(); }
  }
  setAway(mode, reason = "") { this.away = mode; this.awayReason = mode ? reason.slice(0, 60) : ""; this.needPush = true; this.presenceBell.ring(); }
  // -- dövrlər
  async start() {
    const rows = await this.db.fetch(this.room.id, { last: 300 });
    this.firstId = rows.length ? rows[0].id : null;
    for (const row of rows) {
      this.lastId = row.id;
      const [m, ts] = this.decode(row);
      if (m) await this.apply(row.id, m, ts, await this.classify(m, ts), false);
    }
    await this.send("join", "", { dh: this.ident.dhHex });
    try { await this.pushPresence(); await this.pullPresence(); } catch (e) { if (e.status === 404) this.presenceOk = false; }
    if (this.useRealtime) this.rt = new Realtime(this.db.url, this.db.key, this.room.id, () => this.msgBell.ring(), () => this.presenceBell.ring()).start();
    this.pollMessages();
    this.presenceLoop();
  }
  async pollMessages() {
    let failing = false;
    while (!this.stopped) {
      const rung = await this.msgBell.wait(this.realtimeOk() ? 10000 : 1000);
      if (this.stopped) break;
      try {
        const rows = await this.db.fetch(this.room.id, { after: this.lastId });
        if (rows.length && !rung && this.realtimeOk() && this.db.now() - Date.parse(rows.at(-1).created_at) / 1000 > 3) this.fastPoll = true;
        for (const row of rows) {
          this.lastId = row.id;
          const [m, ts] = this.decode(row);
          if (!m) continue;
          const e = await this.apply(row.id, m, ts, await this.classify(m, ts), true);
          if (e && !e.mine) this.ui.incoming?.(e);
        }
        if (rows.length) { this.needPush = true; this.presenceBell.ring(); this.ui.status(); }
        if (failing) this.ui.warn("● əlaqə bərpa olundu", "ok");
        failing = false;
      } catch (err) {
        if (!failing) this.ui.warn(`● əlaqə problemi: ${err.message}`, "danger");
        failing = true;
      }
    }
  }
  async presenceLoop() {
    let lastPush = 0;
    while (!this.stopped) {
      if (this.presenceOk) {
        try {
          if (this.needPush || Date.now() / 1000 - lastPush > 10) { this.needPush = false; await this.pushPresence(); lastPush = Date.now() / 1000; }
          await this.pullPresence();
        } catch (e) { if (e.status === 404) this.presenceOk = false; }
      }
      this.ui.status();
      await this.presenceBell.wait(this.realtimeOk() ? 8000 : 2000);
    }
  }
  async stop() {
    this.stopped = true;
    this.msgBell.ring(); this.presenceBell.ring();
    this.rt?.close();
    try { await this.send("leave"); } catch { /* şəbəkə yoxdur */ }
    try { await this.pushPresence(false); } catch { /* şəbəkə yoxdur */ }
    const saved = (this.cfg.rooms || []).find((r) => r.password === this.password);
    if (saved) saved.last_id = this.lastId;
    this.save();
  }
  // -- əməliyyatlar
  byNumber(n) { return this.entries.get(this.numbers.get(Number(String(n).replace(/^#/, "")))) || null; }
  async dm(nick, text) {
    const k = this.keys.get(nick);
    if (!k) throw new Error(`'${nick}' üçün təsdiqlənmiş açar yoxdur — o, bu otaqda LETHEA v4 ilə görünməlidir`);
    const box = await this.ident.dmRoom(this.room.id, k.dh);
    await this.send("dm", "", { to: this.room.member(k.pub), tonick: nick, todh: k.dh, dh: this.ident.dhHex,
      box: b64(box.seal(utf8(JSON.stringify({ text: text.slice(0, 4000) })))) });
  }
  async sendFile(name, bytes) {
    if (bytes.length > 20 * 1024 * 1024) throw new Error("fayl çox böyükdür (limit 20 MB)");
    const path = `${this.room.id}/${hex(randomBytes(16))}`;
    await this.db.upload(path, this.room.seal(bytes));
    await this.send("file", "", { file: { name, size: bytes.length, path } });
  }
  async getFile(e) { return this.room.open(await this.db.download(e.file.path)); }
  async more(n = 50) {
    if (this.firstId === null) return [];
    const rows = await this.db.fetchBefore(this.room.id, this.firstId, n);
    if (!rows.length) return [];
    this.firstId = rows[0].id;
    const added = [];
    for (const row of rows) {
      const [m, ts] = this.decode(row);
      if (!m) continue;
      const e = await this.apply(row.id, m, ts, await this.classify(m, ts), false);
      if (e) added.push(e);
    }
    return added;
  }
  search(q) {
    const ql = q.toLowerCase();
    return [...this.entries.values()].filter((e) => !e.deleted &&
      ((e.text || "").toLowerCase().includes(ql) || String(e.file?.name || "").toLowerCase().includes(ql)));
  }
  trust(nick) {
    const pub = this.lastPub.get(nick);
    if (!pub) return false;
    const pins = this.pins[nick] ??= [];
    if (!pins.includes(pub)) { pins.push(pub); this.save(); }
    this.idcache.clear();
    for (const w of [...this.warned]) if (w.startsWith(nick + "|")) this.warned.delete(w);
    return true;
  }
}
