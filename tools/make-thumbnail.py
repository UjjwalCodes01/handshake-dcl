#!/usr/bin/env python3
"""
Turn any screenshot into a spec-correct Decentraland scene thumbnail.

Decentraland recommends 228x160 for `navmapThumbnail`, and explicitly warns that
an image whose proportions differ WILL BE STRETCHED. So the important part is not
the pixel count, it is the 228:160 (1.425) aspect ratio -- get that wrong and the
scene looks distorted on the map card, which is the first thing anyone sees.

This crops to that ratio (keeping the centre by default) and scales up to a
2x-recommended size so it stays crisp on high-DPI screens.

    python3 tools/make-thumbnail.py shot.png
    python3 tools/make-thumbnail.py shot.png --anchor top
    python3 tools/make-thumbnail.py shot.png -o images/scene-thumbnail.png
"""
import argparse
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required:  pip install --user Pillow")

TARGET_W, TARGET_H = 228, 160
RATIO = TARGET_W / TARGET_H
# 2x the recommended size: still tiny, noticeably sharper on a phone.
OUT_W, OUT_H = TARGET_W * 2, TARGET_H * 2
MIN_W, MIN_H = 196, 143


def crop_box(w: int, h: int, anchor: str) -> tuple[int, int, int, int]:
    """Largest 228:160 rectangle that fits inside w x h."""
    if w / h > RATIO:
        # Too wide: full height, trim the sides.
        new_w, new_h = int(round(h * RATIO)), h
    else:
        # Too tall: full width, trim top/bottom.
        new_w, new_h = w, int(round(w / RATIO))

    left = (w - new_w) // 2
    if anchor == "top":
        top = 0
    elif anchor == "bottom":
        top = h - new_h
    else:
        top = (h - new_h) // 2
    return left, top, left + new_w, top + new_h


def main() -> int:
    ap = argparse.ArgumentParser(description="Make a Decentraland scene thumbnail.")
    ap.add_argument("input", help="screenshot to convert")
    ap.add_argument("-o", "--output", default="images/scene-thumbnail.png")
    ap.add_argument(
        "--anchor",
        choices=["center", "top", "bottom"],
        default="center",
        help="which part to keep when cropping (default: center)",
    )
    args = ap.parse_args()

    src = Path(args.input)
    if not src.exists():
        sys.exit(f"no such file: {src}")

    img = Image.open(src)
    # Screenshots often carry an alpha channel; the map card does not want one.
    img = img.convert("RGB")
    w, h = img.size

    if w < MIN_W or h < MIN_H:
        sys.exit(f"source is {w}x{h}, below the {MIN_W}x{MIN_H} minimum — retake it larger")

    box = crop_box(w, h, args.anchor)
    out = img.crop(box).resize((OUT_W, OUT_H), Image.LANCZOS)

    dest = Path(args.output)
    dest.parent.mkdir(parents=True, exist_ok=True)
    out.save(dest, "PNG", optimize=True)

    kb = dest.stat().st_size / 1024
    print(f"  source   {w}x{h}")
    print(f"  cropped  {box[2]-box[0]}x{box[3]-box[1]}  (anchor: {args.anchor})")
    print(f"  written  {dest}  {OUT_W}x{OUT_H}  {kb:.0f} KB")
    print(f"  ratio    {OUT_W/OUT_H:.3f}  (target {RATIO:.3f}) — no stretching on the map card")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
