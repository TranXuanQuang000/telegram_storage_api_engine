import os
from PIL import Image

def analyze(path):
    if not os.path.exists(path):
        print(f"{path}: NOT FOUND")
        return
    img = Image.open(path)
    print(f"=== {path} ===")
    print(f"Format: {img.format}, Mode: {img.mode}, Size: {img.size} (W={img.width}, H={img.height})")
    print(f"File Size: {os.path.getsize(path)} bytes")
    if "dpi" in img.info:
        print(f"DPI: {img.info['dpi']}")
    else:
        print("DPI: Not specified in metadata")
    
    rgba = img.convert("RGBA")
    colors = rgba.getcolors(maxcolors=2000000)
    if colors:
        print(f"Unique RGBA colors: {len(colors)}")
        transparent_pixels = 0
        semi_transparent = 0
        opaque_pixels = 0
        for count, (r, g, b, a) in colors:
            if a == 0:
                transparent_pixels += count
            elif a < 255:
                semi_transparent += count
            else:
                opaque_pixels += count
        total = img.width * img.height
        print(f"Alpha stats: Transparent={transparent_pixels} ({transparent_pixels/total*100:.2f}%), Semi={semi_transparent} ({semi_transparent/total*100:.2f}%), Opaque={opaque_pixels} ({opaque_pixels/total*100:.2f}%)")
        
        # Dominant visible colors
        opaque_colors = [c for c in colors if c[1][3] > 0]
        opaque_colors.sort(key=lambda x: x[0], reverse=True)
        print("Top 10 dominant visible colors (RGBA, count):")
        for count, color in opaque_colors[:10]:
            print(f"  {color}: {count} pixels ({count/total*100:.2f}%)")
    else:
        print("Color count exceeds threshold")
    print()

if __name__ == "__main__":
    paths = [
        "public/muc-pet-pixel.png",
        "public/muc-pet-sprite.png",
        "public/muc-pet-sprite.jpg",
        "public/muc-pet.webp"
    ]
    for p in paths:
        analyze(p)
