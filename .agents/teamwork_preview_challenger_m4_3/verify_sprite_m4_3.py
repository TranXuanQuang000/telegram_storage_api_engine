import os
import json
import math
import numpy as np
from PIL import Image

def analyze_sprite(image_path, grid_cols=6, grid_rows=4):
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Sprite file not found: {image_path}")

    img = Image.open(image_path)
    width, height = img.size
    mode = img.mode
    
    cell_width = width // grid_cols
    cell_height = height // grid_rows
    
    img_rgba = img.convert("RGBA")
    arr = np.array(img_rgba)
    
    # Global Alpha stats
    alpha = arr[:, :, 3]
    total_pixels = width * height
    transparent_count = int(np.sum(alpha == 0))
    semi_transparent_count = int(np.sum((alpha > 0) & (alpha < 255)))
    opaque_count = int(np.sum(alpha == 255))
    
    states = ["Idle", "Running", "Petting", "Dragging"]
    frame_results = []
    
    top_edge_clipped_frames = []
    bottom_edge_clipped_frames = []
    left_edge_clipped_frames = []
    right_edge_clipped_frames = []
    
    seam_hit_pixels_total = 0
    
    state_palettes_4bit = {s: set() for s in states}
    state_unique_rgb = {s: set() for s in states}
    
    for row in range(grid_rows):
        state_name = states[row] if row < len(states) else f"Row_{row}"
        for col in range(grid_cols):
            frame_idx = row * grid_cols + col
            
            y_start = row * cell_height
            y_end = (row + 1) * cell_height
            x_start = col * cell_width
            x_end = (col + 1) * cell_width
            
            cell_arr = arr[y_start:y_end, x_start:x_end]
            cell_alpha = cell_arr[:, :, 3]
            cell_rgb = cell_arr[:, :, :3]
            
            visible_mask = cell_alpha > 0
            visible_count = int(np.sum(visible_mask))
            
            if visible_count == 0:
                bbox = None
                top_margin = None
                bottom_margin = None
                left_margin = None
                right_margin = None
                centroid = None
                clipped_edges = ["EMPTY"]
                top_clipped = False
            else:
                ys, xs = np.where(visible_mask)
                min_y, max_y = int(np.min(ys)), int(np.max(ys))
                min_x, max_x = int(np.min(xs)), int(np.max(xs))
                
                bbox = [min_x, min_y, max_x, max_y]
                top_margin = min_y
                bottom_margin = (cell_height - 1) - max_y
                left_margin = min_x
                right_margin = (cell_width - 1) - max_x
                
                # Check seam hits
                top_seam_hits = int(np.sum(cell_alpha[0, :] > 0))
                bottom_seam_hits = int(np.sum(cell_alpha[cell_height - 1, :] > 0))
                left_seam_hits = int(np.sum(cell_alpha[:, 0] > 0))
                right_seam_hits = int(np.sum(cell_alpha[:, cell_width - 1] > 0))
                
                cell_seam_hits = top_seam_hits + bottom_seam_hits + left_seam_hits + right_seam_hits
                seam_hit_pixels_total += cell_seam_hits
                
                clipped_edges = []
                if min_y == 0:
                    clipped_edges.append(f"TOP ({top_seam_hits} px)")
                    top_edge_clipped_frames.append(frame_idx)
                if max_y == cell_height - 1:
                    clipped_edges.append(f"BOTTOM ({bottom_seam_hits} px)")
                    bottom_edge_clipped_frames.append(frame_idx)
                if min_x == 0:
                    clipped_edges.append(f"LEFT ({left_seam_hits} px)")
                    left_edge_clipped_frames.append(frame_idx)
                if max_x == cell_width - 1:
                    clipped_edges.append(f"RIGHT ({right_seam_hits} px)")
                    right_edge_clipped_frames.append(frame_idx)
                    
                top_clipped = (min_y == 0)
                
                # Centroid
                centroid_x = float(np.mean(xs))
                centroid_y = float(np.mean(ys))
                centroid = [round(centroid_x, 2), round(centroid_y, 2)]
                
                # Collect colors for palette analysis
                vis_rgb = cell_rgb[visible_mask]
                for r, g, b in vis_rgb:
                    state_unique_rgb[state_name].add((int(r), int(g), int(b)))
                    # 4-bit bin: divide by 16
                    state_palettes_4bit[state_name].add((r // 16, g // 16, b // 16))
            
            # Inspect character top outline pixels if present
            # We check the highest row of visible pixels in cell
            top_row_pixel_colors = []
            if visible_count > 0:
                top_row_idx = min_y
                top_row_mask = (cell_alpha[top_row_idx, :] > 0)
                top_row_rgbas = cell_arr[top_row_idx, top_row_mask]
                # Sample up to 5 colors
                for p in top_row_rgbas[:5]:
                    top_row_pixel_colors.append([int(p[0]), int(p[1]), int(p[2]), int(p[3])])
            
            frame_results.append({
                "frame": frame_idx,
                "state": state_name,
                "row": row,
                "col": col,
                "crop_rect": [x_start, y_start, x_end, y_end],
                "visible_pixels": visible_count,
                "bbox_rel": bbox,
                "top_margin_px": top_margin,
                "bottom_margin_px": bottom_margin,
                "left_margin_px": left_margin,
                "right_margin_px": right_margin,
                "centroid_rel": centroid,
                "clipped_edges": clipped_edges if clipped_edges else ["NONE"],
                "min_y_gt_zero": (top_margin > 0) if top_margin is not None else False,
                "is_empty": (visible_count == 0),
                "sample_top_row_rgbas": top_row_pixel_colors
            })

    # Palette Similarity (Jaccard)
    jaccard_sim = {}
    state_names = list(state_palettes_4bit.keys())
    for i in range(len(state_names)):
        for j in range(i + 1, len(state_names)):
            s1, s2 = state_names[i], state_names[j]
            set1 = state_palettes_4bit[s1]
            set2 = state_palettes_4bit[s2]
            intersection = len(set1.intersection(set2))
            union = len(set1.union(set2))
            sim = intersection / union if union > 0 else 1.0
            jaccard_sim[f"{s1} vs {s2}"] = round(sim, 4)

    # Centroid Motion Stability per state
    centroid_stats = {}
    for state_name in states:
        state_frames = [f for f in frame_results if f["state"] == state_name and f["centroid_rel"] is not None]
        if state_frames:
            xs = [f["centroid_rel"][0] for f in state_frames]
            ys = [f["centroid_rel"][1] for f in state_frames]
            centroid_stats[state_name] = {
                "mean_x": round(float(np.mean(xs)), 2),
                "std_x": round(float(np.std(xs)), 2),
                "mean_y": round(float(np.mean(ys)), 2),
                "std_y": round(float(np.std(ys)), 2),
                "min_top_margin": min([f["top_margin_px"] for f in state_frames]),
                "max_top_margin": max([f["top_margin_px"] for f in state_frames])
            }

    summary = {
        "image_path": image_path,
        "format": img.format,
        "mode": mode,
        "width": width,
        "height": height,
        "grid_cols": grid_cols,
        "grid_rows": grid_rows,
        "cell_width": cell_width,
        "cell_height": cell_height,
        "total_pixels": total_pixels,
        "transparent_pixels": transparent_count,
        "transparent_pct": round(transparent_count / total_pixels * 100, 2),
        "semi_transparent_pixels": semi_transparent_count,
        "semi_transparent_pct": round(semi_transparent_count / total_pixels * 100, 2),
        "opaque_pixels": opaque_count,
        "opaque_pct": round(opaque_count / total_pixels * 100, 2),
        "total_seam_hit_pixels": seam_hit_pixels_total,
        "top_edge_clipped_frame_count": len(top_edge_clipped_frames),
        "top_edge_clipped_frames": top_edge_clipped_frames,
        "all_frames_min_y_gt_zero": (len(top_edge_clipped_frames) == 0),
        "bottom_edge_clipped_frames": bottom_edge_clipped_frames,
        "left_edge_clipped_frames": left_edge_clipped_frames,
        "right_edge_clipped_frames": right_edge_clipped_frames,
        "empty_frame_count": sum(1 for f in frame_results if f["is_empty"]),
        "jaccard_palette_similarity_4bit": jaccard_sim,
        "centroid_stats_per_state": centroid_stats,
        "frames": frame_results
    }
    
    return summary

if __name__ == "__main__":
    sprite_path = "public/muc-pet-sprite.png"
    out_json = ".agents/teamwork_preview_challenger_m4_3/sprite_analysis_results.json"
    
    results = analyze_sprite(sprite_path)
    
    os.makedirs(os.path.dirname(out_json), exist_ok=True)
    with open(out_json, "w") as f:
        json.dump(results, f, indent=2)
        
    print("=" * 80)
    print(f"EMPIRICAL STRESS TEST RESULTS FOR: {sprite_path}")
    print("=" * 80)
    print(f"Dimensions: {results['width']}x{results['height']} | Mode: {results['mode']} | Cell: {results['cell_width']}x{results['cell_height']}")
    print(f"Alpha Breakdown: Transparent={results['transparent_pct']}%, Semi-Transparent={results['semi_transparent_pct']}%, Opaque={results['opaque_pct']}%")
    print(f"Empty Frames: {results['empty_frame_count']} / 24")
    print(f"Top-Edge Clipped Frames (min_y == 0): {results['top_edge_clipped_frame_count']} / 24 -> {results['top_edge_clipped_frames']}")
    print(f"All Frames min_y > 0 Check: {'PASSED' if results['all_frames_min_y_gt_zero'] else 'FAILED'}")
    print(f"Total Seam Hit Pixels: {results['total_seam_hit_pixels']}")
    print("-" * 80)
    print("Per Frame Bounding Box & Top Margin Summary:")
    for f in results["frames"]:
        print(f"Frame {f['frame']:2d} ({f['state']:8s} Col {f['col']}): visible={f['visible_pixels']:6d} | bbox={f['bbox_rel']} | top_margin={f['top_margin_px']}px | clip={f['clipped_edges']}")
    print("-" * 80)
    print("Centroid Stats Per State:")
    for s, st in results["centroid_stats_per_state"].items():
        print(f"  {s:8s}: X mean={st['mean_x']} (std={st['std_x']}), Y mean={st['mean_y']} (std={st['std_y']}), Top Margin Range=[{st['min_top_margin']}px .. {st['max_top_margin']}px]")
    print("-" * 80)
    print("Palette Jaccard Similarity (4-bit color quantization):")
    for pair, sim in results["jaccard_palette_similarity_4bit"].items():
        print(f"  {pair}: {sim:.4f}")
    print("=" * 80)
