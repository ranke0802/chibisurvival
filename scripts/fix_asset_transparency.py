from __future__ import annotations
from pathlib import Path
from PIL import Image
import os

from collections import deque


def is_bg_like(px) -> bool:
    r, g, b, a = px if len(px) == 4 else (*px, 255)
    
    # Fully transparent is bg
    if a == 0:
        return True
        
    # Check for white-ish / grey-ish (typical background)
    if r > 200 and g > 200 and b > 200:
        spread = max(r, g, b) - min(r, g, b)
        return spread < 30
        
    # Check for specific "checkerboard" grey often found in AI gen transparency representation
    # Usually around (204, 204, 204) or similar greys
    if r > 150 and g > 150 and b > 150:
         spread = max(r, g, b) - min(r, g, b)
         if spread < 10: # Very neutral grey
             return True

    return False

def remove_background(img: Image.Image) -> Image.Image:
    img = img.convert('RGBA')
    width, height = img.size
    pixels = img.load()
    
    # 1. Flood fill from edges to remove contiguous background
    visited = set()
    queue = deque()

    # Start from borders
    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))
    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))

    while queue:
        x, y = queue.popleft()
        if (x, y) in visited:
            continue
        
        if x < 0 or x >= width or y < 0 or y >= height:
            continue
            
        visited.add((x, y))
        
        r, g, b, a = pixels[x, y]
        # Check if it's background-like
        if a == 0 or is_bg_like((r, g, b, a)):
            pixels[x, y] = (0, 0, 0, 0)
            
            # Add neighbors
            queue.append((x + 1, y))
            queue.append((x - 1, y))
            queue.append((x, y + 1))
            queue.append((x, y - 1))

    return img

def remove_small_islands(img: Image.Image, threshold: int = 30) -> Image.Image:
    """
    Removes isolated groups of non-transparent pixels smaller than threshold.
    """
    width, height = img.size
    pixels = img.load()
    visited = set()
    
    for y in range(height):
        for x in range(width):
            if (x, y) in visited:
                continue
            
            r, g, b, a = pixels[x, y]
            if a == 0:
                visited.add((x, y))
                continue
            
            # Start BFS for this component
            component = []
            queue = deque([(x, y)])
            visited.add((x, y))
            component.append((x, y))
            
            idx = 0
            while idx < len(component):
                cx, cy = component[idx]
                idx += 1
                
                for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < width and 0 <= ny < height:
                        if (nx, ny) not in visited:
                            nr, ng, nb, na = pixels[nx, ny]
                            if na > 0: # Non-transparent
                                visited.add((nx, ny))
                                component.append((nx, ny))
                                queue.append((nx, ny))

            # If component is small, remove it (make transparent)
            if len(component) < threshold:
                for cx, cy in component:
                    pixels[cx, cy] = (0, 0, 0, 0)
                    
    return img

def fix_transparency(img_path: Path):
    print(f"Fixing transparency for {img_path}...")
    try:
        img = Image.open(img_path)
        img = remove_background(img)
        img = remove_small_islands(img, threshold=100) # Remove small floating noise
        
        img.save(img_path.with_suffix('.png'), "PNG")
        print(f"Successfully fixed {img_path}")
    except Exception as e:
        print(f"Error fixing {img_path}: {e}")

def main():
    asset_dirs = [
        Path("public/assets/monsters"),
        Path("public/assets/bosses"),
        Path("public/assets/characters"),
    ]
    
    for directory in asset_dirs:
        if not directory.exists():
            continue
        for ext in ["*.png", "*.jpg", "*.jpeg"]:
            for img_file in directory.glob(ext):
                # Skip reference and sheets for now to avoid accidental damage
                # Skip only reference jpg and specific files if needed
                if img_file.name in ["chibi.jpg", "chibi_sheet.png"]:
                    continue
                fix_transparency(img_file)

if __name__ == "__main__":
    main()
