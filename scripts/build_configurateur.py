"""Prépare les données et les visuels du configurateur (configurateur/).

Usage : python3 scripts/build_configurateur.py
  - lit data/catalogue.csv et flatlay/tenues.json ;
  - télécharge les packshots détourés Café du Cycliste (coupe homme ou unisexe), les casques
    Specialized et les chaussures NIMBL (détourés avec rembg) ;
  - écrit configurateur/assets/*.webp et configurateur/catalogue.json.
Le cache de téléchargement est flatlay/.cache/ (non versionné).
"""
import csv, io, json, os, re, sys, urllib.request
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'scripts'))
from flatlay import fetch, cutout, season_label  # noqa: E402

OUT = os.path.join(ROOT, 'configurateur')
ASSETS = os.path.join(OUT, 'assets')
MAX_H = 640

SLOT = {'maillot_mc': 'haut', 'maillot_ml': 'haut', 'gilet': 'couche', 'veste': 'couche',
        'veste_pluie': 'couche', 'cuissard': 'bas', 'short': 'bas', 'collant': 'bas', 'gants': 'gants',
        'chaussettes': 'chaussettes', 'sous_maillot': 'sous'}

# Plages de température estimées (°C), d'après docs/gamme-cafe-du-cycliste.md.
TEMP = {
    'Bergida': (22, 35), 'Angeline': (20, 32), 'Vinciane': (20, 30), 'Mona': (22, 35), 'Magda': (18, 30),
    'Laurette': (25, 35), 'Romy': (18, 30), 'Mireille': (16, 26), 'Eze': (22, 35), 'Ventoux': (22, 35),
    'Paris': (22, 35), 'Sa': (22, 35), 'Barbara': (20, 30), 'Sandie': (20, 30), 'Giselle': (20, 30),
    'Gladys': (20, 30), 'Fleurette': (25, 35), 'Francine': (16, 26), 'Olympe': (20, 30), 'Tiphany': (22, 32),
    'Perrine': (20, 30), 'Andrea': (14, 22), 'Constance': (10, 18), 'Laure': (8, 16), 'Emilie': (4, 12),
    'Charlie': (6, 16), 'Claudette': (8, 16), 'Solange': (4, 12), 'Ivana': (2, 12), 'Lorenne': (8, 16),
    'Ingrid': (4, 12), 'Marguerite': (6, 14), 'Corinne': (10, 18), 'Roxane': (14, 22), 'Faustine': (8, 16),
    'Lydia': (4, 12), 'Apolline': (2, 10), 'Solenne': (4, 12), 'Sylvie': (6, 14), 'Pascaline': (8, 16),
    'Victoire': (16, 35), 'Cecile': (8, 15), 'Freida': (16, 35), 'Marinette': (16, 35), 'Adrienne': (8, 15),
    'Eva': (15, 30), 'Albane': (18, 30), 'Mathilde': (16, 35), 'Marie': (2, 10), 'Rosie': (2, 10),
    'Elise': (-2, 5), 'Summer': (16, 35), 'Lightweight': (10, 16), 'Softshell': (4, 12), 'Classic': (2, 10),
    'Leather': (4, 12), 'Winter': (-5, 5), 'Lina': (8, 18), 'Norine': (8, 18), 'Edith': (8, 18),
    'Albertine': (-2, 8), 'Lise': (-2, 8), 'Alexia': (-5, 5), 'Manon': (4, 14), 'Sibille': (6, 16),
    'Judith': (0, 12), 'Carmen': (-5, 8), 'Coline': (5, 18), 'Liliane': (18, 35),
    'Aero': (12, 35), 'Primaloft': (-5, 10), 'Nordic': (0, 12), 'Downy': (0, 12), 'Motto': (8, 25),
    'Suzette': (2, 15), 'Alizee': (2, 15), 'Ilona': (8, 18), 'Zelie': (-2, 8), 'Irisia': (8, 18),
}
DEFAULT_TEMP = {'maillot_mc': (18, 30), 'maillot_ml': (8, 18), 'gilet': (8, 18), 'veste': (0, 12),
                'veste_pluie': (2, 15), 'cuissard': (16, 35), 'short': (18, 30), 'collant': (0, 10), 'gants': (5, 20),
                'chaussettes': (10, 30), 'sous_maillot': (5, 18)}

# Noms de coloris lus sur les fiches cafeducycliste.com (les identifiants n'en donnent qu'un code).
COLOURS = json.load(open(os.path.join(ROOT, 'data', 'coloris.json')))

