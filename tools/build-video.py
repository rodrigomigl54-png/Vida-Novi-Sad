#!/usr/bin/env python3
"""
build-video.py — montaža intro-a i hero petlji iz snimaka u assets/source/video/.

Edit (rezovi, vremena, prelazi) je u tools/video-edit.json.

Upotreba (iz root foldera sajta):
    python3 tools/build-video.py hero          # petlje za početnu (brzo)
    python3 tools/build-video.py desktop       # intro za računar, triptih (brzo)
    python3 tools/build-video.py mobile        # intro za telefon, AI uveličanje (~1 h na CPU)
    python3 tools/build-video.py mobile --encode-only   # ponovo kodira već obrađene kadrove

AI uveličanje: Real-ESRGAN realesr-general-x4v3 (težine se učitavaju sa weights_only=True).
    pip install torch opencv-python-headless numpy pillow
    putanja do težina: env VIDA_SR_WEIGHTS (podrazumevano tools/models/realesr-general-x4v3.pth)

Izlaz: assets/video/*.mp4 (H.264), *.webm (VP9), *-poster.jpg/.webp
"""
import json
import os
import shutil
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "source", "video")
OUT = os.path.join(ROOT, "assets", "video")
EDIT = json.load(open(os.path.join(ROOT, "tools", "video-edit.json"), encoding="utf-8"))
FPS = EDIT["fps"]
CACHE = os.environ.get("VIDA_VIDEO_CACHE", "/tmp/vida-video-cache")
SR_WEIGHTS = os.environ.get("VIDA_SR_WEIGHTS", os.path.join(ROOT, "tools", "models", "realesr-general-x4v3.pth"))


