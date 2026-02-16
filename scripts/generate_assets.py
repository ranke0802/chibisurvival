from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Tuple

import numpy as np
from PIL import Image, ImageDraw

ASSET_ROOT = Path('public/assets')
CHAR_ROOT = ASSET_ROOT / 'characters'
MON_ROOT = ASSET_ROOT / 'monsters'
BOSS_ROOT = ASSET_ROOT / 'bosses'
BG_ROOT = ASSET_ROOT / 'backgrounds'

BASE_SIZE = 64
SCALE = 4
OUT_SIZE = BASE_SIZE * SCALE
BG_SIZE = 1024

Color = Tuple[int, int, int, int]


@dataclass(frozen=True)
class Palette:
    outline: Color = (58, 42, 64, 255)
    skin: Color = (241, 221, 209, 255)
    skin_shadow: Color = (213, 191, 183, 255)
    eye_white: Color = (254, 250, 247, 255)
    eye_dark: Color = (54, 44, 60, 255)
    blush: Color = (224, 152, 160, 220)
    hair_red: Color = (181, 82, 92, 255)
    hair_red_shadow: Color = (137, 62, 70, 255)
    leather: Color = (139, 94, 78, 255)
    leather_dark: Color = (103, 68, 55, 255)
    boot_dark: Color = (80, 65, 98, 255)


P = Palette()


def ensure_dirs() -> None:
    CHAR_ROOT.mkdir(parents=True, exist_ok=True)
    MON_ROOT.mkdir(parents=True, exist_ok=True)
    BOSS_ROOT.mkdir(parents=True, exist_ok=True)
    BG_ROOT.mkdir(parents=True, exist_ok=True)


def new_canvas() -> Image.Image:
    return Image.new('RGBA', (BASE_SIZE, BASE_SIZE), (0, 0, 0, 0))


def upscaled(img: Image.Image) -> Image.Image:
    return img.resize((OUT_SIZE, OUT_SIZE), Image.Resampling.NEAREST)


def outline_pass(img: Image.Image, color: Color = P.outline) -> Image.Image:
    src = img.copy()
    dst = img.copy()
    px = src.load()
    out = dst.load()

    for y in range(BASE_SIZE):
        for x in range(BASE_SIZE):
            if px[x, y][3] == 0:
                continue
            for ox, oy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nx, ny = x + ox, y + oy
                if 0 <= nx < BASE_SIZE and 0 <= ny < BASE_SIZE and px[nx, ny][3] == 0:
                    out[nx, ny] = color
    return dst


def draw_shadow(d: ImageDraw.ImageDraw) -> None:
    d.ellipse((16, 52, 48, 60), fill=(10, 8, 14, 80))


def draw_bunny_clip(d: ImageDraw.ImageDraw, x: int, y: int) -> None:
    d.ellipse((x, y, x + 6, y + 5), fill=(248, 243, 238, 255), outline=P.outline)
    d.ellipse((x + 1, y - 4, x + 3, y + 1), fill=(248, 243, 238, 255), outline=P.outline)
    d.ellipse((x + 4, y - 4, x + 6, y + 1), fill=(248, 243, 238, 255), outline=P.outline)


