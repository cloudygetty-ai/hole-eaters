#!/usr/bin/env python3
"""Printable QR sticker sheets for venue/event drops.

Each venue gets its own tracked link (utm_source=qr_<slug>), which the landing page
records as the waitlist `source`, so signups per venue show up in Supabase.

Usage:
  pip install segno pillow
  python3 scripts/qr_stickers.py the-eagle bar-xyz pride-booth --out stickers.pdf [--fonts DIR]

Prints a US-Letter PDF: 12 stickers per page (2.5in circles), one page per venue.
--fonts: optional dir with BodoniModa.ttf + InstrumentSans.ttf (Google Fonts); falls back to default.
"""
import argparse
import io
import re
import sys
from pathlib import Path

import segno
from PIL import Image, ImageDraw, ImageFont

SITE = 'https://www.hole-eaters.com/'
DPI = 300
STICKER_IN = 2.5
PAGE_W, PAGE_H = int(8.5 * DPI), int(11 * DPI)
INK, IVORY, EMBER, BRASS = (9, 6, 8), (239, 230, 218), (178, 43, 68), (177, 138, 85)
ROOT = Path(__file__).resolve().parent.parent


def tracked_url(slug: str) -> str:
    return f'{SITE}?utm_source=qr_{slug}'


def load_font(font_dir: Path | None, name: str, size: int) -> ImageFont.ImageFont:
    if font_dir and (font_dir / name).exists():
        return ImageFont.truetype(str(font_dir / name), size)
    return ImageFont.load_default(size)


def sticker(slug: str, font_dir: Path | None) -> Image.Image:
    size = int(STICKER_IN * DPI)
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse((0, 0, size - 1, size - 1), fill=INK, outline=BRASS, width=6)

    # QR stays dark-on-light: inverted codes fail on older phone cameras.
    qr_px = int(size * 0.5)
    buf = io.BytesIO()
    segno.make(tracked_url(slug), error='h').save(buf, kind='png', scale=10, border=2, dark=INK, light=IVORY)
    qr = Image.open(buf).convert('RGBA').resize((qr_px, qr_px), Image.NEAREST)
    qx, qy = (size - qr_px) // 2, int(size * 0.27)
    img.paste(qr, (qx, qy))

    emblem_path = ROOT / 'public/brand/emblem.webp'
    if emblem_path.exists():
        em = Image.open(emblem_path).convert('RGBA').resize((int(qr_px * 0.24),) * 2, Image.LANCZOS)
        ex, ey = qx + (qr_px - em.width) // 2, qy + (qr_px - em.height) // 2
        d.ellipse((ex - 6, ey - 6, ex + em.width + 6, ey + em.height + 6), fill=INK)
        img.paste(em, (ex, ey), em)

    title = load_font(font_dir, 'BodoniModa.ttf', int(size * 0.085))
    small = load_font(font_dir, 'InstrumentSans.ttf', int(size * 0.042))
    d.text((size // 2, int(size * 0.17)), "Who's near?", font=title, fill=IVORY, anchor='mm')
    d.text((size // 2, int(size * 0.83)), 'SCAN · 18+', font=small, fill=BRASS, anchor='mm')
    d.text((size // 2, int(size * 0.89)), 'hole-eaters.com', font=small, fill=EMBER, anchor='mm')
    return img


def page(slug: str, font_dir: Path | None) -> Image.Image:
    sheet = Image.new('RGB', (PAGE_W, PAGE_H), 'white')
    s = sticker(slug, font_dir)
    cols, rows = 3, 4
    gap_x = (PAGE_W - cols * s.width) // (cols + 1)
    gap_y = (PAGE_H - rows * s.height) // (rows + 1)
    for r in range(rows):
        for c in range(cols):
            sheet.paste(s, (gap_x + c * (s.width + gap_x), gap_y + r * (s.height + gap_y)), s)
    ImageDraw.Draw(sheet).text((40, PAGE_H - 50), f'{slug} → {tracked_url(slug)}', fill=(120, 120, 120))
    return sheet


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('venues', nargs='+', help='venue/event slugs, e.g. the-eagle pride-booth')
    ap.add_argument('--out', default='stickers.pdf')
    ap.add_argument('--fonts', type=Path, default=None)
    args = ap.parse_args()

    slugs = [re.sub(r'[^a-z0-9_-]', '', v.lower())[:56] for v in args.venues]
    if not all(slugs):
        print('Venue slugs must contain letters or numbers.', file=sys.stderr)
        return 1
    pages = [page(s, args.fonts) for s in slugs]
    pages[0].save(args.out, save_all=True, append_images=pages[1:], resolution=DPI)
    for s in slugs:
        print(f'{s}\t{tracked_url(s)}')
    print(f'wrote {args.out} ({len(pages)} page{"s" * (len(pages) > 1)})')
    return 0


if __name__ == '__main__':
    sys.exit(main())
