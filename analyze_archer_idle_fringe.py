from PIL import Image
import numpy as np

path = 'public/assets/characters/archer/idle.png'
try:
    img = Image.open(path)
    print(f'Analyzing {path} for background-like pixels')
    
    arr = np.array(img)
    alpha = arr[:, :, 3]
    rgb = arr[:, :, :3]
    
    # Define "background-like" as bright, low saturation (gray/white) or dark matte
    # User mentioned "gray border".
    # Let's count pixels that are opaque but look like background
    
    # Condition: Opaque AND (White-ish OR Gray-ish)
    # White-ish: R,G,B > 240
    # Gray-ish: R,G,B > 50 AND Max(RGB) - Min(RGB) < 20 (Low saturation)
    
    opaque = alpha == 255
    r, g, b = rgb[:,:,0], rgb[:,:,1], rgb[:,:,2]
    
    # White/Bright Gray check
    bright = (r > 200) & (g > 200) & (b > 200)
    
    # Low saturation check (gray)
    sat = np.max(rgb, axis=2) - np.min(rgb, axis=2)
    low_sat = sat < 30
    
    # Potential background pixels
    bg_like = opaque & bright & low_sat
    
    bg_count = np.count_nonzero(bg_like)
    total_opaque = np.count_nonzero(opaque)
    
    print(f"Total opaque pixels: {total_opaque}")
    print(f"Potential background (fringe) pixels: {bg_count} ({bg_count/total_opaque*100:.2f}% of opaque)")
    
    if bg_count > 0:
        # Check where these pixels are (edges?)
        # Get coordinates
        y_idxs, x_idxs = np.nonzero(bg_like)
        print(f"Bounds of BG-like pixels: X[{np.min(x_idxs)}, {np.max(x_idxs)}], Y[{np.min(y_idxs)}, {np.max(y_idxs)}]")
        
        # Check if they are at the edges of the content
        print("Sampling some BG-like pixel locations:")
        for i in range(0, len(x_idxs), max(1, len(x_idxs)//10)):
            print(f"  ({x_idxs[i]}, {y_idxs[i]}) - RGB: {arr[y_idxs[i], x_idxs[i]]}")

except Exception as e:
    print(f"Error: {e}")
