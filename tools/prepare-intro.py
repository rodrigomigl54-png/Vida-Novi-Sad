#!/usr/bin/env python3
"""
prepare-intro.py — priprema fotografija za intro "Walking into Vida".

Šta radi:
  1. Čita redosled kadrova iz data/intro.json (ključ "order"). Ako ne postoji,
     koristi abecedni redosled fajlova iz assets/source/intro/ (01-, 02-, ...).
  2. Ujednačava boje svih kadrova na jedan "sunčan, svetao, topao" izgled
     (balans belog, ekspozicija, kontrast, blagi topli ton).
  3. Na spoljnim kadrovima (type: "exterior") pokušava da zameni sivo/belo nebo
     čistim plavim nebom (heuristička segmentacija neba + meka maska).
  4. Za svaki par kadrova N -> N+1 traži (ORB + homografija) gde se kadar N+1
     nalazi unutar kadra N. Taj pravougaonik je "cilj" kamere (dolly zoom).
     Ako poklapanje ne uspe, koristi se ručna tačka fokusa iz intro.json
     ("manualFocus") ili centar.
  5. Izvozi WebP + JPG u dve verzije: landscape i portrait (pametno isečen oko
     putanje fokusa) u assets/img/intro/.
  6. Upisuje rezultat u data/intro.json (ručna podešavanja se čuvaju).

Originali u assets/source/ se NIKAD ne menjaju.

Pokretanje (iz root foldera sajta):
    pip install opencv-python-headless numpy pillow
    python3 tools/prepare-intro.py
"""
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "source", "intro")
OUT = os.path.join(ROOT, "assets", "img", "intro")
CFG = os.path.join(ROOT, "data", "intro.json")

# Izvozne dimenzije. Originalne fotografije su male (~550px), pa ne
# povećavamo na 1920px (bilo bi mutno) — vidi REVIEW.md.
LANDSCAPE_MAX_W = 1280
PORTRAIT_SIZE = (720, 1280)
WEBP_Q = 78
JPG_Q = 80
# Ako je originalna slika manja od ciljne, dozvoljeno povećanje (faktor).
MAX_UPSCALE = 2.2


# --------------------------------------------------------------------------
# Konfiguracija
# --------------------------------------------------------------------------
def load_cfg():
    if os.path.exists(CFG):
        with open(CFG, encoding="utf-8") as f:
            return json.load(f)
    return {}


def frame_list(cfg):
    files = sorted(
        f for f in os.listdir(SRC) if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))
    )
    if cfg.get("order"):
        order = [o["file"] for o in cfg["order"] if o["file"] in files and not o.get("skip")]
        return order, {o["file"]: o for o in cfg["order"]}
    return files, {}


# --------------------------------------------------------------------------
# Kolor grading
# --------------------------------------------------------------------------
def gray_world_wb(img, strength=0.6):
    """Delimičan gray-world balans belog (ne skroz, da ne ubije atmosferu)."""
    f = img.astype(np.float32)
    means = f.reshape(-1, 3).mean(0)
    gray = means.mean()
    gains = 1 + strength * (gray / np.maximum(means, 1) - 1)
    return np.clip(f * gains, 0, 255)