def draw_chibi_character(
    name: str,
    robe_main: Color,
    robe_shadow: Color,
    accent: Color,
    weapon: str,
    hat_main: Color,
    hat_shadow: Color,
    hair_main: Color,
    hair_shadow: Color,
) -> None:
    img = new_canvas()
    d = ImageDraw.Draw(img)

    draw_shadow(d)

    d.rectangle((24, 46, 30, 56), fill=P.boot_dark)
    d.rectangle((34, 46, 40, 56), fill=P.boot_dark)
    d.rectangle((24, 54, 31, 58), fill=(66, 53, 83, 255))
    d.rectangle((33, 54, 40, 58), fill=(66, 53, 83, 255))

    d.polygon([(21, 28), (43, 28), (46, 46), (18, 46)], fill=robe_main)
    d.rectangle((21, 38, 43, 46), fill=robe_shadow)
    d.rectangle((28, 30, 36, 40), fill=accent)

    d.polygon([(18, 33), (22, 31), (24, 42), (19, 44)], fill=robe_shadow)
    d.polygon([(46, 33), (42, 31), (40, 42), (45, 44)], fill=robe_shadow)

    d.rounded_rectangle((26, 35, 39, 47), radius=3, fill=P.leather, outline=P.outline)
    d.arc((24, 31, 41, 43), start=190, end=350, fill=P.leather_dark, width=1)
    d.rectangle((31, 39, 34, 42), fill=(188, 142, 92, 255))

    d.ellipse((19, 13, 45, 37), fill=P.skin)
    d.polygon([(19, 25), (45, 25), (45, 37), (19, 37)], fill=P.skin_shadow)

    d.polygon([(19, 15), (45, 15), (44, 27), (20, 27)], fill=hair_main)
    d.polygon([(19, 26), (23, 24), (23, 36), (19, 35)], fill=hair_shadow)
    d.polygon([(45, 26), (41, 24), (41, 36), (45, 35)], fill=hair_shadow)

    d.polygon([(15, 14), (49, 14), (44, 21), (20, 21)], fill=hat_shadow)
    d.polygon([(20, 2), (44, 2), (38, 14), (24, 14)], fill=hat_main)
    d.polygon([(24, 6), (40, 6), (36, 13), (27, 13)], fill=hat_shadow)
    d.rectangle((20, 15, 44, 17), fill=(160, 106, 86, 255))

    draw_bunny_clip(d, 40, 1)

    d.ellipse((25, 22, 29, 26), fill=P.eye_white)
    d.ellipse((35, 22, 39, 26), fill=P.eye_white)
    d.rectangle((26, 23, 28, 25), fill=P.eye_dark)
    d.rectangle((36, 23, 38, 25), fill=P.eye_dark)
    d.rectangle((31, 27, 33, 28), fill=(161, 84, 86, 255))
    d.rectangle((23, 27, 25, 28), fill=P.blush)
    d.rectangle((39, 27, 41, 28), fill=P.blush)

    if weapon == 'sword':
        d.polygon([(44, 33), (52, 25), (54, 27), (46, 35)], fill=(232, 236, 243, 255))
        d.rectangle((43, 35, 47, 37), fill=(212, 170, 103, 255))
    elif weapon == 'staff':
        d.rectangle((45, 25, 47, 40), fill=(132, 93, 70, 255))
        d.ellipse((43, 22, 49, 28), fill=accent)
    elif weapon == 'bow':
        d.arc((43, 24, 54, 40), start=250, end=80, fill=(168, 194, 118, 255), width=2)
        d.line((49, 25, 49, 39), fill=(230, 232, 238, 255), width=1)

    img = outline_pass(img)
    upscaled(img).save(CHAR_ROOT / f'{name}.png')


def draw_slime(name: str, body: Color, shade: Color) -> None:
    img = new_canvas()
    d = ImageDraw.Draw(img)
    draw_shadow(d)
    d.polygon([(18, 46), (20, 33), (30, 26), (36, 25), (45, 32), (47, 46), (42, 51), (24, 51)], fill=body)
    d.polygon([(20, 43), (46, 43), (42, 50), (24, 50)], fill=shade)
    d.rectangle((26, 35, 28, 37), fill=P.eye_white)
    d.rectangle((35, 35, 37, 37), fill=P.eye_white)
    d.point((27, 36), fill=P.eye_dark)
    d.point((36, 36), fill=P.eye_dark)
    d.arc((26, 39, 38, 44), start=5, end=175, fill=(66, 102, 72, 255), width=1)
    d.ellipse((23, 31, 26, 33), fill=(232, 255, 238, 130))
    img = outline_pass(img)
    upscaled(img).save(MON_ROOT / f'{name}.png')


def draw_bat(name: str, body: Color, wing: Color) -> None:
    img = new_canvas()
    d = ImageDraw.Draw(img)
    draw_shadow(d)
    d.polygon([(10, 40), (22, 30), (28, 34), (32, 30), (46, 40), (37, 44), (32, 47), (24, 44)], fill=wing)
    d.polygon([(24, 30), (32, 28), (40, 33), (38, 43), (26, 43)], fill=body)
    d.polygon([(27, 30), (29, 26), (31, 30)], fill=body)
    d.polygon([(33, 30), (35, 26), (37, 30)], fill=body)
    d.rectangle((29, 35, 30, 36), fill=P.eye_white)
    d.rectangle((34, 35, 35, 36), fill=P.eye_white)
    d.rectangle((31, 39, 33, 40), fill=(98, 57, 75, 255))
    img = outline_pass(img)
    upscaled(img).save(MON_ROOT / f'{name}.png')


