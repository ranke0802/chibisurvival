#!/usr/bin/env python3
from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path
from typing import Dict

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent.parent
ASSET_DIR = ROOT / "public" / "assets" / "characters"

COLS = 8
ROWS = 3  # idle / walk / attack
FRAME_W = 200
FRAME_H = 320
GROUND_PAD = 16


@dataclass(frozen=True)
class MotionSpec:
  key: str
  source_name: str
  target_name: str
  target_height_ratio: float
  walk_stride: float
  walk_lift: float
  arm_swing: float


@dataclass
class Part:
  image: Image.Image
  x: int
  y: int


SPECS = [
  MotionSpec(
    key="mage",
    source_name="mage.png",
    target_name="mage_motion_sheet.png",
    target_height_ratio=0.8,
    walk_stride=7.0,
    walk_lift=8.5,
    arm_swing=6.0,
  ),
  MotionSpec(
    key="warrior",
    source_name="warrior.png",
    target_name="warrior_motion_sheet.png",
    target_height_ratio=0.82,
    walk_stride=8.0,
    walk_lift=9.5,
    arm_swing=7.2,
  ),
  MotionSpec(
    key="archer",
    source_name="archer.png",
    target_name="archer_motion_sheet.png",
    target_height_ratio=0.8,
    walk_stride=8.6,
    walk_lift=8.2,
    arm_swing=9.0,
  ),
]


def trim_alpha(image: Image.Image) -> Image.Image:
  alpha = image.split()[-1]
  bbox = alpha.getbbox()
  if not bbox:
    raise RuntimeError("sprite has no visible pixels")
  return image.crop(bbox)


def rect_from_ratio(w: int, h: int, x0: float, y0: float, x1: float, y1: float) -> tuple[int, int, int, int]:
  return (
    int(round(w * x0)),
    int(round(h * y0)),
    int(round(w * x1)),
    int(round(h * y1)),
  )


def extract_part(image: Image.Image, rect: tuple[int, int, int, int]) -> Part:
  mask = Image.new("L", image.size, 0)
  draw = ImageDraw.Draw(mask)
  draw.rectangle(rect, fill=255)
  layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
  layer.paste(image, (0, 0), mask=mask)
  bbox = layer.getbbox()
  if not bbox:
    return Part(Image.new("RGBA", (1, 1), (0, 0, 0, 0)), rect[0], rect[1])
  return Part(layer.crop(bbox), bbox[0], bbox[1])


def build_parts(base: Image.Image) -> Dict[str, Part]:
  w, h = base.size
  head_r = rect_from_ratio(w, h, 0.2, 0.0, 0.8, 0.34)
  arm_l_r = rect_from_ratio(w, h, 0.0, 0.31, 0.36, 0.72)
  arm_r_r = rect_from_ratio(w, h, 0.64, 0.31, 1.0, 0.72)
  leg_l_r = rect_from_ratio(w, h, 0.16, 0.61, 0.5, 1.0)
  leg_r_r = rect_from_ratio(w, h, 0.5, 0.61, 0.84, 1.0)
  torso_r = rect_from_ratio(w, h, 0.24, 0.3, 0.76, 0.73)

  # core = full sprite minus major moving parts
  alpha = base.split()[-1].copy()
  erase = ImageDraw.Draw(alpha)
  for r in (head_r, arm_l_r, arm_r_r, leg_l_r, leg_r_r):
    erase.rectangle(r, fill=0)
  core_layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
  core_layer.paste(base, (0, 0), mask=alpha)
  core_box = core_layer.getbbox()
  if core_box:
    core = Part(core_layer.crop(core_box), core_box[0], core_box[1])
  else:
    core = extract_part(base, torso_r)

  return {
    "core": core,
    "head": extract_part(base, head_r),
    "arm_l": extract_part(base, arm_l_r),
    "arm_r": extract_part(base, arm_r_r),
    "leg_l": extract_part(base, leg_l_r),
    "leg_r": extract_part(base, leg_r_r),
  }


def paste_part(frame: Image.Image, part: Part, bx: int, by: int, dx: float, dy: float) -> None:
  x = int(round(bx + part.x + dx))
  y = int(round(by + part.y + dy))
  frame.alpha_composite(part.image, (x, y))


def idle_offsets(frame_idx: int) -> Dict[str, tuple[float, float]]:
  a = (frame_idx / COLS) * math.pi * 2
  breathe = math.sin(a)
  return {
    "core": (0, -0.8 * breathe),
    "head": (0.4 * breathe, -1.2 * breathe),
    "arm_l": (0.8 * breathe, -0.2 * breathe),
    "arm_r": (-0.8 * breathe, -0.2 * breathe),
    "leg_l": (0, 0),
    "leg_r": (0, 0),
  }


