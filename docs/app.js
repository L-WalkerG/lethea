// LETHEA veb klienti — interfeys. Protokol və şifrələmə web/lethea.js-dədir.
import * as L from "./lethea.js";

const RELAY_URL = atob("aHR0cHM6Ly94Z2V4bGx0bnpzaXNtZnFmd3FhYi5zdXBhYmFzZS5jbw=="); // server ünvanı
const RELAY_KEY = "sb_publishable_2BJfAWkWdgLaYEPCVZDIgQ_rYw7KcJE";
const VERSION = "4.1";
const RELEASES = "L-WalkerG/lethea";
const WEB_URL = "https://l-walkerg.github.io/lethea/";
const PALETTE = ["#ff5f5f", "#ffaf00", "#ffff5f", "#87ff87", "#5fffff", "#87afff",
  "#d787ff", "#ff87ff", "#afffff", "#ffffaf", "#afd787", "#ff875f"];
const WORDS = ["qara", "ay", "dəniz", "külək", "od", "bulud", "dağ", "şimşək", "ulduz", "qartal", "pələng", "canavar",
  "duman", "xəzər", "gecə", "polad", "kölgə", "işıq", "qum", "buz", "çay", "göl", "meşə", "yarpaq",
  "alma", "nar", "üzüm", "ərik", "gilas", "badam", "qoz", "bal", "duz", "çörək", "dəmir", "mis",
  "gümüş", "qızıl", "daş", "torpaq", "yağış", "qar", "şeh", "səhər", "axşam", "bahar", "yay", "payız",
  "qış", "dalğa", "sahil", "ada", "körpü", "qala", "bayraq", "kitab", "qələm", "sim", "tar", "saz",
  "zurna", "balaban", "kaman", "nağara"];
const QUICK = ["👍", "❤️", "😂", "😮", "😢", "🔥"];
const WEAK = 12;
const MAX_FILE = 20 * 1024 * 1024;

const $ = (id) => document.getElementById(id);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
  return el;
}

// ------------------------------------------------------------------ ayarlar (terminaldakı ~/.lethea.json ilə eyni quruluş)
const cfg = (() => { try { return JSON.parse(localStorage.getItem("lethea") || "{}"); } catch { return {}; } })();
const save = () => { try { localStorage.setItem("lethea", JSON.stringify(cfg)); } catch { /* gizli rejim */ } };
cfg.rooms ??= [];
cfg.nick ??= "qonaq" + Math.floor(100 + Math.random() * 900);
cfg.sound ??= true;
cfg.notify ??= false;

const db = new L.Relay(RELAY_URL, RELAY_KEY);
let ident = null, core = null, current = null, chatReady = false, pendingInvite = null;
let replyTo = null, editing = null, hiddenTimer = null, unseen = 0;
const els = new Map(), pendingSys = [], unread = new Map(), roomCache = new Map();

const roomFor = async (pw) => {
  if (!roomCache.has(pw)) roomCache.set(pw, await L.Room.fromPassword(pw));
  return roomCache.get(pw);
};
const savedRoom = (pw) => cfg.rooms.find((r) => r.password === pw);
function genPassword() {
  const r = L.randomBytes(7);
  return [...r.subarray(0, 5)].map((b) => WORDS[b & 63]).join("-") + "-" + (1000 + (((r[5] << 8) | r[6]) % 9000));
}

// ------------------------------------------------------------------ köməkçilər
let toastTimer;
function toast(text, ms = 2600) {
  const t = $("toast");
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}
function loading(text) {
  $("loading").hidden = !text;
  if (text) $("loadingText").textContent = text;
}
const pad2 = (n) => String(n).padStart(2, "0");
const hhmm = (ts) => { const d = new Date(ts * 1000); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const nickColor = (n) => PALETTE[L.sha256(L.utf8(n))[0] % PALETTE.length];
const human = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast("Kopyalandı ✓"); } catch { toast("Kopyalamaq alınmadı — əl ilə seç"); }
}
function snippet(e, n = 60) {
  if (!e) return "köhnə mesaj";
  if (e.deleted) return "[silindi]";
  const t = e.kind === "file" ? (e.file.name || "fayl") : (e.text ?? "🔒");
  return `${e.nick}: ${t.replace(/\n/g, " ").slice(0, n)}`;
}
function handleError(e) {
  const detail = e?.detail || e?.message || String(e);
  if (detail.includes("expires_at")) {
    if (core) core.ttl = null;
    updateStatus();
    toast("✗ Yox olan mesajlar üçün serverdə yeniləmə lazımdır — ⏳ bağlandı", 4500);
  } else if (detail.includes("rate limit")) toast("Çox tez-tez yazırsan — bir az gözlə", 4000);
  else toast("✗ " + detail, 4000);
}
async function run(fn) { try { await fn(); } catch (e) { handleError(e); } }

