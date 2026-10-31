// "Kako se osećaš?" — čipovi raspoloženja koji filtriraju meni
import { $, $$, escapeHtml, reducedMotion } from "./util.js";
import { t, L, onLangChange } from "./i18n.js";
import { setMood, onMoodChange, getMenu } from "./menu.js";

const ICON = { energy: "sun", light: "leaf", sweet: "cake", "post-workout": "glass", kids: "kids", "coffee-relax": "cup" };
let active = null;

function render() {
  const menu = getMenu();
  $("[data-mood-chips]").innerHTML = Object.entries(menu.moods).map(([id, label]) => `
    <button type="button" class="mood-chip" data-mood="${id}" aria-pressed="${active === id}">
      <span class="mood-chip__dot"><svg class="icon" aria-hidden="true" viewBox="0 0 48 48"><use href="#i-${ICON[id] || "leaf"}"/></svg></span>
      ${escapeHtml(L(label))}
    </button>`).join("");
  // ikonice iz seta su 24 ili 48 jedinica — koristimo pravi viewBox
  $$(".mood-chip__dot svg").forEach((svg) => {
    const id = svg.querySelector("use").getAttribute("href").slice(1);
    const sym = document.getElementById(id);
    if (sym) svg.setAttribute("viewBox", sym.getAttribute("viewBox"));
  });
  hint();
}

function hint() {
  const el = $("[data-mood-hint]");
  if (!active) { el.textContent = t("mood.hint"); return; }
  const menu = getMenu();
  const n = menu.categories.reduce((a, c) => a + c.items.filter((i) => i.mood.includes(active)).length, 0);
  el.textContent = t("mood.result", { n, mood: L(menu.moods[active]) });
}

export function initMood() {
  render();
  $("[data-mood-chips]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-mood]");
    if (!b) return;
    const next = active === b.dataset.mood ? null : b.dataset.mood;
    setMood(next);
    if (next) {
      const target = $("#meni .menu__tools");
      target?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
    }
  });
  onMoodChange((m) => {
    active = m;
    $$("[data-mood]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mood === m)));
    hint();
  });
  onLangChange(render);
}
