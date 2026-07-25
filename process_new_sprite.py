import os
import cv2
import numpy as np
from PIL import Image

def process_sprite_sheet():
    gen_path = r"C:\Users\TrieuHa\.gemini\antigravity\brain\3c9fb07c-7504-4840-99e3-22608476f2bd\muc_pet_new_spritesheet_1784828363257.jpg"
    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.join(script_dir, "public", "muc-pet-sprite.png")

    if not os.path.exists(gen_path):
        print(f"Error: Generated image not found at {gen_path}")
        return

    # Load image
    img_bgr = cv2.imread(gen_path)
    if img_bgr is None:
        print("Error: Could not load BGR image")
        return

    # Convert to HSV to key out white/light background
    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    lower_white = np.array([0, 0, 200])
    upper_white = np.array([180, 55, 255])
    bg_mask = cv2.inRange(hsv, lower_white, upper_white)

    # Create RGBA image with transparent background
    b, g, r = cv2.split(img_bgr)
    a = np.ones(b.shape, dtype=np.uint8) * 255
    a[bg_mask > 0] = 0

    rgba = cv2.merge([r, g, b, a])
    pil_img = Image.fromarray(rgba, mode="RGBA")

    # Resize cleanly to match the web app's sprite grid: 1248 x 696 (208x174 per frame)
    target_width = 1248
    target_height = 696
    
    final_sprite = pil_img.resize((target_width, target_height), resample=Image.Resampling.LANCZOS)
    
    # Save transparent PNG to public directory
    final_sprite.save(out_path, format="PNG")
    print(f"Successfully processed and saved new pet sprite sheet to {out_path}")

if __name__ == "__main__":
    process_sprite_sheet()