// ------------------------------------------------------------------ dialoqlar
const dlg = $("dlg");
function openDialog(title, ...content) {
  dlg.onclose = null;
  dlg.replaceChildren(h("h3", {}, title), ...content.filter(Boolean),
    h("div", { class: "row" }, h("button", { class: "grow", onclick: () => dlg.close() }, "Bağla")));
  dlg.showModal();
}
function openSheet(title, items) {
  dlg.onclose = null;
  dlg.replaceChildren(h("h3", {}, title), h("div", { class: "sheet" }, items.filter(Boolean),
    h("button", { onclick: () => dlg.close() }, "Bağla")));
  dlg.showModal();
}
const sheetBtn = (label, fn, cls) => h("button", { class: cls, onclick: () => { dlg.close(); fn(); } }, label);
function ask(title, { placeholder = "", value = "", ok = "Təsdiq" } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (settled) return; settled = true; dlg.close(); resolve(v); };
    const input = h("input", { placeholder, value, spellcheck: "false" });
    input.addEventListener("keydown", (ev) => { if (ev.key === "Enter") done(input.value.trim()); });
    dlg.replaceChildren(h("h3", {}, title), input, h("div", { class: "row" },
      h("button", { class: "grow", onclick: () => done(null) }, "Ləğv et"),
      h("button", { class: "primary grow", onclick: () => done(input.value.trim()) }, ok)));
    dlg.onclose = () => done(null);
    dlg.showModal();
    input.focus();
  });
}

function inviteLines(code) {
  return [
    ["Telefon (brauzer)", `${WEB_URL}#${code}`],
    ["Windows (PowerShell) — quraşdırıb dərhal qoşulur",
      `irm https://raw.githubusercontent.com/${RELEASES}/main/install.ps1 | iex; lethea join ${code}`],
    ["Linux / macOS — quraşdırıb dərhal qoşulur",
      `curl -fsSL https://raw.githubusercontent.com/${RELEASES}/main/install.sh | sh && ~/.local/bin/lethea join ${code}`],
    ["LETHEA artıq quraşdırılıbsa", `lethea join ${code}`],
  ];
}
function showInvite(password, name, enter = false) {
  const code = L.makeInvite(password, name || "");
  const blocks = inviteLines(code).map(([title, cmd]) => h("div", {},
    h("p", { class: "muted" }, title),
    h("div", { class: "cmd" }, h("pre", {}, cmd), h("button", { onclick: () => copy(cmd) }, "Kopyala"))));
  openDialog("Dəvət" + (name ? ` · ${name}` : ""), ...blocks,
    navigator.share ? h("button", { class: "primary", onclick: () => navigator.share({ title: "LETHEA dəvəti",
      text: `LETHEA otağına dəvət${name ? ` (${name})` : ""}`, url: `${WEB_URL}#${code}` }).catch(() => {}) }, "Paylaş") : null,
    h("p", { class: "muted warn-text" }, "⚠ Kodun içində otağın şifrəsi var — yalnız etibar etdiyin adama göndər."),
    enter ? h("button", { class: "primary", onclick: () => { dlg.close(); enterRoom(password); } }, "Otağa gir") : null);
}

// ------------------------------------------------------------------ kimlik
async function initIdentity() {
  try { ident = cfg.identity ? await L.Identity.fromJSON(cfg.identity) : null; } catch { ident = null; }
  if (!ident) { ident = await L.Identity.generate(); cfg.identity = ident.toJSON(); save(); }
  $("fp").textContent = ident.fingerprint;
}
$("idExport").onclick = () => openDialog("Kimliyi köçür",
  h("p", { class: "warn-text" }, "⚠ Bu kod sənin ŞƏXSİ açarındır. Yalnız öz cihazına köçür, heç kimə göndərmə!"),
  h("div", { class: "cmd" }, h("pre", {}, ident.exportCode()), h("button", { onclick: () => copy(ident.exportCode()) }, "Kopyala")),
  h("p", { class: "muted" }, "Terminalda: menyu → [6] Kimlik və cihazlar → [2] Gətir"));
$("idImport").onclick = async () => {
  const code = await ask("Kimliyi gətir", { placeholder: "LID-… (terminalda: [6] → [1])", ok: "Gətir" });
  if (!code) return;
  try {
    ident = await L.Identity.fromCode(code);
    cfg.identity = ident.toJSON();
    save();
    $("fp").textContent = ident.fingerprint;
    toast("Kimlik gətirildi ✓");
  } catch (e) { toast("✗ " + e.message); }
};

