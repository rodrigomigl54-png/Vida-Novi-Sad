// Korpa → porudžbina preko WhatsApp-a (+ Wolt kao alternativa)
import { $, $$, store, fmtPrice, waUrl, openWa, validPhone, escapeHtml, lockScroll, unlockScroll, trapFocus, toast, hm, fmtHM, addDays, fmtDate, reducedMotion } from "./util.js";
import { t, L, getLang, onLangChange } from "./i18n.js";
import { getStatus, onStatus } from "./open-status.js";

const KEY = "vida-cart";
let site;
let items = [];
let lastWaUrl = "";
let lastFocus = null;

const keyOf = (it) => [it.kind, it.id, it.variant?.id || "", it.kind === "bowl" ? JSON.stringify(it.ingredients) : ""].join("|");

function save() { store.set(KEY, items); }

export function getItems() { return items; }

export function addToCart(entry) {
  const k = keyOf(entry);
  const found = items.find((i) => i.key === k);
  if (found) found.qty += 1;
  else items.push({ ...entry, key: k, qty: 1, note: "" });
  save();
  renderAll();
  bump();
  toast(t("cart.added", { name: entry.kind === "bowl" ? L(entry.name) : entry.name }));
}

function setQty(key, qty) {
  const it = items.find((i) => i.key === key);
  if (!it) return;
  if (qty <= 0) items = items.filter((i) => i.key !== key);
  else it.qty = Math.min(qty, 99);
  save(); renderAll();
}

export function clearCart() { items = []; save(); renderAll(); }

function totals() {
  let sum = 0, onRequest = false, count = 0;
  items.forEach((i) => { count += i.qty; if (i.price == null) onRequest = true; else sum += i.price * i.qty; });
  return { sum, onRequest, count };
}

const itemName = (i) => (i.kind === "bowl" ? L(i.name) : i.name) + (i.size ? ` ${getLang() === "en" ? i.size.replace(",", ".") : i.size} l` : "");

function bump() {
  $$("[data-cart-count]").forEach((el) => { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); });
}

// ---------------------------------------------------------------- RENDER
function renderAll() {
  const lang = getLang();
  const { sum, onRequest, count } = totals();
  $$("[data-cart-count]").forEach((el) => { el.textContent = count; el.classList.toggle("has-items", count > 0); });

  // drawer
  const list = $("[data-cart-items]");
  list.innerHTML = items.map((i) => `
    <li class="cart-item" data-key="${escapeHtml(i.key)}">
      <div>
        <div class="cart-item__name">${escapeHtml(itemName(i))}</div>
        ${i.variant ? `<div class="cart-item__variant">${escapeHtml(L(i.variant.name))}</div>` : ""}
        ${i.ingredients ? `<div class="cart-item__ings">${i.ingredients.map((g) => `${escapeHtml(L(g.step))}: ${escapeHtml(g.items.map(L).join(", "))}`).join(" · ")}</div>` : ""}
      </div>
      <div class="cart-item__price">${i.price == null ? escapeHtml(t("menu.onRequest")) : fmtPrice(i.price * i.qty, lang)}</div>
      <div class="cart-item__row">
        <div class="qty" role="group" aria-label="${escapeHtml(t("cart.qty"))}: ${escapeHtml(itemName(i))}">
          <button type="button" data-qty="-1" aria-label="${escapeHtml(t("cart.less"))}"><svg class="icon" aria-hidden="true"><use href="#i-minus"/></svg></button>
          <output aria-live="polite">${i.qty}</output>
          <button type="button" data-qty="1" aria-label="${escapeHtml(t("cart.more"))}"><svg class="icon" aria-hidden="true"><use href="#i-plus"/></svg></button>
        </div>
        <button type="button" class="cart-item__remove" data-remove>${escapeHtml(t("cart.remove"))}</button>
      </div>
      <label class="cart-item__note"><span class="visually-hidden">${escapeHtml(t("cart.itemNote"))}</span>
        <input type="text" data-note value="${escapeHtml(i.note)}" placeholder="${escapeHtml(t("cart.itemNotePh"))}" maxlength="140">
      </label>
    </li>`).join("");
  $("[data-cart-empty]").hidden = items.length > 0;
  $("[data-checkout]").hidden = items.length === 0;
  $("[data-cart-total]").textContent = fmtPrice(sum, lang);
  $("[data-cart-total-note]").hidden = !onRequest;
  $("[data-cart-send]").disabled = items.length === 0;

  // rezime u sekciji "Poruči"
  const sumEl = $("[data-order-summary]");
  sumEl.innerHTML = items.length
    ? `<ul>${items.map((i) => `<li><span>${i.qty} × ${escapeHtml(itemName(i))}</span><span>${i.price == null ? escapeHtml(t("menu.onRequest")) : fmtPrice(i.price * i.qty, lang)}</span></li>`).join("")}
        <li class="order__sum"><span>${escapeHtml(t("cart.total"))}</span><span>${fmtPrice(sum, lang)}${onRequest ? " +" : ""}</span></li></ul>`
    : `<p class="order__empty">${escapeHtml(t("order.empty"))}</p>`;
}

