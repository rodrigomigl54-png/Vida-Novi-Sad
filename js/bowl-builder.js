// "Napravi svoj bowl" — animirani, Instagram-style smoothie bowl (SVG)
import { $, escapeHtml, fmtPrice, reducedMotion, seeded } from "./util.js";
import { t, L, getLang, onLangChange } from "./i18n.js";
import { addToCart } from "./cart.js";

const NS = "http://www.w3.org/2000/svg";
const C = 200, R_IN = 146, BAND = 54; // centar, unutrašnji radijus, širina trake
let data, stepIdx = 0, sel = {}, shownPrice = 0;

// ---------------------------------------------------------------- ilustracije
function shapeContent(ing, w, h, seed) {
  const rnd = seeded(ing.id + seed);
  const col = ing.color, acc = ing.accent || "#00000033";
  let s = "";
  const rows = (gap) => { const out = []; for (let y = 8; y < h; y += gap) out.push(y + rnd() * 4 - 2); return out; };
  switch (ing.shape) {
    case "slices":
      rows(30).forEach((y, i) => {
        const x = w / 2 + (i % 2 ? 6 : -6) + rnd() * 4;
        s += `<circle cx="${x}" cy="${y}" r="16" fill="${col}" stroke="${acc}" stroke-opacity=".35" stroke-width="1.5"/>`;
        s += `<circle cx="${x}" cy="${y}" r="7" fill="none" stroke="${acc}" stroke-opacity=".45" stroke-width="1"/>`;
        for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; s += `<circle cx="${x + Math.cos(a) * 4}" cy="${y + Math.sin(a) * 4}" r="1.1" fill="${acc}" opacity=".7"/>`; }
      });
      break;
    case "halves":
      rows(26).forEach((y, i) => {
        const x = w / 2 + (i % 2 ? 9 : -9);
        const rot = (rnd() * 40 - 20).toFixed(1);
        s += `<g transform="translate(${x} ${y}) rotate(${rot})"><path d="M0 14C-12 6-13-6-6-11c3-2 5-1 6 1 1-2 3-3 6-1 7 5 6 17-6 25Z" fill="${col}"/><path d="M0 9C-6 4-7-3-3-6" fill="none" stroke="${acc}" stroke-width="2.4" stroke-linecap="round"/>${[...Array(5)].map(() => `<circle cx="${(rnd() * 10 - 5).toFixed(1)}" cy="${(rnd() * 14 - 6).toFixed(1)}" r=".9" fill="#fbe3a0"/>`).join("")}</g>`;
      });
      break;
    case "berries":
      for (let k = 0; k < h * 0.55; k++) {
        const x = 6 + rnd() * (w - 12), y = 4 + rnd() * (h - 8), r = 5 + rnd() * 3.5, c = rnd() > 0.6 ? acc : col;
        s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${c}"/><circle cx="${(x - r / 3).toFixed(1)}" cy="${(y - r / 3).toFixed(1)}" r="${(r / 3.2).toFixed(1)}" fill="#fff" opacity=".22"/>`;
      }
      break;
    case "cubes":
      for (let k = 0; k < h * 0.42; k++) {
        const x = 4 + rnd() * (w - 16), y = 2 + rnd() * (h - 14), z = 10 + rnd() * 5, r = (rnd() * 90).toFixed(0);
        s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${z.toFixed(1)}" height="${z.toFixed(1)}" rx="3" fill="${rnd() > 0.7 ? acc : col}" transform="rotate(${r} ${(x + z / 2).toFixed(1)} ${(y + z / 2).toFixed(1)})"/>`;
      }
      break;
    case "clusters":
      for (let k = 0; k < h * 0.5; k++) {
        const x = 4 + rnd() * (w - 8), y = 4 + rnd() * (h - 8), r = 3.5 + rnd() * 4;
        const pts = [...Array(6)].map((_, j) => { const a = (j / 6) * Math.PI * 2, rr = r * (0.7 + rnd() * 0.5); return `${(x + Math.cos(a) * rr).toFixed(1)},${(y + Math.sin(a) * rr).toFixed(1)}`; }).join(" ");
        s += `<polygon points="${pts}" fill="${rnd() > 0.55 ? acc : col}"/>`;
      }
      break;
    case "flakes":
      for (let k = 0; k < h * 0.45; k++) {
        const x = 4 + rnd() * (w - 8), y = 4 + rnd() * (h - 8), r = (rnd() * 180).toFixed(0);
        s += `<path d="M${x.toFixed(1)} ${y.toFixed(1)}q5 -5 11 -1" transform="rotate(${r} ${x.toFixed(1)} ${y.toFixed(1)})" stroke="${col}" stroke-width="3.2" stroke-linecap="round" fill="none"/><path d="M${x.toFixed(1)} ${(y + 1.6).toFixed(1)}q5 -5 11 -1" transform="rotate(${r} ${x.toFixed(1)} ${y.toFixed(1)})" stroke="${acc}" stroke-width="1" fill="none" opacity=".8"/>`;
      }
      break;
    case "almonds":
      for (let k = 0; k < h * 0.32; k++) {
        const x = 8 + rnd() * (w - 16), y = 6 + rnd() * (h - 12), r = (rnd() * 180).toFixed(0);
        s += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="8" ry="4.6" fill="${col}" stroke="${acc}" stroke-width="1" transform="rotate(${r} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
      }
      break;
    default:
      s = `<rect width="${w}" height="${h}" fill="${col}"/>`;
  }
  return s;
}

