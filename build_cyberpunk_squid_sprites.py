import os
import cv2
import math
import numpy as np
from PIL import Image, ImageDraw

def process_and_build_cyberpunk_squid():
    user_img_path = r"C:\Users\TrieuHa\.gemini\antigravity\brain\3c9fb07c-7504-4840-99e3-22608476f2bd\.user_uploaded\media__1784830021797.png"
    script_dir = os.path.dirname(os.path.abspath(__file__))
    public_dir = os.path.join(script_dir, "public")

    if not os.path.exists(user_img_path):
        print(f"Error: User image not found at {user_img_path}")
        return

    # 1. Load image and remove white background cleanly
    raw_img = Image.open(user_img_path).convert("RGBA")
    arr = np.array(raw_img)
    
    # White background keying
    r, g, b, a = arr[:,:,0], arr[:,:,1], arr[:,:,2], arr[:,:,3]
    white_bg = (r > 235) & (g > 235) & (b > 235)
    arr[white_bg, 3] = 0

    transparent_squid = Image.fromarray(arr, mode="RGBA")

    # Bounding box crop
    bbox = transparent_squid.getbbox()
    if bbox:
        transparent_squid = transparent_squid.crop(bbox)

    # Resize base image cleanly to 104x87 (1-to-1 matching pet dimensions)
    target_w, target_h = 104, 87
    base_squid = transparent_squid.resize((target_w, target_h), resample=Image.Resampling.LANCZOS)
    
    # Save base clean PNG
    base_squid.save(os.path.join(public_dir, "muc-pet-pixel.png"), "PNG")
    print("Saved public/muc-pet-pixel.png")

    cols = 6
    actions = ["idle", "moving", "petting", "dragging"]

    for action in actions:
        strip = Image.new("RGBA", (target_w * cols, target_h), (0, 0, 0, 0))
        
        for c in range(cols):
            t = (c / cols) * math.pi * 2
            scale_x, scale_y = 1.0, 1.0
            offset_y, rotate = 0, 0

            if action == "idle":
                offset_y = int(math.sin(t) * 2)
                scale_x = 1.0 + math.sin(t) * 0.02
                scale_y = 1.0 - math.sin(t) * 0.02
            elif action == "moving":
                # Smooth Swimming / Crawling motion
                offset_y = int(math.sin(t * 2) * 3)
                rotate = int(math.sin(t) * 5)
                scale_x = 1.0 + math.cos(t * 2) * 0.04
                scale_y = 1.0 - math.cos(t * 2) * 0.04
            elif action == "petting":
                # Happy Bouncing
                offset_y = int(abs(math.sin(t * 2)) * -6)
                scale_x = 1.0 + math.sin(t * 2) * 0.05
                scale_y = 1.0 - math.sin(t * 2) * 0.05
            elif action == "dragging":
                # Swaying Dangling
                rotate = int(math.sin(t) * 6)
                scale_y = 1.05

            nw, nh = max(1, int(target_w * scale_x)), max(1, int(target_h * scale_y))
            frame = base_squid.resize((nw, nh), resample=Image.Resampling.LANCZOS)

            if rotate != 0:
                frame = frame.rotate(rotate, resample=Image.Resampling.BICUBIC, expand=False, fillcolor=(0, 0, 0, 0))

            canvas = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
            px = (target_w - nw) // 2
            py = (target_h - nh) // 2 + offset_y
            canvas.paste(frame, (px, py), frame)

            # Sparkle effects on petting
            if action == "petting" and c % 2 == 1:
                draw = ImageDraw.Draw(canvas)
                cyan_glow = (0, 229, 255, 255)
                pink_glow = (224, 0, 255, 255)
                draw.rectangle([14, 14, 18, 18], fill=cyan_glow)
                draw.rectangle([84, 16, 88, 20], fill=pink_glow)

            strip.paste(canvas, (c * target_w, 0), canvas)

        out_path = os.path.join(public_dir, f"muc-pet-{action}.png")
        strip.save(out_path, "PNG")
        print(f"Generated cyberpunk state strip: {out_path}")

    # Combined master sheet
    combined = Image.new("RGBA", (target_w * cols, target_h * 4), (0, 0, 0, 0))
    for idx, action in enumerate(actions):
        strip_img = Image.open(os.path.join(public_dir, f"muc-pet-{action}.png"))
        combined.paste(strip_img, (0, idx * target_h), strip_img)
    combined.save(os.path.join(public_dir, "muc-pet-sprite.png"), "PNG")
    print("Generated public/muc-pet-sprite.png")

if __name__ == "__main__":
    process_and_build_cyberpunk_squid()
