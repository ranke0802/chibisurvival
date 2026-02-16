from __future__ import annotations

from pathlib import Path
from collections import deque
from typing import List

from PIL import Image

SRC = Path('public/assets/characters/chibi_sheet.png')
OUT = Path('public/assets/characters/chibi_motion_sheet.png')

COLS = 3
ROWS = 4

IDLE_FRAMES = 8
WALK_FRAMES = 8
CELL_PAD_X = 10
CELL_PAD_Y = 12


def split_frames(img: Image.Image) -> List[Image.Image]:
    frames: List[Image.Image] = []
    fw = img.width // COLS
    fh = img.height // ROWS
    for r in range(ROWS):
        for c in range(COLS):
            frame = img.crop((c * fw, r * fh, (c + 1) * fw, (r + 1) * fh)).convert('RGBA')
            bb = frame.getbbox()
            if bb is None:
                frames.append(Image.new('RGBA', (1, 1), (0, 0, 0, 0)))
            else:
                frames.append(keep_largest_alpha_component(frame.crop(bb)))
    return frames


def keep_largest_alpha_component(img: Image.Image) -> Image.Image:
    src = img.convert('RGBA')
    w, h = src.size
    px = src.load()
    visited = [[False for _ in range(w)] for _ in range(h)]

    largest: List[tuple[int, int]] = []
    for y in range(h):
        for x in range(w):
            if visited[y][x] or px[x, y][3] <= 0:
                continue
            q = deque([(x, y)])
            visited[y][x] = True
            comp: List[tuple[int, int]] = []
            while q:
                cx, cy = q.popleft()
                comp.append((cx, cy))
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if nx < 0 or nx >= w or ny < 0 or ny >= h:
                        continue
                    if visited[ny][nx]:
                        continue
                    if px[nx, ny][3] <= 0:
                        continue
                    visited[ny][nx] = True
                    q.append((nx, ny))
            if len(comp) > len(largest):
                largest = comp

    if not largest:
        return src

    kept = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    kp = kept.load()
    for x, y in largest:
        kp[x, y] = px[x, y]

    bb = kept.getbbox()
    if bb is None:
        return kept
    return kept.crop(bb)


def transformed(frame: Image.Image, scale_y: float, offset_y: int, tilt_deg: float) -> Image.Image:
    w, h = frame.size
    target_h = max(1, int(round(h * scale_y)))
    scaled = frame.resize((w, target_h), Image.Resampling.NEAREST)

    # tiny tilt gives more life to movement while keeping pixel-art vibe.
    tilted = scaled.rotate(tilt_deg, resample=Image.Resampling.NEAREST, expand=True)

    canvas_h = max(h + 16, tilted.height + 8)
    canvas_w = max(w + 16, tilted.width + 8)
    canvas = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    ox = (canvas_w - tilted.width) // 2
    oy = (canvas_h - tilted.height) // 2 + offset_y
    canvas.alpha_composite(tilted, (ox, oy))
    return canvas


def build_motion_sheet(frames: List[Image.Image]) -> Image.Image:
    # Stable base pose from middle row.
    base_idle = frames[7]
    walk_a = frames[6]
    walk_b = frames[7]
    walk_c = frames[8]

    idle_sequence: List[Image.Image] = []
    idle_scales = [1.00, 1.01, 1.012, 1.008, 1.00, 0.995, 0.992, 0.997]
    idle_offsets = [0, -1, -1, 0, 0, 1, 1, 0]
    idle_tilts = [0.0, -0.3, -0.45, -0.2, 0.0, 0.2, 0.45, 0.25]

    for i in range(IDLE_FRAMES):
        idle_sequence.append(
            transformed(
                base_idle,
                scale_y=idle_scales[i],
                offset_y=idle_offsets[i],
                tilt_deg=idle_tilts[i],
            ),
        )

    walk_sequence_src = [walk_a, walk_b, walk_c, walk_b, walk_a, walk_b, walk_c, walk_b]
    walk_scales = [0.985, 1.0, 1.02, 1.0, 0.985, 1.0, 1.02, 1.0]
    walk_offsets = [1, 0, -2, 0, 1, 0, -2, 0]
    walk_tilts = [-1.0, -0.35, 0.9, 0.35, 1.0, 0.35, -0.9, -0.35]
    walk_sequence: List[Image.Image] = []

    for i, src in enumerate(walk_sequence_src):
        walk_sequence.append(
            transformed(
                src,
                scale_y=walk_scales[i],
                offset_y=walk_offsets[i],
                tilt_deg=walk_tilts[i],
            ),
        )

    max_w = max(frame.width for frame in idle_sequence + walk_sequence)
    max_h = max(frame.height for frame in idle_sequence + walk_sequence)
    cell_w = max_w + CELL_PAD_X * 2
    cell_h = max_h + CELL_PAD_Y * 2
    out = Image.new('RGBA', (WALK_FRAMES * cell_w, 2 * cell_h), (0, 0, 0, 0))

    for i, frame in enumerate(idle_sequence):
        ox = i * cell_w + (cell_w - frame.width) // 2
        oy = (cell_h - frame.height) // 2
        out.alpha_composite(frame, (ox, oy))

    for i, frame in enumerate(walk_sequence):
        ox = i * cell_w + (cell_w - frame.width) // 2
        oy = cell_h + (cell_h - frame.height) // 2
        out.alpha_composite(frame, (ox, oy))

    return out


def main() -> None:
    src = Image.open(SRC).convert('RGBA')
    frames = split_frames(src)
    sheet = build_motion_sheet(frames)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT)


if __name__ == '__main__':
    main()
