---
name: aet-generating-gif
description: GIF animation generation and processing skill. Used when users need: (1) extracting frames from GIF; (2) stitching multiple images into GIF; (3) converting video to GIF. Supports Pillow image composition and ffmpeg video processing.
---

# AET Generating Skill

## Feature Overview

| Feature | Description | Dependencies |
|---------|-------------|--------------|
| GIF Frame Extraction | Extract specified frames or key frames from GIF | Pillow |
| GIF Cropping | Crop GIF to specified ratio, dimensions, or shape | Pillow |
| Image Stitching GIF | Combine multiple images into GIF, supports subtitles (including Chinese) | Pillow |
| Video → GIF | Convert video to GIF | ffmpeg |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GIF_FPS` | Default frame rate (default: 1, i.e., 1 second per frame) |
| `GIF_DURATION` | Frame duration (default: 1000 milliseconds) |

## Workflow

### 1. GIF Frame Extraction

**Use Case**: Extract specified frames from GIF animation as static images, with optional subtitles.

```python
# List all frames in GIF
python scripts/extract_gif_frames.py list -i input.gif

# Extract specified frame (single)
python scripts/extract_gif_frames.py extract -i input.gif -o frames/ -f 0

# Extract multiple specified frames
python scripts/extract_gif_frames.py extract -i input.gif -o frames/ -f "0,2,5"

# Extract frame range
python scripts/extract_gif_frames.py extract -i input.gif -o frames/ -f "0-10"

# Extract all frames
python scripts/extract_gif_frames.py extract -i input.gif -o frames/ --all

# Extract frames with subtitles
python scripts/extract_gif_frames.py extract -i input.gif -o frames/ -f "0,2,5" --subtitles "Start;Middle;End"
```

**Subcommands**:
- `list`: List all frame information in GIF
- `extract`: Extract specified frames

**Parameter Description**:
- `-i, --input`: Input GIF file path
- `-o, --output`: Output directory
- `-f, --frames`: Frame index, supports comma-separated values or dash ranges (e.g., "0,2,5" or "0-10")
- `--all`: Extract all frames
- `--format`: Output format (png, jpg, gif, default png)
- `--prefix`: Output filename prefix (default frame)
- `--subtitles`: Subtitle configuration, format "text1;text2;text3" (semicolon-separated, corresponds to frames one-to-one)
- `--subtitle-pos`: Subtitle position (top, bottom, center, default bottom)
- `--subtitle-color`: Subtitle color (default black)
- `--subtitle-bg`: Subtitle background color (default none transparent)
- `--subtitle-size`: Subtitle font size (optional, defaults to 6% of frame's shorter dimension if not specified)

### 2. Image Stitching GIF

**Use Case**: User has multiple images and wants to combine them into a GIF.

```python
# Script usage
python scripts/generate_gif_from_images.py -i "frame1.png" "frame2.png" "frame3.png" -o output.gif
python scripts/generate_gif_from_images.py -i "*.png" -o output.gif --fps 15 --resize 800x600
```

**Adding Subtitles**:
```python
# Add different subtitles to each frame (semicolon-separated)
python scripts/generate_gif_from_images.py -i "frame1.png" "frame2.png" "frame3.png" -o output.gif --subtitles "Start;Middle;End"

# Set global subtitle style (uses dynamic font size based on image dimensions)
python scripts/generate_gif_from_images.py -i "*.png" -o output.gif --subtitles "Step1;Step2;Step3" --subtitle-pos top --subtitle-color white --subtitle-bg black

