from __future__ import annotations

from collections import deque
from pathlib import Path
from typing import List, Tuple

from PIL import Image

SRC = Path('public/assets/characters/chibi.jpg')
OUT = Path('public/assets/characters/chibi_sheet.png')
PORTRAIT_OUT = Path('public/assets/characters/chibi_portrait.png')

COLS = 3
ROWS = 4
CELL_PAD = 6
PORTRAIT_FRAME_INDEX = 1
PORTRAIT_SIZE = 128

Pixel = Tuple[int, int, int, int]


def is_bg_like(px: Pixel) -> bool:
    r, g, b, a = px
    if a == 0:
        return True
    if r > 222 and g > 222 and b > 222:
        # keep very saturated bright pixels less likely to be paper-white bg
        spread = max(r, g, b) - min(r, g, b)
        return spread < 24
    return False


def remove_connected_background(frame: Image.Image) -> Image.Image:
    img = frame.copy().convert('RGBA')
    w, h = img.size
    px = img.load()

    visited = [[False for _ in range(w)] for _ in range(h)]
    q = deque()

    for x in range(w):
        q.append((x, 0))
        q.append((x, h - 1))
    for y in range(h):
        q.append((0, y))
        q.append((w - 1, y))

    while q:
        x, y = q.popleft()
        if x < 0 or x >= w or y < 0 or y >= h:
            continue
        if visited[y][x]:
            continue
        visited[y][x] = True

        if not is_bg_like(px[x, y]):
            continue

        px[x, y] = (0, 0, 0, 0)
        q.append((x - 1, y))
        q.append((x + 1, y))
        q.append((x, y - 1))
        q.append((x, y + 1))

    return img


def decontaminate_edges(frame: Image.Image) -> Image.Image:
    src = frame.copy().convert('RGBA')
    dst = frame.copy().convert('RGBA')
    w, h = src.size
    s = src.load()
    d = dst.load()

    for y in range(h):
        for x in range(w):
            r, g, b, a = s[x, y]
            if a == 0:
                continue
            # White-ish fringe pixels often appear after jpeg keying.
            if r + g + b < 655:
                continue

            samples: List[Tuple[int, int, int]] = []
            for oy in (-1, 0, 1):
                for ox in (-1, 0, 1):
                    if ox == 0 and oy == 0:
                        continue
                    nx, ny = x + ox, y + oy
                    if nx < 0 or nx >= w or ny < 0 or ny >= h:
                        continue
                    nr, ng, nb, na = s[nx, ny]
                    if na > 32 and (nr + ng + nb) < 690:
                        samples.append((nr, ng, nb))

            if samples:
                rr = sum(v[0] for v in samples) // len(samples)
                gg = sum(v[1] for v in samples) // len(samples)
                bb = sum(v[2] for v in samples) // len(samples)
                d[x, y] = (rr, gg, bb, a)

    return dst


def split_frames(img: Image.Image) -> List[Image.Image]:
    w, h = img.size
    xs = [round(i * w / COLS) for i in range(COLS + 1)]
    ys = [round(i * h / ROWS) for i in range(ROWS + 1)]

    frames: List[Image.Image] = []
    for row in range(ROWS):
        for col in range(COLS):
            x0, x1 = xs[col], xs[col + 1]
            y0, y1 = ys[row], ys[row + 1]
            frames.append(img.crop((x0, y0, x1, y1)).convert('RGBA'))
    return frames


def trim_to_bbox(img: Image.Image) -> Image.Image:
    bbox = img.getbbox()
    if bbox is None:
        return Image.new('RGBA', (1, 1), (0, 0, 0, 0))
    x0, y0, x1, y1 = bbox
    x0 = max(0, x0 - 1)
    y0 = max(0, y0 - 1)
    x1 = min(img.width, x1 + 1)
    y1 = min(img.height, y1 + 1)
    return img.crop((x0, y0, x1, y1))


def build_portrait(frame: Image.Image) -> Image.Image:
    sprite = trim_to_bbox(frame)
    # Portrait icon: focus on head/upper body instead of full-body tiny silhouette.
    bust_h = max(1, int(sprite.height * 0.84))
    bust = sprite.crop((0, 0, sprite.width, bust_h))

    canvas = Image.new('RGBA', (PORTRAIT_SIZE, PORTRAIT_SIZE), (0, 0, 0, 0))
    inner = PORTRAIT_SIZE - 8
    scale = min(inner / bust.width, inner / bust.height)
    draw_w = max(1, int(round(bust.width * scale)))
    draw_h = max(1, int(round(bust.height * scale)))
    resized = bust.resize((draw_w, draw_h), Image.Resampling.NEAREST)

    x = (PORTRAIT_SIZE - draw_w) // 2
    y = (PORTRAIT_SIZE - draw_h) // 2 + 2
    canvas.alpha_composite(resized, (x, y))
    return canvas


def build_uniform_atlas(frames: List[Image.Image]) -> Image.Image:
    trimmed = [trim_to_bbox(frame) for frame in frames]
    max_w = max(frame.width for frame in trimmed)
    max_h = max(frame.height for frame in trimmed)

    cell_w = max_w + CELL_PAD * 2
    cell_h = max_h + CELL_PAD * 2

    atlas = Image.new('RGBA', (cell_w * COLS, cell_h * ROWS), (0, 0, 0, 0))

    for i, frame in enumerate(trimmed):
        col = i % COLS
        row = i // COLS
        ox = col * cell_w + (cell_w - frame.width) // 2
        oy = row * cell_h + (cell_h - frame.height) // 2
        atlas.alpha_composite(frame, (ox, oy))

    return atlas


def main() -> None:
    source = Image.open(SRC).convert('RGBA')
    frames = split_frames(source)

    cleaned: List[Image.Image] = []
    for frame in frames:
        cut = remove_connected_background(frame)
        fixed = decontaminate_edges(cut)
        cleaned.append(fixed)

    atlas = build_uniform_atlas(cleaned)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(OUT)

    portrait_idx = max(0, min(PORTRAIT_FRAME_INDEX, len(cleaned) - 1))
    portrait = build_portrait(cleaned[portrait_idx])
    portrait.save(PORTRAIT_OUT)


if __name__ == '__main__':
    main()
