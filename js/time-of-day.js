// Hero koji zavisi od doba dana (Europe/Belgrade)
import { $, hm, escapeHtml } from "./util.js";
import { t, L, onLangChange } from "./i18n.js";
import { onStatus } from "./open-status.js";
import { categoryIcon } from "./menu.js";

let site, menu, gallery, current;

export function pickSlot(status) {
  if (!status.open) return site.timeOfDay.find((s) => s.id === "closed");
  const m = status.now.minutes;
  return site.timeOfDay.find((s) => s.id !== "closed" && m >= hm(s.from) && m < hm(s.to)) || site.timeOfDay[0];
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

  // fotografija za doba dana
  const img = gallery.items.find((g) => g.id === s.image);
  const fig = $(".hero__media");
  const pic = $("[data-hero-picture]");
  if (img && pic.dataset.current !== img.id) {
    const apply = () => {
      const [sm, lg] = img.sizes;
      pic.querySelector("source").srcset = img.sizes.map((z) => `${z.base}.webp ${z.w}w`).join(", ");
      const el = pic.querySelector("img");
      el.src = `${lg.base}.jpg`; el.width = lg.w; el.height = lg.h; el.alt = L(img.alt);
      pic.dataset.current = img.id;
      fig.classList.remove("is-swapping");
      void sm;
    };
    if (pic.dataset.current) { fig.classList.add("is-swapping"); setTimeout(apply, 350); } else apply();
  } else if (img) {
    pic.querySelector("img").alt = L(img.alt);
  }
}

export function initTimeOfDay(siteData, menuData, galleryData) {
  site = siteData; menu = menuData; gallery = galleryData;
  onStatus((status) => {
    const slot = pickSlot(status);
    if (!current || current.id !== slot.id) { current = slot; renderHero(slot); }
  });
  onLangChange(() => current && renderHero(current));
}