def draw_skeleton(name: str) -> None:
    img = new_canvas()
    d = ImageDraw.Draw(img)
    draw_shadow(d)
    bone = (226, 214, 201, 255)
    bone_dark = (190, 173, 160, 255)
    d.ellipse((21, 18, 43, 38), fill=bone)
    d.rectangle((28, 37, 36, 49), fill=bone)
    d.rectangle((24, 41, 40, 44), fill=bone_dark)
    d.rectangle((22, 48, 27, 57), fill=bone_dark)
    d.rectangle((37, 48, 42, 57), fill=bone_dark)
    d.rectangle((27, 27, 31, 30), fill=P.eye_dark)
    d.rectangle((33, 27, 37, 30), fill=P.eye_dark)
    d.rectangle((29, 33, 35, 34), fill=(132, 104, 94, 255))
    img = outline_pass(img)
    upscaled(img).save(MON_ROOT / f'{name}.png')


def draw_scorpion(name: str) -> None:
    img = new_canvas()
    d = ImageDraw.Draw(img)
    draw_shadow(d)
    body = (202, 146, 77, 255)
    shade = (151, 101, 49, 255)
    d.rounded_rectangle((20, 30, 44, 46), radius=6, fill=body)
    d.polygon([(20, 36), (11, 30), (14, 40)], fill=shade)
    d.polygon([(44, 36), (53, 30), (50, 40)], fill=shade)
    d.arc((30, 21, 56, 49), start=282, end=20, fill=shade, width=3)
    d.polygon([(49, 20), (54, 17), (52, 24)], fill=shade)
    d.point((30, 35), fill=P.eye_dark)
    d.point((35, 35), fill=P.eye_dark)
    d.line((25, 46, 21, 52), fill=shade, width=2)
    d.line((39, 46, 43, 52), fill=shade, width=2)
    img = outline_pass(img)
    upscaled(img).save(MON_ROOT / f'{name}.png')


def draw_mummy(name: str) -> None:
    img = new_canvas()
    d = ImageDraw.Draw(img)
    draw_shadow(d)
    body = (203, 186, 146, 255)
    stripe = (169, 152, 118, 255)
    d.rounded_rectangle((22, 20, 42, 50), radius=6, fill=body)
    for y in range(24, 50, 4):
        d.line((23, y, 41, y + 1), fill=stripe, width=1)
    d.rectangle((26, 30, 30, 33), fill=P.eye_dark)
    d.rectangle((34, 30, 38, 33), fill=P.eye_dark)
    d.rectangle((26, 45, 30, 57), fill=stripe)
    d.rectangle((34, 45, 38, 57), fill=stripe)
    img = outline_pass(img)
    upscaled(img).save(MON_ROOT / f'{name}.png')


def draw_flame(name: str) -> None:
    img = new_canvas()
    d = ImageDraw.Draw(img)
    draw_shadow(d)
    outer = (241, 118, 78, 255)
    mid = (246, 158, 93, 255)
    inner = (252, 210, 120, 255)
    d.polygon([(32, 15), (43, 29), (39, 46), (32, 52), (25, 46), (21, 29)], fill=outer)
    d.polygon([(32, 22), (39, 32), (36, 43), (32, 47), (28, 43), (25, 32)], fill=mid)
    d.polygon([(32, 27), (36, 34), (34, 40), (32, 42), (30, 40), (28, 34)], fill=inner)
    d.rectangle((29, 33, 30, 34), fill=P.eye_dark)
    d.rectangle((34, 33, 35, 34), fill=P.eye_dark)
    img = outline_pass(img)
    upscaled(img).save(MON_ROOT / f'{name}.png')


def draw_boss(name: str, main: Color, shade: Color, horn: Color, accent: Color) -> None:
    img = new_canvas()
    d = ImageDraw.Draw(img)
    d.ellipse((10, 52, 54, 62), fill=(10, 8, 14, 90))
    d.ellipse((10, 12, 54, 56), fill=main)
    d.polygon([(20, 19), (26, 5), (31, 20)], fill=horn)
    d.polygon([(44, 19), (38, 5), (33, 20)], fill=horn)
    d.polygon([(14, 34), (50, 34), (46, 52), (18, 52)], fill=shade)
    d.rectangle((22, 28, 28, 33), fill=P.eye_white)
    d.rectangle((36, 28, 42, 33), fill=P.eye_white)
    d.rectangle((24, 30, 27, 32), fill=P.eye_dark)
    d.rectangle((38, 30, 41, 32), fill=P.eye_dark)
    d.rectangle((27, 40, 37, 43), fill=P.eye_dark)
    d.rectangle((20, 22, 44, 24), fill=accent)
    for x in (18, 46):
        d.rectangle((x, 45, x + 3, 57), fill=shade)
    img = outline_pass(img)
    upscaled(img).save(BOSS_ROOT / f'{name}.png')


