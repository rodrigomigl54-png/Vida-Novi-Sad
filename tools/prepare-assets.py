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
    "01-wrap-jaja-avokado.jpg": {"sr": "Wrap sa jajima, avokadom, zelenom salatom i kiselim lukom", "en": "Wrap with eggs, avocado, lettuce and pickled onion"},
    "02-zeleni-tuna-wrap.jpg": {"sr": "Zeleni wrap sa tunom, kinoom i crvenim kupusom", "en": "Green wrap with tuna, quinoa and red cabbage"},
    "03-cinnamon-rolls.jpg": {"sr": "Cinnamon rolls sa pistaći i karamel prelivom", "en": "Cinnamon rolls with pistachio and caramel glaze"},
    "04-vida-infused-water.jpg": {"sr": "Voda sa limetom, pomorandžom i nanom u Vida čaši", "en": "Water with lime, orange and mint in a Vida glass"},
    "00-we-celebrate-life.jpg": {"sr": "Zid sa muralom i natpisom We Celebrate Life", "en": "Mural wall with the words We Celebrate Life"},
    "05-daska-hleb-namazi.jpg": {"sr": "Daska sa domaćim hlebom, pršutom, namazima i orašastim plodovima", "en": "Board with homemade bread, prosciutto, spreads and nuts"},
    "06-napitak-grozdje-lavanda.jpg": {"sr": "Osvežavajući napitak sa grožđem, nanom i lavandom", "en": "Refreshing drink with grapes, mint and lavender"},
    "07-coconut-acai-bowl.jpg": {"sr": "Coconut bowl sa voćem i granolom", "en": "Coconut bowl with fruit and granola"},
    "08-ube-kasa-plavi-smoothie.jpg": {"sr": "Ljubičasta ovsena kaša i plavi smoothie", "en": "Purple oat bowl and a blue smoothie"},
    "09-pistachio-latte.jpg": {"sr": "Kafa sa srcem u peni i pistaći ivicom", "en": "Coffee with latte art and a pistachio rim"},
    "10-smoothie-jagoda.jpg": {"sr": "Smoothie sa jagodama", "en": "Strawberry smoothie"},
    "11-pumpkin-latte.jpg": {"sr": "Jesenja kafa sa cimetom", "en": "Autumn coffee with cinnamon"},
    "12-smoothie-jabuka-cimet.jpg": {"sr": "Smoothie sa jabukom i cimetom", "en": "Apple and cinnamon smoothie"},
    "13-cvekla-jabuka-sok.jpg": {"sr": "Slojeviti sok u čašama sa jabukom", "en": "Layered juice with apple garnish"},
    "14-krem-corba-bundeva.jpg": {"sr": "Krem čorba od bundeve sa integralnim hlebom", "en": "Pumpkin cream soup with wholegrain bread"},
    "15-ledena-kafa-vida.jpg": {"sr": "Ledena kafa u Vida limenci", "en": "Iced coffee in a Vida can"},
    "16-cinnamon-rolls-izbor.jpg": {"sr": "Izbor cinnamon rolls-a", "en": "A selection of cinnamon rolls"},
    "17-palacinke-banana.jpg": {"sr": "Palačinke sa bananom i voćem", "en": "Pancakes with banana and fruit"},
}
SIZES = (480, 960)
AI_BELOW = 1400  # fotografije čija je duža strana manja od ovoga idu kroz AI uveličanje (Real-ESRGAN)


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


def ai_upscale(im):
    """AI 4x (Real-ESRGAN) za male fotografije; bez torch-a — klasično (Lanczos)."""
    try:
        import sys
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import torch
        from sr_model import load, upscale
        torch.set_num_threads(os.cpu_count() or 4)
        global _SR
        if "_SR" not in globals():
            _SR = load(os.environ.get("VIDA_SR_WEIGHTS", os.path.join(ROOT, "tools", "models", "realesr-general-x4v3.pth")))
        print(f"  AI uveličanje {im.size} → {(im.width * 4, im.height * 4)}", flush=True)
        return upscale(_SR, im)
    except Exception as e:  # noqa: BLE001
        print("  (AI nije dostupan, klasično uveličanje)", e)
        return im.resize((im.width * 3, im.height * 3), Image.LANCZOS).filter(ImageFilter.UnsharpMask(1.2, 60, 2))


def gallery():
    out = ensure(os.path.join(IMG, "gallery"))
    files = [f for f in os.listdir(os.path.join(SRC, "gallery")) if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))]
    order = [f for f in GALLERY_META if f in files] + sorted(f for f in files if f not in GALLERY_META)
    items = []
    for f in order:
        im = ImageOps.exif_transpose(Image.open(os.path.join(SRC, "gallery", f))).convert("RGB")
        if max(im.size) < AI_BELOW:
            im = ai_upscale(im)
        # blaga korekcija kontrasta
        im = ImageOps.autocontrast(im, cutoff=0.3)
        name = os.path.splitext(f)[0]
        srcs = []
        for w in SIZES:
            tw = min(w, im.width)
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
    src = os.path.join(SRC, "venue-archive", "terasa-vece.jpg")
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
