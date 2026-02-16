from __future__ import annotations
from pathlib import Path
from PIL import Image, ImageOps
import numpy as np
from collections import deque

# Constants
TARGET_W = 1600
TARGET_H = 3840  # 12 rows * 320px
COLS = 8
ROWS = 12
FRAME_W = 200
FRAME_H = 320

# Input files map (files are now in processed_precision/ folder)
INPUT_MAP = {
    'warrior': {
        'idle': 'refined_warrior_idle.png',
        'walk': 'refined_warrior_walk.png',
        'attack': 'refined_warrior_attack.png',
    },
    'archer': {
        'idle': 'refined_archer_idle.png',
        'walk': 'refined_archer_walk.png',
        'attack': 'refined_archer_attack.png',
    },
    'mage': {
        'idle': 'refined_mage_idle.png',
        'walk': 'refined_mage_walk.png',
        'attack': 'refined_mage_attack.png',
    },
}

BRAIN_DIR = Path("public/assets/characters")
OUTPUT_DIR = Path("public/assets/characters")

def is_bg_like(px) -> bool:
    r, g, b, a = px if len(px) == 4 else (*px, 255)
    if a == 0: return True
    if r > 240 and g > 240 and b > 240: return True  # White
    return False

def remove_background(img: Image.Image) -> Image.Image:
    img = img.convert('RGBA')
    width, height = img.size
    pixels = img.load()
    visited = set()
    queue = deque()

    # Flood fill from connection points (corners and edges)
    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))
    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))

    while queue:
        x, y = queue.popleft()
        if (x, y) in visited: continue
        if not (0 <= x < width and 0 <= y < height): continue
        visited.add((x, y))
        
        r, g, b, a = pixels[x, y]
        if a == 0 or is_bg_like((r, g, b, a)):
            pixels[x, y] = (0, 0, 0, 0)
            for dx, dy in [(1,0), (-1,0), (0,1), (0,-1)]:
                queue.append((x+dx, y+dy))
    return img

def remove_small_islands(img: Image.Image, threshold: int = 50) -> Image.Image:
    width, height = img.size
    pixels = img.load()
    visited = set()
    
    for y in range(height):
        for x in range(width):
            if (x, y) in visited: continue
            r, g, b, a = pixels[x, y]
            if a == 0:
                visited.add((x, y))
                continue
            
            # BFS for component
            component = []
            q = deque([(x, y)])
            visited.add((x, y))
            component.append((x, y))
            
            idx = 0
            while idx < len(component):
                cx, cy = component[idx]
                idx += 1
                for dx, dy in [(-1,0), (1,0), (0,-1), (0,1)]:
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < width and 0 <= ny < height and (nx, ny) not in visited:
                        nr, ng, nb, na = pixels[nx, ny]
                        if na > 0:
                            visited.add((nx, ny))
                            component.append((nx, ny))
                            q.append((nx, ny))
            
            if len(component) < threshold:
                for cx, cy in component:
                    pixels[cx, cy] = (0, 0, 0, 0)
    return img

def find_grid_cells(img: Image.Image) -> list[list[tuple[int, int, int, int]]]:
    """
    Input images are now pre-processed to 4x4 grid of CANVAS_WIDTH x CANVAS_HEIGHT (240x320).
    Total size 960x1280.
    """
    w, h = img.size
    cw = 240 # Fixed from precision script
    ch = 320 # Fixed from precision script
    
    rows = []
    for r in range(4):
        cols = []
        for c in range(4):
            x = c * cw
            y = r * ch
            cols.append((x, y, cw, ch))
        rows.append(cols)
    return rows

def build_sheet():
    if not OUTPUT_DIR.exists():
        OUTPUT_DIR.mkdir(parents=True)

    for char_name, files in INPUT_MAP.items():
        print(f"Processing {char_name}...")
        canvas = Image.new("RGBA", (TARGET_W, TARGET_H), (0, 0, 0, 0))
        
        # Order: Idle -> Walk -> Attack
        parts = ['idle', 'walk', 'attack']
        
        for part_idx, part_name in enumerate(parts):
            fname = files[part_name]
            fpath = BRAIN_DIR / fname
            if not fpath.exists():
                print(f"  MISSING: {fpath}")
                continue
            
            print(f"  Loading {part_name}: {fname}")
            # Processed images are already clean and perfect grid
            img = Image.open(fpath)
            
            # Detect 4 rows x 4 cols
            cell_rows = find_grid_cells(img) # list of list of (x,y,w,h)
            
            # part_idx 0-> rows 0-3, idx 1-> rows 4-7, idx 2-> rows 8-11
            start_row = part_idx * 4
            
            for r_sub in range(4): # 0..3
                target_row = start_row + r_sub
                if r_sub >= len(cell_rows): break
                
                row_cells = cell_rows[r_sub]
                
                # We have 4 cells. We need to fill 8 columns.
                # Pattern: 0, 0, 1, 1, 2, 2, 3, 3
                
                for c_sub in range(4): # 0..3
                    if c_sub >= len(row_cells): break
                    
                    fx, fy, fw, fh = row_cells[c_sub]
                    frame_img = img.crop((fx, fy, fx+fw, fy+fh))
                    
                    # Target columns: c_sub*2 and c_sub*2 + 1
                    dest_cols = [c_sub * 2, c_sub * 2 + 1]
                    
                    for dest_col in dest_cols:
                        tx = dest_col * FRAME_W
                        ty = target_row * FRAME_H
                        
                        # Resize and center
                        # Scale to fit 200x320, keeping aspect ratio
                        scale = min(FRAME_W / fw, FRAME_H / fh)
                        # Optionally scale up a bit more if too small? 
                        # generated images are 160x160 cells roughly. 200x320 is bigger.
                        # Let's scale to fit width 160, or just fit containment.
                        # Containment is safer.
                        
                        new_w = int(fw * scale * 0.9) # 90% fit to avoid touching edges
                        new_h = int(fh * scale * 0.9)
                        
                        resized = frame_img.resize((new_w, new_h), Image.NEAREST) # Pixel art
                        
                        ox = tx + (FRAME_W - new_w) // 2
                        oy = ty + (FRAME_H - new_h) // 2
                        
                        canvas.paste(resized, (ox, oy), resized)
        
        out_path = OUTPUT_DIR / f"{char_name}_motion_sheet.png"
        canvas.save(out_path, "PNG")
        print(f"Saved {out_path}")

if __name__ == "__main__":
    build_sheet()
