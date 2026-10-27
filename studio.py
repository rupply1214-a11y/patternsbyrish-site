"""Drawing data for the studio page film: R108 Boatneck Maxi Dress, from line drawing to finished dress.
All coordinates are in the film's 1200 x 700 viewBox."""


def flat(cx, back=False, top=70, hw=155, hem=500):
    """Technical flat of the boatneck, sleeveless, full-length A-line dress."""
    t = top
    neck_dip = 80 if back else 98
    outline = (f"M{cx-60} {t} L{cx-88} {t+8} C{cx-80} {t+76} {cx-68} {t+128} {cx-96} {t+138} "
               f"L{cx-hw} {t+hem} Q{cx} {t+hem+16} {cx+hw} {t+hem} L{cx+96} {t+138} "
               f"C{cx+68} {t+128} {cx+80} {t+76} {cx+88} {t+8} L{cx+60} {t} Q{cx} {t+neck_dip-70} {cx-60} {t} Z")
    details = []
    if back:
        details.append(f"M{cx} {t+10} L{cx} {t+hem+14}")                    # centre back seam
        details.append(f"M{cx-9} {t+200} L{cx+9} {t+200}")                  # end of zipper
    else:
        details.append(f"M{cx-56} {t+8} Q{cx} {t+38} {cx+56} {t+8}")        # facing stitch line under the neckline
    k = (hw - 96) / (hem - 138)                                               # side seam slope, to sit the pockets on it
    for side in (-1, 1):
        x1, x2 = 96 + k * 105, 96 + k * 190
        details.append(f"M{cx + side * x1:.0f} {t+243} C{cx + side * (x1 - 34):.0f} {t+252} {cx + side * (x1 - 40):.0f} {t+318} {cx + side * x2:.0f} {t+328}")
    stitches = [f"M{cx-60} {t+4} L{cx-88} {t+12}", f"M{cx+60} {t+4} L{cx+88} {t+12}",
                f"M{cx-95} {t+146} L{cx-hw+6} {t+hem-6}", f"M{cx+95} {t+146} L{cx+hw-6} {t+hem-6}",
                f"M{cx-hw+8} {t+hem-14} Q{cx} {t+hem+2} {cx+hw-8} {t+hem-14}"]
    return dict(outline=outline, details=details, cx=cx, top=t, stitches=stitches, hem=t + hem, hw=hw)


def zipper(cx, top=70):
    """Small zipper teeth along the centre back from the neck to the zipper end."""
    return [f"M{cx-5} {y} L{cx+5} {y}" for y in range(top + 18, top + 198, 7)]


def size_lines(x0=120, y0=70, s=1.18):
    colors = ["#E07A93", "#E8956A", "#D9A92B", "#9DB84A", "#4FB08A", "#3FA6A6", "#5A9BD8", "#8B7FD9", "#B77FC9"]
    sizes = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"]
    out = []
    for i, (size, col) in enumerate(zip(sizes, colors)):
        g = i * 1.45
        P = lambda x, y: f"{x0 + x * s:.1f} {y0 + y * s:.1f}"
        d = (f"M{P(40, 70 - g * .6)} Q{P(78 + g * .6, 70 - g * .6)} {P(88 + g * .8, 40 - g * .8)} L{P(148 + g * 3.2, 56 + g * .6)} "
             f"Q{P(136 + g * 4.4, 108 + g * 2.2)} {P(158 + g * 6.2, 132 + g * 3.2)} Q{P(150 + g * 6.2, 170 + g * 2)} {P(148 + g * 6.4, 214 + g * 1.4)} "
             f"L{P(226 + g * 6.6, 418 + g * 2.2)} Q{P(140 + g * 3, 440 + g * 2.4)} {P(40, 438 + g * 2.4)}")
        out.append(dict(d=d, color=col, size=size, i=i, lx=x0 + (232 + g * 6.6) * s, ly=y0 + (424 + g * 2.2) * s))
    fold = f"M{x0 + 40 * s:.1f} {y0 + 20 * s:.1f} L{x0 + 40 * s:.1f} {y0 + 470 * s:.1f}"
    return dict(lines=out, fold=fold, label_x=x0 + 110 * s, label_y=y0 + 300 * s)


