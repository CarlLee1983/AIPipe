#!/usr/bin/env python3
"""Prepare a generated chroma-key image as a project pixel asset.

The script wraps Codex's imagegen chroma-key remover, then crops the visible
alpha bounds, scales with nearest-neighbor sampling, places the subject on a
transparent canvas, and validates the final PNG.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image


def parse_size(value: str) -> tuple[int, int]:
    parts = value.lower().split("x", 1)
    if len(parts) != 2:
        raise argparse.ArgumentTypeError("size must use WIDTHxHEIGHT, e.g. 48x72")
    try:
        width = int(parts[0])
        height = int(parts[1])
    except ValueError as exc:
        raise argparse.ArgumentTypeError("size dimensions must be integers") from exc
    if width <= 0 or height <= 0:
        raise argparse.ArgumentTypeError("size dimensions must be positive")
    return width, height


def default_helper_path() -> Path:
    codex_home = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))
    return codex_home / "skills/.system/imagegen/scripts/remove_chroma_key.py"


def run_chroma_key_removal(input_path: Path, alpha_path: Path, helper_path: Path) -> None:
    if not helper_path.exists():
        raise FileNotFoundError(f"chroma-key helper not found: {helper_path}")
    command = [
        sys.executable,
        str(helper_path),
        "--input",
        str(input_path),
        "--out",
        str(alpha_path),
        "--auto-key",
        "border",
        "--soft-matte",
        "--transparent-threshold",
        "12",
        "--opaque-threshold",
        "220",
        "--despill",
    ]
    subprocess.run(command, check=True)


def crop_scale_place(alpha_path: Path, output_path: Path, size: tuple[int, int], padding: int) -> None:
    image = Image.open(alpha_path).convert("RGBA")
    alpha = image.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value > 16 else 0).getbbox()
    if bbox is None:
        raise ValueError(f"no visible alpha subject found in {alpha_path}")

    cropped = image.crop(bbox)
    target_width, target_height = size
    max_width = target_width - padding * 2
    max_height = target_height - padding * 2
    if max_width <= 0 or max_height <= 0:
        raise ValueError("padding leaves no room for the asset")

    scale = min(max_width / cropped.width, max_height / cropped.height)
    resized_size = (
        max(1, round(cropped.width * scale)),
        max(1, round(cropped.height * scale)),
    )
    resized = cropped.resize(resized_size, Image.Resampling.NEAREST)

    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    x = (target_width - resized_size[0]) // 2
    if target_height > target_width:
        y = target_height - resized_size[1] - padding
    else:
        y = (target_height - resized_size[1]) // 2
    canvas.alpha_composite(resized, (x, y))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output_path)


def validate_output(output_path: Path, expected_size: tuple[int, int]) -> int:
    image = Image.open(output_path).convert("RGBA")
    if image.size != expected_size:
        raise ValueError(f"{output_path} has size {image.size}, expected {expected_size}")

    width, height = image.size
    corners = [
        image.getpixel((0, 0))[3],
        image.getpixel((width - 1, 0))[3],
        image.getpixel((0, height - 1))[3],
        image.getpixel((width - 1, height - 1))[3],
    ]
    if any(corners):
        raise ValueError(f"{output_path} has non-transparent corners: {corners}")

    alpha_histogram = image.getchannel("A").histogram()
    visible_pixels = sum(alpha_histogram[1:])
    if visible_pixels == 0:
        raise ValueError(f"{output_path} has no visible pixels")
    return visible_pixels


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Convert a generated chroma-key PNG into a sized transparent pixel asset.",
    )
    parser.add_argument("--input", required=True, type=Path, help="Generated chroma-key PNG")
    parser.add_argument("--output", required=True, type=Path, help="Final transparent PNG")
    parser.add_argument("--size", required=True, type=parse_size, help="Final canvas size, e.g. 48x72")
    parser.add_argument("--padding", type=int, default=1, help="Transparent padding in pixels")
    parser.add_argument(
        "--helper",
        type=Path,
        default=default_helper_path(),
        help="Path to remove_chroma_key.py",
    )
    parser.add_argument(
        "--keep-intermediate",
        action="store_true",
        help="Keep the intermediate alpha PNG next to the output",
    )
    args = parser.parse_args()

    input_path = args.input.expanduser().resolve()
    output_path = args.output.expanduser().resolve()
    if not input_path.exists():
        parser.error(f"input does not exist: {input_path}")
    if args.padding < 0:
        parser.error("--padding must be zero or positive")

    with tempfile.TemporaryDirectory(prefix="aipipe-pixel-asset-") as temp_dir:
        alpha_path = output_path.with_name(f"{output_path.stem}-alpha.png")
        if not args.keep_intermediate:
            alpha_path = Path(temp_dir) / "alpha.png"

        run_chroma_key_removal(input_path, alpha_path, args.helper.expanduser().resolve())
        crop_scale_place(alpha_path, output_path, args.size, args.padding)
        visible_pixels = validate_output(output_path, args.size)

    print(f"Wrote {output_path}")
    print(f"Size: {args.size[0]}x{args.size[1]}")
    print(f"Visible alpha pixels: {visible_pixels}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
