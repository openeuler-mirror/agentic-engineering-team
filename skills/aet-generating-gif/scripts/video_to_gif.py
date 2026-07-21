#!/usr/bin/env python3
"""Convert video to GIF"""

import argparse
import os
import subprocess
import sys
import tempfile
from PIL import Image
import glob


def check_ffmpeg():
    """Check if ffmpeg is available"""
    try:
        result = subprocess.run(['ffmpeg', '-version'], capture_output=True, text=True)
        return result.returncode == 0
    except FileNotFoundError:
        return False


def extract_frames(video_path, output_dir, fps=15, start=0, duration=None):
    """Extract video frames using ffmpeg"""
    cmd = ['ffmpeg', '-i', video_path, '-vsync', '0']

    if start > 0:
        cmd.extend(['-ss', str(start)])

    if duration:
        cmd.extend(['-t', str(duration)])

    cmd.extend([
        '-vf', f'fps={fps}',
        os.path.join(output_dir, 'frame_%04d.png')
    ])

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

        if result.returncode != 0:
            print(f"ffmpeg error: {result.stderr}", file=sys.stderr)
            return None

        frames = sorted(glob.glob(os.path.join(output_dir, 'frame_*.png')))
        return frames

    except subprocess.TimeoutExpired:
        print("Error: ffmpeg timeout", file=sys.stderr)
        return None
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return None


def create_gif_from_frames(frame_paths, output_path, fps=15, loop=0, resize_width=None):
    """Combine frame images into GIF"""
    if not frame_paths:
        print("Error: No frames to process", file=sys.stderr)
        return False

    images = []
    target_size = None

    for path in frame_paths:
        try:
            img = Image.open(path)
            if img.mode != 'RGB':
                img = img.convert('RGB')

            if resize_width and img.width != resize_width:
                ratio = resize_width / img.width
                new_height = int(img.height * ratio)
                img = img.resize((resize_width, new_height), Image.Resampling.LANCZOS)

            images.append(img)
        except Exception as e:
            print(f"Warning: Failed to load {path}: {e}", file=sys.stderr)

    if not images:
        print("Error: No valid frames to process", file=sys.stderr)
        return False

    duration = 1000 // fps

    output_dir = os.path.dirname(output_path) or '.'
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

    print(f"GIF created: {output_path} ({len(images)} frames, {fps} fps)")
    return True


def video_to_gif(video_path, output_path, fps=15, start=0, duration=None, resize_width=None):
    """Convert video to GIF"""
    if not os.path.exists(video_path):
        print(f"Error: Video file not found: {video_path}", file=sys.stderr)
        return False

    if not check_ffmpeg():
        print("Error: ffmpeg not found. Please install ffmpeg.", file=sys.stderr)
        print("  Windows: Download from https://ffmpeg.org/download.html", file=sys.stderr)
        print("  macOS: brew install ffmpeg", file=sys.stderr)
        print("  Linux: sudo apt install ffmpeg", file=sys.stderr)
        return False

    temp_dir = tempfile.mkdtemp(prefix='video_to_gif_')
    try:
        print(f"Extracting frames from video...")
        frame_paths = extract_frames(video_path, temp_dir, fps=fps, start=start, duration=duration)

        if not frame_paths:
            print("Error: Failed to extract frames", file=sys.stderr)
            return False

        print(f"Extracted {len(frame_paths)} frames")

        success = create_gif_from_frames(frame_paths, output_path, fps=fps, resize_width=resize_width)

        return success

    finally:
        import shutil
        try:
            shutil.rmtree(temp_dir)
        except:
            pass


def main():
    parser = argparse.ArgumentParser(description='Convert video to GIF')
    parser.add_argument('-i', '--input', required=True, help='Input video file path')
    parser.add_argument('-o', '--output', required=True, help='Output GIF file path')
    parser.add_argument('--fps', type=int, default=15, help='Frame rate (default 15)')
    parser.add_argument('--start', type=float, default=0, help='Start time (seconds, default 0)')
    parser.add_argument('--duration', type=float, help='Duration (seconds, default entire video)')
    parser.add_argument('--width', type=int, help='Output width (pixels, automatic proportional scaling)')

    args = parser.parse_args()

    success = video_to_gif(
        args.input,
        args.output,
        fps=args.fps,
        start=args.start,
        duration=args.duration,
        resize_width=args.width
    )

    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()