# ----------------------------------------------------------------- dekodiranje
def decode(clip, start, dur):
    path = os.path.join(SRC, clip + ".mp4")
    w, h = 720, 1280
    cmd = ["ffmpeg", "-v", "error", "-ss", f"{start:.3f}", "-i", path, "-t", f"{dur:.3f}",
           "-vf", f"fps={FPS},scale={w}:{h}:flags=lanczos", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    raw = subprocess.run(cmd, check=True, capture_output=True).stdout
    n = len(raw) // (w * h * 3)
    frames = np.frombuffer(raw[: n * w * h * 3], np.uint8).reshape(n, h, w, 3)
    want = round(dur * FPS)
    if n < want:  # dopuni poslednjim kadrom ako izvor kratko „fali“
        frames = np.concatenate([frames, np.repeat(frames[-1:], want - n, 0)])
    return frames[:want]


# ----------------------------------------------------------------- kolor (ujednačen Vida izgled)
def grade_luts(ref):
    g = EDIT["grade"]
    f = ref.reshape(-1, 3).astype(np.float32)
    means = f.mean(0)
    gains = 1 + g["wb"] * (means.mean() / np.maximum(means, 1) - 1)
    luma = (0.2126 * f[:, 0] + 0.7152 * f[:, 1] + 0.0722 * f[:, 2]).mean() / 255
    gamma = float(np.clip(np.log(g["targetLuma"]) / np.log(max(luma, 0.05)), 0.8, 1.25))
    x = np.arange(256, dtype=np.float32) / 255
    luts = []
    for c in range(3):
        y = np.clip(x * gains[c], 0, 1) ** gamma
        y = 0.5 + (y - 0.5) * g["contrast"]                 # kontrast
        y = np.where(y > 0.9, 0.9 + (y - 0.9) * 0.6, y)     # zaštita svetlih delova
        warm = (g["warmth"], g["warmth"] * 0.3, -g["warmth"])[c] / 255
        luts.append((np.clip(y + warm, 0, 1) * 255 + 0.5).astype(np.uint8))
    return luts


def apply_grade(frame, luts):
    out = np.stack([luts[c][frame[..., c]] for c in range(3)], -1)
    s = EDIT["grade"]["saturation"]
    if s != 1:
        gray = out.astype(np.float32).mean(-1, keepdims=True)
        out = np.clip(gray + (out - gray) * s, 0, 255).astype(np.uint8)
    return out


def graded(clip, start, dur):
    frames = decode(clip, start, dur)
    luts = grade_luts(frames[len(frames) // 2])
    return [apply_grade(f, luts) for f in frames]


# ----------------------------------------------------------------- pomoćne
def zoom_crop(img, zoom, size):
    """Centrirani isečak (push-in) i promena veličine u size=(w,h)."""
    h, w = img.shape[:2]
    cw, ch = w / zoom, h / zoom
    x0, y0 = (w - cw) / 2, (h - ch) / 2
    M = np.array([[size[0] / cw, 0, -x0 * size[0] / cw], [0, size[1] / ch, -y0 * size[1] / ch]], np.float32)
    return cv2.warpAffine(img, M, size, flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT)


def sharpen(img, amount=0.35, sigma=1.0):
    blur = cv2.GaussianBlur(img, (0, 0), sigma)
    return cv2.addWeighted(img, 1 + amount, blur, -amount, 0)


def whip(img, strength, direction=1):
    """Horizontalno „trzanje“ kamere: motion blur + pomeraj."""
    if strength <= 0:
        return img
    k = max(3, int(strength * img.shape[1] * 0.12) | 1)
    kernel = np.zeros((1, k), np.float32)
    kernel[0, :] = 1 / k
    out = cv2.filter2D(img, -1, kernel)
    shift = direction * strength * img.shape[1] * 0.08
    M = np.float32([[1, 0, shift], [0, 1, 0]])
    return cv2.warpAffine(out, M, (img.shape[1], img.shape[0]), borderMode=cv2.BORDER_REPLICATE)


def encode(frames_iter, size, base, crf_mp4=22, crf_webm=34, poster_index=None):
    """Kodira niz RGB kadrova u MP4 (H.264) + WebM (VP9) + poster."""
    os.makedirs(OUT, exist_ok=True)
    tmp = base + ".master.mp4"
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{size[0]}x{size[1]}",
                          "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "12",
                          "-pix_fmt", "yuv444p", "-an", tmp], stdin=subprocess.PIPE)
    poster = None
    for i, f in enumerate(frames_iter):
        p.stdin.write(np.ascontiguousarray(f).tobytes())
        if poster_index is not None and (i == poster_index or poster_index == -1):
            poster = f
    p.stdin.close()
    p.wait()
    common = ["-an", "-pix_fmt", "yuv420p", "-r", str(FPS)]
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tmp, "-c:v", "libx264", "-preset", "veryslow", "-crf", str(crf_mp4),
                    "-profile:v", "high", "-tune", "film", "-movflags", "+faststart", *common, base + ".mp4"], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tmp, "-c:v", "libvpx-vp9", "-crf", str(crf_webm), "-b:v", "0",
                    "-row-mt", "1", "-deadline", "good", "-cpu-used", "2", *common, base + ".webm"], check=True)
    os.remove(tmp)
    if poster is not None:
        im = Image.fromarray(poster)
        if im.width > 720:  # poster je samo privremena slika — manji fajl = brže učitavanje
            im = im.resize((720, round(im.height * 720 / im.width)), Image.LANCZOS)
        im.save(base + "-poster.jpg", quality=78, optimize=True, progressive=True)
        im.save(base + "-poster.webp", quality=72, method=6)
    for ext in (".mp4", ".webm"):
        print(f"  {os.path.relpath(base + ext, ROOT)}  {os.path.getsize(base + ext) / 1e6:.2f} MB")


