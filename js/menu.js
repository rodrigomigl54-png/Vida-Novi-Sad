// Meni: kategorije, pretraga, dijetalni filteri, filter raspoloženja, prikaz kartice/lista
import { $, $$, escapeHtml, fmtPrice, store, reducedMotion } from "./util.js";
import { t, L, getLang, onLangChange } from "./i18n.js";
import { addToCart } from "./cart.js";

let menu;
let dishImages = new Set();
const state = { q: "", diet: null, mood: null, view: store.get("vida-menu-view", "grid") };
const moodListeners = new Set();

const ICONS = new Set(["cup", "bowl", "glass", "cocktail", "wine", "beer", "plate", "sandwich", "wrap", "leaf", "burger", "cake"]);
const TONES = { cup: "coffee", bowl: "green", leaf: "green", wrap: "green", glass: "peach", cocktail: "peach", burger: "peach", wine: "berry", beer: "sun", plate: "sun", sandwich: "sun", cake: "berry" };

export const categoryIcon = (c) => (ICONS.has(c.icon) ? c.icon : "plate");

const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "dj");

/**
 * Fotografije jela: ako postoji /assets/dishes/<id>.webp|jpg|png, koristi se ona.
 * Spisak fajlova se čita iz listinga foldera (Apache/LiteSpeed "Options +Indexes",
 * vidi assets/dishes/.htaccess). Ako listing nije dostupan, koristi se polje "image" iz menu.json.
 */