// ---------------------------------------------------------------- DRAWER
const drawer = () => $("[data-cart-drawer]");

export function openCart() {
  const d = drawer();
  if (!d.hidden) return;
  lastFocus = document.activeElement;
  showView("items");
  fillTimes();
  d.hidden = false;
  lockScroll();
  $(".drawer__panel", d).focus();
}

function closeCart() {
  const d = drawer();
  if (d.hidden) return;
  const done = () => { d.hidden = true; d.classList.remove("is-closing"); unlockScroll(); lastFocus?.focus?.(); };
  if (reducedMotion()) return done();
  d.classList.add("is-closing");
  setTimeout(done, 270);
}

function showView(v) {
  $$("[data-cart-view]").forEach((el) => { el.hidden = el.dataset.cartView !== v; });
  $("[data-cart-foot]").hidden = v !== "items";
}

// ---------------------------------------------------------------- CHECKOUT
function orderTypes() {
  const f = site.features;
  return ["delivery", "pickup"].filter((x) => f[x]);
}

function fillTimes() {
  const sel = $("#o-time");
  const prev = sel.value;
  const st = getStatus();
  const step = site.ordering.timeStepMinutes || 15;
  const o = hm(site.hours.open), c = hm(site.hours.close);
  const lang = getLang();
  const opts = [];
  if (st.open) opts.push({ v: "asap", l: t("cart.asap") });
  let date = st.now.date, from;
  if (st.open) from = Math.ceil((st.now.minutes + 30) / step) * step;
  else { if (st.now.minutes >= c) date = addDays(date, 1); from = o + 30; }
  const dayLabel = date === st.now.date ? t("cart.today") : `${t("cart.tomorrow")} (${fmtDate(date, lang)})`;
  for (let m = from; m <= c - step; m += step) opts.push({ v: `${date} ${fmtHM(m)}`, l: `${dayLabel} ${fmtHM(m)}` });
  sel.innerHTML = opts.map((x) => `<option value="${x.v}">${escapeHtml(x.l)}</option>`).join("");
  if (opts.some((x) => x.v === prev)) sel.value = prev;
}

function setError(form, name, msg) {
  const input = form.querySelector(`[name="${name}"]`);
  const err = $(`#o-${name}-err`);
  if (err) err.textContent = msg || "";
  if (input && input.type !== "radio") {
    input.setAttribute("aria-invalid", msg ? "true" : "false");
    if (err) input.setAttribute("aria-describedby", err.id);
  }
  return !msg;
}

function validate(form) {
  const d = Object.fromEntries(new FormData(form));
  let ok = true, first = null;
  const check = (name, cond, key) => {
    const good = setError(form, name, cond ? "" : t(key));
    if (!good) { ok = false; first = first || form.querySelector(`[name="${name}"]`); }
  };
  check("name", (d.name || "").trim().length >= 2, "form.errName");
  check("phone", validPhone(d.phone), "form.errPhone");
  check("type", !!d.type, "form.errType");
  if (d.type === "delivery") check("address", (d.address || "").trim().length >= 5, "form.errAddress");
  else setError(form, "address", "");
  if (!ok) first?.focus();
  return ok ? d : null;
}

export function buildOrderMessage(d, lang = getLang()) {
  const tt = (k, v) => t(k, v);
  const { sum, onRequest } = totals();
  const lines = [`🌿 *${tt("wa.orderTitle")}*`, ""];
  lines.push(`*${tt("wa.items")}:*`);
  items.forEach((i) => {
    const price = i.price == null ? tt("menu.onRequest") : `${fmtPrice(i.price, lang)}${i.qty > 1 ? ` = ${fmtPrice(i.price * i.qty, lang)}` : ""}`;
    lines.push(`• ${i.qty} × ${itemName(i)}${i.variant ? ` (${L(i.variant.name)})` : ""} — ${price}`);
    if (i.ingredients) i.ingredients.forEach((g) => lines.push(`   ${L(g.step)}: ${g.items.map(L).join(", ")}`));
    if (i.note) lines.push(`   ${tt("wa.note")}: ${i.note}`);
  });
  lines.push("", `*${tt("cart.total")}:* ${fmtPrice(sum, lang)}${onRequest ? ` ${tt("cart.onRequestNote")}` : ""}`, "");
  lines.push(`*${tt("cart.type")}:* ${tt(d.type === "delivery" ? "cart.delivery" : "cart.pickup")}`);
  if (d.type === "delivery") lines.push(`*${tt("cart.address")}:* ${d.address.trim()}`);
  const timeLabel = $("#o-time").selectedOptions[0]?.textContent || tt("cart.asap");
  lines.push(`*${tt("cart.when")}:* ${timeLabel}`);
  lines.push(`*${tt("cart.payment")}:* ${tt(d.payment === "card" ? "cart.card" : "cart.cash")}`);
  lines.push(`*${tt("form.name")}:* ${d.name.trim()}`);
  lines.push(`*${tt("form.phone")}:* ${d.phone.trim()}`);
  if ((d.note || "").trim()) lines.push(`*${tt("wa.note")}:* ${d.note.trim()}`);
  if (!getStatus().open) lines.push("", tt("wa.closedNote"));
  return lines.join("\n");
}