// ------------------------------------------------------------------ giriş ekranı
function readInviteFromHash() {
  const hash = decodeURIComponent(location.hash.slice(1));
  if (!hash) return;
  history.replaceState(null, "", location.pathname + location.search);
  try { pendingInvite = L.parseInvite(hash); } catch { toast("Dəvət linki zədəlidir"); }
}
function showLogin() {
  $("chat").hidden = true;
  $("login").hidden = false;
  document.title = "LETHEA";
  $("nick").value = cfg.nick;
  $("inviteCard").hidden = !pendingInvite;
  if (pendingInvite) $("inviteText").textContent = `Səni “${pendingInvite.name || "otaq"}” otağına dəvət ediblər.`;
  $("footer").textContent = `LETHEA v${VERSION} · veb · uçdan-uca şifrələnmiş`;
  renderRooms();
  refreshUnread();
}
function renderRooms() {
  $("roomsCard").hidden = !cfg.rooms.length;
  $("rooms").replaceChildren(...cfg.rooms.map((r) => {
    const n = unread.get(r.password);
    return h("div", { class: "room" },
      h("span", { class: "name" }, r.name),
      n?.count ? h("span", { class: "badge" }, `${n.count}${n.more ? "+" : ""}`) : null,
      h("button", { class: "primary", onclick: () => enterRoom(r.password) }, "Gir"),
      h("button", { "aria-label": "Dəvət", onclick: () => showInvite(r.password, r.name) }, "✉"),
      h("button", { class: "danger", "aria-label": "Sil", onclick: () => {
        if (!confirm(`“${r.name}” siyahıdan silinsin?`)) return;
        cfg.rooms = cfg.rooms.filter((x) => x !== r);
        save();
        renderRooms();
      } }, "✕"));
  }));
}
async function refreshUnread() {
  await Promise.all(cfg.rooms.filter((r) => r.last_id).map(async (r) => {
    try {
      const room = await roomFor(r.password), me = room.member(ident.pubHex);
      const rows = await db.fetch(room.id, { after: r.last_id, limit: 100 });
      let count = 0;
      for (const row of rows) {
        let m;
        try { m = room.decrypt(row.body); } catch { continue; }
        if ((["msg", "me", "file"].includes(m.kind) && m.from !== me) || (m.kind === "dm" && m.to === me)) count++;
      }
      unread.set(r.password, { count, more: rows.length >= 100 });
    } catch { /* şəbəkə */ }
  }));
  if (!$("login").hidden) renderRooms();
}
$("nick").onchange = () => {
  const v = $("nick").value.trim().slice(0, 24);
  if (v) { cfg.nick = v; save(); } else $("nick").value = cfg.nick;
};
$("password").oninput = () => {
  const v = $("password").value.trim();
  $("weak").hidden = !v || v.includes("L4-") || v.length >= WEAK;
};
$("password").onkeydown = (ev) => { if (ev.key === "Enter") $("enter").click(); };
$("enter").onclick = () => {
  let pw = $("password").value.trim(), name = $("saveName").value.trim();
  if (!pw) return toast("Şifrəni və ya dəvət kodunu yaz");
  if (pw.includes("L4-")) {
    try { const inv = L.parseInvite(pw); pw = inv.password; name ||= inv.name || "Dəvət"; } catch (e) { return toast(e.message); }
  }
  if (name && !savedRoom(pw)) { cfg.rooms.push({ name: name.slice(0, 32), password: pw }); save(); }
  $("password").value = "";
  $("saveName").value = "";
  $("weak").hidden = true;
  enterRoom(pw);
};
$("newRoom").onclick = async () => {
  const name = await ask("Yeni otaq", { placeholder: "Otağın adı", value: "Dostlar", ok: "Yarat" });
  if (name == null) return;
  const pw = genPassword();
  cfg.rooms.push({ name: name.slice(0, 32) || "Otaq", password: pw });
  save();
  renderRooms();
  showInvite(pw, name, true);
};
$("inviteJoin").onclick = () => {
  const inv = pendingInvite;
  pendingInvite = null;
  if (!savedRoom(inv.password)) { cfg.rooms.push({ name: inv.name || "Dəvət", password: inv.password }); save(); }
  enterRoom(inv.password);
};