async function loadDishImages(gh) {
  // GitHub Pages nema listing foldera → spisak fajlova preko javnog GitHub API-ja
  if (/\.github\.io$/.test(location.hostname)) {
    try {
      const owner = location.hostname.split(".")[0];
      const repo = location.pathname.split("/").filter(Boolean)[0];
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/assets/dishes?ref=${encodeURIComponent(gh?.branch || "gh-pages")}`);
      if (res.ok) (await res.json()).forEach((f) => { if (/\.(webp|jpe?g|png)$/i.test(f.name)) dishImages.add(f.name.toLowerCase()); });
    } catch (e) { /* bez spiska — samo placeholderi */ }
    return;
  }
  try {
    const res = await fetch("assets/dishes/", { cache: "no-cache" });
    if (!res.ok) return;
    const html = await res.text();
    for (const m of html.matchAll(/href="(?:[^"]*\/)?([\w.-]+\.(?:webp|jpe?g|png))"/gi)) dishImages.add(decodeURIComponent(m[1]).toLowerCase());
  } catch (e) { /* bez listinga — samo placeholderi */ }
}

function imageFor(item) {
  if (item.image) return item.image;
  for (const ext of ["webp", "jpg", "jpeg", "png"]) if (dishImages.has(`${item.id}.${ext}`)) return `assets/dishes/${item.id}.${ext}`;
  return null;
}

function placeholder(cat) {
  const icon = categoryIcon(cat);
  return `<div class="dish-ph" data-tone="${TONES[icon] || "green"}" aria-hidden="true"><svg viewBox="0 0 48 48"><use href="#i-${icon}"/></svg></div>`;
}

const sizeLabel = (s) => (s ? ` <span class="dish__size">${getLang() === "en" ? s.replace(",", ".") : s} l</span>` : "");

function priceHtml(price) {
  return price == null ? `<span class="dish__ask">${t("menu.onRequest")}</span>` : `<span class="dish__price">${fmtPrice(price, getLang())}</span>`;
}

function dishHtml(item, cat, i) {
  const img = imageFor(item);
  const desc = item.description ? L(item.description) : "";
  const diets = item.diet.map((d) => `<span class="dish__tag">${escapeHtml(L(menu.diets[d]))}</span>`).join("");
  const hasVariants = item.variants && item.variants.length > 1;
  const price = hasVariants ? item.variants[0].price : item.price;
  const variantSel = hasVariants
    ? `<select class="dish__variant" data-variant aria-label="${escapeHtml(t("menu.variant"))}: ${escapeHtml(item.name)}">
        ${item.variants.map((v) => `<option value="${v.id}">${escapeHtml(L(v.name))} — ${fmtPrice(v.price, getLang())}</option>`).join("")}
       </select>`
    : "";
  const canAdd = price != null;
  return `
    <li class="dish${reducedMotion() ? "" : " is-entering"}" data-id="${item.id}" style="animation-delay:${Math.min(i, 12) * 28}ms">
      <div class="dish__media">${img ? `<img src="${img}" alt="${escapeHtml(item.name)}" width="400" height="300" loading="lazy" decoding="async">` : placeholder(cat)}</div>
      <div class="dish__body">
        <h4 class="dish__name">${escapeHtml(item.name)}${sizeLabel(item.size)}</h4>
        ${desc ? `<p class="dish__desc">${escapeHtml(desc)}</p>` : ""}
        ${diets ? `<div class="dish__tags">${diets}</div>` : ""}
        <div class="dish__foot">
          ${hasVariants ? variantSel : priceHtml(price)}
          ${canAdd ? `<button type="button" class="dish__add" data-add aria-label="${escapeHtml(t("menu.add", { name: item.name }))}"><svg class="icon" aria-hidden="true"><use href="#i-plus"/></svg></button>` : ""}
        </div>
      </div>
    </li>`;
}

function matches(item) {
  if (state.diet && !item.diet.includes(state.diet)) return false;
  if (state.mood && !item.mood.includes(state.mood)) return false;
  if (state.q) {
    const hay = norm([item.name, item.description?.sr, item.description?.en].join(" "));
    if (!norm(state.q).split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}

function render() {
  const list = $("[data-menu-list]");
  list.dataset.layout = state.view;
  let count = 0, i = 0;
  const html = menu.categories.map((c) => {
    const items = c.items.filter(matches);
    if (!items.length) return "";
    count += items.length;
    const meta = c.availability ? `<span class="menu-cat__meta">${escapeHtml(L(c.availability.label))}</span>` : "";
    const note = c.note ? `<p class="menu-cat__note">${escapeHtml(L(c.note))}</p>` : "";
    return `
      <section class="menu-cat" id="cat-${c.id}" data-cat="${c.id}" aria-labelledby="cat-h-${c.id}">
        <div class="menu-cat__head"><h3 class="menu-cat__title" id="cat-h-${c.id}">${escapeHtml(L(c.name))}</h3>${meta}</div>
        ${note}
        <ul class="menu-items">${items.map((it) => dishHtml(it, c, i++)).join("")}</ul>
      </section>`;
  }).join("");
  list.innerHTML = html || `<p class="menu-empty">${escapeHtml(t("menu.noResults"))}</p>`;

  const status = $("[data-menu-status]");
  const filtered = state.q || state.diet || state.mood;
  status.innerHTML = filtered
    ? `${escapeHtml(t("menu.results", { n: count }))} · <button type="button" class="btn--text" style="border:0;background:none;padding:0;font-weight:700;text-decoration:underline" data-clear-filters>${escapeHtml(t("menu.showAll"))}</button>`
    : "";
  renderCats();
  observeCats();
}

function renderCats() {
  const visible = new Set($$(".menu-cat").map((s) => s.dataset.cat));
  $("[data-menu-cats]").innerHTML = menu.categories
    .filter((c) => visible.has(c.id))
    .map((c) => `<a class="chip" href="#cat-${c.id}" data-cat-link="${c.id}">${escapeHtml(L(c.name))}</a>`).join("");
}

function renderDiets() {
  // filter se prikazuje samo ako bar jedna stavka ima potvrđenu oznaku
  const present = new Set(menu.categories.flatMap((c) => c.items.flatMap((i) => i.diet)));
  $("[data-menu-diets]").innerHTML = Object.keys(menu.diets).filter((d) => present.has(d))
    .map((d) => `<button type="button" class="chip" data-diet="${d}" aria-pressed="${state.diet === d}"><svg class="icon" aria-hidden="true"><use href="#i-vegan"/></svg>${escapeHtml(L(menu.diets[d]))}</button>`).join("");
}

let io;
function observeCats() {
  io?.disconnect();
  if (!("IntersectionObserver" in window)) return;
  io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const id = e.target.dataset.cat;
      $$("[data-cat-link]").forEach((a) => a.setAttribute("aria-current", String(a.dataset.catLink === id)));
      const link = $(`[data-cat-link="${id}"]`);
      const bar = $("[data-menu-cats]");
      if (link && bar) bar.scrollTo({ left: link.offsetLeft - 24, behavior: reducedMotion() ? "auto" : "smooth" });
    });
  }, { rootMargin: "-35% 0px -60% 0px" });
  $$(".menu-cat").forEach((s) => io.observe(s));
}

export function setMood(mood) {
  state.mood = mood;
  render();
  moodListeners.forEach((fn) => fn(mood));
}
export const onMoodChange = (fn) => moodListeners.add(fn);
export const getMenu = () => menu;

function bind() {
  const list = $("[data-menu-list]");
  list.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-add]");
    if (!btn) return;
    const li = btn.closest(".dish");
    const { item } = find(li.dataset.id);
    const sel = li.querySelector("[data-variant]");
    const variant = sel ? item.variants.find((v) => v.id === sel.value) : null;
    addToCart({
      kind: "menu", id: item.id, name: item.name, size: item.size || null,
      variant: variant ? { id: variant.id, name: variant.name } : null,
      price: variant ? variant.price : item.price,
    });
    btn.classList.add("is-added");
    setTimeout(() => btn.classList.remove("is-added"), 900);
  });
  $("[data-menu-status]").addEventListener("click", (e) => {
    if (!e.target.closest("[data-clear-filters]")) return;
    state.q = ""; state.diet = null; $("[data-menu-search]").value = "";
    renderDiets();
    setMood(null);
  });
  let tmr;
  $("[data-menu-search]").addEventListener("input", (e) => { clearTimeout(tmr); tmr = setTimeout(() => { state.q = e.target.value.trim(); render(); }, 140); });
  $("[data-menu-diets]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-diet]");
    if (!b) return;
    state.diet = state.diet === b.dataset.diet ? null : b.dataset.diet;
    renderDiets(); render();
  });
  $$("[data-view]").forEach((b) => b.addEventListener("click", () => {
    state.view = b.dataset.view; store.set("vida-menu-view", state.view);
    $$("[data-view]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    $("[data-menu-list]").dataset.layout = state.view;
  }));
  $$("[data-view]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.view === state.view)));
}

function find(id) {
  for (const c of menu.categories) { const item = c.items.find((i) => i.id === id); if (item) return { item, cat: c }; }
  return {};
}

export async function initMenu(menuData, gh) {
  menu = menuData;
  await loadDishImages(gh);
  bind();
  renderDiets();
  render();
  onLangChange(() => { renderDiets(); render(); });
}
