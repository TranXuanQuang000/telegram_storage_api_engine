import os
from PIL import Image

def analyze_jpg():
    path = "public/muc-pet-sprite.jpg"
    if not os.path.exists(path):
        return
    img = Image.open(path)
    print(f"JPEG Size: {img.size}")
    
    # Check top-left corner pixels to see checkerboard pattern
    pixels = img.load()
    print("Sample top-left corner pixels (5x5):")
    for y in range(5):
        row = [pixels[x, y] for x in range(5)]
        print(f"Row {y}: {row}")

if __name__ == "__main__":
    analyze_jpg()
