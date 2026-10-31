#!/usr/bin/env python3
"""
prepare-assets.py — obrada logoa, galerije, OG slike i favicona.

  - assets/source/logo/*   -> assets/img/logo/ (providna PNG/WebP, crna i bela verzija)
  - assets/source/gallery/* -> assets/img/gallery/ (WebP + JPG, 2 veličine) + data/gallery.json
  - OG slika 1200x630 (fotografija iz galerije + logo) -> assets/img/og-image.jpg
  - favicon set -> assets/img/favicon/

Originali se ne menjaju. Pokretanje iz root foldera:  python3 tools/prepare-assets.py
"""
import json
import os

import numpy as np
from PIL import Image, ImageFilter, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "source")
IMG = os.path.join(ROOT, "assets", "img")
DATA = os.path.join(ROOT, "data")

# Redosled i opisi (alt) galerije. Novi fajlovi koji nisu ovde dodaju se na kraj.
GALLERY_META = {
    "we-celebrate-life.jpg": {"sr": "Zid sa muralom i natpisom We Celebrate Life", "en": "Mural wall with the words We Celebrate Life"},
    "vitrina-kolaci.jpg": {"sr": "Vitrina sa kolačima ispred šanka sa Vida logom", "en": "Cake display in front of the bar with the Vida logo"},
    "terasa-vece.jpg": {"sr": "Terasa uveče pod svetlećim girlandama", "en": "The terrace in the evening under string lights"},
    "enterijer-biljke.jpg": {"sr": "Svetao enterijer sa policama punim biljaka", "en": "Bright interior with shelves full of plants"},
    "basta-dan.jpg": {"sr": "Bašta sa drvenim klupama tokom dana", "en": "Garden seating with wooden benches during the day"},
    "sank.jpg": {"sr": "Šank sa aparatom za espresso i Vida logom", "en": "The bar with the espresso machine and Vida logo"},
    "enterijer-gosti.jpg": {"sr": "Gosti za stolovima ispod pletenih lampi", "en": "Guests at tables beneath woven lamps"},
    "ulaz.jpg": {"sr": "Ulaz u Vidu sa stolovima ispred", "en": "The Vida entrance with tables outside"},
    "spolja.jpg": {"sr": "Vida spolja, sa terasom", "en": "Vida from the outside, with the terrace"},
}
SIZES = (480, 960)


def ensure(p):
    os.makedirs(p, exist_ok=True)
    return p


def logo():
    out = ensure(os.path.join(IMG, "logo"))
    src = [f for f in os.listdir(os.path.join(SRC, "logo")) if f.lower().endswith((".png", ".jpg", ".jpeg"))][0]
    im = Image.open(os.path.join(SRC, "logo", src)).convert("L")
    # povećaj 3x pre praga radi glatkih ivica
    big = im.resize((im.width * 3, im.height * 3), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.6))
    a = np.array(big).astype(np.float32)
    # tamno mastilo -> alfa (meki prag)
    alpha = np.clip((215 - a) / (215 - 90), 0, 1)
    alpha = (alpha * 255).astype(np.uint8)
    bbox = Image.fromarray(alpha).getbbox()
    alpha_img = Image.fromarray(alpha).crop(bbox)
    for name, col in (("vida-logo", (22, 24, 20)), ("vida-logo-white", (255, 255, 255))):
        rgba = Image.new("RGBA", alpha_img.size, col + (0,))
        rgba.putalpha(alpha_img)
        rgba.save(os.path.join(out, name + ".png"), optimize=True)
        rgba.save(os.path.join(out, name + ".webp"), "WEBP", quality=90, method=6)
        small = rgba.resize((256, round(256 * rgba.height / rgba.width)), Image.LANCZOS)
        small.save(os.path.join(out, name + "-256.webp"), "WEBP", quality=90, method=6)
        small.save(os.path.join(out, name + "-256.png"), optimize=True)
    return alpha_img


