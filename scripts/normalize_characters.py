import os
import sys
from pathlib import Path
from PIL import Image, ImageFilter
import numpy as np

# Configuration
TARGET_BODY_HEIGHT = 100
CANVAS_WIDTH = 200
CANVAS_HEIGHT = 320
PADDING_BOTTOM = 40

# Input Map (Original Assets that are currently live but problematic)
INPUT_ASSETS = {
    'warrior': {
        'idle': 'warrior_idle_sheet_1771181604006.png',
        'walk': 'warrior_walk_sheet_1771181647599.png',
        'attack': 'warrior_attack_sheet_v2_1771181723042.png',
    },
    'archer': {
        'idle': 'archer_idle_sheet_1771181754968.png',
        'walk': 'archer_walk_sheet_1771181782897.png',
        'attack': 'archer_attack_sheet_1771181824339.png',
    },
    'mage': {
        'idle': 'mage_idle_sheet_1771181854715.png',
        'walk': 'mage_walk_sheet_1771181888222.png',
        'attack': 'mage_attack_sheet_1771181928022.png',
    },
}

BRAIN_DIR = Path("/Users/kimhansoo/.gemini/antigravity/brain/21bf551c-5341-4b2e-a5aa-4b16491c9dbc")
OUTPUT_DIR = BRAIN_DIR / "processed_normalized"

def clean_halo(img: Image.Image) -> Image.Image:
    """
    Remove white/light-gray semi-transparent pixels (halos).
    """
    img = img.convert("RGBA")
    arr = np.array(img)
    
    r, g, b, a = arr.T
    
    # Calculate brightness and saturation to identify white/grayish pixels
    brightness = np.maximum(r, np.maximum(g, b))
    cmin = np.minimum(r, np.minimum(g, b))
    saturation = np.zeros_like(brightness, dtype=float)
    max_val = brightness.astype(float)
    delta = max_val - cmin.astype(float)
    non_zero = max_val > 0
    saturation[non_zero] = delta[non_zero] / max_val[non_zero]
    
    # Condition: High brightness AND Low saturation (White/Gray)
    # AND pixels that are not fully opaque (often antialiasing artifacts)
    # or just very light pixels that shouldn't be there in a pixel art outline
    
    # Aggressive cleaning for pixel art:
    # If it's near white and low alpha, kill it.
    white_mask = (r > 200) & (g > 200) & (b > 200)
    
    # Kill faint pixels
    faint_mask = (a < 100)
    
    # Combine
    kill_mask = white_mask
    
    # Apply
    arr[..., 3][kill_mask.T] = 0
    arr[..., 3][faint_mask.T] = 0
    
    return Image.fromarray(arr)

def get_bbox(img: Image.Image):
    return img.getbbox()

def process_frame(frame: Image.Image, scale_ratio: float) -> Image.Image:
    """
    Resize frame by scale_ratio and place it on a standardized canvas.
    """
    # 1. Resize
    fw, fh = frame.size
    new_w = int(fw * scale_ratio)
    new_h = int(fh * scale_ratio)
    
    # Use Nearest Neighbor to keep pixel art crisp
    resized = frame.resize((new_w, new_h), Image.Resampling.NEAREST)
    
    # 2. Extract content bbox of the resized character
    bbox = resized.getbbox()
    if not bbox:
        # Empty frame
        return Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0,0,0,0))
    
    l, t, r, b = bbox
    content_w = r - l
    content_h = b - t
    content = resized.crop(bbox)
    
    # 3. Create Canvas
    canvas = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0,0,0,0))
    
    # 4. Alignment
    # Center X:
    dest_x = (CANVAS_WIDTH - content_w) // 2
    
    # Bottom Y:
    # We want the bottom of the content to be PADDING_BOTTOM pixels from the bottom of canvas
    dest_y = CANVAS_HEIGHT - PADDING_BOTTOM - content_h
    
    canvas.paste(content, (dest_x, dest_y))
    return canvas

def split_grid(sheet: Image.Image, rows=4, cols=4):
    """
    Split a standardized 4x4 sheet into individual frames.
    Assumes the input sheet is roughly grid-aligned or we just split evenly.
    """
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
    """
    Determine scale ratio based on the average height of the character in Idle frames.
    We'll pick the first frame (Down Idle) usually.
    """
    # Pick the first non-empty frame
    ref_frame = None
    for f in frames:
        if f.getbbox():
            ref_frame = f
            break
    
    if not ref_frame:
        return 1.0
        
    l, t, r, b = ref_frame.getbbox()
    body_height = b - t
    
    if body_height == 0: return 1.0
    
    ratio = TARGET_BODY_HEIGHT / body_height
    # Clamp ratio reasonably (e.g. don't zoom 10x)
    return ratio

def main():
    if not OUTPUT_DIR.exists():
        OUTPUT_DIR.mkdir(parents=True)
        
    for char_name, sheets in INPUT_ASSETS.items():
        print(f"Processing {char_name}...")
        
        # 1. Load Idle sheet to calculate Scale Ratio
        idle_path = BRAIN_DIR / sheets['idle']
        if not idle_path.exists():
            print(f"  Missing idle sheet: {idle_path}")
            continue
            
        idle_img = Image.open(idle_path)
        idle_img = clean_halo(idle_img)
        idle_frames = split_grid(idle_img)
        
        # Calculate Scale Ratio from Idle (to apply to all)
        scale_ratio = calculate_scale_ratio(idle_frames)
        print(f"  Scale Ratio for {char_name}: {scale_ratio:.2f}")
        
        # 2. Process all sheets with this ratio
        for sheet_type, fname in sheets.items():
            fpath = BRAIN_DIR / fname
            if not fpath.exists(): continue
            
            print(f"  Normalizing {sheet_type}...")
            img = Image.open(fpath)
            img = clean_halo(img)
            frames = split_grid(img)
            
            normalized_frames = []
            for frame in frames:
                # For Attack frames, sometimes the sprite is bigger due to FX.
                # But we want the CHARACTER to match. 
                # Since we calculated ratio based on Idle Body Height, 
                # applying same ratio *should* keep character size consistent 
                # assuming the source pixel density is consistent (which it is for AI Gen typically).
                
                norm_frame = process_frame(frame, scale_ratio)
                normalized_frames.append(norm_frame)
            
            # 3. Reassemble Sheet
            # The output should be 4x4 grid of 200x320 frames
            # Total Size: 800 x 1280
            out_w = CANVAS_WIDTH * 4
            out_h = CANVAS_HEIGHT * 4
            out_sheet = Image.new("RGBA", (out_w, out_h), (0,0,0,0))
            
            for idx, nf in enumerate(normalized_frames):
                r = idx // 4
                c = idx % 4
                x = c * CANVAS_WIDTH
                y = r * CANVAS_HEIGHT
                out_sheet.paste(nf, (x, y))
            
            out_name = f"normalized_{fname}"
            out_sheet.save(OUTPUT_DIR / out_name)
            print(f"  Saved {out_name}")

if __name__ == "__main__":
    main()