def walk_offsets(spec: MotionSpec, frame_idx: int) -> Dict[str, tuple[float, float]]:
  a = (frame_idx / COLS) * math.pi * 2
  step = math.sin(a)
  lift = abs(step)
  lift_l = max(0.0, step)
  lift_r = max(0.0, -step)
  return {
    "core": (step * spec.walk_stride * 0.26, -lift * 2.1),
    "head": (step * spec.walk_stride * 0.2, -lift * 1.4),
    "arm_l": (step * spec.arm_swing, -lift_r * 2.4),
    "arm_r": (-step * spec.arm_swing, -lift_l * 2.4),
    "leg_l": (-step * spec.walk_stride, -lift_l * spec.walk_lift),
    "leg_r": (step * spec.walk_stride, -lift_r * spec.walk_lift),
  }


def attack_offsets(spec: MotionSpec, frame_idx: int) -> Dict[str, tuple[float, float]]:
  # Explicit key poses for clear attack readability.
  if spec.key == "warrior":
    table = [
      {"core": (-2, 0), "head": (-1, 0), "arm_l": (2, 0), "arm_r": (-8, -2), "leg_l": (-1, 0), "leg_r": (1, 0)},
      {"core": (-4, -1), "head": (-2, -1), "arm_l": (3, 0), "arm_r": (-12, -4), "leg_l": (-2, 0), "leg_r": (2, -1)},
      {"core": (-6, -2), "head": (-3, -2), "arm_l": (4, -1), "arm_r": (-16, -7), "leg_l": (-2, 0), "leg_r": (3, -2)},
      {"core": (2, -1), "head": (1, -1), "arm_l": (0, -1), "arm_r": (4, -8), "leg_l": (-3, -2), "leg_r": (6, 0)},
      {"core": (8, -2), "head": (3, -1), "arm_l": (-2, -1), "arm_r": (14, -4), "leg_l": (-6, -1), "leg_r": (10, -2)},
      {"core": (5, -1), "head": (2, -1), "arm_l": (-1, 0), "arm_r": (9, -2), "leg_l": (-4, 0), "leg_r": (7, -1)},
      {"core": (2, 0), "head": (1, 0), "arm_l": (0, 0), "arm_r": (4, -1), "leg_l": (-2, 0), "leg_r": (3, 0)},
      {"core": (0, 0), "head": (0, 0), "arm_l": (0, 0), "arm_r": (0, 0), "leg_l": (0, 0), "leg_r": (0, 0)},
    ]
    return table[frame_idx]

  if spec.key == "archer":
    table = [
      {"core": (-1, 0), "head": (-1, 0), "arm_l": (4, -1), "arm_r": (-6, 0), "leg_l": (0, 0), "leg_r": (0, 0)},
      {"core": (-2, -1), "head": (-1, -1), "arm_l": (7, -2), "arm_r": (-10, -1), "leg_l": (-1, 0), "leg_r": (1, 0)},
      {"core": (-4, -2), "head": (-2, -2), "arm_l": (10, -3), "arm_r": (-14, -2), "leg_l": (-2, 0), "leg_r": (2, -1)},
      {"core": (-6, -2), "head": (-3, -2), "arm_l": (12, -4), "arm_r": (-18, -3), "leg_l": (-2, 0), "leg_r": (2, -1)},
      {"core": (1, -1), "head": (0, -1), "arm_l": (2, -1), "arm_r": (-4, -1), "leg_l": (-1, -1), "leg_r": (3, 0)},
      {"core": (4, -1), "head": (1, -1), "arm_l": (-1, 0), "arm_r": (0, 0), "leg_l": (-2, 0), "leg_r": (4, -1)},
      {"core": (2, 0), "head": (1, 0), "arm_l": (0, 0), "arm_r": (0, 0), "leg_l": (-1, 0), "leg_r": (2, 0)},
      {"core": (0, 0), "head": (0, 0), "arm_l": (0, 0), "arm_r": (0, 0), "leg_l": (0, 0), "leg_r": (0, 0)},
    ]
    return table[frame_idx]

  # mage
  table = [
    {"core": (-1, 0), "head": (-1, 0), "arm_l": (3, -1), "arm_r": (-3, 0), "leg_l": (0, 0), "leg_r": (0, 0)},
    {"core": (-2, -1), "head": (-1, -1), "arm_l": (6, -4), "arm_r": (-6, -2), "leg_l": (-1, 0), "leg_r": (1, 0)},
    {"core": (-3, -2), "head": (-2, -2), "arm_l": (8, -8), "arm_r": (-8, -4), "leg_l": (-1, 0), "leg_r": (1, -1)},
    {"core": (-1, -3), "head": (-1, -3), "arm_l": (10, -10), "arm_r": (-10, -5), "leg_l": (-1, -1), "leg_r": (1, -1)},
    {"core": (2, -2), "head": (1, -2), "arm_l": (5, -6), "arm_r": (-5, -3), "leg_l": (-2, 0), "leg_r": (2, -1)},
    {"core": (4, -1), "head": (2, -1), "arm_l": (2, -3), "arm_r": (-2, -1), "leg_l": (-2, 0), "leg_r": (3, -1)},
    {"core": (2, 0), "head": (1, 0), "arm_l": (1, -1), "arm_r": (-1, 0), "leg_l": (-1, 0), "leg_r": (1, 0)},
    {"core": (0, 0), "head": (0, 0), "arm_l": (0, 0), "arm_r": (0, 0), "leg_l": (0, 0), "leg_r": (0, 0)},
  ]
  return table[frame_idx]


