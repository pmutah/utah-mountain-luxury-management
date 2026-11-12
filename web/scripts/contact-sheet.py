"""Build a labelled contact sheet per house so the downloaded photos can be checked by eye.

Not part of the app. Run it when the photo set is harvested or reordered:

    python scripts/contact-sheet.py

Writes sheet-<house>.jpg into the temp folder and prints the path, so the sheet can be opened and the
covers / best rooms picked. Each cell is numbered to match the file's leading digits.
"""
import os
import sys
import glob
import tempfile

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = tempfile.gettempdir()

CELL_W, CELL_H = 360, 270
COLS = 5


def sheet(house: str, only: list[str] | None = None, cell_w: int = CELL_W, cell_h: int = CELL_H) -> str | None:
    files = sorted(glob.glob(os.path.join(ROOT, "public", "houses", house, "*.jpg")))
    if only:
        files = [f for f in files if os.path.basename(f).split("-")[0] in only]
    if not files:
        return None
    rows = (len(files) + COLS - 1) // COLS
    canvas = Image.new("RGB", (COLS * cell_w, rows * cell_h), (16, 24, 32))
    draw = ImageDraw.Draw(canvas)
    for index, path in enumerate(files):
        col, row = index % COLS, index // COLS
        with Image.open(path) as src:
            image = src.convert("RGB")
            image.thumbnail((cell_w - 8, cell_h - 8), Image.LANCZOS)
        x = col * cell_w + (cell_w - image.width) // 2
        y = row * cell_h + (cell_h - image.height) // 2
        canvas.paste(image, (x, y))
        label = os.path.splitext(os.path.basename(path))[0]
        draw.rectangle([col * cell_w + 4, row * cell_h + 4, col * cell_w + 8 + 7 * len(label), row * cell_h + 24], fill=(0, 0, 0))
        draw.text((col * cell_w + 10, row * cell_h + 8), label, fill=(255, 235, 180))
    suffix = "-pick" if only else ""
    out = os.path.join(OUT, f"sheet-{house}{suffix}.jpg")
    canvas.save(out, quality=86)
    return out


if __name__ == "__main__":
    # `house:01,02,03` renders just those photos, larger, for judging a candidate set.
    spec = sys.argv[1] if len(sys.argv) > 1 else ""
    if ":" in spec:
        house, ids = spec.split(":", 1)
        path = sheet(house, [i.strip() for i in ids.split(",") if i.strip()], 480, 360)
        print(f"{house}: {path}" if path else f"{house}: no photos")
    else:
        wanted = sys.argv[1:] or ["river", "ranch", "lindon"]
        for name in wanted:
            path = sheet(name)
            print(f"{name}: {path}" if path else f"{name}: no photos")