# Anciens coloris absents du catalogue en ligne, repris chez des revendeurs.
EXTRA = [  # (id, modèle, coloris, image, prix €, saison, catégorie, gamme)
    ('constance-black-avocado', 'Constance', 'Black / Avocado',
     'https://static.wixstatic.com/media/e7fbda_dcd255be05f54274b3448a02fb447217~mv2.jpg/v1/fill/w_1230,h_1500,al_c,q_90/a.jpg',
     180, 'Archive', 'maillot_ml', 'race'),
    ('constance-navy-scots-pine', 'Constance', 'Navy / Scots Pine',
     'https://cdn.shopify.com/s/files/1/0561/3322/2572/files/B-JLS-CONSTA-M-NVSP_FR_1500X2000_91359a47-0f47-43e6-a17e-7e902b9a3bfe.png',
     180, 'Archive', 'maillot_ml', 'race'),
    ('constance-black-quetsche', 'Constance', 'Black / Quetsche',
     'https://cdn.shopify.com/s/files/1/0561/3322/2572/files/B-JLS-CONSTA-M-BKQC_1500x2000_01_FR_67473fc7-99ad-45cd-bc00-30375fc72e12.jpg',
     180, 'Archive', 'maillot_ml', 'race'),
    ('constance-navy-chalk', 'Constance', 'Navy / Chalk',
     'https://cdn.shopify.com/s/files/1/0561/3322/2572/files/B-JLS-CONSTA-M-NVCK_FR_1500X2000_ab3164b2-cb3a-4d3f-9fe7-668605ad98f0.jpg',
     180, 'Archive', 'maillot_ml', 'race'),
]
EXTRA_HELMETS = [  # (id, modèle, coloris, image, usage)
    ('helmet-evade3-smoke', 'S-Works Evade 3', 'Smoke', 'https://www.balfesbikes.co.uk/images/products/2/27/275668-smk.jpg', 'Aéro'),
    ('helmet-evade3-black', 'S-Works Evade 3', 'Noir',
     'https://resources.specialized.com/image/60723-100_HLMT_SW-EVADE-3-HLMT-CE-BLK-M_HERO-SQUARE?w=1000&h=1000&q=85', 'Aéro'),
]

EXTRA_SHOES = [  # (id, marque, modèle, coloris, image, prix €, usage, chaussure seule ?)
    ('shoe-northwave-extreme-r-gtx', 'Northwave', 'Extreme R GTX', 'Black',
     'https://www.northwave.com/2528-thickbox_default/extreme-r-gtx.jpg', 319.99, 'Route · hiver Gore-Tex', True),
]

HELMETS = [  # (modèle, coloris, image Specialized, usage)
    ('S-Works Prevail 3', 'Blanc', '60923-106_HLMT_SW-PREVAIL-3-HLMT-CE-WHT-M_HERO-SQUARE', 'Ventilation'),
    ('S-Works Prevail 3', 'Blanc / noir', '60923-107_HLMT_SW-PREVAIL-3-HLMT-CE-WHT-BLK-M_HERO-SQUARE', 'Ventilation'),
    ('S-Works Prevail 3', 'Noir', '60923-100_HLMT_SW-PREVAIL-3-HLMT-CE-BLK-M_HERO-SQUARE', 'Ventilation'),
    ('S-Works Prevail 3', 'Sandstone', '60926-100_HLMT_SW-PREVAIL-3-HLMT-CE-SNDSTN_HERO-SQUARE', 'Ventilation'),
    ('S-Works Evade 4', 'Noir mat', '60726-110_HLMT_SW-EVADE-4-HLMT-CE-MATTE-BLK_HERO-SQUARE', 'Aéro'),
    ('S-Works Evade 4', 'Blanc mat', '60726-111_HLMT_SW-EVADE-4-HLMT-CE-MATTE-WHT_HERO-SQUARE', 'Aéro'),
    ('S-Works Evade 4 LTD', 'Race Red', '60726-150_HLMT_SW-EVADE-4-LTD-HLMT-CE-RACE-RED-VAPOR_HERO-SQUARE', 'Aéro'),
    ('Propero 4', 'Noir', '60124-170_HLMT_PROPERO-4-HLMT-CE-BLK-M_HERO-SQUARE', 'Polyvalent'),
    ('Propero 4', 'Blanc', '60124-171_HLMT_PROPERO-4-HLMT-CE-WHT-M_HERO-SQUARE', 'Polyvalent'),
    ('Propero 4', 'Hyper / Dove Grey', '60124-173_HLMT_PROPERO-4-HLMT-CE-HYP-DOVGRY-M_HERO-SQUARE', 'Polyvalent'),
    ('Search', 'Noir', '60124-160_HLMT_SEARCH-HLMT-CE-BLK_HERO-SQUARE', 'Gravel'),
    ('Search', 'Blanc', '60124-161_HLMT_SEARCH-HLMT-CE-WHT_HERO-SQUARE', 'Gravel'),
]
SHOES = [  # (modèle, image nimbl.cc, prix €, usage)
    ('Ultimate Exceed Pro Edition', 'Ultimate-Exceed-Pro-Edition-1.webp', 651, 'Route · BOA'),
    ('Ultimate Glide Pro Edition', 'Ultimate-Glide-Pro-Edition-1.webp', 651, 'Route · double BOA'),
    ('Ultimate Air Pro Edition', 'Nimbl-Ultimate-Air-Pro-Edition-1.webp', 581, 'Route · lacets'),
    ('Ultimate Exceed Giro LTD', 'NIMBL-Ultimate-Exceed-Giro-dItalia-Limited-Edition-1.webp', None, 'Route · édition limitée'),
    ('Ultimate Exceed Stardust Origine', 'Nimbl-x-Nike-Ultimate-Exceed-Stardust-Origine-Edition-1.webp', None, 'Route · NIMBL x Nike'),
    ('Ultimate Exceed Étoile', 'NIMBLxNIKE-Ultimate-Exceed-Etoile-Edition-1.webp', None, 'Route · NIMBL x Nike'),
    ('Ultimate Exceed Gold', 'NIMBL-ULTIMATE-EXCEED-GOLD-1.webp', None, 'Route · BOA'),
    ('Ultimate Glide Gold', 'NIMBL-ULTIMATE-GLIDE-GOLD-1.webp', None, 'Route · double BOA'),
    ('Ultimate Air', 'NIMBL-ULTIMATE-AIR-1.webp', None, 'Route · lacets'),
    ('Urano', 'Nimbl-Urano-White-1.webp', 599, 'Gravel'),
]


