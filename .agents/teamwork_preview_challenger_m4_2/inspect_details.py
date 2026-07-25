import json
import numpy as np
from PIL import Image

with open(".agents/teamwork_preview_challenger_m4_2/sprite_analysis_results.json", "r") as f:
    data = json.load(f)

img = Image.open("public/muc-pet-sprite.png").convert("RGBA")
arr = np.array(img)

cell_w, cell_h = 208, 174

print("=== DETAILED EDGE CLIPPING INSPECTION ===")
for frame in data["frames"]:
    if frame["edge_clipped"]:
        r, c = frame["row_index"], frame["col_index"]
        idx = frame["frame_index"]
        state = frame["row_state"]
        left, top = c * cell_w, r * cell_h
        
        top_row_alpha = arr[top, left:left+cell_w, 3]
        bottom_row_alpha = arr[top+cell_h-1, left:left+cell_w, 3]
        left_col_alpha = arr[top:top+cell_h, left, 3]
        right_col_alpha = arr[top:top+cell_h, left+cell_w-1, 3]

        t_hits = np.sum(top_row_alpha > 0)
        b_hits = np.sum(bottom_row_alpha > 0)
        l_hits = np.sum(left_col_alpha > 0)
        r_hits = np.sum(right_col_alpha > 0)

        print(f"Frame {idx:2d} ({state} R{r}C{c}): Clips [{frame['edge_clip_details']}] | Non-transparent at borders -> Top:{t_hits}, Bottom:{b_hits}, Left:{l_hits}, Right:{r_hits}")

print("\n=== FRAME CENTROID ALIGNMENT & MOTION STABILITY ===")
for r in range(4):
    state_frames = [f for f in data["frames"] if f["row_index"] == r]
    centroids_x = [f["centroid"][0] for f in state_frames]
    centroids_y = [f["centroid"][1] for f in state_frames]
    
    mean_x = np.mean(centroids_x)
    std_x = np.std(centroids_x)
    mean_y = np.mean(centroids_y)
    std_y = np.std(centroids_y)

    print(f"\nState: {state_frames[0]['row_state']}")
    print(f"  Centroid X: Mean={mean_x:.2f}px, StdDev={std_x:.2f}px, Range=[{min(centroids_x):.2f}, {max(centroids_x):.2f}]")
    print(f"  Centroid Y: Mean={mean_y:.2f}px, StdDev={std_y:.2f}px, Range=[{min(centroids_y):.2f}, {max(centroids_y):.2f}]")