def lerp(a: int, b: int, t: float) -> int:
    return int(a + (b - a) * t)


def gradient_image(width: int, height: int, top: Tuple[int, int, int], bottom: Tuple[int, int, int]) -> Image.Image:
    arr = np.zeros((height, width, 3), dtype=np.uint8)
    for y in range(height):
        t = y / max(1, height - 1)
        arr[y, :, 0] = lerp(top[0], bottom[0], t)
        arr[y, :, 1] = lerp(top[1], bottom[1], t)
        arr[y, :, 2] = lerp(top[2], bottom[2], t)
    return Image.fromarray(arr).convert('RGBA')


def add_noise_rgba(img: Image.Image, amount: int) -> Image.Image:
    arr = np.array(img, dtype=np.int16)
    noise = np.random.randint(-amount, amount + 1, arr.shape, dtype=np.int16)
    noise[:, :, 3] = 0
    arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
    return Image.fromarray(arr)


def draw_forest_background() -> None:
    img = gradient_image(BG_SIZE, BG_SIZE, (22, 60, 44), (10, 35, 30))
    d = ImageDraw.Draw(img, 'RGBA')

    for _ in range(550):
        x = np.random.randint(0, BG_SIZE)
        y = np.random.randint(0, BG_SIZE)
        r = np.random.randint(6, 26)
        color = (28, np.random.randint(88, 145), np.random.randint(60, 94), np.random.randint(35, 90))
        d.ellipse((x - r, y - r, x + r, y + r), fill=color)

    for _ in range(120):
        x = np.random.randint(0, BG_SIZE)
        y = np.random.randint(0, BG_SIZE)
        d.rectangle((x - 1, y - 5, x + 1, y + 6), fill=(132, 97, 68, 150))
        d.ellipse((x - 4, y - 8, x + 4, y - 1), fill=(80, 140, 94, 160))

    img = add_noise_rgba(img, 8)
    img.save(BG_ROOT / 'stage_1.png')


