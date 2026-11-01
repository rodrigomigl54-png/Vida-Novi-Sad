// Hero koji zavisi od doba dana (Europe/Belgrade): tekst, istaknute kategorije i video petlja
import { $, hm, escapeHtml, reducedMotion } from "./util.js";
import { t, L, onLangChange } from "./i18n.js";
import { onStatus } from "./open-status.js";
import { categoryIcon } from "./menu.js";

let site, menu, current;
let videosAllowed = false; // video kreće tek posle intro-a (da ne troši mrežu tokom intro-a)

export function pickSlot(status) {
  if (!status.open) return site.timeOfDay.find((s) => s.id === "closed");
  const m = status.now.minutes;
  return site.timeOfDay.find((s) => s.id !== "closed" && m >= hm(s.from) && m < hm(s.to)) || site.timeOfDay[0];
}

const saveData = () => navigator.connection?.saveData === true;
const isDesktop = () => window.matchMedia("(min-width: 900px)").matches;

function setVideo(el, base, play) {
  if (!el) return;
  const key = base;
  el.poster = `${base}-poster.webp`;
  if (!play) return;
  if (el.dataset.src !== key) {
    el.dataset.src = key;
    el.innerHTML = `<source src="${base}.webm" type="video/webm"><source src="${base}.mp4" type="video/mp4">`;
    el.load();
  }
  const p = el.play();
  if (p && p.catch) p.catch(() => { /* autoplay odbijen — ostaje poster */ });
}

function renderVideos(slot) {
  const id = slot.video || slot.id;
  const play = videosAllowed && !reducedMotion() && !saveData();
  setVideo($("[data-hero-main]"), `assets/video/hero-${id}-main`, play);
  setVideo($("[data-hero-side]"), `assets/video/hero-${id}-side`, play && isDesktop());
}

function renderHero(slot) {
  const enabled = site.features.timeOfDayHero;
  const s = enabled ? slot : site.timeOfDay[0];
  document.body.dataset.tod = s.id;
  $("[data-hero-lead]").textContent = t(`hero.${s.id}.lead`);
  $("[data-hero-eyebrow]").textContent = t(`hero.${s.id}.eyebrow`);
  $("[data-hero-closed]").hidden = s.id !== "closed";
  const cats = s.categories.map((id) => menu.categories.find((c) => c.id === id)).filter(Boolean);
  $("[data-hero-cats]").innerHTML = cats.map((c) => `
    <li><a class="chip" href="#cat-${c.id}">
      <svg class="icon" aria-hidden="true"><use href="#i-${categoryIcon(c)}"/></svg>${escapeHtml(L(c.name))}
    </a></li>`).join("");
  renderVideos(s);
}

/** Pozvati kad se intro završi — tada hero video sme da se učita i pusti */
export function startHeroVideos() {
  videosAllowed = true;
  if (current) renderVideos(site.features.timeOfDayHero ? current : site.timeOfDay[0]);
  // pauziraj kad hero nije na ekranu (štedi bateriju)
  if ("IntersectionObserver" in window) {
    const vids = [$("[data-hero-main]"), $("[data-hero-side]")].filter(Boolean);
    new IntersectionObserver((entries) => {
      entries.forEach((e) => vids.forEach((v) => {
        if (!v.dataset.src) return;
        if (e.isIntersecting) v.play().catch(() => {}); else v.pause();
      }));
    }, { threshold: 0.05 }).observe($(".hero"));
  }
  window.matchMedia("(min-width: 900px)").addEventListener("change", () => current && renderVideos(current));
}

export function initTimeOfDay(siteData, menuData) {
  site = siteData; menu = menuData;
  onStatus((status) => {
    const slot = pickSlot(status);
    if (!current || current.id !== slot.id) { current = slot; renderHero(slot); }
  });
  onLangChange(() => current && renderHero(current));
}