// ------------------------------------------------------------------ otaq
const ui = {
  entry(e) {
    if (!chatReady) return;
    const near = nearBottom();
    $("log").append(entryEl(e));
    if (e.mine || near) scrollBottom(); else showNewPill();
  },
  update(e, info) {
    const el = els.get(e.id);
    if (el) el.replaceWith(entryEl(e));
    if (info.kind === "edit") addSys(`✎ ${info.who} #${e.no}-i düzəltdi`);
    else if (info.kind === "del") addSys(`✗ ${info.who} #${e.no} mesajını sildi`);
  },
  line({ kind, nick }) { addSys(kind === "join" ? `→ ${nick} söhbətə qoşuldu` : `← ${nick} söhbətdən çıxdı`); },
  warn(text, level) { addSys(text, level); },
  status() { updateStatus(); },
  incoming(e) { notifyIncoming(e); },
};

async function enterRoom(pw) {
  const nick = $("nick").value.trim().slice(0, 24);
  if (nick) { cfg.nick = nick; save(); }
  loading("Açar yaradılır (PBKDF2)…");
  try {
    const room = await roomFor(pw);
    loading("Tarixçə və imzalar yoxlanılır…");
    current = { password: pw, room, name: savedRoom(pw)?.name || `#${room.id.slice(0, 8)}` };
    chatReady = false;
    pendingSys.length = 0;
    core = new L.ChatCore({ db, room, ident, cfg, password: pw, save, ui });
    await core.start();
    $("login").hidden = true;
    $("chat").hidden = false;
    $("roomName").textContent = current.name;
    if (pw.length < WEAK) pendingSys.push(h("div", { class: "sys warn" }, "⚠ Otaq şifrəsi qısadır — güclü şifrə üçün yeni otaq yarat."));
    renderHistory();
    updateStatus();
  } catch (e) {
    toast("✗ " + (e.message || e), 4500);
    const c = core;
    core = null;
    await c?.stop();
    showLogin();
  } finally { loading(null); }
}
async function leave() {
  const c = core;
  core = null;
  chatReady = false;
  clearReply();
  await c?.stop();
  showLogin();
}
$("back").onclick = leave;
window.addEventListener("pagehide", () => { core?.stop(); });

const visibleEntries = () => [...core.entries.values()]
  .filter((e) => !(e.exp && e.exp < core.db.now())).sort((a, b) => a.id - b.id);