function swatch(ing) {
  if (ing.shape === "base") return `<svg class="ing__swatch" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="${ing.color}"/><circle cx="14" cy="14" r="5" fill="#fff" opacity=".18"/></svg>`;
  if (ing.shape === "drizzle") return `<svg class="ing__swatch" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="#f3ece0"/><path d="M6 14c6 6 10-6 16 0s10-6 14 0M6 24c6 6 10-6 16 0s10-6 14 0" stroke="${ing.color}" stroke-width="3.2" fill="none" stroke-linecap="round"/></svg>`;
  return `<svg class="ing__swatch" viewBox="0 0 40 40" aria-hidden="true"><defs><clipPath id="sw-${ing.id}"><circle cx="20" cy="20" r="18"/></clipPath></defs><circle cx="20" cy="20" r="18" fill="#f3ece0"/><g clip-path="url(#sw-${ing.id})"><g transform="translate(0 -4)">${shapeContent(ing, 40, 48, "sw")}</g></g></svg>`;
}

// ---------------------------------------------------------------- bowl SVG
function bowlSvg() {
  return `
  <svg viewBox="0 0 400 400" role="img" aria-labelledby="bowl-svg-title" data-bowl-svg>
    <title id="bowl-svg-title"></title>
    <defs>
      <radialGradient id="shell" cx="45%" cy="40%" r="65%"><stop offset="0" stop-color="#8a6243"/><stop offset=".7" stop-color="#5d3f2a"/><stop offset="1" stop-color="#3c281a"/></radialGradient>
      <radialGradient id="flesh" cx="50%" cy="45%" r="55%"><stop offset=".85" stop-color="#fbf6ec"/><stop offset="1" stop-color="#e9dfcd"/></radialGradient>
      <radialGradient id="inner-shade" cx="50%" cy="50%" r="50%"><stop offset=".72" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></radialGradient>
      <clipPath id="bowl-clip"><circle cx="${C}" cy="${C}" r="${R_IN}"/></clipPath>
    </defs>
    <ellipse cx="${C + 8}" cy="${C + 14}" rx="190" ry="186" fill="#000" opacity=".12"/>
    <circle cx="${C}" cy="${C}" r="188" fill="url(#shell)"/>
    <g opacity=".35" stroke="#2a1b10" stroke-width="1.2" stroke-linecap="round">${[...Array(70)].map((_, i) => { const a = (i / 70) * Math.PI * 2, r1 = 172 + (i % 3) * 4; return `<path d="M${(C + Math.cos(a) * r1).toFixed(1)} ${(C + Math.sin(a) * r1).toFixed(1)}l${(Math.cos(a + 0.6) * 9).toFixed(1)} ${(Math.sin(a + 0.6) * 9).toFixed(1)}"/>`; }).join("")}</g>
    <circle cx="${C}" cy="${C}" r="${R_IN + 12}" fill="url(#flesh)"/>
    <g clip-path="url(#bowl-clip)">
      <circle cx="${C}" cy="${C}" r="${R_IN}" fill="#efe6d6"/>
      <g data-layer-base></g>
      <g data-layer-bands></g>
      <g data-layer-drizzle></g>
      <circle cx="${C}" cy="${C}" r="${R_IN}" fill="url(#inner-shade)"/>
    </g>
    <g data-empty-hint><text x="${C}" y="${C + 5}" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-size="17" fill="#8a7d68"></text></g>
  </svg>`;
}