def favicons(alpha_img):
    out = ensure(os.path.join(IMG, "favicon"))
    s = max(alpha_img.size)
    sq = Image.new("L", (s, s), 0)
    sq.paste(alpha_img, ((s - alpha_img.width) // 2, (s - alpha_img.height) // 2))
    for size, name, bg in ((32, "favicon-32.png", None), (16, "favicon-16.png", None),
                           (180, "apple-touch-icon.png", (250, 246, 238)), (192, "icon-192.png", (250, 246, 238)),
                           (512, "icon-512.png", (250, 246, 238))):
        pad = int(size * (0.1 if bg else 0.0))
        inner = size - 2 * pad
        a = sq.resize((inner, inner), Image.LANCZOS)
        base = Image.new("RGBA", (size, size), (bg + (255,)) if bg else (0, 0, 0, 0))
        ink = Image.new("RGBA", (inner, inner), (31, 61, 43, 255))
        ink.putalpha(a)
        base.alpha_composite(ink, (pad, pad))
        base.save(os.path.join(out, name), optimize=True)
    Image.open(os.path.join(out, "favicon-32.png")).save(os.path.join(ROOT, "favicon.ico"), sizes=[(16, 16), (32, 32)])


def gallery():
    out = ensure(os.path.join(IMG, "gallery"))
    files = [f for f in os.listdir(os.path.join(SRC, "gallery")) if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))]
    order = [f for f in GALLERY_META if f in files] + sorted(f for f in files if f not in GALLERY_META)
    items = []
    for f in order:
        im = ImageOps.exif_transpose(Image.open(os.path.join(SRC, "gallery", f))).convert("RGB")
        # blaga, ujednačena korekcija (toplije, malo svetlije)
        im = ImageOps.autocontrast(im, cutoff=0.5)
        name = os.path.splitext(f)[0]
        srcs = []
        for w in SIZES:
            tw = min(w, int(im.width * 1.6))
            th = round(tw * im.height / im.width)
            r = im.resize((tw, th), Image.LANCZOS)
            if tw > im.width:
                r = r.filter(ImageFilter.UnsharpMask(1.2, 60, 2))
            r.save(os.path.join(out, f"{name}-{tw}.webp"), "WEBP", quality=78, method=6)
            r.save(os.path.join(out, f"{name}-{tw}.jpg"), "JPEG", quality=80, optimize=True, progressive=True)
            srcs.append({"w": tw, "h": th, "base": f"assets/img/gallery/{name}-{tw}"})
        meta = GALLERY_META.get(f, {"sr": "Vida Novi Sad", "en": "Vida Novi Sad"})
        items.append({"id": name, "alt": meta, "sizes": srcs, "ratio": round(im.width / im.height, 4)})
    with open(os.path.join(DATA, "gallery.json"), "w", encoding="utf-8") as fh:
        json.dump({"items": items}, fh, ensure_ascii=False, indent=2)
    return order


def og_image():
    src = os.path.join(SRC, "gallery", "terasa-vece.jpg")
    if not os.path.exists(src):
        return
    im = Image.open(src).convert("RGB")
    W, H = 1200, 630
    # pozadina: krem; levo fotografija, desno logo
    canvas = Image.new("RGB", (W, H), (250, 246, 238))
    ph = H
    pw = round(im.width * ph / im.height)
    photo = im.resize((pw, ph), Image.LANCZOS)
    canvas.paste(photo, (0, 0))
    lg = Image.open(os.path.join(IMG, "logo", "vida-logo.png"))
    lw = 360
    lg = lg.resize((lw, round(lw * lg.height / lg.width)), Image.LANCZOS)
    x = pw + (W - pw - lw) // 2
    canvas.paste(lg, (x, (H - lg.height) // 2), lg)
    canvas.save(os.path.join(IMG, "og-image.jpg"), "JPEG", quality=85, optimize=True)


if __name__ == "__main__":
    a = logo()
    favicons(a)
    order = gallery()
    og_image()
    print("Logo, favicon, galerija (%d), OG slika – gotovo." % len(order))
