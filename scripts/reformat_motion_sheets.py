"""
Reformat motion sheets to exact 1600x960 (8 cols x 3 rows, 200x320 per frame).

Problem: AI-generated sheets are 640x640 with inconsistent grid layouts.
Solution: Detect frames automatically and repack them into the strict grid.
"""
from __future__ import annotations
from pathlib import Path
from PIL import Image
import numpy as np


TARGET_W = 1600
TARGET_H = 960
COLS = 8
ROWS = 3
FRAME_W = TARGET_W // COLS   # 200
FRAME_H = TARGET_H // ROWS   # 320


def find_frame_bboxes(img: Image.Image, expected_cols: int, expected_rows: int) -> list[tuple[int, int, int, int]]:
    """
    Find bounding boxes for each frame in the sprite sheet.
    Returns list of (x, y, w, h) for each detected frame, row by row.
    """
    arr = np.array(img)
    alpha = arr[:, :, 3] if arr.shape[2] == 4 else np.ones(arr.shape[:2], dtype=np.uint8) * 255

    h, w = alpha.shape

    # Find row boundaries by scanning for horizontal gaps
    row_has_content = np.any(alpha > 10, axis=1)
    row_ranges = []
    in_row = False
    start = 0
    for y in range(h):
        if row_has_content[y] and not in_row:
            start = y
            in_row = True
        elif not row_has_content[y] and in_row:
            row_ranges.append((start, y))
            in_row = False
    if in_row:
        row_ranges.append((start, h))

    print(f"  Detected {len(row_ranges)} rows: {row_ranges}")

    # For each row, find column boundaries
    all_frames = []
    for row_start, row_end in row_ranges:
        row_alpha = alpha[row_start:row_end, :]
        col_has_content = np.any(row_alpha > 10, axis=0)

        col_ranges = []
        in_col = False
        cstart = 0
        for x in range(w):
            if col_has_content[x] and not in_col:
                cstart = x
                in_col = True
            elif not col_has_content[x] and in_col:
                col_ranges.append((cstart, x))
                in_col = False
        if in_col:
            col_ranges.append((cstart, w))

        print(f"    Row [{row_start}:{row_end}] has {len(col_ranges)} frames")

        row_frames = []
        for col_start, col_end in col_ranges:
            row_frames.append((col_start, row_start, col_end - col_start, row_end - row_start))
        all_frames.append(row_frames)

    return all_frames


def reformat_sheet(img: Image.Image, label: str) -> Image.Image:
    """Reformat a motion sheet to exact 1600x960 with 8x3 grid."""
    print(f"\nProcessing {label}...")

    img = img.convert("RGBA")
    all_row_frames = find_frame_bboxes(img, COLS, ROWS)

    # Create target canvas
    canvas = Image.new("RGBA", (TARGET_W, TARGET_H), (0, 0, 0, 0))

    # We need exactly 3 rows. If we have more, merge rows 2+ into attack row
    if len(all_row_frames) == 4:
        # 4 rows detected: likely row0=idle, row1=move, row2=attack_part1, row3=attack_part2
        # OR row0=idle, row1=move, row2=attack, row3=extra
        # Use first 3 rows: idle, move, attack
        print(f"  4 rows detected, using first 3 for idle/move/attack")
        rows_to_use = all_row_frames[:3]
    elif len(all_row_frames) >= 3:
        rows_to_use = all_row_frames[:3]
    elif len(all_row_frames) == 2:
        # Duplicate first row as idle
        print(f"  Only 2 rows, duplicating row 0 as idle")
        rows_to_use = [all_row_frames[0], all_row_frames[0], all_row_frames[1]]
    else:
        print(f"  WARNING: Only {len(all_row_frames)} rows detected!")
        rows_to_use = all_row_frames * 3

    for row_idx, row_frames in enumerate(rows_to_use[:ROWS]):
        # Take up to 8 frames, or repeat last frame to fill
        frames = row_frames[:COLS]
        while len(frames) < COLS:
            frames.append(frames[-1] if frames else (0, 0, 1, 1))

        for col_idx, (fx, fy, fw, fh) in enumerate(frames[:COLS]):
            # Crop the frame from source
            frame_img = img.crop((fx, fy, fx + fw, fy + fh))

            # Calculate target position (centered in the 200x320 cell)
            target_x = col_idx * FRAME_W
            target_y = row_idx * FRAME_H

            # Scale frame to fit within FRAME_W x FRAME_H while maintaining aspect ratio
            scale = min(FRAME_W / fw, FRAME_H / fh)
            new_w = int(fw * scale)
            new_h = int(fh * scale)

            # Use LANCZOS for quality downscale
            frame_resized = frame_img.resize((new_w, new_h), Image.LANCZOS)

            # Center in cell
            offset_x = target_x + (FRAME_W - new_w) // 2
            offset_y = target_y + (FRAME_H - new_h) // 2

            canvas.paste(frame_resized, (offset_x, offset_y), frame_resized)

    print(f"  Output: {TARGET_W}x{TARGET_H}, {COLS}x{ROWS} grid")
    return canvas


def main():
    sheets = [
        Path("public/assets/characters/warrior_motion_sheet.png"),
        Path("public/assets/characters/archer_motion_sheet.png"),
        Path("public/assets/characters/mage_motion_sheet.png"),
    ]

    for sheet_path in sheets:
        if not sheet_path.exists():
            print(f"SKIP: {sheet_path} not found")
            continue

        img = Image.open(sheet_path)
        w, h = img.size
        print(f"\n{'='*60}")
        print(f"File: {sheet_path} ({w}x{h})")

        if w == TARGET_W and h == TARGET_H:
            print(f"  Already correct size, skipping")
            continue

        result = reformat_sheet(img, sheet_path.name)
        result.save(sheet_path, "PNG")
        print(f"  Saved: {sheet_path}")


if __name__ == "__main__":
    main()
