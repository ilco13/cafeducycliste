"""Génère les planches flat-lay des tenues définies dans flatlay/tenues.json.

Usage : python3 scripts/flatlay.py
  - lit data/catalogue.csv (Café du Cycliste) et flatlay/tenues.json ;
  - télécharge et met en cache les visuels dans flatlay/.cache/ (non versionné) ;
  - détoure les chaussures NIMBL avec rembg (les packshots CdC et Specialized sont déjà transparents) ;
  - écrit flatlay/out/<id>.png (1080x1350) et flatlay/out/planche-contact.jpg.
Dépendances : Pillow, numpy, rembg (+ onnxruntime).
"""
import csv, io, json, os, re, urllib.request
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'flatlay', '.cache')
OUT = os.path.join(ROOT, 'flatlay', 'out')
W, H = 1080, 1350
BG = (243, 238, 230)
INK = (28, 36, 52)
MUTED = (110, 112, 118)
ACCENT = {'new': (196, 92, 60), 'old': (52, 92, 120), 'perm': (130, 130, 130)}
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
FONT_B = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
FONT_S = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'
UA = {'User-Agent': 'Mozilla/5.0'}


def font(path, size):
    return ImageFont.truetype(path, size)


def fetch(url, name):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
        open(path, 'wb').write(data)
    return path


def cutout(path, remove_bg=False, hard=False):
    """Retourne une image RGBA recadrée sur son contenu."""
    out = path + '.cut.png'
    if os.path.exists(out):
        return Image.open(out)
    im = Image.open(path).convert('RGBA')
    if remove_bg:
        from rembg import remove
        im = remove(im)
    if hard:
        # Supprime les ombres portées semi-transparentes laissées par le détourage.
        r, g, b, a = im.split()
        im.putalpha(a.point(lambda v: 0 if v < 170 else 255))
    alpha = im.split()[-1]
    # Ignore les ombres très légères (casques Specialized) pour le recadrage.
    box = alpha.point(lambda a: 255 if a > 40 else 0).getbbox()
    im = im.crop(box)
    im.save(out)
    return im


def fit(im, w, h):
    im = im.copy()
    im.thumbnail((w, h), Image.LANCZOS)
    return im


