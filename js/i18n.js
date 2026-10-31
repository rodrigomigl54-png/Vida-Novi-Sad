// Mali i18n pomoćnik: tekstovi su u /data/i18n/sr.json i en.json
import { loadJSON, store, $$ } from "./util.js";

const LANGS = ["sr", "en"];
const dicts = {};
let lang = "sr";
const listeners = new Set();
export const missing = new Set();

function lookup(dict, key) {
  return key.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), dict);
}

export function t(key, vars) {
  let s = lookup(dicts[lang], key);
  if (s === undefined) {
    if (!missing.has(`${lang}:${key}`)) { missing.add(`${lang}:${key}`); console.warn(`[i18n] nedostaje ključ "${key}" (${lang})`); }
    s = lookup(dicts.sr, key) ?? key;
  }
  if (vars && typeof s === "string") s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ""));
  return s;
}

/** Vraća vrednost iz objekta {sr, en} za trenutni jezik */
export const L = (obj) => (obj == null ? "" : typeof obj === "string" ? obj : obj[lang] ?? obj.sr ?? "");

export const getLang = () => lang;

export function apply(root = document) {
  $$("[data-i18n]", root).forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $$("[data-i18n-attr]", root).forEach((el) => {
    el.dataset.i18nAttr.split(";").forEach((pair) => {
      const [attr, key] = pair.split(":").map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    });
  });
}

function initialLang() {
  const q = new URLSearchParams(location.search).get("lang");
  if (LANGS.includes(q)) return q;
  const saved = store.get("vida-lang");
  if (LANGS.includes(saved)) return saved;
  return "sr";
}

export async function initI18n() {
  const [sr, en] = await Promise.all([loadJSON("data/i18n/sr.json"), loadJSON("data/i18n/en.json")]);
  dicts.sr = sr; dicts.en = en;
  lang = initialLang();
  render();
  $$("[data-lang]").forEach((btn) => btn.addEventListener("click", () => setLang(btn.dataset.lang)));
}

export function setLang(next) {
  if (!LANGS.includes(next) || next === lang) return;
  lang = next;
  store.set("vida-lang", lang);
  const url = new URL(location.href);
  if (lang === "en") url.searchParams.set("lang", "en"); else url.searchParams.delete("lang");
  history.replaceState(null, "", url);
  render();
}

function render() {
  document.documentElement.lang = lang === "sr" ? "sr-Latn" : "en";
  document.title = t("meta.title");
  document.querySelector('meta[name="description"]')?.setAttribute("content", t("meta.description"));
  $$("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
  apply();
  listeners.forEach((fn) => fn(lang));
}

export const onLangChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