def draw_walk_dust(frame: Image.Image, frame_idx: int, bx: int, by: int, base_h: int) -> None:
  if frame_idx % 2 == 0:
    return
  draw = ImageDraw.Draw(frame, "RGBA")
  y = by + base_h - 2
  draw.ellipse((bx + 58, y - 4, bx + 74, y + 3), fill=(255, 255, 255, 40))
  draw.ellipse((bx + 126, y - 5, bx + 142, y + 2), fill=(255, 255, 255, 36))


def draw_attack_fx(frame: Image.Image, spec: MotionSpec, frame_idx: int, bx: int, by: int, base_h: int) -> None:
  draw = ImageDraw.Draw(frame, "RGBA")
  phase = frame_idx / (COLS - 1)

  if spec.key == "warrior":
    if phase < 0.25 or phase > 0.82:
      return
    radius = int(56 + phase * 40)
    cx = bx + FRAME_W // 2 + int(phase * 14)
    cy = by + int(base_h * 0.42)
    draw.arc((cx - radius, cy - radius, cx + radius, cy + radius), -35, 64, fill=(255, 226, 170, 230), width=6)
    draw.arc((cx - radius + 4, cy - radius + 4, cx + radius - 4, cy + radius - 4), -30, 58, fill=(255, 255, 246, 190), width=3)
    return

  if spec.key == "archer":
    if phase < 0.34 or phase > 0.96:
      return
    ox = bx + FRAME_W // 2 + 24
    oy = by + int(base_h * 0.36)
    length = int(40 + (phase - 0.34) * 240)
    tx = ox + length
    ty = oy - int((phase - 0.34) * 12)
    draw.line((ox, oy, tx, ty), fill=(255, 245, 194, 240), width=3)
    draw.line((ox - 3, oy + 1, tx - 3, ty + 1), fill=(165, 236, 255, 175), width=1)
    draw.polygon([(tx, ty), (tx - 9, ty - 3), (tx - 9, ty + 3)], fill=(255, 239, 192, 225))
    return

  # mage
  if phase < 0.2:
    return
  cx = bx + FRAME_W // 2 + int(26 + phase * 26)
  cy = by + int(base_h * 0.24) - int(phase * 10)
  r = int(8 + phase * 9)
  draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(157, 236, 255, 186))
  draw.ellipse((cx - r + 3, cy - r + 3, cx + r - 3, cy + r - 3), fill=(236, 251, 255, 210))
  if phase > 0.58:
    tx = cx + int((phase - 0.58) * 150)
    draw.line((cx, cy, tx, cy - 2), fill=(193, 244, 255, 185), width=2)


def build_sheet(spec: MotionSpec) -> Image.Image:
  src = Image.open(ASSET_DIR / spec.source_name).convert("RGBA")
  base = trim_alpha(src)

  target_h = int(FRAME_H * spec.target_height_ratio)
  base_scale = target_h / base.height
  normalized = base.resize(
    (max(1, int(round(base.width * base_scale))), max(1, int(round(base.height * base_scale)))),
    Image.Resampling.NEAREST,
  )
  parts = build_parts(normalized)

  base_x = (FRAME_W - normalized.width) // 2
  base_y = FRAME_H - normalized.height - GROUND_PAD

  sheet = Image.new("RGBA", (FRAME_W * COLS, FRAME_H * ROWS), (0, 0, 0, 0))
  draw_order = ("leg_l", "leg_r", "core", "head", "arm_l", "arm_r")

  for row in range(ROWS):
    for i in range(COLS):
      if row == 0:
        offsets = idle_offsets(i)
      elif row == 1:
        offsets = walk_offsets(spec, i)
      else:
        offsets = attack_offsets(spec, i)

      frame = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
      for name in draw_order:
        part = parts[name]
        dx, dy = offsets[name]
        paste_part(frame, part, base_x, base_y, dx, dy)

      if row == 1:
        draw_walk_dust(frame, i, base_x, base_y, normalized.height)
      if row == 2:
        draw_attack_fx(frame, spec, i, base_x, base_y, normalized.height)

      sheet.alpha_composite(frame, (i * FRAME_W, row * FRAME_H))

  return sheet


def main() -> None:
  for spec in SPECS:
    out = ASSET_DIR / spec.target_name
    sheet = build_sheet(spec)
    sheet.save(out)
    print(f"generated: {out} {sheet.size}")


if __name__ == "__main__":
  main()
