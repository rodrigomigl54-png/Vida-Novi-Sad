// Intro "Walking into Vida" — kontinuirani "dolly" kroz fotografije, pa logo
import { $, store, reducedMotion } from "./util.js";

const SESSION_KEY = "vida-intro";
const VISITOR_KEY = "vida-intro-visitor";

const easeInOut = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const easeOut = (p) => 1 - Math.pow(1 - p, 3);
const walk = (p) => 0.75 * p + 0.25 * easeInOut(p); // skoro konstantna brzina hoda

function supportsWebp() {
  try { return document.createElement("canvas").toDataURL("image/webp").startsWith("data:image/webp"); } catch (e) { return false; }
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => (img.decode ? img.decode().catch(() => {}).then(() => res(img)) : res(img));
    img.onerror = rej;
    img.src = src;
  });
}

/** Normalizovani pravougaonik (u originalnom kadru) → u koordinate portrait isečka */
function toPortrait(r, crop) {
  const [cx, cy, cw, ch] = crop;
  let x = (r[0] - cx) / cw, y = (r[1] - cy) / ch, w = r[2] / cw, h = r[3] / ch;
  w = Math.min(w, 1); h = Math.min(h, 1);
  x = Math.min(Math.max(x, 0), 1 - w); y = Math.min(Math.max(y, 0), 1 - h);
  return [x, y, w, h];
}

/** "cover" isečak oko normalizovanog pravougaonika za platno odnosa A */
function sourceRect(img, r, A) {
  const iw = img.naturalWidth, ih = img.naturalHeight;
  let w = r[2] * iw, h = r[3] * ih;
  const cx = (r[0] + r[2] / 2) * iw, cy = (r[1] + r[3] / 2) * ih;
  if (w / h < A) w = h * A; else h = w / A;
  const s = Math.min(1, iw / w, ih / h);
  w *= s; h *= s;
  const x = Math.min(Math.max(cx - w / 2, 0), iw - w);
  const y = Math.min(Math.max(cy - h / 2, 0), ih - h);
  return [x, y, w, h];
}

/** geometrijska interpolacija zuma (konstantan osećaj brzine) */
function lerpRect(a, b, p) {
  const w = a[2] * Math.pow(b[2] / a[2], p), h = a[3] * Math.pow(b[3] / a[3], p);
  const ca = [a[0] + a[2] / 2, a[1] + a[3] / 2], cb = [b[0] + b[2] / 2, b[1] + b[3] / 2];
  const cx = ca[0] + (cb[0] - ca[0]) * p, cy = ca[1] + (cb[1] - ca[1]) * p;
  return [cx - w / 2, cy - h / 2, w, h];
}