const ingById = (id) => data.ingredients.find((i) => i.id === id);
const stepIds = () => data.steps.map((s) => s.id);

function bandIngredients() {
  return [...(sel.fruit || []), ...(sel.toppings || [])].map(ingById);
}

function bandX(i, n) { return C - (n * BAND) / 2 + i * BAND; }

function renderBowl(newId) {
  const svg = $("[data-bowl-svg]");
  if (!svg) return;
  const base = ingById((sel.base || [])[0]);
  svg.querySelector("[data-empty-hint]").style.display = base || bandIngredients().length ? "none" : "";
  svg.querySelector("[data-empty-hint] text").textContent = t("bowl.empty");
  svg.querySelector("title").textContent = t("bowl.svgTitle", { list: summaryText() || t("bowl.empty") });

  // baza
  const baseLayer = svg.querySelector("[data-layer-base]");
  const baseKey = base ? base.id : "";
  if (baseLayer.dataset.key !== baseKey) {
    baseLayer.dataset.key = baseKey;
    baseLayer.innerHTML = base
      ? `<g class="bowl-layer${newId === base.id ? " is-new" : ""}"><circle cx="${C}" cy="${C}" r="${R_IN}" fill="${base.color}"/>${[...Array(26)].map((_, i) => { const r = seeded(base.id + i); return `<circle cx="${(C - R_IN + r() * R_IN * 2).toFixed(0)}" cy="${(C - R_IN + r() * R_IN * 2).toFixed(0)}" r="${(8 + r() * 26).toFixed(0)}" fill="#fff" opacity="${(0.03 + r() * 0.05).toFixed(2)}"/>`; }).join("")}</g>`
      : "";
  }

  // trake (voće + toppings) — svaka traka ima svoj <g>, pozicija se animira (re-flow)
  const bands = svg.querySelector("[data-layer-bands]");
  const list = bandIngredients();
  const existing = new Map([...bands.children].filter((g) => !g.dataset.removing).map((g) => [g.dataset.id, g]));
  list.forEach((ing, i) => {
    let g = existing.get(ing.id);
    const x = bandX(i, list.length);
    if (!g) {
      g = document.createElementNS(NS, "g");
      g.dataset.id = ing.id;
      g.innerHTML = `<g class="bowl-layer${newId === ing.id ? " is-new" : ""}">${shapeContent(ing, BAND, R_IN * 2 + 10, "band")}</g>`;
      g.style.transform = `translate(${x}px, ${C - R_IN - 5}px)`;
      bands.appendChild(g);
    } else {
      existing.delete(ing.id);
      g.style.transform = `translate(${x}px, ${C - R_IN - 5}px)`;
    }
    g.classList.add("bowl-layer");
  });
  existing.forEach((g) => { g.dataset.removing = "1"; g.style.opacity = "0"; setTimeout(() => g.remove(), reducedMotion() ? 0 : 400); });

  // preliv
  const dz = svg.querySelector("[data-layer-drizzle]");
  const drizzle = ingById((sel.drizzle || [])[0]);
  const dKey = drizzle ? drizzle.id : "";
  if (dz.dataset.key !== dKey) {
    dz.dataset.key = dKey;
    if (drizzle) {
      let d = `M${C - 150} ${C - 70}`;
      for (let k = 0; k < 6; k++) d += ` q 25 ${k % 2 ? -36 : 36} 50 0`;
      dz.innerHTML = `<path d="${d}" fill="none" stroke="${drizzle.color}" stroke-width="5" stroke-linecap="round" opacity=".92" pathLength="1" class="bowl-drizzle"/>
                      <path d="${d.replace(`${C - 70}`, `${C + 60}`)}" fill="none" stroke="${drizzle.color}" stroke-width="4" stroke-linecap="round" opacity=".85" pathLength="1" class="bowl-drizzle"/>`;
      if (!reducedMotion()) dz.querySelectorAll("path").forEach((p, i) => p.animate([{ strokeDasharray: "1 1", strokeDashoffset: 1 }, { strokeDasharray: "1 1", strokeDashoffset: 0 }], { duration: 900, delay: i * 180, easing: "cubic-bezier(.22,1,.36,1)", fill: "backwards" }));
    } else dz.innerHTML = "";
  }
}

