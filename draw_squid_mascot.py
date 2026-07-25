import os
import math
from PIL import Image, ImageDraw

def draw_pixel_squid_frame(width, height, action, frame_idx, total_frames=6):
    """
    Draws an authentic, cute Pixel Art Squid character ("Con Mực") with distinct tentacles
    for each animation frame.
    - width: 104
    - height: 87
    - action: 'idle' | 'moving' | 'petting' | 'dragging'
    """
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Color Palette for Mực (Cute Cyan/Teal Neon Squid Mascot)
    BODY_MAIN = (0, 229, 255, 255)       # Bright Neon Cyan
    BODY_DARK = (0, 160, 200, 255)       # Shadow Cyan
    BODY_LIGHT = (160, 245, 255, 255)    # Highlight
    EYE_BLACK = (10, 15, 30, 255)        # Dark Eye
    EYE_SPARKLE = (255, 255, 255, 255)   # Eye Specular
    BLUSH_COLOR = (255, 100, 160, 220)   # Blushing Cheeks
    TENTACLE_COLOR = (0, 210, 240, 255)  # Tentacles
    TENTACLE_TIP = (100, 240, 255, 255)  # Tentacle Tips

    # Center coordinates
    cx = width // 2
    cy = height // 2 - 6

    # Action-specific animation offset calculations
    head_y_offset = 0
    t_wave_phase = (frame_idx / total_frames) * math.pi * 2

    if action == "idle":
        head_y_offset = int(math.sin(t_wave_phase) * 2)
    elif action == "moving":
        head_y_offset = int(math.sin(t_wave_phase * 2) * 3)
    elif action == "petting":
        head_y_offset = int(abs(math.sin(t_wave_phase * 2)) * -5)
    elif action == "dragging":
        head_y_offset = -4

    body_top = cy - 22 + head_y_offset
    body_bottom = cy + 10 + head_y_offset

    # 1. Draw Squid Hood / Dome Head (Cute rounded dome shape)
    # Head Dome Top
    draw.ellipse([cx - 24, body_top, cx + 24, body_bottom + 4], fill=BODY_MAIN)
    # Head Top Crown / Fin
    draw.polygon([(cx, body_top - 8), (cx - 16, body_top + 6), (cx + 16, body_top + 6)], fill=BODY_MAIN)
    draw.polygon([(cx, body_top - 6), (cx - 10, body_top + 4), (cx + 10, body_top + 4)], fill=BODY_LIGHT)

    # Shadow & Highlights on Head
    draw.ellipse([cx - 20, body_top + 2, cx + 18, body_top + 18], fill=BODY_LIGHT)

    # 2. Draw Eyes & Face Expressions
    eye_y = body_top + 18
    left_eye_x = cx - 12
    right_eye_x = cx + 12

    if action == "idle" and frame_idx == 2:
        # Blinking Eyes (Horizontal Lines)
        draw.line([left_eye_x - 4, eye_y, left_eye_x + 4, eye_y], fill=EYE_BLACK, width=2)
        draw.line([right_eye_x - 4, eye_y, right_eye_x + 4, eye_y], fill=EYE_BLACK, width=2)
    elif action == "petting":
        # Joyful Arc Eyes ( Happy ^ ^ Eyes )
        draw.arc([left_eye_x - 5, eye_y - 4, left_eye_x + 5, eye_y + 4], start=180, end=360, fill=EYE_BLACK, width=3)
        draw.arc([right_eye_x - 5, eye_y - 4, right_eye_x + 5, eye_y + 4], start=180, end=360, fill=EYE_BLACK, width=3)
        # Cute Blushing Cheeks
        draw.ellipse([left_eye_x - 8, eye_y + 4, left_eye_x - 2, eye_y + 9], fill=BLUSH_COLOR)
        draw.ellipse([right_eye_x + 2, eye_y + 4, right_eye_x + 8, eye_y + 9], fill=BLUSH_COLOR)
    else:
        # Big Cute Anime Eyes
        draw.ellipse([left_eye_x - 5, eye_y - 5, left_eye_x + 5, eye_y + 5], fill=EYE_BLACK)
        draw.ellipse([right_eye_x - 5, eye_y - 5, right_eye_x + 5, eye_y + 5], fill=EYE_BLACK)
        # Specular Sparkles
        draw.ellipse([left_eye_x - 3, eye_y - 3, left_eye_x + 1, eye_y + 1], fill=EYE_SPARKLE)
        draw.ellipse([right_eye_x - 3, eye_y - 3, right_eye_x + 1, eye_y + 1], fill=EYE_SPARKLE)

    # Cute Mouth
    if action == "petting":
        draw.arc([cx - 4, eye_y + 3, cx + 4, eye_y + 9], start=0, end=180, fill=EYE_BLACK, width=2)
    else:
        draw.ellipse([cx - 2, eye_y + 5, cx + 2, eye_y + 8], fill=EYE_BLACK)

    # 3. Draw Wiggling Tentacles (Xúc tu chuyển động thực sự!)
    tentacle_base_y = body_bottom - 2
    num_tentacles = 6
    tentacle_spacing = 38 / (num_tentacles - 1)

    for i in range(num_tentacles):
        tx = int(cx - 19 + i * tentacle_spacing)
        
        # Calculate distinct wiggling curves for each tentacle per frame
        if action == "moving":
            # Running tentacles: Leg stepping motion
            phase_shift = (i * 0.8) + t_wave_phase
            tip_x = tx + int(math.sin(phase_shift) * 12)
            tip_y = tentacle_base_y + 16 + int(math.cos(phase_shift) * 6)
            mid_x = tx + int(math.sin(phase_shift) * 6)
        elif action == "petting":
            # Waving happy tentacles upwards/outwards
            phase_shift = (i * 0.5) + t_wave_phase
            tip_x = tx + int(math.sin(phase_shift) * 10) + (i - 2.5) * 4
            tip_y = tentacle_base_y + 14 - int(abs(math.sin(phase_shift)) * 8)
            mid_x = tx + int(math.sin(phase_shift) * 5)
        elif action == "dragging":
            # Dangling tentacles swaying in the wind
            phase_shift = (i * 0.4) + t_wave_phase
            tip_x = tx + int(math.sin(phase_shift * 1.5) * 14) + (i - 2.5) * 3
            tip_y = tentacle_base_y + 24
            mid_x = tx + int(math.sin(phase_shift * 1.5) * 7)
        else: # Idle
            # Gentle swaying tentacles
            phase_shift = (i * 0.6) + t_wave_phase
            tip_x = tx + int(math.sin(phase_shift) * 6)
            tip_y = tentacle_base_y + 16 + int(math.cos(phase_shift) * 2)
            mid_x = tx + int(math.sin(phase_shift) * 3)

        mid_y = tentacle_base_y + (tip_y - tentacle_base_y) // 2

        # Draw curved tentacle line with thickness
        draw.line([(tx, tentacle_base_y), (mid_x, mid_y), (tip_x, tip_y)], fill=TENTACLE_COLOR, width=4)
        draw.ellipse([tip_x - 3, tip_y - 3, tip_x + 3, tip_y + 3], fill=TENTACLE_TIP)

    return img

def generate_all_squid_assets():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    public_dir = os.path.join(script_dir, "public")
    width, height = 104, 87
    cols = 6

    actions = ["idle", "moving", "petting", "dragging"]

    for action in actions:
        strip = Image.new("RGBA", (width * cols, height), (0, 0, 0, 0))
        for c in range(cols):
            frame = draw_pixel_squid_frame(width, height, action, c, cols)
            strip.paste(frame, (c * width, 0), frame)

        out_path = os.path.join(public_dir, f"muc-pet-{action}.png")
        strip.save(out_path, "PNG")
        print(f"Generated squid animation strip: {out_path} ({strip.size[0]}x{strip.size[1]})")

    # Combined master sprite sheet
    combined = Image.new("RGBA", (width * cols, height * 4), (0, 0, 0, 0))
    for idx, action in enumerate(actions):
        strip_img = Image.open(os.path.join(public_dir, f"muc-pet-{action}.png"))
        combined.paste(strip_img, (0, idx * height), strip_img)
    
    combined_path = os.path.join(public_dir, "muc-pet-sprite.png")
    combined.save(combined_path, "PNG")
    print(f"Generated combined master sprite: {combined_path}")

if __name__ == "__main__":
    generate_all_squid_assets()
