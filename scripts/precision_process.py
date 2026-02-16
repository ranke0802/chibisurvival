import os
import sys
from pathlib import Path
from PIL import Image, ImageFilter
import numpy as np

# Configuration
# Canvas size extended to prevent clipping
CANVAS_WIDTH = 240 
CANVAS_HEIGHT = 320
TARGET_BODY_HEIGHT = 260 # Increased to match original asset size
PADDING_BOTTOM = 25 # Distance from bottom of canvas to feet

# Input Map (Original/Repaired Assets)
# Will be updated dynamically or hardcoded based on new generations
INPUT_ASSETS = {
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

BRAIN_DIR = Path("/Users/kimhansoo/.gemini/antigravity/brain/21bf551c-5341-4b2e-a5aa-4b16491c9dbc/processed_precision")
OUTPUT_DIR = Path("public/assets/characters") # Direct output to game assets

def clean_halo(img: Image.Image) -> Image.Image:
    """
    Remove white/light-gray semi-transparent pixels (halos).
    """
    img = img.convert("RGBA")
    arr = np.array(img)
    
    r, g, b, a = arr.T
    
    # White/Gray detection
    # Pixels that are bright (R,G,B > 220) and low saturation are likely background noise
    white_mask = (r > 220) & (g > 220) & (b > 220)
    
    # Faint alpha detection
    faint_mask = (a < 50)
    
    # Combined mask
    kill_mask = white_mask | faint_mask
    
    arr[..., 3][kill_mask.T] = 0
    
    return Image.fromarray(arr)

def get_visible_bbox(img: Image.Image):
    bbox = img.getbbox()
    if not bbox: return None
    return bbox

def process_frame(frame: Image.Image, scale_ratio: float) -> Image.Image:
    """
    Resize by scale_ratio and Align Bottom-Center.
    """
    # 1. Resize
    fw, fh = frame.size
    new_w = int(fw * scale_ratio)
    new_h = int(fh * scale_ratio)
    
    if new_w <= 0 or new_h <= 0:
        return Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0,0,0,0))

    resized = frame.resize((new_w, new_h), Image.Resampling.NEAREST)
    
    # 2. Extract content
    bbox = resized.getbbox()
    if not bbox:
        return Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0,0,0,0))
    
    l, t, r, b = bbox
    content_w = r - l
    content_h = b - t
    content = resized.crop(bbox)
    
    # 3. Create Canvas
    canvas = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0,0,0,0))
    
    # 4. Alignment
    # Center X
    dest_x = (CANVAS_WIDTH - content_w) // 2
    
    # Bottom Y (Feet Alignment)
    # Place the bottom of the content at (CANVAS_HEIGHT - PADDING_BOTTOM)
    dest_y = CANVAS_HEIGHT - PADDING_BOTTOM - content_h
    
    # Safety Check: If dest_y is negative (character too tall), align to top (or crop top?)
    # Prefer top crop over feet crop for gameplay feel, or just let it float up?
    # If character is huge, bottom align is still best so feet stay on ground.
    
    canvas.paste(content, (dest_x, dest_y))
    return canvas

def split_grid(sheet: Image.Image, rows=4, cols=4):
    w, h = sheet.size
    cw = w // cols
    ch = h // rows
    frames = []
    for r in range(rows):
        for c in range(cols):
            x = c * cw
            y = r * ch
            frame = sheet.crop((x, y, x+cw, y+ch))
            frames.append(frame)
    return frames

def calculate_scale_ratio(frames: list[Image.Image]) -> float:
    # Find the body height of the character in Idle state
    # We typically look for the 'Down' facing idle (first few frames)
    
    ref_frame = None
    for f in frames:
        if f.getbbox():
            ref_frame = f
            break
            
    if not ref_frame: return 1.0
    
    l, t, r, b = ref_frame.getbbox()
    body_height = b - t
    
    if body_height == 0: return 1.0
    
    # If the detected body height is very small (e.g. noise), skip
    if body_height < 20: return 1.0 
    
    ratio = TARGET_BODY_HEIGHT / body_height
    return ratio

def main():
    if not OUTPUT_DIR.exists():
        OUTPUT_DIR.mkdir(parents=True)
        
    for char_name, sheets in INPUT_ASSETS.items():
        print(f"Processing {char_name}...")
        
        # 1. Determine Scale Ratio from Idle
        idle_files = [f for k, f in sheets.items() if 'idle' in k]
        scale_ratio = 1.0
        
        if idle_files:
            idle_path = BRAIN_DIR / sheets['idle']
            if idle_path.exists():
                idle_img = Image.open(idle_path)
                idle_img = clean_halo(idle_img)
                idle_frames = split_grid(idle_img)
                scale_ratio = calculate_scale_ratio(idle_frames)
                print(f"  {char_name} Base Height Ratio: {scale_ratio:.2f}")
        
        # 2. Process All Sheets
        for sheet_type, fname in sheets.items():
            fpath = BRAIN_DIR / fname
            if not fpath.exists():
                # Try checking if it's a newly generated file with a timestamp suffix roughly?
                # For now assume exact match or updated via `update_assets`
                # If 'attack' and we just generated 'warrior_attack_sheet_uncropped.png' (no timestamp yet?), 
                # we might need to find the latest file.
                
                # Fallback: Search for latest file if exact name not found
                candidates = sorted(BRAIN_DIR.glob(f"{Path(fname).stem}*"))
                if candidates:
                    fpath = candidates[-1]
                    print(f"  Found alternative for {fname}: {fpath.name}")
                else:
                    print(f"  Missing {fname}")
                    continue
            
            print(f"  Refining {sheet_type}: {fpath.name}")
            img = Image.open(fpath)
            img = clean_halo(img)
            frames = split_grid(img)
            
            refined_frames = []
            for frame in frames:
                refined = process_frame(frame, scale_ratio)
                refined_frames.append(refined)
            
            # Reassemble
            out_w = CANVAS_WIDTH * 4
            out_h = CANVAS_HEIGHT * 4
            out_sheet = Image.new("RGBA", (out_w, out_h), (0,0,0,0))
            
            for idx, rf in enumerate(refined_frames):
                r = idx // 4
                c = idx % 4
                x = c * CANVAS_WIDTH
                y = r * CANVAS_HEIGHT
                out_sheet.paste(rf, (x, y))
                
            out_name = f"refined_{char_name}_{sheet_type}.png"
            out_sheet.save(OUTPUT_DIR / out_name)
            print(f"  Saved {out_name}")

if __name__ == "__main__":
    main()