function renderHistory() {
  const log = $("log");
  els.clear();
  log.replaceChildren(h("button", { class: "more", onclick: loadMore }, "↑ Köhnə mesajlar"));
  const list = visibleEntries();
  if (!list.length) log.append(h("div", { class: "sys" }, "Otaq boşdur. Dostlarını dəvət et: ⋯ → Dəvət."));
  for (const e of list) log.append(entryEl(e));
  log.append(...pendingSys.splice(0));
  chatReady = true;
  scrollBottom();
}
function entryEl(e) {
  const cls = ["msg", e.mine && "mine", e.kind === "dm" && "dm", e.kind === "me" && "me", e.deleted && "deleted",
    e.status === "impostor" && "impostor"].filter(Boolean).join(" ");
  const nick = h("span", { class: "nick" }, e.kind === "me" ? "•" : e.nick);
  nick.style.color = e.status === "impostor" ? "var(--danger)" : e.mine ? "var(--ok)" : nickColor(e.nick);
  const flag = e.status === "unsigned" ? h("span", { class: "flag unsigned", title: "İmzasız — köhnə versiya" }, "?")
    : e.status === "impostor" ? h("span", { class: "flag impostor", title: "Bu adın açarı fərqlidir!" }, "⚠") : null;
  const parts = [h("div", { class: "meta" }, h("span", {}, `#${e.no}`), nick, flag,
    e.kind === "dm" ? h("span", { class: "lock" }, e.mine ? `🔒 → ${e.tonick}` : "🔒 şəxsi") : null,
    h("span", { class: "time" }, hhmm(e.ts)))];
  if (e.re) {
    const t = core.entries.get(e.re);
    parts.push(h("div", { class: "reply" }, `↪ ${t ? `#${t.no} ${snippet(t)}` : "köhnə mesaja"}`));
  }
  if (e.deleted) parts.push(h("div", { class: "text" }, "[silindi]"));
  else if (e.kind === "file") parts.push(h("div", { class: "file" }, "📎", h("b", {}, e.file.name || "fayl"),
    h("span", { class: "muted" }, human(e.file.size || 0)),
    h("button", { onclick: (ev) => { ev.stopPropagation(); download(e); } }, "Yüklə")));
  else if (e.kind === "me") parts.push(h("div", { class: "text" }, `${e.nick} ${e.text}`));
  else if (e.text == null) parts.push(h("div", { class: "text muted" }, "(açılmadı — açar dəyişib?)"));
  else parts.push(h("div", { class: "text", html: L.fmtHTML(e.text, core.nick) }));
  const foot = [];
  if (!e.deleted) {
    for (const [k, v] of e.reactions) foot.push(h("span", { class: "chip", title: [...v].join(", ") }, v.size > 1 ? `${k} ${v.size}` : k));
    if (e.edited) foot.push(h("span", {}, "düzəldildi"));
    if (e.exp) foot.push(h("span", {}, `⏳ ${L.fmtTTL(Math.max(0, e.exp - core.db.now()))}`));
  }
  if (foot.length) parts.push(h("div", { class: "foot" }, foot));
  const el = h("div", { class: cls, "data-id": e.id }, h("div", { class: "bubble", onclick: () => actions(e) }, parts));
  els.set(e.id, el);
  return el;
}
function addSys(text, level = "") {
  const el = h("div", { class: `sys ${level}` }, text);
  if (!chatReady) { pendingSys.push(el); return; }
  const near = nearBottom();
  $("log").append(el);
  if (near) scrollBottom();
}
const nearBottom = () => { const l = $("log"); return l.scrollHeight - l.scrollTop - l.clientHeight < 140; };
function scrollBottom() {
  const l = $("log");
  l.querySelector(".newpill")?.remove();
  l.scrollTop = l.scrollHeight;
}
function showNewPill() {
  if (!$("log").querySelector(".newpill")) $("log").append(h("button", { class: "newpill", onclick: scrollBottom }, "↓ yeni mesaj"));
}
$("log").addEventListener("scroll", () => { if (nearBottom()) $("log").querySelector(".newpill")?.remove(); });

function updateStatus() {
  if (!core) return;
  const names = [...core.onlinePeers().map((p) => p.nick + (p.away ? " (uzaqda)" : "")), core.nick + (core.away ? " (uzaqda)" : "")];
  $("online").textContent = `${names.length} onlayn · ${names.join(", ")}`;
  $("rt").hidden = !core.realtimeOk();
  const typers = core.typers(), rc = core.receipt(), parts = [];
  if (typers.length) parts.push(h("span", { class: "typing" }, `${typers.join(", ")} yazır…`));
  else if (rc) parts.push(rc.read ? `✓✓ oxundu: ${rc.by.join(", ")}` : "✓ göndərildi");
  if (core.ttl) parts.push(`   ⏳ ${L.fmtTTL(core.ttl)}`);
  $("status").replaceChildren(...parts);
}

// ------------------------------------------------------------------ mesaj əməliyyatları
function actions(e) {
  if (e.deleted || !core) return;
  openSheet(`#${e.no} · ${e.nick}`, [
    h("div", { class: "emojis" }, QUICK.map((em) => h("button", { onclick: () => {
      dlg.close();
      run(() => core.send("react", "", { target: e.id, emoji: em }));
    } }, em))),
    sheetBtn("↪ Cavab ver", () => setReply(e)),
    e.kind !== "file" && e.text ? sheetBtn("📋 Kopyala", () => copy(e.text)) : null,
    e.kind === "file" ? sheetBtn("⇣ Yüklə", () => download(e)) : null,
    e.mine && e.kind === "msg" ? sheetBtn("✎ Düzəlt", () => startEdit(e)) : null,
    e.mine ? sheetBtn("🗑 Sil", () => { if (confirm("Mesaj hamıda silinsin?")) run(() => core.send("del", "", { target: e.id })); }, "danger") : null,
    !e.mine && e.kind !== "dm" ? sheetBtn(`🔒 ${e.nick}-ə şəxsi yaz`, () => setInput(`/msg ${e.nick} `)) : null,
  ]);
}
function setReply(e) {
  editing = null;
  replyTo = e;
  $("replyText").textContent = `↪ #${e.no} ${snippet(e)}`;
  $("replyBar").hidden = false;
  $("input").focus();
}
function startEdit(e) {
  replyTo = null;
  editing = e;
  $("replyText").textContent = `✎ #${e.no} düzəldilir`;
  $("replyBar").hidden = false;
  setInput(e.text);
}
function clearReply() { replyTo = editing = null; $("replyBar").hidden = true; }
$("replyX").onclick = () => { if (editing) setInput(""); clearReply(); };
function setInput(v) {
  const i = $("input");
  i.value = v;
  autoGrow();
  i.focus();
  i.setSelectionRange(v.length, v.length);
}
function autoGrow() {
  const i = $("input");
  i.style.height = "auto";
  i.style.height = Math.min(i.scrollHeight + 2, 140) + "px";
}
function download(e) {
  run(async () => {
    toast("Yüklənir və açılır…");
    const bytes = await core.getFile(e);
    const url = URL.createObjectURL(new Blob([bytes]));
    const a = h("a", { href: url, download: e.file.name || "fayl" });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  });
}
async function loadMore() {
  if (!core) return;
  const added = await core.more(50).catch((e) => { handleError(e); return null; });
  if (!added) return;
  if (!added.length) return toast("Daha köhnə mesaj yoxdur");
  const log = $("log"), before = log.scrollHeight, anchor = log.firstElementChild.nextSibling;
  for (const e of added) log.insertBefore(entryEl(e), anchor);
  log.scrollTop += log.scrollHeight - before;
}
function flash(e) {
  const el = els.get(e.id);
  if (!el) return;
  el.scrollIntoView({ block: "center" });
  el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 1600);
}
async function search(q) {
  q ||= await ask("Axtar", { placeholder: "söz", ok: "Axtar" });
  if (!q) return;
  const hits = core.search(q).sort((a, b) => a.id - b.id).slice(-30);
  openDialog(`Axtarış: “${q}” — ${hits.length}`, hits.length
    ? h("div", { class: "sheet" }, hits.map((e) => sheetBtn(`#${e.no} ${snippet(e, 80)}`, () => flash(e))))
    : h("p", { class: "muted" }, "Yüklənmiş mesajlarda tapılmadı — “↑ Köhnə mesajlar” ilə köhnələri yüklə."));
}
async function setTTL(arg) {
  const apply = async (sec) => {
    if (sec && !(await db.supportsTTL())) return toast("✗ Bunun üçün serverdə yeniləmə lazımdır", 4500);
    core.ttl = sec;
    updateStatus();
    toast(sec ? `⏳ Mesajların ${L.fmtTTL(sec)} sonra hamıda yox olacaq` : "⏳ Yox olan mesajlar bağlandı");
  };
  if (arg) {
    if (["off", "0", "yox", "bağla"].includes(arg.toLowerCase())) return apply(null);
    const sec = L.parseTTL(arg);
    return sec ? apply(sec) : toast("istifadə: /ttl 10m · 1h · 1d · off");
  }
  openSheet("Yox olan mesajlar", [["Bağlı", null], ["10 dəqiqə", 600], ["1 saat", 3600], ["1 gün", 86400], ["7 gün", 604800]]
    .map(([label, sec]) => sheetBtn((core.ttl === sec ? "● " : "") + label, () => apply(sec))));
}
function showWho() {
  const peers = core.onlinePeers();
  const idMark = { ok: "✓ təsdiqlənib", impostor: "⚠ açar dəyişib!", bad: "⚠ saxta imza", unsigned: "? köhnə versiya" };
  openDialog(`Onlayn · ${peers.length + 1}`, h("div", { class: "sheet" },
    h("p", {}, `● ${core.nick} (sən)${core.away ? " — uzaqda" : ""}`),
    peers.map((p) => h("p", {}, `● ${p.nick} — ${idMark[p.id] || "?"}${p.typing ? " · yazır…" : ""}${p.away ? ` · uzaqda${p.reason ? `: ${p.reason}` : ""}` : ""}`))));
}
function whois(nick) {
  if (!nick) return toast("istifadə: /whois ad");
  const pins = core.pins[nick] || [], last = core.lastPub.get(nick);
  openDialog(`Kimlik · ${nick}`, pins.length ? pins.map((p) => h("p", { class: "fp" }, L.fingerprint(p))) : h("p", { class: "muted" }, "Bu otaqda hələ imzalı yazmayıb."),
    last && !pins.includes(last) ? h("p", { class: "warn-text" }, `⚠ Son görünən açar FƏRQLİDİR: ${L.fingerprint(last)} — əmin olsan: /trust ${nick}`) : null,
    h("p", { class: "muted" }, `${nick}-dən telefonla və ya üzbəüz soruş: onun /id-si eyni izi göstərirmi? Çatda yazılan izə inanma — izi hər kəs görür, amma onunla imza atmaq mümkün deyil.`));
}
function showHelp() {
  const items = [
    ["Mesaja toxun", "reaksiya, cavab, kopyala, düzəlt, sil, şəxsi yaz"],
    ["/reply N mətn", "N nömrəli mesaja cavab"], ["/react N 👍", "reaksiya (+1 <3 haha wow fire ok)"],
    ["/edit [#N] mətn", "mesajını düzəlt"], ["/delete [#N]", "mesajını sil"],
    ["/msg ad mətn", "🔒 yalnız ona görünən şəxsi mesaj"], ["/me hərəkət", "hərəkət göstər"],
    ["/search söz", "axtar"], ["/ttl 1h", "mesajların yox olsun (/ttl off)"], ["/away [səbəb]", "uzaqda ol"],
    ["/who · /id · /whois ad", "onlayn olanlar, barmaq izləri"], ["/trust ad", "dəyişmiş açarı qəbul et"],
    ["*qalın* _kursiv_ `kod` @ad", "mətn formatı və qeyd etmə"],
  ];
  openDialog("Kömək", h("dl", { class: "help" }, items.map(([k, v]) => [h("dt", {}, k), h("dd", {}, v)])));
}
async function toggleNotify() {
  if (!("Notification" in window)) return toast("Bu brauzer bildirişləri dəstəkləmir");
  if (cfg.notify) { cfg.notify = false; save(); return toast("Bildirişlər bağlandı"); }
  if ((await Notification.requestPermission()) !== "granted") return toast("İcazə verilmədi — brauzer ayarlarından aç");
  cfg.notify = true;
  save();
  toast("Bildirişlər açıldı ✓");
}
$("menuBtn").onclick = () => openSheet(current?.name || "Otaq", [
  sheetBtn("✉ Dəvət göndər", () => showInvite(current.password, current.name)),
  sheetBtn("👥 Kim onlayndır", showWho),
  sheetBtn(`⏳ Yox olan mesajlar: ${core?.ttl ? L.fmtTTL(core.ttl) : "bağlı"}`, () => setTTL("")),
  sheetBtn("🔍 Axtar", () => search("")),
  sheetBtn("↑ Köhnə mesajlar", loadMore),
  sheetBtn(core?.away ? "☀ Qayıtdım" : "🌙 Uzaqda ol", () => { core.setAway(core.away ? false : "manual"); updateStatus(); }),
  sheetBtn(`🔔 Bildirişlər: ${cfg.notify ? "açıq" : "bağlı"}`, toggleNotify),
  sheetBtn(`🔊 Səs: ${cfg.sound ? "açıq" : "bağlı"}`, () => { cfg.sound = !cfg.sound; save(); }),
  sheetBtn("🪪 Barmaq izim", () => command("/id")),
  sheetBtn("❓ Kömək", showHelp),
  sheetBtn("← Otaqdan çıx", leave, "danger"),
]);

// ------------------------------------------------------------------ yazı sahəsi və əmrlər
$("composer").onsubmit = (ev) => { ev.preventDefault(); submit(); };
$("input").addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); submit(); }
});
$("input").addEventListener("input", () => { autoGrow(); core?.typing($("input").value); });
$("attach").onclick = () => $("file").click();
$("file").onchange = async () => {
  const f = $("file").files[0];
  $("file").value = "";
  if (!f || !core) return;
  if (f.size > MAX_FILE) return toast("Fayl çox böyükdür (limit 20 MB)");
  loading(`Şifrələnir və yüklənir: ${f.name}`);
  try { await core.sendFile(f.name, new Uint8Array(await f.arrayBuffer())); } catch (e) { handleError(e); } finally { loading(null); }
};
async function submit() {
  const text = $("input").value;
  if (!text.trim() || !core) return;
  $("input").value = "";
  autoGrow();
  core.typing("");
  try {
    if (editing) {
      const e = editing;
      clearReply();
      await core.send("edit", text.slice(0, 4000), { target: e.id });
    } else if (text.startsWith("/")) await command(text.trim());
    else {
      const extra = replyTo ? { re: replyTo.id } : {};
      clearReply();
      await core.send("msg", text.slice(0, 4000), extra);
    }
  } catch (e) { handleError(e); }
}
async function command(text) {
  const [first, ...rest] = text.split(" ");
  const cmd = first.toLowerCase(), arg = rest.join(" ").trim();
  const nArg = () => { const [n, ...t] = arg.split(" "); return [core.byNumber(n), t.join(" ").trim()]; };
  switch (cmd) {
    case "/help": return showHelp();
    case "/who": return showWho();
    case "/me": return arg ? core.send("me", arg.slice(0, 4000)) : toast("istifadə: /me hərəkət");
    case "/reply": case "/r": {
      const [e, t] = nArg();
      return e && t ? core.send("msg", t.slice(0, 4000), { re: e.id }) : toast("istifadə: /reply N mətn");
    }
    case "/react": {
      const [e, t] = nArg(), emo = L.REACTIONS[t.toLowerCase()] || t;
      return e && emo && [...emo].length <= 16 ? core.send("react", "", { target: e.id, emoji: emo }) : toast("istifadə: /react N 👍");
    }
    case "/edit": {
      let target = core.myLast(["msg"]), t = arg;
      if (arg.startsWith("#")) { const [e, tt] = nArg(); target = e && e.mine && e.kind === "msg" && !e.deleted ? e.id : null; t = tt; }
      if (!t) return toast("istifadə: /edit [#N] mətn");
      return target ? core.send("edit", t.slice(0, 4000), { target }) : toast("✗ düzəltmək üçün öz mesajın yoxdur");
    }
    case "/delete": {
      let target = core.myLast();
      if (arg.startsWith("#")) { const [e] = nArg(); target = e && e.mine && !e.deleted ? e.id : null; }
      return target ? core.send("del", "", { target }) : toast("✗ silmək üçün öz mesajın yoxdur");
    }
    case "/msg": case "/dm": {
      const [nick0 = "", ...t] = arg.split(" "), nick = nick0.replace(/^@/, "");
      if (!nick || !t.join(" ").trim()) return toast("istifadə: /msg ad mətn");
      if (nick === core.nick) return toast("✗ özünə şəxsi mesaj yazmaq olmaz");
      return core.dm(nick, t.join(" "));
    }
    case "/ttl": return setTTL(arg);
    case "/away": core.setAway(core.away === "manual" && !arg ? false : "manual", arg); updateStatus(); return toast(core.away ? "Uzaqdasan" : "Qayıtdın");
    case "/search": return search(arg);
    case "/more": return loadMore();
    case "/invite": return showInvite(current.password, current.name);
    case "/id": return openDialog("Sənin barmaq izin", h("p", { class: "fp" }, ident.fingerprint),
      h("p", { class: "muted" }, "Bu sirr deyil: onu bilmək sənin adından yazmağa imkan vermir — imza üçün yalnız bu cihazdakı gizli açar lazımdır."),
      h("p", { class: "muted" }, "Yoxlamaq üçün: dostunun ekranında “/whois səninadın” eyni izi göstərməlidir. Telefonla və ya üzbəüz müqayisə edin, çatda yox."));
    case "/whois": return whois(arg.replace(/^@/, ""));
    case "/trust": {
      const nick = arg.replace(/^@/, "");
      return toast(nick && core.trust(nick) ? `✓ '${nick}' üçün yeni açar qəbul edildi` : "istifadə: /trust ad (açarı dəyişmiş adam)");
    }
    case "/clear": return renderHistory();
    case "/quit": case "/q": return leave();
    case "/sound": cfg.sound = !cfg.sound; save(); return toast(`Səs: ${cfg.sound ? "açıq" : "bağlı"}`);
    case "/notify": return toggleNotify();
    default: return toast(`naməlum əmr: ${cmd} (/help)`);
  }
}