// let sastojka iz čipa u bowl (luk + "settle")
function fly(fromEl, ing, then) {
  if (reducedMotion() || !fromEl) return then();
  const svg = $("[data-bowl-svg]");
  const sr = svg.getBoundingClientRect();
  const fr = fromEl.querySelector(".ing__swatch").getBoundingClientRect();
  const k = sr.width / 400;
  let tx = sr.left + C * k, ty = sr.top + C * k;
  if (ing.step === "fruit" || ing.step === "toppings") {
    const list = [...(sel.fruit || []), ...(sel.toppings || [])];
    const i = list.indexOf(ing.id);
    tx = sr.left + (bandX(i, list.length) + BAND / 2) * k;
    ty = sr.top + (C - 30) * k;
  }
  const el = document.createElement("div");
  el.className = "bowl-fly";
  el.innerHTML = swatch(ing);
  document.body.appendChild(el);
  const x0 = fr.left, y0 = fr.top, x1 = tx - 22, y1 = ty - 22;
  const peak = Math.min(y0, y1) - 90;
  const anim = el.animate([
    { transform: `translate(${x0}px, ${y0}px) scale(1)`, opacity: 1 },
    { transform: `translate(${(x0 + x1) / 2}px, ${peak}px) scale(1.15)`, opacity: 1, offset: 0.45 },
    { transform: `translate(${x1}px, ${y1}px) scale(.7)`, opacity: 0.2 },
  ], { duration: 640, easing: "cubic-bezier(.45,.05,.35,1)" });
  anim.onfinish = () => { el.remove(); then(); };
}

// ---------------------------------------------------------------- cena
function priceInfo() {
  const chosen = stepIds().flatMap((s) => sel[s] || []).map(ingById);
  const unknown = data.basePrice == null || chosen.some((i) => i.price == null);
  const total = (data.basePrice || 0) + chosen.reduce((a, i) => a + (i.price || 0), 0);
  return { unknown, total };
}

