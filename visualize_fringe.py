from PIL import Image
import numpy as np

path = 'public/assets/characters/archer/idle.png'
try:
    img = Image.open(path)
    print(f'Visualizing fringe for {path}')
    
    arr = np.array(img).astype(int) # Use int to avoid overflow
    h, w, _ = arr.shape
    
    # Create a visualization image (Red = Masked by current logic, Blue = Masked by proposed logic)
    vis = np.zeros((h, w, 3), dtype=np.uint8)
    
    alpha = arr[:, :, 3]
    rgb = arr[:, :, :3]
    r, g, b = rgb[:,:,0], rgb[:,:,1], rgb[:,:,2]
    
    mx = np.max(rgb, axis=2)
    mn = np.min(rgb, axis=2)
    sat = mx - mn
    
    # Current Logic (approximate) in renderer.ts
    # sat <= 24 && mx >= 58 && mx <= 218
    # AND alpha > 28
    current_mask = (alpha > 28) & (sat <= 24) & (mx >= 58) & (mx <= 218)
    
    # Proposed Logic (Wider)
    # The user complained about "white and gray", so we need to catch brighter pixels too.
    # Pixels found in previous analysis: [225 224 220] -> Max 225.
    # Let's try bumping max to 240 or even higher if saturation is very low.
    
    proposed_mask = (alpha > 28) & (sat <= 30) & (mx >= 50) & (mx <= 245)
    
    # Mark pixels
    # Gray = Original Image content
    # Red = Caught by Current Logic
    # Green = Caught ONLY by Proposed Logic (Missed by current)
    
    # Copy original grayscale version for context
    gray = np.mean(rgb, axis=2).astype(np.uint8)
    vis[:,:,0] = gray // 2
    vis[:,:,1] = gray // 2
    vis[:,:,2] = gray // 2
    
    # Apply masks
    vis[current_mask] = [255, 0, 0] # Red for current
    
    missed_mask = proposed_mask & (~current_mask)
    vis[missed_mask] = [0, 255, 0] # Green for new matches
    
    # Save visualization
    out_path = 'fringe_debug.png'
    Image.fromarray(vis).save(out_path)
    print(f"Saved debug visualization to {out_path}")
    print(f"Pixels caught by current logic: {np.count_nonzero(current_mask)}")
    print(f"Pixels caught ONLY by proposed: {np.count_nonzero(missed_mask)}")
    
    if np.count_nonzero(missed_mask) > 0:
        print("Sample missed pixels (RGB):")
        y_idxs, x_idxs = np.nonzero(missed_mask)
        for i in range(0, len(x_idxs), max(1, len(x_idxs)//5)):
             y, x = y_idxs[i], x_idxs[i]
             print(f"  ({x}, {y}) - RGB: {arr[y,x,:3]} (Mx: {mx[y,x]}, Sat: {sat[y,x]})")

except Exception as e:
    print(f"Error: {e}")
