#!/usr/bin/env python3
"""Combine multiple images into a GIF, supporting size normalization and subtitles"""

import argparse
import glob
import os
import sys
from PIL import Image, ImageDraw, ImageFont


def load_and_normalize_image(path, target_size=None, force_size=None):
    """Load and adjust image size, maintaining aspect ratio without cropping"""
    img = Image.open(path)
    if img.mode != 'RGB':
        img = img.convert('RGB')

    if force_size:
        img = img.resize(force_size, Image.Resampling.LANCZOS)
        return img

    if not target_size:
        return img

    target_w, target_h = target_size
    img_w, img_h = img.size

    if img_w <= target_w and img_h <= target_h:
        new_img = Image.new('RGB', target_size, (255, 255, 255))
        paste_x = (target_w - img_w) // 2
        paste_y = (target_h - img_h) // 2
        new_img.paste(img, (paste_x, paste_y))
        return new_img
    else:
        ratio = min(target_w / img_w, target_h / img_h)
        new_w = int(img_w * ratio)
        new_h = int(img_h * ratio)
        resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)

        new_img = Image.new('RGB', target_size, (255, 255, 255))
        paste_x = (target_size[0] - new_w) // 2
        paste_y = (target_size[1] - new_h) // 2
        new_img.paste(resized, (paste_x, paste_y))
        return new_img


def calculate_normalized_size(image_paths):
    """Calculate normalization size (takes maximum width and height from all images)"""
    max_w, max_h = 0, 0
    for path in image_paths:
        try:
            img = Image.open(path)
            w, h = img.size
            max_w = max(max_w, w)
            max_h = max(max_h, h)
        except:
            pass
    return (max_w, max_h)


def parse_color(color_str):
    """Parse color string"""
    color_map = {
        'white': (255, 255, 255),
        'black': (0, 0, 0),
        'red': (255, 0, 0),
        'green': (0, 255, 0),
        'blue': (0, 0, 255),
        'yellow': (255, 255, 0),
        'cyan': (0, 255, 255),
        'magenta': (255, 0, 255),
    }
    if color_str.lower() in color_map:
        return color_map[color_str.lower()]

    if ',' in color_str:
        parts = color_str.split(',')
        if len(parts) == 3:
            try:
                return tuple(int(p.strip()) for p in parts)
            except ValueError:
                pass

    return (255, 255, 255)


def get_font(font_size):
    """Get font supporting international characters"""
    font_paths = [
        # macOS Chinese fonts
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/System/Library/Fonts/STHeiti Medium.ttc",
        # Windows Chinese fonts
        "C:/Windows/Fonts/simhei.ttf",
        "C:/Windows/Fonts/msyh.ttc",
        "C:/Windows/Fonts/simsun.ttc",
        # Common fonts
        "C:/Windows/Fonts/arial.ttf",
    ]
    for path in font_paths:
        try:
            return ImageFont.truetype(path, font_size)
        except:
            pass
    return ImageFont.load_default()


def add_subtitle(img, text, position='bottom', font_size=None, text_color='black', bg_color=None):
    """Add subtitle to image"""
    # Calculate font size based on image short edge if not provided
    if font_size is None:
        short_edge = min(img.width, img.height)
        font_size = int(short_edge * 0.06)
    
    draw = ImageDraw.Draw(img)
    font = get_font(font_size)

    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]

    padding = 10
    margin = 10

    if position == 'top':
        x = margin
        y = margin
    elif position == 'bottom':
        # Center horizontally at bottom
        x = (img.width - text_width) // 2
        y = img.height - text_height - padding - margin - 30
    else:
        # Center both horizontally and vertically
        x = (img.width - text_width) // 2
        y = (img.height - text_height) // 2

    if bg_color:
        bg_box = [x - padding, y - padding, x + text_width + padding, y + text_height + padding]
        draw.rectangle(bg_box, fill=bg_color)

    draw.text((x, y), text, fill=text_color, font=font)

    return img


