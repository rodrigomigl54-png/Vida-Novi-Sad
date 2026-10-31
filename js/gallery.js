// Galerija: jedan red, horizontalni swipe / drag / strelice / trackpad, scroll-snap
import { $, escapeHtml, reducedMotion } from "./util.js";
import { L, onLangChange } from "./i18n.js";

let data;

function render() {
  const track = $("[data-gal-track]");
  track.innerHTML = data.items.map((g, i) => {
    const [sm, lg] = g.sizes;
    const big = lg || sm;
    return `
      <figure class="gal-item" style="aspect-ratio:${g.ratio}">
        <picture>
          <source type="image/webp" srcset="${g.sizes.map((s) => `${s.base}.webp ${s.w}w`).join(", ")}" sizes="(min-width: 900px) 40vw, 80vw">
          <img src="${big.base}.jpg" alt="${escapeHtml(L(g.alt))}" width="${big.w}" height="${big.h}" loading="${i < 2 ? "eager" : "lazy"}" decoding="async" draggable="false">
        </picture>
      </figure>`;
  }).join("");
}

export function initGallery(galleryData) {
  data = galleryData;
  render();
  onLangChange(render);
  const track = $("[data-gal-track]");
  const bar = $("[data-gal-progress]");

  // napredak
  const progress = () => {
    const max = track.scrollWidth - track.clientWidth;
    const vis = track.clientWidth / track.scrollWidth;
    const p = max > 0 ? track.scrollLeft / max : 0;
    bar.style.width = `${Math.max(vis * 100, 8)}%`;
    bar.style.transform = `translateX(${p * (1 / Math.max(vis, 0.08) - 1) * 100}%)`;
  };
  track.addEventListener("scroll", () => requestAnimationFrame(progress), { passive: true });
  window.addEventListener("resize", progress);
  setTimeout(progress, 100);

  // strelice: pomeri za jednu fotografiju
  const step = (dir) => {
    const items = [...track.children];
    const left = track.scrollLeft;
    const pad = parseFloat(getComputedStyle(track).scrollPaddingLeft) || 0;
    const target = dir > 0
      ? items.find((el) => el.offsetLeft - pad > left + 4)
      : [...items].reverse().find((el) => el.offsetLeft - pad < left - 4);
    const to = target ? target.offsetLeft - pad : dir > 0 ? track.scrollWidth : 0;
    track.scrollTo({ left: to, behavior: reducedMotion() ? "auto" : "smooth" });
  };
  $("[data-gal-prev]").addEventListener("click", () => step(-1));
  $("[data-gal-next]").addEventListener("click", () => step(1));
  track.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
  });

  // drag mišem (dodir koristi nativni scroll)
  let down = false, startX = 0, startLeft = 0, moved = 0, lastX = 0, lastT = 0, vel = 0, raf;
  track.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    cancelAnimationFrame(raf);
    down = true; moved = 0; startX = lastX = e.clientX; startLeft = track.scrollLeft; lastT = performance.now(); vel = 0;
    track.setPointerCapture(e.pointerId);
  });
  track.addEventListener("pointermove", (e) => {
    if (!down) return;
    const dx = e.clientX - startX;
    moved = Math.max(moved, Math.abs(dx));
    if (moved > 3) track.classList.add("is-dragging");
    track.scrollLeft = startLeft - dx;
    const now = performance.now();
    vel = (e.clientX - lastX) / Math.max(now - lastT, 1);
    lastX = e.clientX; lastT = now;
  });
  const end = (e) => {
    if (!down) return;
    down = false;
    try { track.releasePointerCapture(e.pointerId); } catch (_) { /* */ }
    // inercija, zatim scroll-snap
    let v = -vel * 16;
    const glide = () => {
      if (Math.abs(v) < 0.5 || reducedMotion()) { track.classList.remove("is-dragging"); return; }
      track.scrollLeft += v; v *= 0.92; raf = requestAnimationFrame(glide);
    };
    glide();
  };
  track.addEventListener("pointerup", end);
  track.addEventListener("pointercancel", end);
  track.addEventListener("click", (e) => { if (moved > 5) { e.preventDefault(); e.stopPropagation(); } }, true);
}
