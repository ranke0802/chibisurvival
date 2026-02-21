from PIL import Image
import numpy as np

path = 'public/assets/characters/archer/attack.png'
try:
    img = Image.open(path)
    print(f'Analyzing {path} ({img.size})')
    
    arr = np.array(img)
    alpha = arr[:, :, 3]
    h, w = alpha.shape
    rows, cols = 4, 4
    fw, fh = w // cols, h // rows
    
    print(f"Frame Size: {fw}x{fh}")
    
    # Analyze transparency fringe
    # count pixels with 0 < alpha < 255
    semi_transparent = np.count_nonzero((alpha > 0) & (alpha < 255))
    total_pixels = w * h
    print(f"Semi-transparent pixels: {semi_transparent} ({semi_transparent/total_pixels*100:.2f}%)")
    
    # Analyze bounding box per frame
    print("\nPer-Frame Bounding Box (Content Area):")
    for r in range(rows):
        for c in range(cols):
            y_start, y_end = r * fh, (r + 1) * fh
            x_start, x_end = c * fw, (c + 1) * fw
            
            frame_alpha = alpha[y_start:y_end, x_start:x_end]
            non_zero_indices = np.nonzero(frame_alpha)
            
            if len(non_zero_indices[0]) == 0:
                print(f"Frame ({r},{c}): EMPTY")
                continue
                
            min_y, max_y = np.min(non_zero_indices[0]), np.max(non_zero_indices[0])
            min_x, max_x = np.min(non_zero_indices[1]), np.max(non_zero_indices[1])
            
            content_w = max_x - min_x + 1
            content_h = max_y - min_y + 1
            
            # Center of content relative to frame center
            center_x = min_x + content_w / 2
            center_y = min_y + content_h / 2
            offset_x = center_x - (fw / 2)
            offset_y = center_y - (fh / 2)
            
            print(f"Frame ({r},{c}): Content {content_w}x{content_h} at ({min_x},{min_y}) - Center Offset: ({offset_x:.1f}, {offset_y:.1f})")

except Exception as e:
    print(f"Error: {e}")
