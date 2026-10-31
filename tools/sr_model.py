"""Real-ESRGAN (realesr-general-x4v3, SRVGGNetCompact) — bezbedno učitavanje težina (weights_only=True)."""
import sys
import time

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image


class SRVGGNetCompact(nn.Module):
    def __init__(self, num_in_ch=3, num_out_ch=3, num_feat=64, num_conv=32, upscale=4):
        super().__init__()
        self.upscale = upscale
        self.body = nn.ModuleList([nn.Conv2d(num_in_ch, num_feat, 3, 1, 1), nn.PReLU(num_parameters=num_feat)])
        for _ in range(num_conv):
            self.body.append(nn.Conv2d(num_feat, num_feat, 3, 1, 1))
            self.body.append(nn.PReLU(num_parameters=num_feat))
        self.body.append(nn.Conv2d(num_feat, num_out_ch * upscale * upscale, 3, 1, 1))
        self.up = nn.PixelShuffle(upscale)

    def forward(self, x):
        out = x
        for m in self.body:
            out = m(out)
        return self.up(out) + F.interpolate(x, scale_factor=self.upscale, mode="nearest")


def load(path):
    m = SRVGGNetCompact()
    sd = torch.load(path, map_location="cpu", weights_only=True)
    m.load_state_dict(sd.get("params", sd))
    m.eval()
    return m.to(memory_format=torch.channels_last)


def _bf16_ok():
    try:
        return torch.backends.mkldnn.is_available() and "amx" in open("/proc/cpuinfo").read()
    except OSError:
        return False


BF16 = _bf16_ok()


@torch.inference_mode()
def upscale(m, img):
    x = torch.from_numpy(np.asarray(img, dtype=np.float32) / 255.0).permute(2, 0, 1)[None].to(memory_format=torch.channels_last)
    if BF16:  # AMX bf16: ~4x brže, razlika u slici zanemarljiva
        with torch.autocast("cpu", dtype=torch.bfloat16):
            y = m(x).float()
    else:
        y = m(x)
    y = y.clamp(0, 1)[0].permute(1, 2, 0).numpy()
    return Image.fromarray((y * 255 + 0.5).astype(np.uint8))


if __name__ == "__main__":
    torch.set_num_threads(4)
    model = load(sys.argv[1])
    im = Image.open(sys.argv[2]).convert("RGB")
    t = time.time()
    out = upscale(model, im)
    print("sec", round(time.time() - t, 2), out.size)
    out.save(sys.argv[3])
