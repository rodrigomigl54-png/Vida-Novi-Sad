// VIDA — ulazna tačka
import { $, $$, loadJSON, lockScroll, unlockScroll, trapFocus, reducedMotion, escapeHtml } from "./util.js";
import { initI18n, onLangChange, t, L, getLang, missing } from "./i18n.js";
import { initOpenStatus } from "./open-status.js";
import { initTimeOfDay } from "./time-of-day.js";
import { initMenu } from "./menu.js";
import { initMood } from "./mood.js";
import { initCart } from "./cart.js";
import { initReservation } from "./reservation.js";
import { initCelebrations } from "./celebrations.js";
import { initGallery } from "./gallery.js";
import { runIntro } from "./intro.js";

/** Feature flagovi iz site.json; za pregled: ?preview=bowlBuilder ili ?features=intro:0,bowlBuilder:1 */
function resolveFeatures(features) {
  const f = { ...features };
  const q = new URLSearchParams(location.search);
  (q.get("preview") || "").split(",").filter(Boolean).forEach((k) => { if (k in f) f[k] = true; });
  (q.get("features") || "").split(",").filter(Boolean).forEach((pair) => {
    const [k, v] = pair.split(":");
    if (k in f) f[k] = v !== "0" && v !== "false";
  });
  return f;
}

function applyFeatures(f) {
  $$("[data-feature]").forEach((el) => {
    if (!f[el.dataset.feature]) {
      if (el.id === "intro") return; // intro se uklanja u intro.js
      el.hidden = true;
      el.setAttribute("aria-hidden", "true");
    }
  });
}

function initHeader() {
  const header = $(".site-header");
  let ticking = false;
  const onScroll = () => {
    header.classList.toggle("is-compact", window.scrollY > 24);
    const fab = $("[data-fab]");
    // FAB se sklanja kad je korisnik na sekciji poruči ili u footer-u
    const foot = $(".site-footer").getBoundingClientRect();
    // sekcije u kojima FAB ne sme da prekriva sadržaj (forme, korpa, bowl)
    const covering = ["#poruci", "#rezervisi", "#proslave", "#bowl"].some((sel) => {
      const el = $(sel);
      if (!el || el.hidden) return false;
      const r = el.getBoundingClientRect();
      return r.top < innerHeight * 0.85 && r.bottom > innerHeight * 0.3;
    });
    const heroEnd = $(".hero").getBoundingClientRect().bottom;
    fab.classList.toggle("is-hidden", heroEnd > innerHeight * 0.35 || covering || foot.top < innerHeight - 40);
    ticking = false;
  };
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  requestAnimationFrame(onScroll);

  // aktivni link u navigaciji
  if ("IntersectionObserver" in window) {
    const links = $$(".nav__list a");
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) links.forEach((a) => a.setAttribute("aria-current", String(a.getAttribute("href") === `#${e.target.id}`)));
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    links.forEach((a) => { const s = $(a.getAttribute("href")); if (s) io.observe(s); });
  }

  // mobilni meni
  const toggle = $(".menu-toggle");
  const panel = $("#mobile-nav");
  const open = () => { panel.hidden = false; toggle.setAttribute("aria-expanded", "true"); lockScroll(); $("[data-close-mobile-nav]").focus(); };
  const close = (focusBack = true) => { if (panel.hidden) return; panel.hidden = true; toggle.setAttribute("aria-expanded", "false"); unlockScroll(); if (focusBack) toggle.focus(); };
  toggle.addEventListener("click", open);
  $("[data-close-mobile-nav]").addEventListener("click", () => close());
  panel.addEventListener("click", (e) => { if (e.target.closest("a")) close(false); });
  panel.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); trapFocus(panel, e); });
}

function initReveal() {
  if (reducedMotion() || !("IntersectionObserver" in window)) return;
  const els = $$(".section-head, .hero__copy, .about__copy, .family__card, .order__card, .form.card, .contact__map, .reviews__inner");
  const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
  els.forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight) return; // već vidljivo — bez animacije
    el.classList.add("reveal"); io.observe(el);
  });
}

function initMap(site) {
  const box = $("[data-map]");
  const load = () => {
    if (box.querySelector("iframe")) return;
    const f = document.createElement("iframe");
    f.src = site.contact.mapsEmbed;
    f.title = t("contact.mapTitle");
    f.loading = "lazy";
    f.referrerPolicy = "no-referrer-when-downgrade";
    box.appendChild(f);
    $("[data-map-load]", box)?.remove();
  };
  $("[data-map-load]").addEventListener("click", load);
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { load(); io.disconnect(); } }, { rootMargin: "200px" });
    io.observe(box);
  }
}

function renderSiteTexts(site) {
  const en = getLang() === "en";
  const r = site.rating;
  $$("[data-rating-value]").forEach((el) => { el.textContent = en ? r.valueEn : r.value; });
  $$("[data-rating-count]").forEach((el) => { el.textContent = t("reviews.count", { n: en ? r.countEn : r.count }); });
  $$("[data-rating-short]").forEach((el) => { el.textContent = t("reviews.short", { v: en ? r.valueEn : r.value, n: en ? r.countEn : r.count }); });
  $$("[data-rating-link]").forEach((a) => { a.href = r.url; });
  $$("[data-year]").forEach((el) => { el.textContent = new Date().getFullYear(); });
  const credit = $("[data-credit]");
  if (site.credit?.name) {
    credit.hidden = false;
    credit.innerHTML = `${escapeHtml(t("footer.madeBy"))} ${site.credit.url ? `<a href="${escapeHtml(site.credit.url)}" target="_blank" rel="noopener">${escapeHtml(site.credit.name)}</a>` : escapeHtml(site.credit.name)}`;
  }
  // stvarne recenzije (prazno → sakriveno)
  const list = $("[data-reviews]");
  list.hidden = !(site.reviews && site.reviews.length);
  list.innerHTML = (site.reviews || []).map((q) => `<li><blockquote>${escapeHtml(L(q.text))}</blockquote><cite>${escapeHtml(q.author || "")}</cite></li>`).join("");
}

async function main() {
  const [site, menu, intro, gallery] = await Promise.all([
    loadJSON("data/site.json"), loadJSON("data/menu.json"), loadJSON("data/intro.json"), loadJSON("data/gallery.json"),
  ]);
  site.features = resolveFeatures(site.features);
  applyFeatures(site.features);

  // intro kreće odmah (paralelno sa ostatkom)
  const introDone = runIntro(intro, site.features);

  await initI18n();
  initOpenStatus(site);
  initCart(site);
  await initMenu(menu);
  initTimeOfDay(site, menu, gallery);
  if (site.features.moodFilter) initMood();
  if (site.features.bowlBuilder) {
    const [{ initBowl }, bowl] = await Promise.all([import("./bowl-builder.js"), loadJSON("data/bowl.json")]);
    initBowl(bowl);
  }
  initReservation(site);
  initCelebrations(site);
  initGallery(gallery);
  initHeader();
  initMap(site);
  renderSiteTexts(site);
  onLangChange(() => renderSiteTexts(site));
  introDone.then(initReveal);

  window.__vida = { site, menu, missing, ready: true };
  document.documentElement.classList.add("is-ready");
}

main().catch((err) => {
  console.error(err);
  document.documentElement.classList.remove("intro-pending");
  $("#intro")?.remove();
});
