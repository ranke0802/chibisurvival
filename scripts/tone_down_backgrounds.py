from pathlib import Path
from PIL import Image, ImageEnhance

def tone_down(img_path: Path):
    print(f"Toning down {img_path}...")
    try:
        img = Image.open(img_path).convert("RGBA")
        
        # Reduce brightness
        enhancer = ImageEnhance.Brightness(img)
        img = enhancer.enhance(0.5) # 50% darker
        
        # Reduce contrast slightly to make it softer
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(0.8)
        
        # Save overwritten
        img.save(img_path)
        print(f"Successfully toned down {img_path}")
    except Exception as e:
        print(f"Error toning down {img_path}: {e}")

def main():
    bg_dir = Path("public/assets/backgrounds")
    if not bg_dir.exists():
        return
    
    for img_file in bg_dir.glob("*.png"):
        tone_down(img_file)

if __name__ == "__main__":
    main()