# ----------------------------------------------------------------- INTRO: telefon (AI)
def build_mobile(encode_only=False):
    cfg = EDIT["introMobile"]
    size = tuple(cfg["size"])
    cache = os.path.join(CACHE, "mobile")
    plan = []  # (segment index, frame index in segment, total in segment)
    for si, s in enumerate(cfg["segments"]):
        n = round((s["to"] - s["from"]) * FPS)
        plan += [(si, k, n) for k in range(n)]
        plan += [(si, -(k + 1), n) for k in range(round(s.get("holdSeconds", 0) * FPS))]  # hold kadrovi
    if not encode_only:
        os.makedirs(cache, exist_ok=True)
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import torch
        from sr_model import load, upscale  # noqa: E402
        torch.set_num_threads(os.cpu_count() or 4)
        model = load(SR_WEIGHTS)
        gi = 0
        for si, s in enumerate(cfg["segments"]):
            frames = graded(s["clip"], s["from"], s["to"] - s["from"])
            hold = round(s.get("holdSeconds", 0) * FPS)
            total = len(frames) + hold
            last4x = None
            for k in range(total):
                path = os.path.join(cache, f"{gi:04d}.png")
                gi += 1
                if os.path.exists(path):
                    continue
                if k < len(frames) or last4x is None:
                    src = frames[min(k, len(frames) - 1)]
                    big = np.asarray(upscale(model, Image.fromarray(src)))
                    if k >= len(frames) - 1:
                        last4x = big
                else:
                    big = last4x
                zoom = 1 + (s.get("pushIn", 1) - 1) * (k / max(total - 1, 1))
                out = sharpen(zoom_crop(big, zoom, size), 0.25, 1.2)
                Image.fromarray(out).save(path, compress_level=1)
                print(f"  kadar {gi}/{len(plan)}  ({s['clip']})", flush=True)

    # sklapanje: fade-in, whip prelazi
    files = sorted(f for f in os.listdir(cache) if f.endswith(".png"))
    seg_ranges, pos = [], 0
    for s in cfg["segments"]:
        n = round((s["to"] - s["from"]) * FPS) + round(s.get("holdSeconds", 0) * FPS)
        seg_ranges.append((pos, pos + n))
        pos += n
    W = 4

    def frames():
        for i, f in enumerate(files):
            img = np.asarray(Image.open(os.path.join(cache, f)).convert("RGB"))
            for si, (a, b) in enumerate(seg_ranges):
                s = cfg["segments"][si]
                if a <= i < b:
                    if s.get("whipOut") and i >= b - W:
                        img = whip(img, (i - (b - W) + 1) / W, -1)
                    if s.get("whipIn") and i < a + W:
                        img = whip(img, 1 - (i - a) / W, -1)
            if i < cfg.get("fadeInFrames", 0):
                img = (img.astype(np.float32) * (i + 1) / (cfg["fadeInFrames"] + 1)).astype(np.uint8)
            yield img

    print("Kodiram intro (telefon)…")
    encode(frames(), size, os.path.join(OUT, "intro-mobile"), crf_mp4=23, crf_webm=35, poster_index=-1)


# ----------------------------------------------------------------- INTRO: računar (triptih)
def rounded_mask(w, h, r):
    m = np.zeros((h, w), np.uint8)
    cv2.rectangle(m, (r, 0), (w - r - 1, h - 1), 255, -1)
    cv2.rectangle(m, (0, r), (w - 1, h - r - 1), 255, -1)
    for cx, cy in ((r, r), (w - r - 1, r), (r, h - r - 1), (w - r - 1, h - r - 1)):
        cv2.circle(m, (cx, cy), r, 255, -1, cv2.LINE_AA)
    return cv2.GaussianBlur(m, (3, 3), 0).astype(np.float32)[..., None] / 255


_MODEL = None


def ai_model():
    """Real-ESRGAN (učitava se jednom)."""
    global _MODEL
    if _MODEL is None:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import torch
        from sr_model import load  # noqa: E402
        torch.set_num_threads(os.cpu_count() or 4)
        _MODEL = load(SR_WEIGHTS)
    return _MODEL


def ai4x(frame):
    model = ai_model()
    from sr_model import upscale  # noqa: E402
    return np.asarray(upscale(model, Image.fromarray(frame)))


def cached(path, make):
    if os.path.exists(path):
        return np.asarray(Image.open(path).convert("RGB"))
    img = make()
    Image.fromarray(img).save(path, compress_level=1)
    return img


