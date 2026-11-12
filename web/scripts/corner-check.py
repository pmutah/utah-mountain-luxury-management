"""Crop the corners of candidate photos so a watermark can be seen at full resolution.

Channel CDNs brand some images with a "Booking.com" / provider mark in a corner. Those must never reach
our booking page, so before wiring a photo set into `house-photos.ts` this renders each candidate's
top-right and bottom-right corner side by side at 1:1.

    python scripts/corner-check.py river 01,02,03,06,07,10,11,12,25,26

Writes corner-<house>.jpg into the temp folder and prints the path.
"""
import os
import sys
import glob
import tempfile

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = tempfile.gettempdir()

CROP_W, CROP_H = 460, 150


def corners(house: str, ids: list[str]) -> str | None:
    files = []
    for prefix in ids:
        matches = glob.glob(os.path.join(ROOT, "public", "houses", house, f"{prefix}-*.jpg"))
        if matches:
            files.append(matches[0])
    if not files:
        return None
    rows = len(files)
    canvas = Image.new("RGB", (CROP_W * 2 + 30, rows * CROP_H + 10), (10, 10, 10))
    draw = ImageDraw.Draw(canvas)
    for index, path in enumerate(files):
        prefix = os.path.basename(path).split("-")[0]
        with Image.open(path) as src:
            image = src.convert("RGB")
            w, h = image.size
            top = image.crop((max(0, w - CROP_W), 0, w, CROP_H))
            bottom = image.crop((max(0, w - CROP_W), max(0, h - CROP_H), w, h))
        y = index * CROP_H + 5
        canvas.paste(top, (5, y))
        canvas.paste(bottom, (CROP_W + 25, y))
        draw.text((8, y + CROP_H - 18), f"{prefix} top", fill=(255, 240, 120))
        draw.text((CROP_W + 28, y + CROP_H - 18), f"{prefix} bottom", fill=(255, 240, 120))
    out = os.path.join(OUT, f"corner-{house}.jpg")
    canvas.save(out, quality=90)
    return out


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("usage: corner-check.py <house> <01,02,...>")
        raise SystemExit(1)
    path = corners(sys.argv[1], [i.strip() for i in sys.argv[2].split(",") if i.strip()])
    print(path or "no matching photos")
