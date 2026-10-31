// Zajedničke pomoćne funkcije
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const store = {
  get(key, fallback = null, area = "local") {
    try {
      const raw = (area === "session" ? sessionStorage : localStorage).getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  },
  set(key, value, area = "local") {
    try { (area === "session" ? sessionStorage : localStorage).setItem(key, JSON.stringify(value)); } catch (e) { /* privatni režim */ }
  },
  remove(key, area = "local") {
    try { (area === "session" ? sessionStorage : localStorage).removeItem(key); } catch (e) { /* */ }
  },
};

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export async function loadJSON(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

// ---------- Vreme (Europe/Belgrade) ----------
export const hm = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
export const pad = (n) => String(n).padStart(2, "0");
export const fmtHM = (min) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;

/** Trenutno vreme u zadatoj vremenskoj zoni: { date: "YYYY-MM-DD", minutes, weekday } */
export function zonedNow(timeZone = "Europe/Belgrade", base = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
  }).formatToParts(base).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes, weekday: parts.weekday.toLowerCase().slice(0, 3) };
}

/** Datum + n dana (YYYY-MM-DD, kalendarski, bez zone) */
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function fmtDate(dateStr, lang) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return lang === "en" ? `${d}/${m}/${y}` : `${d}. ${m}. ${y}.`;
}

// ---------- Cene ----------
export function fmtPrice(n, lang = "sr") {
  if (n == null) return null;
  const s = new Intl.NumberFormat(lang === "en" ? "en-GB" : "sr-Latn-RS", { maximumFractionDigits: 0, useGrouping: true }).format(n);
  // sr-Latn koristi tačku kao separator hiljada (1.330)
  return `${s} RSD`;
}

// ---------- WhatsApp ----------
export function waUrl(number, text) {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
export function openWa(url) {
  const w = window.open(url, "_blank", "noopener");
  if (!w) window.location.href = url;
}

// ---------- Validacija ----------
export function validPhone(v) {
  const digits = (v || "").replace(/[^\d]/g, "");
  return /^[+\d][\d\s()/.-]*$/.test((v || "").trim()) && digits.length >= 8 && digits.length <= 15;
}

// ---------- Scroll lock ----------
let lockCount = 0;
export function lockScroll() {
  if (lockCount++ === 0) {
    document.documentElement.style.setProperty("--scrollbar-w", `${window.innerWidth - document.documentElement.clientWidth}px`);
    document.documentElement.classList.add("scroll-locked");
  }
}
export function unlockScroll() {
  if (lockCount > 0 && --lockCount === 0) document.documentElement.classList.remove("scroll-locked");
}

// ---------- Toast ----------
let toastTimer;
export function toast(msg) {
  const el = $("[data-toast]");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

// ---------- Focus trap ----------
export function trapFocus(container, e) {
  if (e.key !== "Tab") return;
  const f = $$('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])', container)
    .filter((el) => el.offsetParent !== null && !el.closest("[hidden]"));
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

export const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Jednostavan deterministički PRNG (za ilustracije sastojaka) */
export function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