export function introShouldPlay(cfg, features) {
  if (!features.intro || !cfg.enabled) return false;
  if (/[?&]nointro\b/.test(location.search)) return false;
  if (store.get(SESSION_KEY, null, "session")) return false;
  if (cfg.playMode === "visitor" && store.get(VISITOR_KEY)) return false;
  return document.documentElement.classList.contains("intro-pending");
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
    const canvas = $(".intro__canvas", root);
    const ctx = canvas.getContext("2d");
    const bar = $(".intro__loader span", root);
    const skipBtn = $(".intro__skip", root);
    let finished = false, raf = 0, frames = [], portrait = false;

    const markPlayed = () => {
      store.set(SESSION_KEY, 1, "session");
      if (cfg.playMode === "visitor") store.set(VISITOR_KEY, 1);
    };

    const finish = (reason, fast) => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      markPlayed();
      root.classList.add("is-leaving");
      if (fast) root.style.transitionDuration = "350ms";
      html.classList.remove("intro-pending");
      setTimeout(() => { root.remove(); resolve(reason); }, fast ? 380 : 950);
      $("#main")?.focus?.({ preventScroll: true });
    };

    skipBtn.addEventListener("click", () => finish("skip", true));
    root.addEventListener("keydown", (e) => { if (e.key === "Escape") finish("skip", true); });
    skipBtn.focus({ preventScroll: true });
    window.scrollTo(0, 0);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(innerWidth * dpr);
      canvas.height = Math.round(innerHeight * dpr);
      portrait = innerHeight > innerWidth * 1.05;
    };
    resize();
    addEventListener("resize", resize);

    const ext = supportsWebp() ? "webp" : "jpg";
    const list = cfg.frames || [];
    const reduced = reducedMotion();
    // reduced motion: samo poslednji kadar
    const toLoad = reduced ? list.slice(-1) : list;
    const useSet = portrait ? "portrait" : "landscape";

    // predugo učitavanje → preskoči intro
    const slowTimer = setTimeout(() => { if (!frames.length) finish("slow", true); }, cfg.skipIfLoadingLongerThanMs || 3000);

    let loaded = 0;
    Promise.all(toLoad.map((f) => loadImage(`${f.src[useSet]}.${ext}`).then((img) => {
      loaded++; bar.style.width = `${(loaded / toLoad.length) * 100}%`;
      const target = useSet === "portrait" ? toPortrait(f.target, f.size.portrait.crop) : f.target;
      return { img, target };
    }))).then((imgs) => {
      clearTimeout(slowTimer);
      if (finished) return;
      frames = imgs;
      root.classList.add("is-playing");
      if (reduced) return playStatic();
      play();
    }).catch(() => { clearTimeout(slowTimer); finish("error", true); });

    function draw(fr, rect, alpha, blur) {
      const A = canvas.width / canvas.height;
      const [sx, sy, sw, sh] = sourceRect(fr.img, rect, A);
      ctx.globalAlpha = alpha;
      ctx.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "none";
      ctx.drawImage(fr.img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      ctx.filter = "none";
      ctx.globalAlpha = 1;
    }

    function playStatic() {
      const fr = frames[0];
      draw(fr, fr.target, 1, 0);
      root.classList.add("is-logo");
      setTimeout(() => finish("done"), 1000);
    }

    function play() {
      const N = frames.length;
      const total = cfg.durationMs || 5200;
      const seg = total / N;
      const overlap = seg * 0.42; // trajanje pretapanja
      const FULL = [0, 0, 1, 1];
      const t0 = performance.now();
      let logoShown = false;

      const tick = (now) => {
        const t = now - t0;
        ctx.fillStyle = "#0f120f";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        for (let i = 0; i < N; i++) {
          const start = i === 0 ? 0 : i * seg - overlap;
          const end = i === N - 1 ? total + (cfg.logoHoldMs || 1100) : (i + 1) * seg;
          if (t < start || (i < N - 1 && t > end)) continue;
          const fr = frames[i];
          let p = Math.min(Math.max((t - start) / (end - start), 0), 1);
          let rect;
          if (i === N - 1) {
            // poslednji kadar (šank): uspori i stani
            const pl = Math.min(Math.max((t - start) / (total - start + 600), 0), 1);
            rect = lerpRect(FULL, fr.target, easeOut(pl));
          } else {
            rect = lerpRect(FULL, fr.target, walk(p));
          }
          // pretapanje dolaznog kadra
          let alpha = 1, blur = 0;
          if (i > 0 && t < i * seg) {
            const q = (t - start) / overlap;
            alpha = easeInOut(Math.min(Math.max(q, 0), 1));
            blur = Math.sin(Math.PI * Math.min(q, 1)) * 1.6 * (canvas.width / 1000);
          }
          // odlazni kadar: blagi motion blur tokom pretapanja
          if (i < N - 1 && t > (i + 1) * seg - overlap) {
            const q = (t - ((i + 1) * seg - overlap)) / overlap;
            blur = Math.sin(Math.PI * Math.min(q, 1)) * 1.2 * (canvas.width / 1000);
          }
          draw(fr, rect, alpha, blur);
        }

        if (!logoShown && t >= total - 250) { logoShown = true; root.classList.add("is-logo"); }
        if (t >= total + (cfg.logoHoldMs || 1100) + 700) return finish("done");
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
  });
}