def grade(img, kind):
    """Ujednačen 'sunčan dan' izgled. img je BGR uint8."""
    f = gray_world_wb(img, 0.55 if kind == "exterior" else 0.45)
    lab = cv2.cvtColor(np.clip(f, 0, 255).astype(np.uint8), cv2.COLOR_BGR2LAB).astype(np.float32)
    L, A, B = lab[..., 0], lab[..., 1], lab[..., 2]

    # Ekspozicija: ciljna srednja svetlina (enterijer malo svetliji -> "dnevno svetlo")
    target = 150 if kind == "interior" else 145
    mean = np.median(L)
    gamma = np.log(target / 255.0) / np.log(max(mean, 1) / 255.0)
    gamma = float(np.clip(gamma, 0.6, 1.4))
    L = 255.0 * (L / 255.0) ** gamma

    # Blaga S-kriva za kontrast, uz zaštitu svetlih delova (bez "pregorevanja")
    x = L / 255.0
    x = x + 0.10 * (x - 0.5) * (1 - np.abs(2 * x - 1))
    x = np.where(x > 0.92, 0.92 + (x - 0.92) * 0.6, x)
    L = np.clip(x * 255.0, 0, 255)

    # Topliji ton (sunce) i vrlo blago više zasićenja — bez "Instagram filtera"
    B = 128 + (B - 128) * 1.06 + 4.0
    A = 128 + (A - 128) * 1.04 + 0.8

    out = cv2.cvtColor(np.dstack([L, A, B]).clip(0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)
    return out


# --------------------------------------------------------------------------
# Zamena neba (heuristika: svetao, nisko zasićen ili plavičast region
# povezan sa gornjom ivicom, sa malo teksture)
# --------------------------------------------------------------------------
def sky_mask(img):
    h, w = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.float32)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    grad = cv2.magnitude(cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3), cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3))
    grad = cv2.GaussianBlur(grad, (0, 0), 3)

    v, s, hue = hsv[..., 2], hsv[..., 1], hsv[..., 0]
    bright = v > 170
    grayish = s < 45
    bluish = (hue > 90) & (hue < 130) & (s < 140) & (v > 140)
    smooth = grad < 18
    cand = ((bright & grayish) | bluish) & smooth
    # nebo je samo u gornjih ~55% kadra
    cand[int(h * 0.55):, :] = False
    cand = cand.astype(np.uint8)

    # samo komponente koje dodiruju gornju ivicu
    n, lab, stats, _ = cv2.connectedComponentsWithStats(cand, 8)
    mask = np.zeros_like(cand)
    for i in range(1, n):
        x, y, ww, hh, area = stats[i]
        if y <= 2 and area > 0.004 * h * w:
            mask[lab == i] = 1
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    return mask


def replace_sky(img):
    mask = sky_mask(img)
    ratio = float(mask.mean())
    if ratio < 0.01:
        return img, 0.0
    h, w = img.shape[:2]
    # prirodno vedro nebo: zasićenije gore, svetlije prema horizontu
    ys = np.linspace(0, 1, h)[:, None]
    top = np.array([214, 160, 92], np.float32)      # BGR, duboko nebesko plava
    horizon = np.array([240, 214, 176], np.float32)  # svetla, toplija pri horizontu
    t = np.clip(ys / 0.55, 0, 1) ** 0.8
    sky = (top * (1 - t[..., None]) + horizon * t[..., None]) * np.ones((h, w, 1), np.float32)
    # blagi "sunčani" sjaj u gornjem levom uglu (svetlo dolazi s leva)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    glow = np.exp(-(((xx - w * 0.15) / (w * 0.5)) ** 2 + ((yy + h * 0.1) / (h * 0.4)) ** 2))
    sky = sky + glow[..., None] * np.array([18, 22, 26], np.float32)

    soft = cv2.GaussianBlur(mask.astype(np.float32), (0, 0), max(2.0, w / 250))
    soft = np.clip(soft * 1.2, 0, 1)[..., None]
    out = img.astype(np.float32) * (1 - soft) + sky * soft
    return np.clip(out, 0, 255).astype(np.uint8), ratio


