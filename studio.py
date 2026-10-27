"""Drawing data for the brand film: a sewing-studio story from sketch to finished dress.
The film's viewBox is 1200 x 700. Everything that matters stays inside x 250..950, so phones can show a square crop."""


def flat(cx, top=70, hw=155, hem=500, back=False):
    """Line drawing of a boat neck, sleeveless, A-line maxi dress (used as the film's example garment)."""
    t = top
    dip = 10 if back else 28
    outline = (f"M{cx-60} {t} L{cx-88} {t+8} C{cx-80} {t+76} {cx-68} {t+128} {cx-96} {t+138} "
               f"L{cx-hw} {t+hem} Q{cx} {t+hem+16} {cx+hw} {t+hem} L{cx+96} {t+138} "
               f"C{cx+68} {t+128} {cx+80} {t+76} {cx+88} {t+8} L{cx+60} {t} Q{cx} {t+dip} {cx-60} {t} Z")
    k = (hw - 96) / (hem - 138)
    pockets = []
    for side in (-1, 1):
        x1, x2 = 96 + k * 105, 96 + k * 190
        pockets.append(f"M{cx + side * x1:.0f} {t+243} C{cx + side * (x1 - 34):.0f} {t+252} {cx + side * (x1 - 40):.0f} {t+318} {cx + side * x2:.0f} {t+328}")
    neck = f"M{cx-56} {t+8} Q{cx} {t+38} {cx+56} {t+8}"
    return dict(outline=outline, pockets=pockets, neck=neck, cx=cx, top=t, hem=t + hem, hw=hw)


def size_lines(x0=300, y0=78, s=1.05):
    colors = ["#E07A93", "#E8956A", "#D9A92B", "#9DB84A", "#4FB08A", "#3FA6A6", "#5A9BD8", "#8B7FD9", "#B77FC9"]
    sizes = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"]
    out = []
    for i, (size, col) in enumerate(zip(sizes, colors)):
        g = i * 1.45
        P = lambda x, y: f"{x0 + x * s:.1f} {y0 + y * s:.1f}"
        d = (f"M{P(40, 70 - g * .6)} Q{P(78 + g * .6, 70 - g * .6)} {P(88 + g * .8, 40 - g * .8)} L{P(148 + g * 3.2, 56 + g * .6)} "
             f"Q{P(136 + g * 4.4, 108 + g * 2.2)} {P(158 + g * 6.2, 132 + g * 3.2)} Q{P(150 + g * 6.2, 170 + g * 2)} {P(148 + g * 6.4, 214 + g * 1.4)} "
             f"L{P(226 + g * 6.6, 418 + g * 2.2)} Q{P(140 + g * 3, 440 + g * 2.4)} {P(40, 438 + g * 2.4)}")
        out.append(dict(d=d, color=col, size=size, i=i))
    fold = f"M{x0 + 40 * s:.1f} {y0 + 24 * s:.1f} L{x0 + 40 * s:.1f} {y0 + 468 * s:.1f}"
    return dict(lines=out, fold=fold, x0=x0, y0=y0, s=s)


def tiles(cols=6, rows=5, x0=411, y0=150, w=63, h=89):
    pages = [dict(x=x0 + c * w, y=y0 + r * h, w=w, h=h, label=f"{c + 1}/{r + 1}", i=r * cols + c) for r in range(rows) for c in range(cols)]
    W, H = cols * w, rows * h
    X = lambda f: x0 + f * W
    Y = lambda f: y0 + f * H
    front = (f"M{X(.10):.0f} {Y(.03):.0f} L{X(.30):.0f} {Y(.04):.0f} Q{X(.27):.0f} {Y(.13):.0f} {X(.31):.0f} {Y(.20):.0f} L{X(.47):.0f} {Y(.95):.0f} "
             f"L{X(.03):.0f} {Y(.95):.0f} L{X(.07):.0f} {Y(.20):.0f} Q{X(.11):.0f} {Y(.13):.0f} {X(.07):.0f} {Y(.04):.0f} Z")
    back = (f"M{X(.56):.0f} {Y(.03):.0f} L{X(.75):.0f} {Y(.04):.0f} Q{X(.72):.0f} {Y(.13):.0f} {X(.76):.0f} {Y(.20):.0f} L{X(.86):.0f} {Y(.95):.0f} "
            f"L{X(.54):.0f} {Y(.95):.0f} L{X(.56):.0f} {Y(.20):.0f} Z")
    pocket = (f"M{X(.88):.0f} {Y(.05):.0f} L{X(.98):.0f} {Y(.05):.0f} Q{X(1.0):.0f} {Y(.17):.0f} {X(.94):.0f} {Y(.25):.0f} "
              f"Q{X(.88):.0f} {Y(.22):.0f} {X(.88):.0f} {Y(.05):.0f} Z")
    tapes = [dict(x=x0 + c * w - 7, y=y0 + r * h + h / 2 - 12) for r in (0, 2, 4) for c in range(1, cols)]
    return dict(pages=pages, pieces=[front, back, pocket], tapes=tapes, x0=x0, y0=y0, W=W, H=H)


