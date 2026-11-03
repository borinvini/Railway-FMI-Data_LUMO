"""Recolour the partner logos for the dark footer (not part of the data build).

Reads web/src/assets/logos/src/*, writes transparent PNGs to web/src/assets/logos/:
  uoulu.png            tower + wordmark white, rays ice (pink in the original)
  6g-flagship.png      gold kept, white kept, black background removed
  interreg-aurora.png  dark blue -> white, lavender -> ice; the EU flag keeps its colours and
                       gets a thin white border (EU visibility rules on dark backgrounds);
                       top line only, the "Aurora" row is cut

Every pixel is "unmixed": it is treated as one ink laid over the plain background with some
coverage (alpha). The closest ink wins, and the pixel is redrawn in that ink's new colour with the
same coverage, so anti-aliased edges stay smooth without a halo. Idempotent.

Run with any Python that has Pillow + numpy, e.g. the training conda env:
  python scripts/make_logos.py
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "web/src/assets/logos/src"
OUT = ROOT / "web/src/assets/logos"
HEIGHT = 144  # px; shown at <= 48 px tall, so sharp on 3x screens

WHITE = (234, 241, 248)  # --text
ICE = (156, 195, 232)    # --ice
GOLD = (209, 163, 52)    # 6G Flagship gold


def unmix(rgb: np.ndarray, bg, inks):
    """rgb HxWx3 float. inks: list of (source colour, target colour).
    Returns RGBA uint8 with each pixel redrawn in its closest ink's target colour."""
    bg = np.array(bg, float)
    best_err = np.full(rgb.shape[:2], np.inf)
    out_rgb = np.zeros_like(rgb)
    out_a = np.zeros(rgb.shape[:2])
    d = rgb - bg
    for src, dst in inks:
        v = np.array(src, float) - bg
        a = np.clip((d @ v) / (v @ v), 0, 1)           # coverage along bg -> ink
        err = np.linalg.norm(d - a[..., None] * v, axis=2)
        take = err < best_err
        best_err[take] = err[take]
        out_a[take] = a[take]
        out_rgb[take] = dst
    a = np.where(out_a < 0.04, 0, out_a)              # drop JPEG noise in the background
    return np.dstack([out_rgb, a * 255]).round().astype(np.uint8)


def trim_and_save(rgba: np.ndarray, name: str):
    im = Image.fromarray(rgba, "RGBA")
    im = im.crop(im.getchannel("A").point(lambda v: 255 if v > 10 else 0).getbbox())
    w = round(im.width * HEIGHT / im.height)
    im = im.resize((w, HEIGHT), Image.LANCZOS)
    path = OUT / name
    im.save(path, optimize=True)
    print(f"{name}: {im.width}x{im.height}, {path.stat().st_size / 1024:.1f} KB")


def load(name: str) -> np.ndarray:
    return np.asarray(Image.open(SRC / name).convert("RGB"), float)


def uoulu():
    rgb = load("uoulu.png")
    trim_and_save(unmix(rgb, (255, 255, 255), [((36, 66, 140), WHITE), ((226, 0, 122), ICE)]), "uoulu.png")


def flagship():
    rgb = load("6g-flagship.webp")
    trim_and_save(unmix(rgb, (20, 20, 20), [((209, 163, 52), GOLD), ((255, 255, 255), WHITE)]), "6g-flagship.png")


def interreg():
    rgb = load("interreg-aurora.jpg")
    rgba = unmix(rgb, (255, 255, 255), [((14, 62, 148), WHITE), ((165, 168, 215), ICE)])
    # The EU flag: the solid blue rectangle in the middle of the lockup. Find it as the bounding box
    # of saturated blue pixels in the columns between the wordmark and the "Co-funded" text.
    h, w, _ = rgb.shape
    blue = (rgb[..., 2] > 110) & (rgb[..., 0] < 60) & (rgb[..., 1] < 90)
    cols = np.where(blue.sum(axis=0) > 0.15 * h)[0]
    x0, x1 = cols.min(), cols.max() + 1
    rows = np.where(blue[:, x0:x1].mean(axis=1) > 0.5)[0]
    y0, y1 = rows.min(), rows.max() + 1
    b = max(2, round((y1 - y0) * 0.035))              # white border, ~2 px at display size
    rgba[y0 - b:y1 + b, x0 - b:x1 + b] = (255, 255, 255, 255)
    flag = rgb[y0:y1, x0:x1].round().astype(np.uint8)
    rgba[y0:y1, x0:x1, :3] = flag
    rgba[y0:y1, x0:x1, 3] = 255
    print(f"  EU flag found at x {x0}-{x1}, y {y0}-{y1} (border {b} px)")
    # Keep only the top line (Interreg + flag + "Co-funded by..."): the "Aurora" row below the flag is
    # cut so all three footer logos are one line high.
    trim_and_save(rgba[: y1 + b + 1], "interreg-aurora.png")


if __name__ == "__main__":
    uoulu()
    flagship()
    interreg()