function send() {
  const form = $("[data-checkout]");
  if (!items.length) return;
  const d = validate(form);
  if (!d) return;
  lastWaUrl = waUrl(site.contact.whatsapp, buildOrderMessage(d));
  window.__lastWaUrl = lastWaUrl; // za testove
  openWa(lastWaUrl);
  showView("done");
  $("[data-cart-view=done]").focus();
}

function bindOrderType() {
  const form = $("[data-checkout]");
  const types = orderTypes();
  const wrap = $("[data-ordertype]");
  wrap.hidden = types.length === 0;
  if (types.length === 1) form.querySelector(`input[value="${types[0]}"]`).checked = true;
  const update = () => {
    const isDel = form.querySelector('input[name="type"]:checked')?.value === "delivery";
    $("[data-address]").hidden = !isDel;
  };
  form.addEventListener("change", (e) => { if (e.target.name === "type") { update(); setError(form, "type", ""); } });
  update();
  // napomena o dostavi (minimalna porudžbina / zone) — prikazuje se samo kad je popunjena
  bindOrderTypeNote();
  // bez dostave i preuzimanja nema WhatsApp porudžbine (ostaje Wolt)
  if (!types.length) {
    $("[data-cart-send]").hidden = true;
    form.hidden = true;
  }
}

export function initCart(siteData) {
  site = siteData;
  items = (store.get(KEY, []) || []).filter((i) => i && i.key && i.qty > 0);
  $$("[data-wolt]").forEach((a) => { a.href = site.social.wolt; });

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-open-cart]")) { e.preventDefault(); openCart(); }
    if (e.target.closest("[data-close-cart]")) closeCart();
  });
  drawer().addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeCart();
    trapFocus($(".drawer__panel"), e);
  });
  const list = $("[data-cart-items]");
  list.addEventListener("click", (e) => {
    const li = e.target.closest(".cart-item");
    if (!li) return;
    const it = items.find((i) => i.key === li.dataset.key);
    const q = e.target.closest("[data-qty]");
    if (q) { setQty(it.key, it.qty + Number(q.dataset.qty)); $(`.cart-item[data-key="${CSS.escape(it.key)}"] [data-qty="${q.dataset.qty}"]`)?.focus(); }
    if (e.target.closest("[data-remove]")) { setQty(it.key, 0); $(".drawer__panel").focus(); }
  });
  list.addEventListener("input", (e) => {
    if (!e.target.matches("[data-note]")) return;
    const it = items.find((i) => i.key === e.target.closest(".cart-item").dataset.key);
    it.note = e.target.value; save();
  });
  $("[data-cart-send]").addEventListener("click", send);
  $("[data-checkout]").addEventListener("submit", (e) => { e.preventDefault(); send(); });
  $("[data-cart-clear]").addEventListener("click", () => { clearCart(); showView("items"); closeCart(); });
  $("[data-cart-back]").addEventListener("click", () => showView("items"));
  $("[data-cart-reopen-wa]").addEventListener("click", (e) => { e.preventDefault(); if (lastWaUrl) openWa(lastWaUrl); });

  bindOrderType();
  renderAll();
  onLangChange(() => { renderAll(); fillTimes(); bindOrderTypeNote(); });
  onStatus(() => { if (!drawer().hidden) fillTimes(); });
  window.addEventListener("storage", (e) => { if (e.key === KEY) { items = store.get(KEY, []); renderAll(); } });
}

function bindOrderTypeNote() {
  const lang = getLang();
  const parts = [];
  if (site.ordering.deliveryMinOrder) parts.push(t("cart.minOrder", { amount: fmtPrice(site.ordering.deliveryMinOrder, lang) }));
  if (site.ordering.deliveryNote) parts.push(L(site.ordering.deliveryNote));
  $$("[data-delivery-note]").forEach((el) => { el.textContent = parts.join(" "); el.hidden = !parts.length; });
}