function renderTotal() {
  const el = $("[data-bowl-total]");
  const { unknown, total } = priceInfo();
  if (unknown) { el.textContent = t("menu.onRequest"); return; }
  const from = shownPrice, to = total, t0 = performance.now();
  if (reducedMotion()) { shownPrice = to; el.textContent = fmtPrice(to, getLang()); return; }
  const step = (now) => {
    const p = Math.min((now - t0) / 500, 1);
    shownPrice = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
    el.textContent = fmtPrice(shownPrice, getLang());
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------------------------------------------------------------- UI koraka
function renderSteps() {
  $("[data-bowl-steps]").innerHTML = data.steps.map((s, i) => `
    <li><button type="button" class="bowl__step${(sel[s.id] || []).length ? " is-done" : ""}" data-step="${i}" ${i === stepIdx ? 'aria-current="step"' : ""}>
      <span class="bowl__step-n">${i + 1}</span>${escapeHtml(L(s.name))}</button></li>`).join("");
  const step = data.steps[stepIdx];
  $("[data-bowl-ingredients]").innerHTML = data.ingredients.filter((i) => i.step === step.id).map((i) => `
    <button type="button" class="ing" data-ing="${i.id}" aria-pressed="${(sel[step.id] || []).includes(i.id)}">
      ${swatch(i)}
      <span><span class="ing__name">${escapeHtml(L(i.name))}</span><span class="ing__price">${i.price == null ? escapeHtml(t("menu.onRequest")) : "+ " + fmtPrice(i.price, getLang())}</span></span>
    </button>`).join("");
  const max = data.maxPerStep[step.id] || 1;
  $("[data-bowl-hint]").textContent = max > 1 ? t("bowl.pickUpTo", { n: max }) : t("bowl.pickOne");
  $("[data-bowl-prev]").disabled = stepIdx === 0;
  $("[data-bowl-next]").textContent = stepIdx === data.steps.length - 1 ? t("bowl.finish") : t("bowl.next");
}

function toggle(id, btn) {
  const ing = ingById(id);
  const step = ing.step;
  const max = data.maxPerStep[step] || 1;
  const cur = sel[step] || [];
  if (cur.includes(id)) {
    sel[step] = cur.filter((x) => x !== id);
    renderSteps(); renderBowl(); renderTotal();
    $(`[data-ing="${id}"]`)?.focus();
    return;
  }
  if (max === 1) sel[step] = [id];
  else if (cur.length >= max) { $("[data-bowl-hint]").textContent = t("bowl.maxReached", { n: max }); return; }
  else sel[step] = [...cur, id];
  renderSteps();
  $(`[data-ing="${id}"]`)?.focus();
  // pozicije ostalih traka se odmah pomeraju (re-flow), novi sastojak "doleti"
  const later = () => { renderBowl(id); renderTotal(); };
  if (step === "fruit" || step === "toppings") {
    const svg = $("[data-bowl-svg]");
    const list = bandIngredients();
    [...svg.querySelector("[data-layer-bands]").children].filter((g) => !g.dataset.removing).forEach((g) => {
      const i = list.findIndex((x) => x.id === g.dataset.id);
      if (i >= 0) g.style.transform = `translate(${bandX(i, list.length)}px, ${C - R_IN - 5}px)`;
    });
  }
  fly(btn, ing, later);
}

function summaryText() {
  return data.steps.map((s) => (sel[s.id] || []).length ? `${L(s.name)}: ${(sel[s.id]).map((id) => L(ingById(id).name)).join(", ")}` : "").filter(Boolean).join("; ");
}

function ingredientGroups() {
  return data.steps.filter((s) => (sel[s.id] || []).length).map((s) => ({ step: s.name, items: sel[s.id].map((id) => ingById(id).name) }));
}

// ---------------------------------------------------------------- share kartica (PNG)
async function svgToImage(svg) {
  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", NS);
  clone.setAttribute("width", "800"); clone.setAttribute("height", "800");
  clone.querySelectorAll(".bowl-layer").forEach((g) => g.classList.remove("is-new"));
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

function loadLogo() {
  return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = "assets/img/logo/vida-logo.png"; });
}

async function renderCard() {
  const canvas = $("[data-bowl-card]");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  try { await document.fonts.ready; } catch (_) { /* */ }
  ctx.fillStyle = "#faf6ee"; ctx.fillRect(0, 0, W, W);
  // mekani krug u pozadini
  const g = ctx.createRadialGradient(W * 0.72, W * 0.2, 10, W * 0.72, W * 0.2, W * 0.7);
  g.addColorStop(0, "#e3ebdc"); g.addColorStop(1, "rgba(227,235,220,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, W);

  ctx.fillStyle = "#161814";
  ctx.font = "italic 400 64px Fraunces, Georgia, serif";
  ctx.fillText(t("bowl.cardTitle"), 72, 128);
  ctx.font = "700 24px Manrope, system-ui, sans-serif";
  ctx.fillStyle = "#2e5a3d";
  ctx.fillText("THE FEEL GOOD PLACE · NOVI SAD", 74, 172);

  const img = await svgToImage($("[data-bowl-svg]"));
  ctx.drawImage(img, 40, 210, 620, 620);

  // spisak sastojaka
  let y = 300;
  ctx.textBaseline = "top";
  data.steps.forEach((s) => {
    const ids = sel[s.id] || [];
    if (!ids.length) return;
    ctx.fillStyle = "#2e5a3d"; ctx.font = "800 20px Manrope, system-ui, sans-serif";
    ctx.fillText(L(s.name).toUpperCase(), 690, y); y += 32;
    ctx.fillStyle = "#161814"; ctx.font = "500 28px Manrope, system-ui, sans-serif";
    ids.forEach((id) => { ctx.fillText(L(ingById(id).name), 690, y, 350); y += 38; });
    y += 18;
  });
  ctx.textBaseline = "alphabetic";
  const logo = await loadLogo();
  if (logo) ctx.drawImage(logo, W - 72 - 150, W - 72 - 150, 150, 150);
  ctx.fillStyle = "#4a4d45"; ctx.font = "600 24px Manrope, system-ui, sans-serif";
  ctx.fillText("@vidanovisad", 72, W - 84);
  canvas.setAttribute("aria-label", `${t("bowl.cardLabel")}: ${summaryText()}`);
}

function download() {
  const canvas = $("[data-bowl-card]");
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "moj-vida-bowl.png";
    document.body.appendChild(a); a.click(); a.remove();
    window.__lastBowlPng = blob.size;
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, "image/png");
}

async function finish() {
  if (!(sel.base || []).length) { stepIdx = 0; renderSteps(); $("[data-bowl-hint]").textContent = t("bowl.needBase"); return; }
  const box = $("[data-bowl-summary]");
  box.hidden = false;
  $("[data-bowl-list]").innerHTML = ingredientGroups().map((g) => `<li><strong>${escapeHtml(L(g.step))}:</strong> ${escapeHtml(g.items.map(L).join(", "))}</li>`).join("");
  await renderCard();
  box.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
}

function reset() {
  sel = {}; stepIdx = 0; shownPrice = 0;
  $("[data-bowl-summary]").hidden = true;
  renderSteps(); renderBowl(); renderTotal();
}

export function initBowl(bowlData) {
  data = bowlData;
  $("[data-bowl-visual]").innerHTML = bowlSvg();
  renderSteps(); renderBowl(); renderTotal();

  $("[data-bowl-steps]").addEventListener("click", (e) => { const b = e.target.closest("[data-step]"); if (b) { stepIdx = Number(b.dataset.step); renderSteps(); } });
  $("[data-bowl-ingredients]").addEventListener("click", (e) => { const b = e.target.closest("[data-ing]"); if (b) toggle(b.dataset.ing, b); });
  $("[data-bowl-prev]").addEventListener("click", () => { if (stepIdx > 0) { stepIdx--; renderSteps(); } });
  $("[data-bowl-next]").addEventListener("click", () => { if (stepIdx < data.steps.length - 1) { stepIdx++; renderSteps(); } else finish(); });
  $("[data-bowl-reset]").addEventListener("click", reset);
  $("[data-bowl-download]").addEventListener("click", download);
  $("[data-bowl-add]").addEventListener("click", () => {
    const { unknown, total } = priceInfo();
    addToCart({ kind: "bowl", id: "custom-bowl", name: { sr: "Moj Vida bowl", en: "My Vida bowl" }, variant: null, price: unknown ? null : total, ingredients: ingredientGroups() });
  });
  onLangChange(() => { renderSteps(); renderBowl(); renderTotal(); if (!$("[data-bowl-summary]").hidden) finish(); });
  window.__bowl = { get sel() { return sel; }, priceInfo };
}
