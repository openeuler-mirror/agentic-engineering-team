#!/usr/bin/env python3
"""Extract key frames/specified frames from GIF"""

import argparse
import os
import sys
from PIL import Image, ImageDraw, ImageFont


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


def extract_frames(gif_path, output_dir, frames=None, format='png', prefix='frame', subtitles=None):
    """Extract frames from GIF

    Args:
        gif_path: GIF file path
        output_dir: Output directory
        frames: List of frame indices to extract, None means extract all frames
        format: Output image format (png, jpg, gif)
        prefix: Output filename prefix
        subtitles: Subtitle list, corresponds one-to-one with frames
    """
    if not os.path.exists(gif_path):
        print(f"Error: GIF not found: {gif_path}", file=sys.stderr)
        return False

    img = Image.open(gif_path)
    total_frames = 0

    try:
        while True:
            total_frames += 1
            img.seek(img.tell() + 1)
    except EOFError:
        pass

    print(f"GIF: {gif_path}")
    print(f"Total frames: {total_frames}")

    if frames is None:
        frames = list(range(total_frames))

    os.makedirs(output_dir, exist_ok=True)

    extracted = []
    for frame_idx in frames:
        if frame_idx < 0 or frame_idx >= total_frames:
            print(f"Warning: Frame {frame_idx} out of range, skipping", file=sys.stderr)
            continue

        img = Image.open(gif_path)
        try:
            img.seek(frame_idx)
        except EOFError:
            print(f"Warning: Cannot seek to frame {frame_idx}", file=sys.stderr)
            continue

        # Apply subtitle if provided
        if subtitles and frame_idx < len(subtitles) and subtitles[frame_idx]:
            subtitle_conf = subtitles[frame_idx]
            img = add_subtitle(
                img,
                text=subtitle_conf.get('text', ''),
                position=subtitle_conf.get('position', 'bottom'),
                font_size=subtitle_conf.get('font_size'),
                text_color=parse_color(subtitle_conf.get('color', 'black')),
                bg_color=parse_color(subtitle_conf['bg']) if subtitle_conf.get('bg') else None
            )

        ext = format.lower()
        output_path = os.path.join(output_dir, f"{prefix}_{frame_idx+1}.{ext}")

        if format.lower() == 'jpg':
            img = img.convert('RGB')

        img.save(output_path)
        extracted.append(output_path)
        print(f"Extracted: {output_path}")

    print(f"\nExtracted {len(extracted)} frames to: {output_dir}")
    return True


def list_frames(gif_path):
    """List all frame information of GIF"""
    if not os.path.exists(gif_path):
        print(f"Error: GIF not found: {gif_path}", file=sys.stderr)
        return False

    img = Image.open(gif_path)
    print(f"GIF: {gif_path}")
    print(f"Size: {img.size}")
    print(f"Mode: {img.mode}")

    frame_num = 0
    try:
        while True:
            print(f"Frame {frame_num}: {img.size} {img.mode}")
            frame_num += 1
            img.seek(frame_num)
    except EOFError:
        pass

    print(f"\nTotal frames: {frame_num}")
    return True


def main():
    parser = argparse.ArgumentParser(description='Extract frames from GIF')
    subparsers = parser.add_subparsers(dest='command', help='Subcommands')

    list_parser = subparsers.add_parser('list', help='List all frames of GIF')
    list_parser.add_argument('-i', '--input', required=True, help='Input GIF file path')
    list_parser.add_argument('-v', '--verbose', action='store_true', help='Verbose output')

    extract_parser = subparsers.add_parser('extract', help='Extract specified frames')
    extract_parser.add_argument('-i', '--input', required=True, help='Input GIF file path')
    extract_parser.add_argument('-o', '--output', required=True, help='Output directory')
    extract_parser.add_argument('-f', '--frames', type=str, help='Frame indices, comma-separated or dash for ranges, e.g., "0,2,5" or "0-5" or "1,3-7,10"')
    extract_parser.add_argument('--all', action='store_true', help='Extract all frames')
    extract_parser.add_argument('--format', default='png', choices=['png', 'jpg', 'gif'], help='Output format (default png)')
    extract_parser.add_argument('--prefix', default='frame', help='Output filename prefix (default frame)')
    extract_parser.add_argument('--subtitles', help='Subtitle configuration, format "text1;text2;text3" (semicolon-separated, corresponds to frames one-to-one)')
    extract_parser.add_argument('--subtitle-pos', default='bottom', choices=['top', 'bottom', 'center'], help='Subtitle position (default bottom)')
    extract_parser.add_argument('--subtitle-color', default='black', help='Subtitle color (default black)')
    extract_parser.add_argument('--subtitle-bg', default='none', help='Subtitle background color (default none transparent)')
    extract_parser.add_argument('--subtitle-size', type=int, help='Subtitle font size (optional, defaults to 6% of frame\'s shorter dimension if not specified)')
    extract_parser.add_argument('-v', '--verbose', action='store_true', help='Verbose output')

    args = parser.parse_args()

    if args.command == 'list':
        list_frames(args.input)
    elif args.command == 'extract':
        frames = None
        if args.all:
            frames = None
        elif args.frames:
            frames = []
            parts = args.frames.split(',')
            for part in parts:
                part = part.strip()
                if '-' in part:
                    start, end = map(int, part.split('-'))
                    frames.extend(range(start, end + 1))
                else:
                    frames.append(int(part))

        subtitles = None
        if args.subtitles:
            subtitles = parse_subtitles(args.subtitles)
            if args.verbose:
                print(f"Subtitles: {subtitles}")

            if subtitles and len(subtitles) < len(frames or []):
                # Estimate total frames if needed
                temp_img = Image.open(args.input)
                try:
                    temp_frames = 0
                    while True:
                        temp_frames += 1
                        temp_img.seek(temp_frames)
                except EOFError:
                    pass
                finally:
                    temp_img.close()

                while len(subtitles) < temp_frames:
                    subtitles.append(subtitles[-1] if subtitles else None)

        extract_frames(args.input, args.output, frames, args.format, args.prefix, subtitles)
    else:
        parser.print_help()


if __name__ == '__main__':
    main()