def paste_shadow(canvas, im, x, y, blur=14, offset=(10, 14), opacity=70):
    alpha = im.split()[-1].point(lambda a: min(255, a * opacity // 255))
    shadow = Image.new('RGBA', im.size, (40, 32, 24, 0))
    shadow.putalpha(alpha)
    pad = blur * 3
    layer = Image.new('RGBA', (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
    layer.paste(shadow, (pad, pad), shadow)
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    canvas.alpha_composite(layer, (x - pad + offset[0], y - pad + offset[1]))
    canvas.alpha_composite(im, (x, y))


def season_label(row, family_archive):
    s = row['saisons']
    if 'AW 26' in s:
        return 'AW26', 'new'
    if 'SS26' in s:
        return 'SS26', 'new'
    m = re.search(r'(AW|SS) ?(25)', s)
    if m:
        return f'{m.group(1)}25', 'old'
    if family_archive:
        return 'Archive', 'old'
    return 'Permanent', 'perm'


def colour_name(handle):
    c = handle.split('-')[-1]
    names = {'pudd': 'Puddle', 'blck': 'Black', 'grli': 'Grey Lilac', 'storm': 'Storm', 'water': 'Deep Water',
             'factory': 'Café Factory', 'red': 'Cinder Red', 'mariniere': 'Marinière', 'verbena': 'Verbena',
             'olive': 'Golden Olive', 'mustard': 'Mustard', 'fog': 'Fog'}
    return names.get(c, c.capitalize())


def draw_tag(d, x, y, text, kind):
    f = font(FONT_B, 15)
    tw = d.textlength(text, font=f)
    d.rounded_rectangle((x, y, x + tw + 16, y + 24), radius=12, fill=ACCENT[kind])
    d.text((x + 8, y + 3), text, font=f, fill='white')
    return tw + 24


def render(t, rows, families_archive):
    canvas = Image.new('RGBA', (W, H), BG + (255,))
    d = ImageDraw.Draw(canvas)

    items = []  # (role, image, label, colour, price, season)
    for i, h in enumerate(t['haut']):
        r = rows[h]
        img = cutout(fetch(r['images'].split()[0].split('?')[0] + '?width=1100', h + '.png'))
        items.append(('haut' if i == 0 else 'couche', img, r['modele'], colour_name(h), float(r['prix_eur']),
                      season_label(r, families_archive.get(r['modele']))))
    for role in ('bas', 'gants'):
        h = t[role]
        r = rows[h]
        img = cutout(fetch(r['images'].split()[0].split('?')[0] + '?width=1100', h + '.png'))
        items.append((role, img, r['modele'], colour_name(h), float(r['prix_eur']),
                      season_label(r, families_archive.get(r['modele']))))
    cname, ccol, cimg = t['casque']
    helmet = cutout(fetch(f'https://resources.specialized.com/image/{cimg}?w=1000&h=1000&q=85', cimg + '.png'), remove_bg=True, hard=True)
    sname, simg, sprice = t['chaussures']
    shoes = cutout(fetch(f'https://nimbl.cc/wp-content/uploads/sites/10/{simg}', simg), remove_bg=True)

    # --- En-tête
    d.text((60, 46), t['nom'], font=font(FONT_S, 50), fill=INK)
    d.text((62, 112), f"{t['temp']}   ·   {t['gamme']}", font=font(FONT, 22), fill=MUTED)
    seasons = [it[5][1] for it in items]
    if 'old' in seasons and ('new' in seasons or 'perm' in seasons):
        mix, kind = 'Mix ancien + actuel', 'old'
    elif 'old' in seasons:
        mix, kind = 'Anciennes collections', 'old'
    else:
        mix, kind = 'Collection actuelle', 'new'
    # (perm = toujours au catalogue, sans saison précise)
    tw = d.textlength(mix, font=font(FONT_B, 15)) + 16
    draw_tag(d, W - 60 - tw, 62, mix, kind)
    d.line((60, 156, W - 60, 156), fill=(214, 206, 194), width=2)

    # --- Composition
    get = {it[0]: it for it in items}
    top, layer, bas, gants = get['haut'][1], get.get('couche', (None, None))[1], get['bas'][1], get['gants'][1]

    # Colonne gauche : casque puis gants
    hm = fit(helmet, 270, 220)
    paste_shadow(canvas, hm, 60 + (270 - hm.width) // 2, 190, blur=10, opacity=45)
    gl = fit(gants, 240, 250)
    paste_shadow(canvas, gl, 75 + (240 - gl.width) // 2, 450)
    # Zone haute droite : maillot (et couche extérieure)
    if layer is not None:
        tp = fit(top, 330, 450)
        ly = fit(layer, 330, 450)
        paste_shadow(canvas, tp, 360 + (330 - tp.width) // 2, 190)
        paste_shadow(canvas, ly, 695 + (330 - ly.width) // 2, 190)
    else:
        tp = fit(top, 620, 460)
        paste_shadow(canvas, tp, 370 + (640 - tp.width) // 2, 185)
    # Rangée basse : cuissard / collant puis chaussures
    bs = fit(bas, 300, 440)
    paste_shadow(canvas, bs, 360 + (300 - bs.width) // 2, 640 + (440 - bs.height) // 2)
    sh = fit(shoes, 360, 280)
    paste_shadow(canvas, sh, 670 + (360 - sh.width) // 2, 740 + (280 - sh.height) // 2, blur=10, opacity=50)

    # --- Légende
    y0 = 1100
    d.rectangle((0, y0 - 10, W, H), fill=(234, 227, 216))
    lines = []
    for role, _, name, col, price, (slab, skind) in items:
        lines.append((f'{name} — {col}', f'{price:.0f} €', (slab, skind)))
    lines.append((f'Specialized {cname} — {ccol}', '', None))
    lines.append((f'NIMBL {sname}', f'{sprice:.0f} €' if sprice else '', None))
    f, fb = font(FONT, 19), font(FONT_B, 19)
    col_x = [60, 560]
    per_col = (len(lines) + 1) // 2
    for i, (txt, price, tag) in enumerate(lines):
        x = col_x[i // per_col]
        y = y0 + 14 + (i % per_col) * 46
        d.text((x, y), txt, font=f, fill=INK)
        tx = x + d.textlength(txt, font=f) + 10
        if price:
            d.text((tx, y), price, font=fb, fill=INK)
            tx += d.textlength(price, font=fb) + 10
        if tag:
            draw_tag(d, tx, y - 1, tag[0], tag[1])
    total = sum(it[4] for it in items)
    d.text((60, H - 46), f'Total textile Café du Cycliste : {total:.0f} €   (prix catalogue, hors soldes)',
           font=font(FONT_B, 17), fill=MUTED)
    return canvas.convert('RGB')


def main():
    rows = {r['url'].split('/')[-1]: r for r in csv.DictReader(open(os.path.join(ROOT, 'data', 'catalogue.csv')))}
    families_archive = {}
    for r in rows.values():
        if r['archive'] == 'oui':
            families_archive[r['modele']] = True
    tenues = json.load(open(os.path.join(ROOT, 'flatlay', 'tenues.json')))
    os.makedirs(OUT, exist_ok=True)
    boards = []
    for t in tenues:
        im = render(t, rows, families_archive)
        p = os.path.join(OUT, t['id'] + '.png')
        im.save(p, optimize=True)
        boards.append(im)
        print('ok', p)
    # Planche contact 4 x 3
    tw, th = 360, 450
    sheet = Image.new('RGB', (4 * tw, 3 * th), BG)
    for i, im in enumerate(boards):
        sheet.paste(im.resize((tw, th), Image.LANCZOS), ((i % 4) * tw, (i // 4) * th))
    sheet.save(os.path.join(OUT, 'planche-contact.jpg'), quality=90)


if __name__ == '__main__':
    main()
