import os
import cv2
import numpy as np
from PIL import Image, ImageDraw

def remove_background_cv2(image_input):
    if isinstance(image_input, str):
        img_bgr = cv2.imread(image_input, cv2.IMREAD_UNCHANGED)
        if img_bgr is None:
            raise FileNotFoundError(f"Could not load image at {image_input}")
    elif isinstance(image_input, Image.Image):
        arr = np.array(image_input)
        if arr.shape[2] == 4:
            img_bgr = cv2.cvtColor(arr, cv2.COLOR_RGBA2BGRA)
        else:
            img_bgr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
    else:
        img_bgr = image_input

    if img_bgr.shape[2] == 4:
        b, g, r, a = cv2.split(img_bgr)
    else:
        b, g, r = cv2.split(img_bgr)
        a = np.ones(b.shape, dtype=np.uint8) * 255

    hsv = cv2.cvtColor(cv2.merge([b, g, r]), cv2.COLOR_BGR2HSV)
    lower_grey = np.array([0, 0, 140])
    upper_grey = np.array([180, 45, 245])
    bg_mask = cv2.inRange(hsv, lower_grey, upper_grey)

    a[bg_mask > 0] = 0
    rgba = cv2.merge([r, g, b, a])
    return Image.fromarray(rgba, mode="RGBA")

def create_individual_state_sprites():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    public_dir = os.path.join(script_dir, "public")
    src_path = os.path.join(public_dir, "muc-pet-pixel.png")

    if not os.path.exists(src_path):
        raise FileNotFoundError(f"Source frame not found at {src_path}")

    raw_img = Image.open(src_path).convert("RGBA")
    np_alpha = np.array(raw_img.split()[-1])
    img = remove_background_cv2(raw_img) if np.count_nonzero(np_alpha == 0) == 0 else raw_img

    w, h = 104, 87 # Exact half scale: 104x87 per cell
    cols = 6

    def generate_row_strip(row_type):
        strip = Image.new("RGBA", (w * cols, h), (0, 0, 0, 0))
        
        for c in range(cols):
            scale_x, scale_y, offset_y, rotate = 1.0, 1.0, 0, 0
            draw_hearts, draw_sparkles, eye_blink = False, False, False

            if row_type == "idle":
                idle_y = [1, 0, -1, -1, 0, 1]
                offset_y = idle_y[c]
                eye_blink = (c == 2)
            elif row_type == "moving":
                run_y = [1, -1, 0, -2, 0, -1]
                run_rot = [-2, -4, -2, 3, 1, -2]
                offset_y = run_y[c]
                rotate = run_rot[c]
            elif row_type == "petting":
                pet_y = [2, 1, 0, 1, 2, 2]
                offset_y = pet_y[c]
                draw_hearts = True
                draw_sparkles = (c % 2 == 1)
            elif row_type == "dragging":
                drag_rot = [-4, -2, 1, 4, 2, -2]
                rotate = drag_rot[c]

            nw, nh = max(1, int(w * scale_x)), max(1, int(h * scale_y))
            frame = img.resize((nw, nh), resample=Image.Resampling.NEAREST)

            if eye_blink:
                frame_arr = np.array(frame)
                r, g, b, a = frame_arr[:, :, 0], frame_arr[:, :, 1], frame_arr[:, :, 2], frame_arr[:, :, 3]
                y_min, y_max = int(22 * scale_y), int(38 * scale_y)
                x_min, x_max = int(42 * scale_x), int(62 * scale_x)
                Y, X = np.ogrid[:nh, :nw]
                in_eye_box = (Y >= y_min) & (Y <= y_max) & (X >= x_min) & (X <= x_max)
                black_all = (r < 20) & (g < 20) & (b < 20) & (a > 200)
                eye_pixels = black_all & in_eye_box
                y_idx, x_idx = np.where(eye_pixels)
                if len(y_idx) > 0:
                    mid_y = int(np.mean(y_idx))
                    keep = np.abs(y_idx - mid_y) <= 4
                    frame_arr[y_idx[~keep], x_idx[~keep], 3] = 0
                frame = Image.fromarray(frame_arr, mode="RGBA")

            if rotate != 0:
                frame = frame.rotate(rotate, resample=Image.Resampling.NEAREST, expand=False, fillcolor=(0, 0, 0, 0))

            canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
            px = (w - nw) // 2
            py = (h - nh) // 2 + offset_y
            canvas.paste(frame, (px, py), frame)

            if draw_hearts:
                draw = ImageDraw.Draw(canvas)
                heart_color = (255, 79, 135, 255)
                if c % 2 == 0:
                    draw.rectangle([18, 18, 22, 22], fill=heart_color)
                    draw.rectangle([82, 24, 88, 28], fill=heart_color)
                else:
                    draw.rectangle([24, 14, 30, 18], fill=heart_color)
                    draw.rectangle([76, 20, 82, 24], fill=heart_color)

            strip.paste(canvas, (c * w, 0), canvas)

        out_file = os.path.join(public_dir, f"muc-pet-{row_type}.png")
        strip.save(out_file, "PNG")
        print(f"Generated state sprite: {out_file} ({strip.size[0]}x{strip.size[1]})")

    for state in ["idle", "moving", "petting", "dragging"]:
        generate_row_strip(state)

    # Also generate combined sprite sheet for fallback
    combined = Image.new("RGBA", (w * cols, h * 4), (0, 0, 0, 0))
    for idx, state in enumerate(["idle", "moving", "petting", "dragging"]):
        strip_img = Image.open(os.path.join(public_dir, f"muc-pet-{state}.png"))
        combined.paste(strip_img, (0, idx * h), strip_img)
    combined.save(os.path.join(public_dir, "muc-pet-sprite.png"), "PNG")
    print(f"Generated combined sprite sheet: {os.path.join(public_dir, 'muc-pet-sprite.png')}")

if __name__ == "__main__":
    create_individual_state_sprites()