def bottom_kind(r):
    if r['categorie'] == 'collant':
        return 'collant'
    if r['modele'] == 'Adrienne':
        return '3/4'
    return 'court'


def trim_helmet_shadow(im):
    """Coupe l'ombre portée sous le casque : coque large, sangles étroites, puis ombre de nouveau large."""
    import numpy as np
    a = np.asarray(im.split()[-1]) > 0
    w = a.sum(1)
    m = w.max()
    narrow = False
    for y in range(len(w) // 2, len(w)):
        if w[y] < 0.3 * m:
            narrow = True
        elif narrow and w[y] > 0.45 * m:
            return im.crop((0, 0, im.width, y))
    return im


def save(im, name, force=False):
    path = os.path.join(ASSETS, name)
    if not force and os.path.exists(path):
        with Image.open(path) as cur:
            return cur.size
    im = im.copy()
    if im.height > MAX_H:
        im = im.resize((round(im.width * MAX_H / im.height), MAX_H), Image.LANCZOS)
    im.save(os.path.join(ASSETS, name), 'WEBP', quality=82, method=6)
    return im.width, im.height


def main():
    os.makedirs(ASSETS, exist_ok=True)
    rows = list(csv.DictReader(open(os.path.join(ROOT, 'data', 'catalogue.csv'))))
    fam_archive = {r['modele'] for r in rows if r['archive'] == 'oui'}
    items, seen = [], set()
    for r in rows:
        if r['categorie'] not in SLOT or not r['image_principale']:
            continue
        if not ('Male' in r['genre'] or 'Unisex' in r['genre']):
            continue
        handle = r['url'].split('/')[-1]
        from flatlay import colour_name as _cn
        key = (r['modele'], COLOURS.get(handle, _cn(handle)), r['categorie'])
        if key in seen:
            continue
        seen.add(key)
        try:
            src = fetch(r['image_principale'].split('?')[0] + '?width=1100', handle + '.png')
            im = Image.open(src).convert('RGBA')
            # Photo sur fond : détourage automatique ; sinon le PNG est déjà détouré.
            im = cutout(src, remove_bg=im.getpixel((2, 2))[3] > 10)
        except Exception as e:  # noqa: BLE001
            print('skip', handle, e)
            continue
        w, h = save(im, handle + '.webp')
        slab, skind = season_label(r, r['modele'] in fam_archive)
        fam = r['modele'].split()[0]
        tmin, tmax = TEMP.get(fam, DEFAULT_TEMP[r['categorie']])
        from flatlay import colour_name
        items.append({
            'id': handle, 'slot': SLOT[r['categorie']], 'cat': r['categorie'], 'brand': 'Café du Cycliste',
            'model': r['modele'], 'colour': COLOURS.get(handle, colour_name(handle)), 'price': float(r['prix_eur']),
            'gamme': r['gamme'] or '', 'season': slab, 'seasonKind': skind, 'tmin': tmin, 'tmax': tmax,
            'kind': bottom_kind(r) if SLOT[r['categorie']] == 'bas' else r['categorie'],
            'sleeves': ('none' if ('sleeveless' in handle or '-bsl-' in handle) else 'short' if r['modele'] == 'Liliane' else 'long')
            if r['categorie'] == 'sous_maillot' else None,
            'turtleneck': r['modele'] == 'Carmen',
            'img': 'assets/' + handle + '.webp', 'w': w, 'h': h, 'url': r['url'],
        })
        print('ok', handle)
    for iid, model, colour, url, price, season, cat, gamme in EXTRA:
        im = cutout(fetch(url, iid + '.src'), remove_bg=True)
        w, h = save(im, iid + '.webp')
        fam = model.split()[0]
        tmin, tmax = TEMP.get(fam, DEFAULT_TEMP[cat])
        items.append({'id': iid, 'slot': SLOT[cat], 'cat': cat, 'brand': 'Café du Cycliste', 'model': model,
                      'colour': colour, 'price': float(price), 'gamme': gamme, 'season': season, 'seasonKind': 'old',
                      'tmin': tmin, 'tmax': tmax, 'kind': cat, 'img': 'assets/' + iid + '.webp', 'w': w, 'h': h,
                      'url': ''})
        print('ok', iid)
    for iid, model, colour, url, use in EXTRA_HELMETS:
        im = trim_helmet_shadow(cutout(fetch(url, iid + '.src'), remove_bg=True, hard=True))
        w, h = save(im, iid + '.webp', force=True)
        items.append({'id': iid, 'slot': 'casque', 'brand': 'Specialized', 'model': model, 'colour': colour,
                      'price': None, 'use': use, 'img': 'assets/' + iid + '.webp', 'w': w, 'h': h, 'url': ''})
        print('ok', iid)
    for model, colour, ref, use in HELMETS:
        im = cutout(fetch(f'https://resources.specialized.com/image/{ref}?w=1000&h=1000&q=85', ref + '.png'),
                    remove_bg=True, hard=True)
        name = 'helmet-' + ref.split('_')[0] + '.webp'
        w, h = save(trim_helmet_shadow(im), name, force=True)
        items.append({'id': 'helmet-' + ref.split('_')[0], 'slot': 'casque', 'brand': 'Specialized', 'model': model,
                      'colour': colour, 'price': None, 'use': use, 'img': 'assets/' + name, 'w': w, 'h': h,
                      'url': 'https://www.specialized.com/fr/fr/'})
        print('ok', name)
    for model, ref, price, use in SHOES:
        try:
            src = fetch(f'https://nimbl.cc/wp-content/uploads/sites/10/{ref}', ref)
        except Exception as e:  # noqa: BLE001
            print('skip', ref, e)
            continue
        im = cutout(src, remove_bg=True)
        name = 'shoe-' + re.sub(r'[^a-z0-9]+', '-', model.lower()).strip('-') + '.webp'
        w, h = save(im, name)
        items.append({'id': name[:-5], 'slot': 'chaussures', 'brand': 'NIMBL', 'model': model, 'colour': '',
                      'price': price, 'use': use, 'img': 'assets/' + name, 'w': w, 'h': h, 'url': 'https://nimbl.cc/'})
        print('ok', name)

    for iid, brand, model, colour, url, price, use, single in EXTRA_SHOES:
        im = cutout(fetch(url, iid + '.src'), remove_bg=True)
        w, h = save(im, iid + '.webp')
        items.append({'id': iid, 'slot': 'chaussures', 'brand': brand, 'model': model, 'colour': colour, 'price': price,
                      'use': use, 'single': single, 'img': 'assets/' + iid + '.webp', 'w': w, 'h': h, 'url': url})
        print('ok', iid)

    # Tenues prédéfinies (flatlay/tenues.json) traduites en identifiants du configurateur.
    ids = {i['id'] for i in items}
    helmet_id = {h[2]: 'helmet-' + h[2].split('_')[0] for h in HELMETS}
    shoe_id = {s[1]: 'shoe-' + re.sub(r'[^a-z0-9]+', '-', s[0].lower()).strip('-') for s in SHOES}
    presets = []
    for t in json.load(open(os.path.join(ROOT, 'flatlay', 'tenues.json'))):
        p = {'id': t['id'], 'name': t['nom'], 'temp': t['temp'], 'gamme': t['gamme'],
             'haut': t['haut'][0], 'couche': t['haut'][1] if len(t['haut']) > 1 else None,
             'bas': t['bas'], 'gants': t['gants'],
             'casque': helmet_id[t['casque'][2]], 'chaussures': shoe_id[t['chaussures'][1]]}
        # Les pièces en coupe femme sont remplacées par la version homme du même coloris.
        for k in ('haut', 'couche', 'bas', 'gants'):
            if p[k] and p[k] not in ids:
                alt = p[k].replace('women-', 'men-')
                p[k] = alt if alt in ids else None
        presets.append(p)
    json.dump({'items': items, 'presets': presets}, open(os.path.join(OUT, 'catalogue.json'), 'w'),
              ensure_ascii=False, separators=(',', ':'))
    print(len(items), 'articles')


if __name__ == '__main__':
    main()
