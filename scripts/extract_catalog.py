"""Extrait le catalogue Café du Cycliste (Shopify products.json) en CSV.

Usage : python3 scripts/extract_catalog.py <dossier_json> data/catalogue.csv
Le dossier doit contenir p*.json (catalogue complet) et r_<genre>_<gamme>.json
(collections par gamme), téléchargés depuis :
  https://www.cafeducycliste.com/en/products.json?limit=250&page=N
  https://www.cafeducycliste.com/en/collections/<mens|womens>-<gamme>-collection/products.json?limit=250
"""
import csv, glob, json, os, re, sys

TYPES = {
    'Jersey Short Sleeve': 'maillot_mc', 'Jersey Long Sleeve': 'maillot_ml',
    'Bib Short': 'cuissard', 'Bib Tight': 'collant', 'Short with pad': 'short',
    'Tight with pad': 'collant_sans_bretelles', 'Gloves': 'gants', 'Speedsuit': 'combinaison',
    'Gilet Windproof': 'gilet', 'Gilet Thermal': 'gilet', 'Jacket Windproof': 'veste',
    'Jacket Thermal': 'veste', 'Jacket Waterproof': 'veste_pluie',
    'Base Layer Long Sleeve': 'sous_maillot', 'Base Layer Sleeveless': 'sous_maillot',
    'Arm Warmers': 'manchettes', 'Leg Warmers': 'jambieres', 'Socks': 'chaussettes',
}

def clean(h):
    return re.sub(r'\s+', ' ', re.sub('<[^>]+>', ' ', h or '')).strip()

def main(src, out):
    products = []
    for f in sorted(glob.glob(os.path.join(src, 'p*.json'))):
        products += json.load(open(f))['products']
    ranges = {}
    for f in glob.glob(os.path.join(src, 'r_*.json')):
        gamme = os.path.basename(f)[:-5].split('_')[2]
        for p in json.load(open(f))['products']:
            ranges.setdefault(p['title'].strip(), set()).add(gamme)
    with open(out, 'w', newline='') as fh:
        w = csv.writer(fh)
        w.writerow(['categorie', 'modele', 'gamme', 'genre', 'saisons', 'archive', 'coloris',
                    'prix_eur', 'url', 'image_principale', 'images', 'description'])
        for p in products:
            cat = TYPES.get(p['product_type'])
            if not cat:
                continue
            title = p['title'].strip()
            tags = p['tags']
            v = p['variants'][0]
            prix = v.get('compare_at_price') or v['price']
            imgs = [i['src'] for i in p['images']]
            w.writerow([
                cat, title, '/'.join(sorted(ranges.get(title, ranges.get(title.split()[0], set())))),
                '/'.join(t for t in tags if t in ('Male', 'Female', 'Unisex')),
                '/'.join(t for t in tags if re.match(r'(SS|AW)', t)),
                'oui' if 'Archives' in tags else 'non',
                p['handle'].split('-')[-1], prix,
                f"https://www.cafeducycliste.com/products/{p['handle']}",
                imgs[0] if imgs else '', ' '.join(imgs[:6]), clean(p['body_html'])[:600],
            ])

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