def tiles(cols=7, rows=7, x0=404, y0=62, w=56, h=79):
    pages = []
    order = 0
    for r in range(rows):
        for c in range(cols):
            pages.append(dict(x=x0 + c * w, y=y0 + r * h, w=w, h=h, label=f"{c + 1}/{r + 1}", i=order))
            order += 1
    W, H = cols * w, rows * h
    # pattern pieces laid across the tiled pages, following the layout page of the real PDF
    X = lambda f: x0 + f * W
    Y = lambda f: y0 + f * H
    front = (f"M{X(.12):.0f} {Y(.02):.0f} L{X(.30):.0f} {Y(.03):.0f} Q{X(.27):.0f} {Y(.10):.0f} {X(.30):.0f} {Y(.16):.0f} L{X(.46):.0f} {Y(.82):.0f} "
             f"L{X(.02):.0f} {Y(.82):.0f} L{X(.06):.0f} {Y(.16):.0f} Q{X(.09):.0f} {Y(.10):.0f} {X(.06):.0f} {Y(.03):.0f} Z")
    back = (f"M{X(.58):.0f} {Y(.02):.0f} L{X(.76):.0f} {Y(.03):.0f} Q{X(.73):.0f} {Y(.10):.0f} {X(.76):.0f} {Y(.16):.0f} L{X(.82):.0f} {Y(.82):.0f} "
            f"L{X(.56):.0f} {Y(.82):.0f} L{X(.58):.0f} {Y(.16):.0f} Z")
    facing = (f"M{X(.42):.0f} {Y(.86):.0f} Q{X(.56):.0f} {Y(.83):.0f} {X(.70):.0f} {Y(.86):.0f} L{X(.76):.0f} {Y(.97):.0f} "
              f"Q{X(.56):.0f} {Y(.90):.0f} {X(.36):.0f} {Y(.97):.0f} Z")
    pocket = f"M{X(.86):.0f} {Y(.03):.0f} L{X(.97):.0f} {Y(.03):.0f} Q{X(1.0):.0f} {Y(.10):.0f} {X(.93):.0f} {Y(.16):.0f} Q{X(.86):.0f} {Y(.14):.0f} {X(.86):.0f} {Y(.03):.0f} Z"
    tapes = [dict(x=x0 + c * w - 7, y=y0 + r * h + h / 2 - 3) for c in range(1, cols) for r in (1, 3, 5)][:12]
    return dict(pages=pages, pieces=[front, back, facing, pocket], tapes=tapes, x0=x0, y0=y0, W=W, H=H)


def cut_pieces():
    """The five pattern pieces laid out on the cutting mat, with how many to cut (from the R108 PDF)."""
    pieces = [
        dict(n=1, name="Front", cut="cut 1, main fabric", d="M150 72 L250 78 Q236 130 252 166 L338 580 L70 580 L150 166 Q166 130 150 72 Z", lx=204, ly=628),
        dict(n=2, name="Back", cut="cut 2, main fabric", d="M402 72 L492 78 Q478 130 494 166 L560 580 L402 580 Z", lx=480, ly=628),
        dict(n=3, name="Front facing", cut="cut 1 + interfacing", d="M640 120 Q770 150 900 120 L924 210 Q770 250 616 210 Z", lx=770, ly=272),
        dict(n=4, name="Back facing", cut="cut 2 + interfacing", d="M640 300 L740 300 L752 400 Q700 380 640 404 Z", lx=696, ly=446),
        dict(n=5, name="Pocket bag", cut="cut 4, lining", d="M850 300 L960 300 Q1010 380 950 450 Q880 470 850 420 Z", lx=915, ly=496),
    ]
    return pieces


STEPS = ["Prepare the pieces", "Attach the pocket bags", "Sew the shoulder seams", "Prepare the facing", "Attach the facing to the neckline",
         "First armhole, burrito method", "Second armhole", "Insert the invisible zipper", "Secure the facing", "Sew the side seams",
         "Fit check before hemming", "Hem the dress", "Final pressing"]

SCENES = [
    dict(key="line", title="It starts as a line", dur=5200,
         text="Every Patterns by Rish design begins as a technical drawing. This is R108, the Boatneck Maxi Dress, front and back."),
    dict(key="details", title="Every detail decided", dur=6500,
         text="A boat neckline and sleeveless armholes finished with one all-in-one facing, in-seam pockets, an invisible zipper and a full-length A-line skirt."),
    dict(key="grade", title="Drafted, then graded to every size", dur=6500,
         text="We draft one size and grade it from XS to 5XL. For US 10 / M that means a 92.5 cm bust, 71 cm waist, 98 cm hips and 144.7 cm from shoulder to hem."),
    dict(key="check", title="Checked to the millimetre", dur=5600,
         text="Every pattern file opens with a 4 × 4 inch test square. Print it and measure it: when it reads 101.5 mm, your printer is at 100%."),
    dict(key="print", title="Printed at home, page by page", dur=7000,
         text="The pattern tiles across A4 or US Letter pages. Line up the numbered pages, tape them together and the full-size pieces appear."),
    dict(key="cut", title="Five pieces, cut once", dur=7000,
         text="Front, back, front facing, back facing and pocket bags. Every piece already includes a 1 cm (3/8 in) seam allowance."),
    dict(key="sew", title="Sewn in 13 clear steps", dur=9000,
         text="The booklet takes you from the pocket bags to burrito-method armholes, the invisible zipper, side seams and hem, with drawings for every step."),
    dict(key="wear", title="And then you wear it", dur=6500,
         text="A dress you made yourself, in the fabric you chose. That moment is what every pattern is drafted for."),
]


def data():
    return dict(front=flat(420), back=flat(780, back=True), zip=zipper(780), grade=size_lines(), tiles=tiles(), pieces=cut_pieces(),
                steps=STEPS, scenes=SCENES, sew=flat(360, top=80, hw=165, hem=530), finished=flat(600, top=70, hw=175, hem=540),
                total=sum(s["dur"] for s in SCENES))
