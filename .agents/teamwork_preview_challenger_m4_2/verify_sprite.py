import os
import json
import math
from PIL import Image
import numpy as np

SPRITE_PATH = "public/muc-pet-sprite.png"
OUTPUT_JSON = ".agents/teamwork_preview_challenger_m4_2/sprite_analysis_results.json"

ROW_NAMES = ["Idle", "Running", "Petting", "Dragging"]

def analyze_sprite():
    if not os.path.exists(SPRITE_PATH):
        print(f"ERROR: File not found at {SPRITE_PATH}")
        return

    img = Image.open(SPRITE_PATH)
    width, height = img.size
    mode = img.mode

    print(f"=== SPRITE SHEET GLOBAL INFO ===")
    print(f"File: {SPRITE_PATH}")
    print(f"Format: {img.format}, Mode: {mode}")
    print(f"Dimensions: {width} x {height} px")

    expected_w, expected_h = 1248, 696
    expected_cols, expected_rows = 6, 4
    expected_cell_w, expected_cell_h = 208, 174

    dim_pass = (width == expected_w and height == expected_h)
    print(f"Dimension check ({expected_w}x{expected_h}): {'PASS' if dim_pass else 'FAIL'}")

    mode_pass = (mode == "RGBA")
    print(f"Alpha channel check (RGBA mode): {'PASS' if mode_pass else 'FAIL'}")

    # Convert image to numpy array (H, W, 4)
    img_rgba = img.convert("RGBA")
    arr = np.array(img_rgba)

    # Global Alpha stats
    alpha = arr[:, :, 3]
    total_pixels = width * height
    zero_alpha = int(np.sum(alpha == 0))
    full_alpha = int(np.sum(alpha == 255))
    semi_alpha = int(np.sum((alpha > 0) & (alpha < 255)))

    print(f"\n=== GLOBAL ALPHA DISTRIBUTION ===")
    print(f"Total Pixels: {total_pixels}")
    print(f"Fully Transparent (alpha=0): {zero_alpha} ({zero_alpha/total_pixels*100:.2f}%)")
    print(f"Semi-Transparent (0<alpha<255): {semi_alpha} ({semi_alpha/total_pixels*100:.2f}%)")
    print(f"Fully Opaque (alpha=255): {full_alpha} ({full_alpha/total_pixels*100:.2f}%)")

    # Frame-by-frame analysis
    frames_data = []

    palette_by_row = {r: set() for r in range(4)}
    all_visible_colors = set()

    cell_w = width // expected_cols
    cell_h = height // expected_rows

    print(f"\n=== PER-FRAME CELL ANALYSIS (24 FRAMES) ===")
    print(f"Grid: {expected_cols} cols x {expected_rows} rows | Cell Size: {cell_w}x{cell_h}")
    print("-" * 100)
    print(f"{'Idx':<4} {'Row/State':<12} {'Col':<4} {'Crop (LxTxRxB)':<18} {'Opaque Px':<10} {'Visible Px':<10} {'BBox (LxTxRxB)':<16} {'Edge Clip':<10} {'Empty?':<7}")
    print("-" * 100)

    all_frames_valid = True

    for r in range(expected_rows):
        row_name = ROW_NAMES[r]
        for c in range(expected_cols):
            idx = r * expected_cols + c
            left = c * cell_w
            top = r * cell_h
            right = left + cell_w
            bottom = top + cell_h

            frame_crop = arr[top:bottom, left:right]
            f_r = frame_crop[:, :, 0]
            f_g = frame_crop[:, :, 1]
            f_b = frame_crop[:, :, 2]
            f_a = frame_crop[:, :, 3]

            visible_mask = f_a > 0
            opaque_mask = f_a == 255
            visible_count = int(np.sum(visible_mask))
            opaque_count = int(np.sum(opaque_mask))

            is_empty = (visible_count == 0)

            # Bounding box within frame relative coordinates (0 to cell_w-1, 0 to cell_h-1)
            if visible_count > 0:
                y_indices, x_indices = np.where(visible_mask)
                min_x, max_x = int(np.min(x_indices)), int(np.max(x_indices))
                min_y, max_y = int(np.min(y_indices)), int(np.max(y_indices))
                bbox = [min_x, min_y, max_x, max_y]

                # Edge clipping check
                touches_left = (min_x == 0)
                touches_right = (max_x == cell_w - 1)
                touches_top = (min_y == 0)
                touches_bottom = (max_y == cell_h - 1)
                edge_clipped = touches_left or touches_right or touches_top or touches_bottom
                clip_str = []
                if touches_left: clip_str.append("L")
                if touches_right: clip_str.append("R")
                if touches_top: clip_str.append("T")
                if touches_bottom: clip_str.append("B")
                clip_desc = ",".join(clip_str) if clip_str else "NONE"

                # Center of mass of visible pixels
                centroid_x = float(np.mean(x_indices))
                centroid_y = float(np.mean(y_indices))
                cell_center_x = (cell_w - 1) / 2.0
                cell_center_y = (cell_h - 1) / 2.0
                offset_x = round(centroid_x - cell_center_x, 2)
                offset_y = round(centroid_y - cell_center_y, 2)

                # Collect unique RGB colors for visible pixels
                visible_rgb = frame_crop[visible_mask][:, :3]
                frame_colors = set(tuple(px) for px in visible_rgb)
                palette_by_row[r].update(frame_colors)
                all_visible_colors.update(frame_colors)

                # Color frequency distribution
                unique_colors, counts = np.unique(visible_rgb, axis=0, return_counts=True)
                top_colors_idx = np.argsort(-counts)[:5]
                top_colors = [
                    {"rgb": unique_colors[i].tolist(), "hex": f"#{unique_colors[i][0]:02x}{unique_colors[i][1]:02x}{unique_colors[i][2]:02x}", "count": int(counts[i])}
                    for i in top_colors_idx
                ]
            else:
                bbox = None
                edge_clipped = False
                clip_desc = "EMPTY"
                centroid_x, centroid_y = None, None
                offset_x, offset_y = None, None
                top_colors = []

            bbox_str = f"[{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}]" if bbox else "N/A"

            if is_empty or visible_count < 50:
                all_frames_valid = False

            print(f"{idx:<4} {row_name:<12} {c:<4} [{left},{top},{right},{bottom}] {opaque_count:<10} {visible_count:<10} {bbox_str:<16} {clip_desc:<10} {'YES' if is_empty else 'NO':<7}")

            frames_data.append({
                "frame_index": idx,
                "row_index": r,
                "row_state": row_name,
                "col_index": c,
                "crop_rect": [left, top, right, bottom],
                "visible_pixels": visible_count,
                "opaque_pixels": opaque_count,
                "is_empty": is_empty,
                "bbox_within_cell": bbox,
                "edge_clipped": edge_clipped,
                "edge_clip_details": clip_desc,
                "centroid": [centroid_x, centroid_y] if bbox else None,
                "center_offset": [offset_x, offset_y] if bbox else None,
                "top_colors": top_colors
            })

    # Color Palette Analysis across frames & states
    print(f"\n=== COLOR PALETTE CONSISTENCY ANALYSIS ===")
    print(f"Total Unique RGB Colors across all frames: {len(all_visible_colors)}")
    for r in range(4):
        print(f"Row {r} ({ROW_NAMES[r]}): {len(palette_by_row[r])} unique colors")

    # Quantize colors to check primary palette dominance (RGB truncated to 4-bit precision / bins of 16)
    def bin_color(rgb, bin_size=16):
        return (rgb[0] // bin_size * bin_size, rgb[1] // bin_size * bin_size, rgb[2] // bin_size * bin_size)

    binned_palettes = {}
    for r in range(4):
        binned = set(bin_color(c) for c in palette_by_row[r])
        binned_palettes[r] = binned

    row_intersections = {}
    for i in range(4):
        for j in range(i+1, 4):
            inter = len(binned_palettes[i].intersection(binned_palettes[j]))
            union = len(binned_palettes[i].union(binned_palettes[j]))
            jaccard = inter / union if union > 0 else 0
            row_intersections[f"{ROW_NAMES[i]} vs {ROW_NAMES[j]}"] = {
                "intersection": inter,
                "union": union,
                "jaccard_similarity": round(jaccard, 3)
            }
            print(f"Palette Similarity {ROW_NAMES[i]} vs {ROW_NAMES[j]}: Jaccard={jaccard:.3f} ({inter} shared color bins)")

    # Grid Transparency & Seam Inspection (Check borders between cells)
    print(f"\n=== GRID SEAM & TRANSPARENCY AUDIT ===")
    border_pixels_non_transparent = 0
    # Top and bottom row borders
    for y in range(0, height, cell_h):
        border_pixels_non_transparent += int(np.sum(arr[y, :, 3] > 0))
    # Left and right col borders
    for x in range(0, width, cell_w):
        border_pixels_non_transparent += int(np.sum(arr[:, x, 3] > 0))

    print(f"Cell Grid Boundary Non-Transparent Pixel Hit Count: {border_pixels_non_transparent}")

    # Output detailed JSON report
    report = {
        "global": {
            "image_path": SPRITE_PATH,
            "width": width,
            "height": height,
            "expected_width": expected_w,
            "expected_height": expected_h,
            "dimension_match": dim_pass,
            "mode": mode,
            "alpha_mode_match": mode_pass,
            "total_pixels": total_pixels,
            "zero_alpha_pixels": zero_alpha,
            "semi_alpha_pixels": semi_alpha,
            "full_alpha_pixels": full_alpha,
            "total_unique_colors": len(all_visible_colors),
            "boundary_hit_count": border_pixels_non_transparent,
            "all_frames_valid": all_frames_valid
        },
        "row_palette_similarity": row_intersections,
        "frames": frames_data
    }

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print(f"\nDetailed analysis JSON saved to: {OUTPUT_JSON}")

if __name__ == "__main__":
    analyze_sprite()