def build_desktop():
    """Triptih za računar, AI uveličanje; izvozi 1920x1080 i 2560x1440 (veliki / retina ekrani)."""
    cfg = EDIT["introDesktop"]
    W0, H0 = cfg["size"]
    P = cfg["panel"]
    sizes = [(W0, H0, ""), (2560, 1440, "-2k")]
    bg = np.array([int(cfg["background"][i:i + 2], 16) for i in (1, 3, 5)], np.float32)
    use_ai = cfg.get("ai", True)

    # 1) kadrovi panela (AI 4x jednom po izvornom kadru, pa isečak za svaku veličinu)
    tracks = {suf: [] for _, _, suf in sizes}
    for pi, segs in enumerate(cfg["panels"]):
        per = {suf: [] for _, _, suf in sizes}
        for si, s in enumerate(segs):
            fr = graded(s["clip"], s["from"], s["dur"])
            hold = round(s.get("holdSeconds", 0) * FPS)
            total = len(fr) + hold
            big = None
            for k in range(total):
                zoom = 1 + (s.get("pushIn", 1) - 1) * (k / max(total - 1, 1))
                need = []
                for W, H, suf in sizes:
                    f = W / W0
                    pw, ph = round(P["width"] * f), round(P["height"] * f)
                    d = os.path.join(CACHE, "desktop" + (suf or "-hd"), f"p{pi}")
                    os.makedirs(d, exist_ok=True)
                    need.append((os.path.join(d, f"{si:02d}_{k:04d}.png"), (pw, ph), suf))
                if any(not os.path.exists(pth) for pth, _, _ in need) and (k < len(fr) or big is None):
                    src = fr[min(k, len(fr) - 1)]
                    big = ai4x(src) if use_ai else src
                for pth, size, suf in need:
                    per[suf].append(cached(pth, lambda: sharpen(zoom_crop(big, zoom, size), 0.22, 1.0)))
            print(f"  panel {pi + 1}/3, segment {si + 1}/{len(segs)} ({s['clip']})", flush=True)
        for suf in per:
            tracks[suf].append(per[suf])

    # 2) sklapanje i kodiranje za svaku veličinu
    f0, f1 = (round(v * FPS) for v in cfg["sideFadeOut"])
    for W, H, suf in sizes:
        f = W / W0
        pw, ph, gap = round(P["width"] * f), round(P["height"] * f), round(P["gap"] * f)
        x0 = (W - (3 * pw + 2 * gap)) // 2
        y0 = (H - ph) // 2
        mask = rounded_mask(pw, ph, round(P["radius"] * f))
        trs = tracks[suf]
        n = max(len(t) for t in trs)
        base = np.ones((H, W, 3), np.float32) * bg

        def frames(trs=trs, n=n, base=base, mask=mask, pw=pw, ph=ph, gap=gap, x0=x0, y0=y0):
            for i in range(n):
                canvas = base.copy()
                for pi, tr in enumerate(trs):
                    img = tr[min(i, len(tr) - 1)].astype(np.float32)
                    a = mask
                    if pi != 1 and i >= f0:
                        fade = max(0.0, 1 - (i - f0) / max(f1 - f0, 1))
                        if fade <= 0:
                            continue
                        a = mask * fade
                    x = x0 + pi * (pw + gap)
                    region = canvas[y0:y0 + ph, x:x + pw]
                    canvas[y0:y0 + ph, x:x + pw] = region * (1 - a) + img * a
                yield canvas.astype(np.uint8)

        print(f"Kodiram intro (računar {W}x{H})…")
        encode(frames(), (W, H), os.path.join(OUT, "intro-desktop" + suf), crf_mp4=23, crf_webm=35, poster_index=-1)


def seamless(frames, xf):
    X = round(xf * FPS)
    N = len(frames)
    out = list(frames[X:N - X])
    for j in range(X):
        a = j / X
        out.append((frames[N - X + j].astype(np.float32) * (1 - a) + frames[j].astype(np.float32) * a).astype(np.uint8))
    return out


def build_hero(only=None):
    """Petlje za početnu. Glavni video (telefon preko celog ekrana / računar luk) ide kroz AI uveličanje."""
    cfg = EDIT["hero"]
    for it in cfg["items"]:
        if only and it["id"] not in only:
            continue
        for role, size, crf in (("main", (1080, 1920), 26), ("side", (540, 960), 28)):
            s = it[role]
            fr = graded(s["clip"], s["from"], s["dur"])
            if role == "main" and cfg.get("aiMain", True):
                d = os.path.join(CACHE, "hero", it["id"])
                os.makedirs(d, exist_ok=True)
                out = []
                for k, f in enumerate(fr):
                    out.append(cached(os.path.join(d, f"{k:04d}.png"), lambda f=f: sharpen(cv2.resize(ai4x(f), size, interpolation=cv2.INTER_AREA), 0.22, 1.1)))
                    if k % 30 == 0:
                        print(f"  hero {it['id']}: kadar {k + 1}/{len(fr)}", flush=True)
                fr = out
            else:
                fr = [sharpen(cv2.resize(f, size, interpolation=cv2.INTER_LANCZOS4), 0.15, 1.0) for f in fr]
            fr = seamless(fr, cfg["loopCrossfade"])
            print(f"Hero {it['id']} / {role}", flush=True)
            encode(iter(fr), size, os.path.join(OUT, f"hero-{it['id']}-{role}"), crf_mp4=crf, crf_webm=crf + 10, poster_index=0)


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    if what in ("hero", "all"):
        build_hero([a for a in sys.argv[2:] if not a.startswith("-")] or None)
    if what in ("desktop", "all"):
        build_desktop()
    if what in ("mobile", "all"):
        build_mobile(encode_only="--encode-only" in sys.argv)
    if what == "clean-cache":
        shutil.rmtree(CACHE, ignore_errors=True)
