"""Ajoute les vues de dos à plat (packshots « _BK ») au catalogue du configurateur.

À lancer après build_configurateur.py :
    python3 scripts/build_backs.py

Pour chaque article de configurateur/catalogue.json, cherche dans data/catalogue.csv
une photo dont le nom contient « BK » (vue de dos studio), la détoure (rembg),
l'enregistre en assets/<id>-dos.webp et renseigne le champ imgBack.
Les vues de dos portées (mannequin vivant de 3/4) sont écartées : on garde
seulement les images dont le détourage ressemble à un vêtement à plat
(pas de tête au-dessus du col, fond uni).
"""
import csv
import json
import os
import re
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from flatlay import cutout, fetch  # noqa: E402
from build_configurateur import save  # noqa: E402

CONF = os.path.join(ROOT, 'configurateur')
BK = re.compile(r'[_-]BK[_.-]', re.I)


def flat_background(path):
    """Vrai si les bords de la photo sont unis (studio), comme les packshots à plat."""
    im = np.asarray(Image.open(path).convert('L').resize((200, 260)), dtype=float)
    border = np.concatenate([im[:6].ravel(), im[-6:].ravel(), im[:, :6].ravel(), im[:, -6:].ravel()])
    return border.std() < 6


def has_head(im):
    """Un mannequin vivant laisse une tête étroite au-dessus des épaules."""
    a = np.asarray(im.split()[-1]) > 128
    rows = a.sum(1)
    if not rows.any():
        return True
    top = np.argmax(rows > 0)
    width = rows.max()
    first = rows[top:top + max(3, a.shape[0] // 12)]
    return first.mean() < width * 0.18 and a.shape[0] > a.shape[1] * 1.6


def main():
    path = os.path.join(CONF, 'catalogue.json')
    data = json.load(open(path))
    rows = {r['url'].rsplit('/', 1)[1]: r for r in csv.DictReader(open(os.path.join(ROOT, 'data', 'catalogue.csv')))}
    n = 0
    for it in data['items']:
        r = rows.get(it['id'])
        if not r or it['slot'] not in ('haut', 'couche', 'sous', 'bas'):
            continue
        cands = [u for u in r['images'].split() if BK.search(u.split('?')[0].rsplit('/', 1)[1])]
        if not cands:
            continue
        url = cands[0].split('?')[0] + '?width=1100'
        try:
            src = fetch(url, it['id'] + '.bk.src')
            if not flat_background(src):
                print('fond non uni', it['id'])
                continue
            im = cutout(src, remove_bg=True, hard=True)
        except Exception as e:  # noqa: BLE001
            print('skip', it['id'], e)
            continue
        if has_head(im):
            print('porté', it['id'])
            continue
        name = it['id'] + '-dos.webp'
        save(im, name)
        it['imgBack'] = 'assets/' + name
        n += 1
        print('dos', it['id'])
    json.dump(data, open(path, 'w'), ensure_ascii=False, separators=(',', ':'))
    print(n, 'vues de dos')


if __name__ == '__main__':
    main()