def generate_gif_from_images(image_paths, output_path, fps=1, loop=0, resize=None,
                             normalize=True, pad_color=(255, 255, 255),
                             subtitles=None):
    """Combine multiple images into a GIF

    Args:
        image_paths: List of image paths
        output_path: Output GIF path
        fps: Frame rate (default 1, i.e., 1 frame per second)
        loop: Loop count, 0 means infinite
        resize: Force resize to specified dimensions (widthxheight format)
        normalize: Whether to automatically normalize dimensions
        pad_color: Padding color
        subtitles: Subtitle list, corresponds one-to-one with images
    """
    if not image_paths:
        print("Error: No images provided", file=sys.stderr)
        return False

    images = []
    target_size = None

    if resize:
        target_size = tuple(map(int, resize.split('x')))
    elif normalize:
        target_size = calculate_normalized_size(image_paths)
        print(f"Normalized size: {target_size[0]}x{target_size[1]}")

    for idx, path in enumerate(image_paths):
        if not os.path.exists(path):
            print(f"Warning: Image not found: {path}", file=sys.stderr)
            continue
        try:
            img = load_and_normalize_image(path, target_size, resize)

            if subtitles and idx < len(subtitles) and subtitles[idx]:
                subtitle_conf = subtitles[idx]
                img = add_subtitle(
                    img,
                    text=subtitle_conf.get('text', ''),
                    position=subtitle_conf.get('position', 'bottom'),
                    font_size=subtitle_conf.get('font_size'),
                    text_color=parse_color(subtitle_conf.get('color', 'black')),
                    bg_color=parse_color(subtitle_conf['bg']) if subtitle_conf.get('bg') else None
                )

            images.append(img)
        except Exception as e:
            print(f"Warning: Failed to load {path}: {e}", file=sys.stderr)

    if not images:
        print("Error: No valid images to process", file=sys.stderr)
        return False

    duration = 1000 // fps

    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir)

    images[0].save(
        output_path,
        save_all=True,
        append_images=images[1:],
        duration=duration,
        loop=loop,
        optimize=True
    )

    print(f"GIF created: {output_path} ({len(images)} frames, {fps} fps, {target_size})")
    return True


def parse_subtitles(subtitle_str):
    """Parse subtitle parameter string

    Format: "text1@pos1:color1:bg1;text2@pos2:color2:bg2;..."

    Examples:
        "Hello"  # All frames show Hello
        "text1;text2"  # First frame text1, second frame text2
        "Start@top:white:black;End@bottom:white:black"  # With position and color
    """
    if not subtitle_str:
        return None

    subtitles = []
    entries = subtitle_str.split(';')

    for entry in entries:
        entry = entry.strip()
        if not entry:
            subtitles.append(None)
            continue

        parts = entry.split('@')
        text = parts[0].strip()

        conf = {'text': text, 'position': 'bottom', 'color': 'black', 'bg': None}

        if len(parts) > 1:
            opts = parts[1].split(':')
            for opt in opts:
                opt = opt.strip()
                if opt in ['top', 'bottom', 'center']:
                    conf['position'] = opt
                elif opt.startswith('color='):
                    conf['color'] = opt.split('=')[1].strip()
                elif opt.startswith('bg='):
                    bg_val = opt.split('=')[1].strip()
                    conf['bg'] = bg_val if bg_val.lower() != 'none' else None
                elif opt in ['white', 'black', 'red', 'green', 'blue', 'yellow', 'cyan', 'magenta']:
                    conf['color'] = opt

        subtitles.append(conf)

    return subtitles


def main():
    parser = argparse.ArgumentParser(description='Combine multiple images into a GIF')
    parser.add_argument('-i', '--inputs', nargs='+', required=True, help='Input image paths (supports wildcards)')
    parser.add_argument('-o', '--output', required=True, help='Output GIF file path')
    parser.add_argument('--fps', type=int, default=1, help='Frame rate (default 1, i.e., 1 second per frame)')
    parser.add_argument('--loop', type=int, default=0, help='Loop count, 0 means infinite loop (default 0)')
    parser.add_argument('--resize', help='Force resize dimensions (e.g., 800x600, will crop)')
    parser.add_argument('--no-normalize', action='store_true', help='Disable size normalization')
    parser.add_argument('--subtitles', help='Subtitle configuration (e.g., "Frame1;Frame2;Frame3")')
    parser.add_argument('--subtitle-pos', default='bottom', choices=['top', 'bottom', 'center'], help='Subtitle position (default bottom)')
    parser.add_argument('--subtitle-color', default='black', help='Subtitle color (default black)')
    parser.add_argument('--subtitle-bg', default='none', help='Subtitle background color (default none transparent)')
    parser.add_argument('--subtitle-size', type=int, help='Subtitle font size (optional, defaults to 6% of image\'s shorter dimension if not specified)')
    parser.add_argument('-v', '--verbose', action='store_true', help='Verbose output')

    args = parser.parse_args()

    image_paths = []
    for pattern in args.inputs:
        if '*' in pattern or '?' in pattern:
            image_paths.extend(glob.glob(pattern))
        else:
            image_paths.append(pattern)

    if not image_paths:
        print("Error: No images found matching the patterns", file=sys.stderr)
        sys.exit(1)

    image_paths.sort()

    if args.verbose:
        print(f"Found {len(image_paths)} images")

    subtitles = None
    if args.subtitles:
        subtitles = parse_subtitles(args.subtitles)
        if args.verbose:
            print(f"Subtitles: {subtitles}")

        if subtitles and len(subtitles) < len(image_paths):
            while len(subtitles) < len(image_paths):
                subtitles.append(subtitles[-1] if subtitles else None)

    output_dir = os.path.dirname(args.output)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir)

    success = generate_gif_from_images(
        image_paths,
        args.output,
        fps=args.fps,
        loop=args.loop,
        resize=args.resize,
        normalize=not args.no_normalize,
        subtitles=subtitles
    )

    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()