def pinking(x, y, w, h, tooth=9):
    """Zig-zag edged rectangle, like fabric cut with pinking shears."""
    pts = []
    n = int(w // tooth)
    for i in range(n + 1):
        pts.append((x + i * w / n, y + (0 if i % 2 == 0 else tooth * .6)))
    m = int(h // tooth)
    for i in range(1, m + 1):
        pts.append((x + w - (0 if i % 2 == 0 else tooth * .6), y + i * h / m))
    for i in range(n - 1, -1, -1):
        pts.append((x + i * w / n, y + h - (0 if i % 2 == 0 else tooth * .6)))
    for i in range(m - 1, 0, -1):
        pts.append((x + (0 if i % 2 == 0 else tooth * .6), y + i * h / m))
    return "M" + " L".join(f"{a:.1f} {b:.1f}" for a, b in pts) + " Z"


SWATCHES = [  # x, y, rotation, fabric pattern id
    (150, 120, -8, "fab-gingham"), (172, 300, 6, "fab-linen"), (140, 470, -4, "fab-floral"),
    (930, 110, 7, "fab-denim"), (915, 300, -6, "fab-sage"), (940, 470, 5, "fab-dots"),
]

CUT_PIECE = ("M500 120 L560 132 L620 120 L652 130 Q630 204 666 244 L770 584 Q560 604 350 584 L454 244 "
             "Q490 204 468 130 Z")

SCENES = [
    dict(key="sketch", title="Every design starts in the sketchbook", dur=7000,
         text="Each Patterns by Rish style begins as a sketch and a stack of fabric swatches, long before it becomes a pattern."),
    dict(key="grade", title="Drafted, then graded size by size", dur=6600,
         text="The sketch becomes a pattern, drafted by hand and graded across its size range so the fit carries through every size."),
    dict(key="download", title="Yours in seconds", dur=6400,
         text="Buy on Etsy and the PDF files are yours straight away. No shipping and no waiting, wherever you live."),
    dict(key="measure", title="Measure, then pick your size", dur=6400,
         text="A soft tape around your bust, waist and hips, checked against the size chart in the pattern, tells you which size to cut."),
    dict(key="print", title="Printed on your own printer", dur=6600,
         text="Print the PDF at home or at a copy shop, tape the pages together and the full pieces appear."),
    dict(key="cut", title="Cut from the fabric you love", dur=7200,
         text="Pin the paper pieces to your fabric and cut around them. This is where your dress starts to take shape."),
    dict(key="sew", title="Sewn one step at a time", dur=7000,
         text="Every pattern comes with step-by-step PDF instructions, with drawings that walk you through the sewing."),
    dict(key="press", title="Pressed as you go", dur=6400,
         text="A quick press after each seam is the secret to a garment that looks shop-bought rather than home-made."),
    dict(key="wear", title="And then it's yours", dur=7200,
         text="The moment you wear something you made yourself is what we design every pattern for."),
]


def data():
    return dict(sketch=flat(600, top=148, hw=128, hem=400), grade=size_lines(), tiles=tiles(),
                swatches=[dict(x=x, y=y, r=r, fab=f, d=pinking(x, y, 112, 112)) for x, y, r, f in SWATCHES],
                cut=CUT_PIECE, wrinkles=[dict(x=x, d=f"M{x} 404 q8 -6 16 0 t16 0 t16 0", at=round(0.5 + (840 - x) / 520 * 4, 2)) for x in range(360, 800, 70)], finished=flat(600, top=136, hw=150, hem=430),
                scenes=SCENES, total=sum(s["dur"] for s in SCENES))
