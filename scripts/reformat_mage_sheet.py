"""
Reformat Mage motion sheet specifically.
The original has 4 rows but row 2 is broken (only tiny fragments).
Use rows: 0=Idle, 1=Move (from row 3 which has clear walk), 2=Attack (from row 3 with casting).
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


def find_row_ranges(alpha: np.ndarray) -> list[tuple[int, int]]:
    """Find contiguous non-empty row ranges."""
    h = alpha.shape[0]
    row_has_content = np.any(alpha > 10, axis=1)
    ranges = []
    in_row = False
    start = 0
    for y in range(h):
        if row_has_content[y] and not in_row:
            start = y
            in_row = True
        elif not row_has_content[y] and in_row:
            if y - start > 15:  # Minimum row height to filter noise
                ranges.append((start, y))
            in_row = False
    if in_row and h - start > 15:
        ranges.append((start, h))
    return ranges


def find_frames_in_row(alpha_row: np.ndarray, full_img: Image.Image, row_start: int, row_end: int) -> list[tuple[int, int, int, int]]:
    """Find frame bounding boxes in a row."""
    col_has_content = np.any(alpha_row > 10, axis=0)
    w = alpha_row.shape[1]
    
    col_ranges = []
    in_col = False
    cstart = 0
    for x in range(w):
        if col_has_content[x] and not in_col:
            cstart = x
            in_col = True
        elif not col_has_content[x] and in_col:
            if x - cstart > 10:  # Min frame width to filter noise
                col_ranges.append((cstart, x))
            in_col = False
    if in_col and w - cstart > 10:
        col_ranges.append((cstart, w))
    
    frames = []
    for cs, ce in col_ranges:
        frames.append((cs, row_start, ce - cs, row_end - row_start))
    return frames


def paste_frames_to_row(canvas: Image.Image, source_img: Image.Image, frames: list[tuple[int, int, int, int]], target_row: int):
    """Paste frames into the target row of the canvas."""
    # Take up to 8 frames, repeat last to fill
    used_frames = frames[:COLS]
    while len(used_frames) < COLS:
        used_frames.append(used_frames[-1] if used_frames else (0, 0, 1, 1))
    
    for col_idx, (fx, fy, fw, fh) in enumerate(used_frames[:COLS]):
        frame_img = source_img.crop((fx, fy, fx + fw, fy + fh))
        
        target_x = col_idx * FRAME_W
        target_y = target_row * FRAME_H
        
        scale = min(FRAME_W / fw, FRAME_H / fh)
        new_w = int(fw * scale)
        new_h = int(fh * scale)
        
        frame_resized = frame_img.resize((new_w, new_h), Image.LANCZOS)
        
        offset_x = target_x + (FRAME_W - new_w) // 2
        offset_y = target_y + (FRAME_H - new_h) // 2
        
        canvas.paste(frame_resized, (offset_x, offset_y), frame_resized)


def main():
    sheet_path = Path("public/assets/characters/mage_motion_sheet.png")
    
    # First, run transparency fix on it
    print(f"Processing mage motion sheet...")
    
    img = Image.open(sheet_path).convert("RGBA")
    arr = np.array(img)
    alpha = arr[:, :, 3]
    w, h = img.size
    print(f"  Size: {w}x{h}")
    
    # Find all rows
    row_ranges = find_row_ranges(alpha)
    print(f"  Found {len(row_ranges)} rows: {row_ranges}")
    
    # Analyze each row
    all_rows = []
    for i, (rs, re) in enumerate(row_ranges):
        row_alpha = alpha[rs:re, :]
        frames = find_frames_in_row(row_alpha, img, rs, re)
        row_height = re - rs
        print(f"  Row {i} [{rs}:{re}] height={row_height}: {len(frames)} frames")
        all_rows.append({
            'start': rs,
            'end': re,
            'height': row_height,
            'frames': frames,
            'frame_count': len(frames)
        })
    
    # Strategy for Mage:
    # Pick the 3 best rows. A "good" row has >= 4 frames and height >= 80px
    good_rows = [r for r in all_rows if r['frame_count'] >= 3 and r['height'] >= 50]
    print(f"\n  Good rows: {len(good_rows)}")
    
    if len(good_rows) < 3:
        # If we don't have 3 good rows, use what we have and duplicate
        while len(good_rows) < 3:
            good_rows.append(good_rows[-1] if good_rows else all_rows[0])
    
    # Use first good row as idle, second as move, last as attack
    idle_row = good_rows[0]
    move_row = good_rows[1] if len(good_rows) > 1 else good_rows[0]
    attack_row = good_rows[-1]  # Last good row is usually the attack
    
    print(f"\n  Idle row: [{idle_row['start']}:{idle_row['end']}] with {idle_row['frame_count']} frames")
    print(f"  Move row: [{move_row['start']}:{move_row['end']}] with {move_row['frame_count']} frames")
    print(f"  Attack row: [{attack_row['start']}:{attack_row['end']}] with {attack_row['frame_count']} frames")
    
    # Create canvas
    canvas = Image.new("RGBA", (TARGET_W, TARGET_H), (0, 0, 0, 0))
    
    paste_frames_to_row(canvas, img, idle_row['frames'], 0)
    paste_frames_to_row(canvas, img, move_row['frames'], 1)
    paste_frames_to_row(canvas, img, attack_row['frames'], 2)
    
    canvas.save(sheet_path, "PNG")
    print(f"\n  Saved: {sheet_path} ({TARGET_W}x{TARGET_H})")


if __name__ == "__main__":
    main()
