import os
import numpy as np
from PIL import Image

def verify_sprite():
    img_path = os.path.join(os.path.dirname(__file__), "..", "..", "public", "muc-pet-sprite.png")
    img_path = os.path.abspath(img_path)
    
    if not os.path.exists(img_path):
        print(f"FAIL: {img_path} does not exist")
        return False
        
    img = Image.open(img_path)
    print(f"Format: {img.format}")
    print(f"Mode: {img.mode}")
    print(f"Size: {img.size}")
    
    assert img.format == "PNG", f"Expected PNG format, got {img.format}"
    assert img.mode == "RGBA", f"Expected RGBA mode, got {img.mode}"
    assert img.size == (1248, 696), f"Expected (1248, 696), got {img.size}"
    
    arr = np.array(img)
    alpha = arr[:, :, 3]
    transparent_count = np.count_nonzero(alpha == 0)
    total_pixels = img.size[0] * img.size[1]
    transparency_pct = (transparent_count / total_pixels) * 100
    
    print(f"Transparent pixels (alpha==0): {transparent_count} / {total_pixels} ({transparency_pct:.2f}%)")
    assert transparent_count > 0, "Image has no transparent background pixels!"
    
    cell_w, cell_h = 208, 174
    cols, rows = 6, 4
    
    non_empty_frames = 0
    row_names = ["Idle (Row 0)", "Running (Row 1)", "Petting (Row 2)", "Dragging (Row 3)"]
    
    for r in range(rows):
        for c in range(cols):
            cell = arr[r*cell_h:(r+1)*cell_h, c*cell_w:(c+1)*cell_w]
            cell_alpha = cell[:, :, 3]
            opaque_count = np.count_nonzero(cell_alpha > 0)
            if opaque_count > 0:
                non_empty_frames += 1
            print(f"  Frame R{r}C{c} ({row_names[r]} frame {c}): {opaque_count} non-transparent pixels")
            
    print(f"Total non-empty frames verified: {non_empty_frames} / 24")
    assert non_empty_frames == 24, f"Expected 24 non-empty frames, got {non_empty_frames}"
    print("INDEPENDENT IMAGE VERIFICATION SUCCESSFUL!")
    return True

if __name__ == "__main__":
    verify_sprite()
