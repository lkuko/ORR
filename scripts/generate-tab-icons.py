"""Generate original local tab icons; requires Pillow. No network or fonts."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent / 'assets' / 'tabbar'
ROOT.mkdir(parents=True, exist_ok=True)
SCALE = 4


def render(name, selected):
    image = Image.new('RGBA', (80 * SCALE, 80 * SCALE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    color = '#2854D9' if selected else '#66738A'
    fill = '#E9EFFF' if selected else None

    def points(values):
        return [(x * SCALE, y * SCALE) for x, y in values]

    def line(values, width=4):
        draw.line(points(values), fill=color, width=width * SCALE, joint='curve')

    def round_box(box, radius=7):
        draw.rounded_rectangle(tuple(x * SCALE for x in box), radius * SCALE, fill=fill, outline=color, width=4 * SCALE)

    if name == 'tasks':
        round_box((15, 22, 65, 64))
        line([(15, 35), (65, 35)])
        line([(40, 23), (40, 44), (47, 40), (47, 23)], 3)
        line([(23, 16), (34, 16)], 3)
        line([(14, 9), (29, 9)], 3)
    elif name == 'forum':
        round_box((12, 13, 61, 49), 10)
        line([(22, 49), (22, 58), (34, 49)])
        line([(68, 30), (68, 59), (56, 59), (56, 67), (45, 59), (38, 59)], 3)
        for x in (26, 37, 48):
            draw.ellipse(((x - 2) * SCALE, 29 * SCALE, (x + 2) * SCALE, 33 * SCALE), fill=color)
    elif name == 'orders':
        round_box((18, 15, 62, 67), 8)
        round_box((29, 10, 51, 23), 5)
        line([(28, 36), (33, 40), (41, 32)], 3)
        line([(46, 36), (53, 36)], 3)
        line([(28, 50), (51, 50)], 3)
        line([(28, 58), (44, 58)], 3)
    else:
        draw.ellipse((28 * SCALE, 10 * SCALE, 52 * SCALE, 34 * SCALE), fill=fill, outline=color, width=4 * SCALE)
        draw.rounded_rectangle((16 * SCALE, 42 * SCALE, 64 * SCALE, 67 * SCALE), radius=12 * SCALE, fill=fill, outline=color, width=4 * SCALE)
    image.resize((80, 80), Image.Resampling.LANCZOS).save(ROOT / (name + ('-active' if selected else '') + '.png'))


for icon in ('tasks', 'forum', 'orders', 'profile'):
    render(icon, False)
    render(icon, True)
print('Generated 8 local tab icons.')
