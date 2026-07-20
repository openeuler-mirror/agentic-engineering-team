#!/usr/bin/env python3
"""Crop GIF animation, supporting rectangular cropping and shape masking"""

import argparse
import os
import sys
from PIL import Image, ImageDraw


def parse_aspect_ratio(ratio_str):
    """Parse aspect ratio string, such as '16:9', '4:3', '1:1'"""
    if ':' in ratio_str:
        parts = ratio_str.split(':')
        if len(parts) == 2:
            try:
                w, h = float(parts[0]), float(parts[1])
                return w / h
            except ValueError:
                pass
    elif '/' in ratio_str:
        parts = ratio_str.split('/')
        if len(parts) == 2:
            try:
                w, h = float(parts[0]), float(parts[1])
                return w / h
            except ValueError:
                pass
    elif 'x' in ratio_str:
        parts = ratio_str.split('x')
        if len(parts) == 2:
            try:
                w, h = float(parts[0]), float(parts[1])
                return w / h
            except ValueError:
                pass
    return None


def calculate_crop_box(width, height, target_ratio, position='center'):
    """Calculate crop box"""
    current_ratio = width / height

    if current_ratio > target_ratio:
        new_width = int(height * target_ratio)
        left = (width - new_width) // 2 if position == 'center' else (0 if position == 'left' else width - new_width)
        right = left + new_width
        top, bottom = 0, height
    else:
        new_height = int(width / target_ratio)
        top = (height - new_height) // 2 if position == 'center' else (0 if position == 'top' else height - new_height)
        bottom = top + new_height
        left, right = 0, width

    return (left, top, right, bottom)


def create_shape_mask(width, height, shape, bg_color='white', position='center'):
    """Create shape mask

    Args:
        width: Canvas width
        height: Canvas height
        shape: Shape type ('rectangle', 'circle', 'oval')
        bg_color: Background color ('white', 'black', 'transparent')
        position: Position ('center', 'left', 'right', 'top', 'bottom')

    Returns:
        Mask image
    """
    mask = Image.new('L', (width, height), 0)

    if shape == 'rectangle':
        mask = Image.new('L', (width, height), 255)
    else:
        if shape == 'circle':
            radius = min(width, height) // 2
            cx, cy = width // 2, height // 2
            x1 = cx - radius
            y1 = cy - radius
            x2 = cx + radius
            y2 = cy + radius
        elif shape == 'oval':
            x1, y1 = 0, 0
            x2, y2 = width, height

        draw = ImageDraw.Draw(mask)
        draw.ellipse([x1, y1, x2, y2], fill=255)

    return mask


def extract_all_frames(gif_path):
    """Extract all frames from GIF"""
    frames = []
    img = Image.open(gif_path)
    try:
        i = 0
        while True:
            frames.append(img.copy())
            i += 1
            img.seek(i)
    except EOFError:
        pass
    return frames


def get_gif_info(gif_path):
    """Get GIF information"""
    img = Image.open(gif_path)
    width, height = img.size

    frame_count = 0
    try:
        while True:
            frame_count += 1
            img.seek(frame_count)
    except EOFError:
        pass

    duration = img.info.get('duration', 100)

    return {
        'width': width,
        'height': height,
        'frames': frame_count,
        'duration': duration
    }


def crop_gif(input_path, output_path, ratio=None, size=None, shape=None, bg='white', position='center', fps=None):
    """Crop GIF

    Args:
        input_path: Input GIF path
        output_path: Output GIF path
        ratio: Target aspect ratio (e.g., '16:9', '4:3')
        size: Force size (e.g., '800x600')
        shape: Shape mask ('rectangle', 'circle', 'oval')
        bg: Background color ('white', 'black', 'transparent')
        position: Crop position
        fps: Frame rate
    """
    if not os.path.exists(input_path):
        print(f"Error: GIF not found: {input_path}", file=sys.stderr)
        return False

    info = get_gif_info(input_path)
    print(f"Input: {info['width']}x{info['height']}, {info['frames']} frames, duration={info['duration']}ms")

    frames = extract_all_frames(input_path)
    print(f"Extracted {len(frames)} frames")

    duration = 1000 // fps if fps else info['duration']

    if shape and shape != 'rectangle':
        cropped_frames = []
        for frame in frames:
            frame_rgb = frame.convert('RGB')

            if bg == 'transparent':
                output_img = Image.new('RGBA', (info['width'], info['height']), (0, 0, 0, 0))
            else:
                output_img = Image.new('RGB', (info['width'], info['height']), bg)

            mask = create_shape_mask(info['width'], info['height'], shape, bg)
            output_img.paste(frame_rgb, (0, 0), mask)
            cropped_frames.append(output_img)

        os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
        cropped_frames[0].save(
            output_path,
            save_all=True,
            append_images=cropped_frames[1:],
            duration=duration,
            loop=0,
            optimize=True
        )
        print(f"Output: {output_path} ({len(cropped_frames)} frames, {duration}ms/frame, shape={shape})")

    else:
        if size:
            target_width, target_height = map(int, size.split('x'))
            target_ratio = target_width / target_height
            left, top, right, bottom = calculate_crop_box(info['width'], info['height'], target_ratio, position)
        elif ratio:
            target_ratio = parse_aspect_ratio(ratio)
            if target_ratio is None:
                print(f"Error: Invalid ratio format: {ratio}", file=sys.stderr)
                return False
            left, top, right, bottom = calculate_crop_box(info['width'], info['height'], target_ratio, position)
        else:
            print("Error: Must specify either --ratio or --size", file=sys.stderr)
            return False

        print(f"Crop: ({left},{top})-({right},{bottom}) = {right-left}x{bottom-top}")

        cropped_frames = []
        for frame in frames:
            cropped = frame.crop((left, top, right, bottom))
            cropped_frames.append(cropped)

        os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
        cropped_frames[0].save(
            output_path,
            save_all=True,
            append_images=cropped_frames[1:],
            duration=duration,
            loop=0,
            optimize=True
        )
        print(f"Output: {output_path} ({len(cropped_frames)} frames, {duration}ms/frame)")

    return True


def main():
    parser = argparse.ArgumentParser(description='Crop GIF animation')
    parser.add_argument('-i', '--input', required=True, help='Input GIF file path')
    parser.add_argument('-o', '--output', required=True, help='Output GIF file path')
    parser.add_argument('--ratio', help='Target aspect ratio (e.g., 16:9, 4:3, 1:1)')
    parser.add_argument('--size', help='Force size (e.g., 800x600, will crop to this ratio)')
    parser.add_argument('--shape', choices=['rectangle', 'circle', 'oval'], help='Shape mask')
    parser.add_argument('--bg', default='white', choices=['white', 'black', 'transparent'], help='Background color (default white)')
    parser.add_argument('--position', default='center',
                        choices=['center', 'left', 'right', 'top', 'bottom'],
                        help='Crop position (default center)')
    parser.add_argument('--fps', type=int, help='Frame rate (default uses original GIF frame rate)')

    args = parser.parse_args()

    if not args.ratio and not args.size and not args.shape:
        print("Error: Must specify --ratio, --size, or --shape", file=sys.stderr)
        sys.exit(1)

    success = crop_gif(
        args.input,
        args.output,
        ratio=args.ratio,
        size=args.size,
        shape=args.shape,
        bg=args.bg,
        position=args.position,
        fps=args.fps
    )

    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()