# Subtitle color and background (position:color:background) - uses dynamic font sizing
python scripts/generate_gif_from_images.py -i "*.png" -o output.gif --subtitles "Hello@top:white:none;Goodbye@bottom:yellow:black"
```

**Parameter Description**:
- `-i, --inputs`: Input image paths (supports wildcards)
- `-o, --output`: Output GIF file path
- `--fps`: Frame rate (default 1, i.e., 1 second per frame)
- `--loop`: Loop count, 0 means infinite loop (default 0)
- `--normalize`: Auto-normalize dimensions, don't crop large images, pad small images (default enabled)
- `--subtitles`: Subtitle configuration, format "text1;text2;text3" (semicolon-separated, corresponds to images one-to-one)
- `--subtitle-pos`: Subtitle position (top, bottom, center, default bottom)
- `--subtitle-color`: Subtitle color (default black)
- `--subtitle-bg`: Subtitle background color (default none transparent)
- `--subtitle-size`: Subtitle font size (optional, defaults to 6% of image's shorter dimension if not specified)

**Default Subtitle Style**: Transparent background, black text, bottom center. Font size is calculated as 6% of the image's shorter dimension (width or height) when not explicitly specified (applies to both image stitching and frame extraction).

**Workflow**:
1. Collect all input images
2. Adjust image dimensions (optional)
3. Sequentially combine into GIF

### 3. Video to GIF

**Use Case**: User has a video file and needs to convert it to GIF.

```python
# Script usage
python scripts/video_to_gif.py -i input.mp4 -o output.gif
python scripts/video_to_gif.py -i input.mp4 -o output.gif --fps 15 --start 0 --duration 10
```

**Parameter Description**:
- `-i, --input`: Input video file path
- `-o, --output`: Output GIF file path
- `--fps`: Frame rate (default 15)
- `--start`: Start time (seconds, default 0)
- `--duration`: Duration (seconds, default entire video)
- `--width`: Output width (pixels, auto proportional scaling)

**Workflow**:
1. Use ffmpeg to extract video frames
2. Combine frames into GIF
3. Optional: Optimize GIF file size

### 4. GIF Cropping

**Use Case**: Crop GIF to specified ratio, dimensions, or shape.

**Rectangular Cropping (by Ratio)**:
```python
# Crop to 4:3 ratio
python scripts/gif_crop.py -i input.gif -o output.gif --ratio 4:3

# Crop to 16:9 ratio
python scripts/gif_crop.py -i input.gif -o output.gif --ratio 16:9

# Force crop to specified dimensions
python scripts/gif_crop.py -i input.gif -o output.gif --size 800x600

# Specify crop position (center, left, right, top, bottom)
python scripts/gif_crop.py -i input.gif -o output.gif --ratio 4:3 --position left
```

**Shape Cropping (Circular, Elliptical)**:
```python
# Crop to circle, circular exterior filled with white
python scripts/gif_crop.py -i input.gif -o output.gif --shape circle --bg white

# Crop to circle, circular exterior transparent
python scripts/gif_crop.py -i input.gif -o output.gif --shape circle --bg transparent

# Crop to ellipse
python scripts/gif_crop.py -i input.gif -o output.gif --shape oval --bg white
```

**Parameter Description**:
- `-i, --input`: Input GIF file path
- `-o, --output`: Output GIF file path
- `--ratio`: Target aspect ratio (e.g., 16:9, 4:3, 1:1)
- `--size`: Forced dimensions (e.g., 800x600, will crop to this ratio)
- `--shape`: Shape mask (rectangle, circle, oval)
- `--bg`: Background color (white, black, transparent)
- `--position`: Crop position (center, left, right, top, bottom, default center)
- `--fps`: Frame rate (default uses original GIF frame rate)

## Common Commands Cheat Sheet

### Basic Usage

```bash
# List GIF frames
python scripts/extract_gif_frames.py list -i animation.gif

# Extract specified GIF frames
python scripts/extract_gif_frames.py extract -i animation.gif -o frames/ -f "0,2,5"

# Extract specified GIF frames (with subtitles)
python scripts/extract_gif_frames.py extract -i animation.gif -o frames/ -f "0,2,5" --subtitles "Start;Middle;End"

# Image stitching GIF (with subtitles)
python scripts/generate_gif_from_images.py -i "frame1.png" "frame2.png" "frame3.png" -o slideshow.gif --subtitles "Start;Go;Finish"

# Video to GIF
python scripts/video_to_gif.py -i movie.mp4 -o preview.gif --fps 10 --width 480

# GIF cropping
python scripts/gif_crop.py -i animation.gif -o cropped.gif --ratio 4:3

# GIF crop to circle
python scripts/gif_crop.py -i animation.gif -o circular.gif --shape circle --bg white
```

### Batch Processing

```bash
# Batch convert videos to GIF
for f in *.mp4; do python scripts/video_to_gif.py -i "$f" -o "${f%.mp4}.gif"; done

# Batch convert folder images to GIF
python scripts/generate_gif_from_images.py -i "frames/*.png" -o animation.gif --fps 12
```

## Troubleshooting

### Common Errors

**1. "No module named 'PIL'"**
```bash
pip install Pillow
```

**2. "ffmpeg not found"**
- Windows: Download ffmpeg and add to PATH
- macOS: `brew install ffmpeg`
- Linux: `sudo apt install ffmpeg`

### Debug Mode

```bash
# Enable verbose output
python scripts/generate_gif_from_images.py -i "*.png" -o output.gif -v

# Save intermediate frames to directory
python scripts/generate_gif_from_images.py -i "*.png" -o output.gif --temp-dir ./temp_frames
```