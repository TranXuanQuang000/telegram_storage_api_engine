import os
import json
import numpy as np
from PIL import Image

def verify_outline_integrity(image_path, grid_cols=6, grid_rows=4):
    img = Image.open(image_path).convert("RGBA")
    arr = np.array(img)
    cell_w = img.width // grid_cols
    cell_h = img.height // grid_rows
    
    states = ["Idle", "Running", "Petting", "Dragging"]
    results = []
    
    for row in range(grid_rows):
        state = states[row]
        for col in range(grid_cols):
            frame_idx = row * grid_cols + col
            y0, y1 = row * cell_h, (row + 1) * cell_h
            x0, x1 = col * cell_w, (col + 1) * cell_w
            
            cell = arr[y0:y1, x0:x1]
            alpha = cell[:, :, 3]
            rgb = cell[:, :, :3]
            
            # Find boundary pixels
            # For each column that has visible pixels, find top-most and bottom-most visible pixel
            visible_cols = np.where(np.any(alpha > 0, axis=0))[0]
            
            top_boundary_pixels = []
            bottom_boundary_pixels = []
            
            for c in visible_cols:
                col_alpha = alpha[:, c]
                vis_rows = np.where(col_alpha > 0)[0]
                top_r = vis_rows[0]
                bot_r = vis_rows[-1]
                
                # RGB and alpha of top boundary pixel
                top_p = cell[top_r, c]
                bot_p = cell[bot_r, c]
                
                top_boundary_pixels.append({
                    "col_rel": int(c),
                    "row_rel": int(top_r),
                    "rgba": [int(x) for x in top_p],
                    "luminance": float(0.299 * top_p[0] + 0.587 * top_p[1] + 0.114 * top_p[2])
                })
                bottom_boundary_pixels.append({
                    "col_rel": int(c),
                    "row_rel": int(bot_r),
                    "rgba": [int(x) for x in bot_p],
                    "luminance": float(0.299 * bot_p[0] + 0.587 * bot_p[1] + 0.114 * bot_p[2])
                })
                
            top_lums = [p["luminance"] for p in top_boundary_pixels]
            avg_top_lum = float(np.mean(top_lums)) if top_lums else 0.0
            
            # Count outline vs bright body pixels (outline typically has low luminance < 80 or high alpha anti-aliasing)
            dark_outline_count = sum(1 for p in top_boundary_pixels if p["luminance"] < 100 or p["rgba"][3] < 255)
            total_boundary = len(top_boundary_pixels)
            dark_outline_ratio = dark_outline_count / total_boundary if total_boundary > 0 else 0.0
            
            results.append({
                "frame": frame_idx,
                "state": state,
                "row": row,
                "col": col,
                "min_y": int(np.min(np.where(alpha > 0)[0])),
                "max_y": int(np.max(np.where(alpha > 0)[0])),
                "min_x": int(np.min(np.where(alpha > 0)[1])),
                "max_x": int(np.max(np.where(alpha > 0)[1])),
                "avg_top_luminance": round(avg_top_lum, 2),
                "dark_outline_ratio": round(dark_outline_ratio, 4),
                "total_boundary_cols": total_boundary,
                "top_margin": int(np.min(np.where(alpha > 0)[0]))
            })
            
    return results

if __name__ == "__main__":
    res = verify_outline_integrity("public/muc-pet-sprite.png")
    out_file = ".agents/teamwork_preview_challenger_m4_3/outline_analysis.json"
    with open(out_file, "w") as f:
        json.dump(res, f, indent=2)
        
    print("=" * 80)
    print("OUTLINE INTEGRITY & TOP MARGIN DETAILED ANALYSIS")
    print("=" * 80)
    for r in res:
        print(f"Frame {r['frame']:2d} ({r['state']:8s}): top_margin={r['top_margin']}px | min_y={r['min_y']:2d} | bbox=[{r['min_x']:2d}, {r['min_y']:2d}, {r['max_x']:3d}, {r['max_y']:3d}] | avg_top_lum={r['avg_top_luminance']:5.1f} | dark_outline_ratio={r['dark_outline_ratio']*100:5.1f}%")
    print("=" * 80)
