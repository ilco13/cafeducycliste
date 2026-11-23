# Café du Cycliste : gamme et simulation de tenues

- [`docs/gamme-cafe-du-cycliste.md`](docs/gamme-cafe-du-cycliste.md) : tableaux comparatifs des gammes (Race, Audax, Classic, Outlands…), maillots actuels et archives, cuissards, gants, températures et matériaux.
- [`docs/plan-simulation-tenues.md`](docs/plan-simulation-tenues.md) : plan pour simuler en photo des tenues (Café du Cycliste, casques Specialized, chaussures NIMBL).
- [`data/catalogue.csv`](data/catalogue.csv) : 494 articles textiles et gants extraits du catalogue public, avec photos.
- [`scripts/extract_catalog.py`](scripts/extract_catalog.py) : régénère le CSV (voir l'en-tête du script).
- [`configurateur/`](configurateur/) : cabine d'essayage interactive (mannequin homme 1,80 m). Ouvrir `configurateur/index.html` via un serveur local (`python3 -m http.server -d configurateur`) ; régénérer les données avec `python3 scripts/build_configurateur.py` puis `python3 scripts/build_backs.py` (vues de dos à plat). Le bouton « Vue 3D » charge `configurateur/vue3d.js` (Three.js) : mannequin pivotant habillé par projection des packshots de face et de dos.
- [`flatlay/out/`](flatlay/out/) : planches flat-lay des 12 tenues (`python3 scripts/flatlay.py`).