def draw_cave_background() -> None:
    img = gradient_image(BG_SIZE, BG_SIZE, (32, 36, 54), (18, 22, 34))
    d = ImageDraw.Draw(img, 'RGBA')

    for _ in range(280):
        x = np.random.randint(0, BG_SIZE)
        y = np.random.randint(0, BG_SIZE)
        w = np.random.randint(26, 90)
        h = np.random.randint(16, 62)
        col = np.random.randint(42, 86)
        d.polygon(
            [(x, y - h // 2), (x + w // 2, y), (x, y + h // 2), (x - w // 2, y)],
            fill=(col, col + 8, col + 14, 55),
        )

    for _ in range(120):
        x = np.random.randint(0, BG_SIZE)
        y = np.random.randint(0, BG_SIZE)
        d.polygon(
            [(x, y - 12), (x + 7, y), (x, y + 13), (x - 7, y)],
            fill=(131, 173, 244, 120),
        )

    img = add_noise_rgba(img, 10)
    img.save(BG_ROOT / 'stage_2.png')


def draw_desert_background() -> None:
    img = gradient_image(BG_SIZE, BG_SIZE, (150, 118, 76), (98, 70, 45))
    d = ImageDraw.Draw(img, 'RGBA')

    for i in range(18):
        y = int((i + 0.5) * BG_SIZE / 18)
        wave = np.random.randint(18, 44)
        points = []
        for x in range(0, BG_SIZE + 80, 80):
            points.append((x, y + int(np.sin((x / 130) + i) * wave)))
        points += [(BG_SIZE, BG_SIZE), (0, BG_SIZE)]
        col = (176 + i % 4 * 4, 136 + i % 3 * 4, 86 + i % 2 * 4, 60)
        d.polygon(points, fill=col)

    for _ in range(220):
        x = np.random.randint(0, BG_SIZE)
        y = np.random.randint(0, BG_SIZE)
        d.ellipse((x - 1, y - 1, x + 1, y + 1), fill=(255, 228, 170, 80))

    img = add_noise_rgba(img, 9)
    img.save(BG_ROOT / 'stage_3.png')


def draw_lava_background() -> None:
    img = gradient_image(BG_SIZE, BG_SIZE, (68, 28, 30), (36, 12, 14))
    d = ImageDraw.Draw(img, 'RGBA')

    for _ in range(32):
        x = np.random.randint(0, BG_SIZE)
        y = np.random.randint(0, BG_SIZE)
        points = [(x, y)]
        for _ in range(6):
            x += np.random.randint(-80, 80)
            y += np.random.randint(-80, 80)
            points.append((x, y))
        d.line(points, fill=(255, 110, 70, 170), width=np.random.randint(2, 5))
        d.line(points, fill=(255, 192, 92, 110), width=1)

    for _ in range(280):
        x = np.random.randint(0, BG_SIZE)
        y = np.random.randint(0, BG_SIZE)
        r = np.random.randint(8, 24)
        d.ellipse((x - r, y - r, x + r, y + r), fill=(89, 33, 35, np.random.randint(35, 80)))

    img = add_noise_rgba(img, 12)
    img.save(BG_ROOT / 'stage_4.png')


def draw_castle_background() -> None:
    img = gradient_image(BG_SIZE, BG_SIZE, (46, 42, 64), (28, 24, 40))
    d = ImageDraw.Draw(img, 'RGBA')

    tile = 64
    for y in range(0, BG_SIZE, tile):
        for x in range(0, BG_SIZE, tile):
            base = (66, 61, 84, 90) if (x // tile + y // tile) % 2 == 0 else (53, 49, 70, 90)
            d.rectangle((x, y, x + tile - 2, y + tile - 2), fill=base)

    for _ in range(90):
        x = np.random.randint(40, BG_SIZE - 40)
        y = np.random.randint(40, BG_SIZE - 40)
        d.ellipse((x - 12, y - 12, x + 12, y + 12), fill=(255, 206, 120, 28))
        d.ellipse((x - 3, y - 3, x + 3, y + 3), fill=(255, 235, 188, 90))

    img = add_noise_rgba(img, 7)
    img.save(BG_ROOT / 'stage_5.png')


def generate_backgrounds() -> None:
    draw_forest_background()
    draw_cave_background()
    draw_desert_background()
    draw_lava_background()
    draw_castle_background()


def main() -> None:
    ensure_dirs()

    draw_chibi_character(
        'warrior',
        robe_main=(168, 90, 102, 255),
        robe_shadow=(127, 66, 79, 255),
        accent=(228, 189, 115, 255),
        weapon='sword',
        hat_main=(146, 111, 154, 255),
        hat_shadow=(101, 78, 114, 255),
        hair_main=(177, 87, 92, 255),
        hair_shadow=(138, 63, 73, 255),
    )
    draw_chibi_character(
        'mage',
        robe_main=(143, 111, 151, 255),
        robe_shadow=(98, 78, 112, 255),
        accent=(173, 213, 227, 255),
        weapon='staff',
        hat_main=(143, 111, 151, 255),
        hat_shadow=(98, 78, 112, 255),
        hair_main=(177, 87, 92, 255),
        hair_shadow=(138, 63, 73, 255),
    )
    draw_chibi_character(
        'archer',
        robe_main=(108, 145, 112, 255),
        robe_shadow=(76, 104, 81, 255),
        accent=(205, 226, 152, 255),
        weapon='bow',
        hat_main=(120, 144, 126, 255),
        hat_shadow=(80, 100, 86, 255),
        hair_main=(177, 87, 92, 255),
        hair_shadow=(138, 63, 73, 255),
    )

    draw_slime('slime', body=(126, 191, 132, 255), shade=(92, 146, 96, 255))
    draw_bat('bat', body=(110, 96, 150, 255), wing=(80, 69, 110, 255))
    draw_skeleton('skeleton')
    draw_scorpion('scorpion')
    draw_mummy('mummy')
    draw_flame('flame')

    draw_boss('boss', main=(161, 89, 108, 255), shade=(118, 63, 79, 255), horn=(54, 41, 64, 255), accent=(208, 127, 142, 255))
    draw_boss('king_slime', main=(118, 197, 130, 255), shade=(86, 148, 96, 255), horn=(72, 121, 80, 255), accent=(188, 232, 198, 255))
    draw_boss('gargoyle_lord', main=(135, 148, 186, 255), shade=(96, 107, 142, 255), horn=(56, 64, 89, 255), accent=(198, 213, 255, 255))
    draw_boss('desert_predator', main=(224, 165, 86, 255), shade=(160, 113, 56, 255), horn=(95, 70, 38, 255), accent=(255, 226, 163, 255))
    draw_boss('magma_golem', main=(236, 108, 68, 255), shade=(161, 68, 46, 255), horn=(99, 35, 22, 255), accent=(255, 194, 113, 255))
    draw_boss('demon_lord', main=(181, 84, 102, 255), shade=(130, 57, 73, 255), horn=(64, 28, 39, 255), accent=(247, 167, 177, 255))

    generate_backgrounds()


if __name__ == '__main__':
    main()
