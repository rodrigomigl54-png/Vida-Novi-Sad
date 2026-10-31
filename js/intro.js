// Intro — montirani video (telefon: vertikalni; računar: triptih), logo, pa prelaz na početnu
import { $, store, reducedMotion } from "./util.js";

const SESSION_KEY = "vida-intro";
const VISITOR_KEY = "vida-intro-visitor";

export function introShouldPlay(cfg, features) {
  if (!features.intro || !cfg.enabled) return false;
  if (/[?&]nointro\b/.test(location.search)) return false;
  if (store.get(SESSION_KEY, null, "session")) return false;
  if (cfg.playMode === "visitor" && store.get(VISITOR_KEY)) return false;
  return document.documentElement.classList.contains("intro-pending");
}

function sources(video, base) {
  video.innerHTML = `<source src="${base}.webm" type="video/webm"><source src="${base}.mp4" type="video/mp4">`;
}

/** Logo „odleti“ iz intro-a na svoje mesto u headeru */
function flyLogo(logo) {
  const target = document.querySelector(".site-header .brand img");
  if (!logo || !target || reducedMotion()) return;
  const a = logo.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  if (!a.width || !b.width) return;
  const clone = logo.cloneNode();
  clone.className = "logo-flight";
  Object.assign(clone.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
  document.body.appendChild(clone);
  const brand = target.closest(".brand");
  brand.classList.add("is-arriving");
  const s = b.width / a.width;
  const anim = clone.animate([
    { transform: "translate(0,0) scale(1)", opacity: 1, filter: "invert(0)" },
    { transform: `translate(${b.left - a.left}px, ${b.top - a.top}px) scale(${s})`, opacity: 0.9, filter: "invert(0.92)" },
  ], { duration: 850, easing: "cubic-bezier(.65,0,.25,1)", fill: "forwards" });
  anim.onfinish = () => {
    brand.classList.remove("is-arriving");
    clone.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 300, fill: "forwards" }).onfinish = () => clone.remove();
  };
}

export function runIntro(cfg, features) {
  const root = $("#intro");
  const html = document.documentElement;
  window.__vidaIntro = true;

  if (!introShouldPlay(cfg, features)) {
    html.classList.remove("intro-pending");
    root?.remove();
    return Promise.resolve("skipped");
  }

  return new Promise((resolve) => {
    const portrait = innerHeight >= innerWidth || innerWidth < 900;
    const conf = portrait ? cfg.mobile : cfg.desktop;
    root.classList.add(portrait ? "is-portrait" : "is-landscape");
    const video = $(".intro__video", root);
    const bar = $(".intro__loader span", root);
    const logo = $(".intro__logo", root);
    let finished = false, raf = 0;

    const markPlayed = () => {
      store.set(SESSION_KEY, 1, "session");
      if (cfg.playMode === "visitor") store.set(VISITOR_KEY, 1);
    };

    const finish = (reason, fast) => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      markPlayed();
      if (!fast && root.classList.contains("is-logo")) flyLogo(logo);
      root.classList.add("is-leaving");
      if (fast) root.style.transitionDuration = "300ms";
      html.classList.remove("intro-pending");
      setTimeout(() => { try { video.pause(); } catch (_) { /* */ } root.remove(); resolve(reason); }, fast ? 320 : 820);
      $("#main")?.focus?.({ preventScroll: true });
    };

    $(".intro__skip", root).addEventListener("click", () => finish("skip", true));
    root.addEventListener("keydown", (e) => { if (e.key === "Escape") finish("skip", true); });
    $(".intro__skip", root).focus({ preventScroll: true });
    window.scrollTo(0, 0);

    // bez animacija: samo poslednji kadar + logo
    if (reducedMotion()) {
      video.poster = `${conf.src}-poster.webp`;
      video.preload = "none";
      root.classList.add("is-playing", "is-logo");
      setTimeout(() => finish("done"), 1100);
      return;
    }

    // učitavanje; ako traje predugo (spora mreža) — preskoči
    const slow = setTimeout(() => { if (!root.classList.contains("is-playing")) finish("slow", true); }, cfg.skipIfLoadingLongerThanMs || 3000);
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    sources(video, conf.src);
    video.addEventListener("progress", () => {
      try { if (video.duration) bar.style.width = `${Math.min(100, (video.buffered.end(0) / video.duration) * 100)}%`; } catch (_) { /* */ }
    });
    video.addEventListener("error", () => finish("error", true), true);
    video.addEventListener("ended", () => setTimeout(() => finish("done"), cfg.endHoldMs ?? 250));

    const start = () => {
      if (finished || root.classList.contains("is-playing")) return;
      const p = video.play();
      const go = () => {
        clearTimeout(slow);
        root.classList.add("is-playing");
        const tick = () => {
          if (!root.classList.contains("is-logo") && video.currentTime >= conf.logoAt) root.classList.add("is-logo");
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      };
      if (p && p.then) p.then(go).catch(() => finish("autoplay-blocked", true)); else go();
    };
    video.addEventListener("canplaythrough", start, { once: true });
    video.load();
  });
}