# --------------------------------------------------------------------------
# Poravnanje N -> N+1 (gde se sledeći kadar nalazi u trenutnom)
# --------------------------------------------------------------------------
def find_target_rect(a, b):
    """Vraća (rect, info). rect = [x, y, w, h] normalizovano na kadar a, ili None."""
    ga = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY)
    gb = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY)
    try:
        det = cv2.SIFT_create(4000)
        norm = cv2.NORM_L2
    except Exception:  # starije verzije OpenCV-a
        det = cv2.ORB_create(4000)
        norm = cv2.NORM_HAMMING
    ka, da = det.detectAndCompute(ga, None)
    kb, db = det.detectAndCompute(gb, None)
    if da is None or db is None or len(ka) < 12 or len(kb) < 12:
        return None, "premalo karakterističnih tačaka"
    matches = cv2.BFMatcher(norm).knnMatch(db, da, k=2)
    good = [m for m, n in (p for p in matches if len(p) == 2) if m.distance < 0.72 * n.distance]
    if len(good) < 14:
        return None, f"premalo poklapanja ({len(good)})"
    src = np.float32([kb[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
    dst = np.float32([ka[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
    H, inl = cv2.findHomography(src, dst, cv2.RANSAC, 4.0)
    if H is None or inl is None or inl.sum() < 12:
        return None, "homografija nije pronađena"
    hb, wb = gb.shape
    ha, wa = ga.shape
    corners = cv2.perspectiveTransform(np.float32([[0, 0], [wb, 0], [wb, hb], [0, hb]]).reshape(-1, 1, 2), H)
    x0, y0 = corners[:, 0, 0].min(), corners[:, 0, 1].min()
    x1, y1 = corners[:, 0, 0].max(), corners[:, 0, 1].max()
    rw, rh = (x1 - x0) / wa, (y1 - y0) / ha
    # kadar N+1 mora biti "unutar" N i manji (kretanje napred)
    if not (0.12 < rw < 0.95 and 0.12 < rh < 0.95) or x0 < -0.1 * wa or y0 < -0.1 * ha or x1 > 1.1 * wa or y1 > 1.1 * ha:
        return None, f"homografija nije realna (inlieri {int(inl.sum())})"
    rect = [float(np.clip(x0 / wa, 0, 1)), float(np.clip(y0 / ha, 0, 1)), float(rw), float(rh)]
    return [round(v, 4) for v in rect], f"ok ({int(inl.sum())} inlier-a)"


def rect_from_focus(focus, zoom=1.6, aspect=1.0):
    """Pravougaonik oko tačke fokusa (fx, fy normalizovano), veličine 1/zoom."""
    fx, fy = focus
    w = 1.0 / zoom
    h = w * aspect
    x = float(np.clip(fx - w / 2, 0, 1 - w))
    y = float(np.clip(fy - h / 2, 0, 1 - h))
    return [round(x, 4), round(y, 4), round(w, 4), round(h, 4)]


# --------------------------------------------------------------------------
# Izvoz
# --------------------------------------------------------------------------
def to_pil(img):
    return Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))


def sharpen_up(pil, size):
    up = pil.resize(size, Image.LANCZOS)
    arr = cv2.cvtColor(np.array(up), cv2.COLOR_RGB2BGR)
    blur = cv2.GaussianBlur(arr, (0, 0), 1.2)
    arr = cv2.addWeighted(arr, 1.35, blur, -0.35, 0)
    return Image.fromarray(cv2.cvtColor(arr, cv2.COLOR_BGR2RGB))


def save_pair(pil, base):
    pil.save(base + ".webp", "WEBP", quality=WEBP_Q, method=6)
    pil.save(base + ".jpg", "JPEG", quality=JPG_Q, optimize=True, progressive=True)
    return os.path.getsize(base + ".webp"), os.path.getsize(base + ".jpg")


def export(img, name, focus):
    h, w = img.shape[:2]
    pil = to_pil(img)
    # landscape
    lw = int(min(LANDSCAPE_MAX_W, w * MAX_UPSCALE))
    lh = round(lw * h / w)
    land = sharpen_up(pil, (lw, lh)) if lw != w else pil
    sl = save_pair(land, os.path.join(OUT, f"{name}-land"))
    # portrait: isečak 9:16 oko fokusa
    pw, ph = PORTRAIT_SIZE
    cw = min(w, round(h * pw / ph))
    ch = min(h, round(cw * ph / pw))
    cx = int(np.clip(focus[0] * w - cw / 2, 0, w - cw))
    cy = int(np.clip(focus[1] * h - ch / 2, 0, h - ch))
    crop = pil.crop((cx, cy, cx + cw, cy + ch))
    tw = int(min(pw, cw * MAX_UPSCALE))
    th = round(tw * ph / pw)
    port = sharpen_up(crop, (tw, th))
    sp = save_pair(port, os.path.join(OUT, f"{name}-port"))
    return {
        "landscape": {"w": lw, "h": lh},
        "portrait": {"w": tw, "h": th, "crop": [round(cx / w, 4), round(cy / h, 4), round(cw / w, 4), round(ch / h, 4)]},
        "bytes": {"landWebp": sl[0], "portWebp": sp[0]},
    }


# --------------------------------------------------------------------------
def main():
    cfg = load_cfg()
    files, meta = frame_list(cfg)
    if not files:
        sys.exit("Nema fotografija u assets/source/intro/")
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(os.path.join(OUT, "fallback"), exist_ok=True)

    graded, report = [], []
    for f in files:
        m = meta.get(f, {})
        kind = m.get("type", "interior")
        img = cv2.imread(os.path.join(SRC, f))
        base = grade(img, kind)
        sky_ratio = 0.0
        out = base
        if kind == "exterior" and m.get("skyReplace", True):
            out, sky_ratio = replace_sky(base)
            # "sunčana" verzija: malo toplije i svetlije posle zamene neba
            out = cv2.convertScaleAbs(out, alpha=1.03, beta=4)
        name = os.path.splitext(f)[0]
        # Rezervna verzija bez zamene neba (samo kolor korekcija)
        to_pil(base).save(os.path.join(OUT, "fallback", name + "-graded.jpg"), "JPEG", quality=82)
        graded.append((f, name, out, kind, sky_ratio))

    frames = []
    for i, (f, name, img, kind, sky_ratio) in enumerate(graded):
        m = meta.get(f, {})
        target, how = None, "poslednji kadar (šank + logo)"
        if i + 1 < len(graded):
            target, how = find_target_rect(img, graded[i + 1][2])
            if target is None:
                focus = m.get("manualFocus", [0.5, 0.5])
                target = rect_from_focus(focus, m.get("zoom", 1.5), aspect=1.0)
                how = "RUČNO (manualFocus) — automatsko poklapanje nije uspelo: " + how
        else:
            focus = m.get("manualFocus", [0.5, 0.45])
            target = rect_from_focus(focus, m.get("zoom", 1.18))
        focus_pt = [round(target[0] + target[2] / 2, 4), round(target[1] + target[3] / 2, 4)]
        info = export(img, name, focus_pt)
        frames.append({
            "file": f,
            "name": name,
            "type": kind,
            "label": m.get("label", name),
            "src": {
                "landscape": f"assets/img/intro/{name}-land",
                "portrait": f"assets/img/intro/{name}-port",
            },
            "size": info,
            "target": target,
            "targetMethod": "auto" if how.startswith("ok") else ("manual" if "RUČNO" in how else "end"),
            "skyReplaced": bool(sky_ratio > 0),
            "skyRatio": round(sky_ratio, 3),
        })
        report.append(f"{f:28s} {kind:9s} nebo={sky_ratio:5.1%}  cilj={target}  -> {how}")

    total_port = sum(fr["size"]["bytes"]["portWebp"] for fr in frames)
    total_land = sum(fr["size"]["bytes"]["landWebp"] for fr in frames)

    cfg_out = dict(cfg)
    cfg_out.setdefault("enabled", True)
    cfg_out.setdefault("durationMs", 5200)
    cfg_out.setdefault("logoHoldMs", 1100)
    cfg_out.setdefault("playMode", "session")
    cfg_out.setdefault("skipIfLoadingLongerThanMs", 3000)
    cfg_out["frames"] = frames
    cfg_out["weights"] = {"portraitWebpBytes": total_port, "landscapeWebpBytes": total_land}
    with open(CFG, "w", encoding="utf-8") as fh:
        json.dump(cfg_out, fh, ensure_ascii=False, indent=2)

    print("\n".join(report))
    print(f"\nUkupno WebP: portrait {total_port/1024:.0f} KB, landscape {total_land/1024:.0f} KB")
    print(f"Upisano: {os.path.relpath(CFG, ROOT)}")


if __name__ == "__main__":
    main()