// ------------------------------------------------------------------ bildirişlər və "uzaqda"
let audio = null;
document.addEventListener("pointerdown", () => { audio ??= new (window.AudioContext || window.webkitAudioContext)(); }, { once: true });
function beep() {
  if (!audio || audio.state !== "running") return;
  const o = audio.createOscillator(), g = audio.createGain();
  o.frequency.value = 880;
  g.gain.setValueAtTime(0.08, audio.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.15);
  o.connect(g).connect(audio.destination);
  o.start();
  o.stop(audio.currentTime + 0.16);
}
function notifyIncoming(e) {
  const mention = ["msg", "me"].includes(e.kind) && L.mentions(e.text || "", core.nick);
  if (!document.hidden && !mention) return;
  if (document.hidden) document.title = `(${++unseen}) LETHEA`;
  if (cfg.sound || mention) beep();
  if ((cfg.notify || mention) && "Notification" in window && Notification.permission === "granted") {
    const body = e.kind === "file" ? `📎 ${e.file.name || "fayl"}` : e.kind === "dm" ? `🔒 ${e.text || "şəxsi mesaj"}` : e.text || "";
    new Notification(`LETHEA · ${e.nick}`, { body: body.slice(0, 200), tag: current.room.id });
  }
}
document.addEventListener("visibilitychange", () => {
  if (!core) return;
  if (document.hidden) {
    hiddenTimer = setTimeout(() => { if (core && !core.away) core.setAway("auto"); }, 5 * 60 * 1000);
  } else {
    clearTimeout(hiddenTimer);
    if (core.away === "auto") core.setAway(false);
    unseen = 0;
    document.title = "LETHEA";
    core.msgBell.ring();
  }
});

// ------------------------------------------------------------------ başlanğıc
async function boot() {
  if (!globalThis.crypto?.subtle) {
    loading("Bu səhifə yalnız təhlükəsiz bağlantı (https) ilə işləyir.");
    return;
  }
  readInviteFromHash();
  loading("Hazırlanır…");
  try { await initIdentity(); } finally { loading(null); }
  showLogin();
}
window.addEventListener("hashchange", () => { readInviteFromHash(); if (!core) showLogin(); });
boot();
