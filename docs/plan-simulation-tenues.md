# Plan : simuler en photo des tenues Café du Cycliste avec casques Specialized et chaussures NIMBL

## Objectif

Pour chaque tenue, on veut obtenir :

1. une **planche « flat-lay »** : les produits détourés et posés à plat (casque, maillot, cuissard, gants, chaussures), avec une fiche (gamme, plage de température, prix total) ;
2. **en option**, un **rendu porté** : la tenue sur un·e cycliste, produit par un modèle d'essayage virtuel.

Le principe est de mêler les **anciennes collections** (Archive, AW25, SS25) et les **nouvelles** (SS26, AW26) : par exemple un maillot d'archive avec un cuissard actuel.

---

## Phase 1 : données (≈ 1 jour)

| Étape | Détail | État |
|---|---|---|
| 1.1 Catalogue CdC | Extraction du `products.json` Shopify public, puis [`data/catalogue.csv`](../data/catalogue.csv) : 494 articles avec catégorie, gamme, saison, statut archive, coloris, prix, URL et **jusqu'à 6 photos packshot par article** | ✅ fait (`scripts/extract_catalog.py`) |
| 1.2 Enrichissement | Ajouter au CSV les colonnes `temp_min`, `temp_max`, `famille_couleur` (neutre, chaude, froide, vive) et `motif` (uni, rayé, graphique), à partir des tableaux de [`gamme-cafe-du-cycliste.md`](gamme-cafe-du-cycliste.md) | à faire |
| 1.3 Casques Specialized | Créer `data/casques.csv` à la main (modèle, usage, coloris, photo officielle) | à faire |
| 1.4 Chaussures NIMBL | Créer `data/chaussures.csv` à la main (même format) | à faire |
| 1.5 Photos | Télécharger les packshots en local (`assets/<marque>/<modele>-<coloris>.jpg`). Vérifier qu'ils sont sur fond blanc et de face. Utiliser de préférence les kits presse (presse.cafeducycliste.com, espaces médias Specialized et NIMBL) | à faire |

> ⚠️ **Droits** : les photos produits appartiennent aux marques. On peut les utiliser en interne, pour une maquette ou une étude. Pour toute diffusion publique (réseaux, site, print), il faut l'accord de Café du Cycliste, Specialized et NIMBL.

### Casques Specialized à intégrer (gamme 2026)

| Modèle | Usage | Gamme CdC associée |
|---|---|---|
| **S-Works Evade 4** (2026) | Aéro, course | Race |
| **S-Works Prevail 3** | Ventilation maximale, chaleur, montagne | Race (été), Audax, Classic |
| **Propero 4** | Polyvalent (aéro et ventilé), prix plus accessible | Classic, Audax, mi-saison |
| **Search** | Gravel / aventure | Outlands |
| Versions Team Replica (Evade 4, Prevail 3) | Couleurs des équipes pro | Tenues « Race » graphiques |

### Chaussures NIMBL à intégrer (gamme 2026)

En 2026, la gamme passe à des **embouts et talons blancs**, et les modèles Air et Glide rejoignent la famille Pro.

| Modèle | Particularité | Gamme CdC associée |
|---|---|---|
| **Ultimate Exceed (Pro)** | Haut de gamme, course ; éditions Giro, Stardust (argent irisé) et Nike « Étoile » | Race |
| **Ultimate Glide (Pro)** | Double BOA Li2, 190 g (T43), blanc et argent | Race, Classic |
| **Feat** | Le plus léger de la gamme, réglable en roulant | Race en montagne, Audax |
| **Air** | Fabriquée à la main en Italie, très ventilée | Classic, Audax en été |
| *Gravel* | NIMBL est surtout « route » : vérifier s'il existe un modèle SPD, sinon utiliser les **Outlands Shoes Café du Cycliste** | Outlands |

---

## Phase 2 : règles d'association (≈ 0,5 jour)

Ces règles sont appliquées dans l'ordre. Le générateur s'en sert pour proposer des tenues cohérentes.

1. **Température** : les plages `temp_min`–`temp_max` du maillot, du bas et des gants doivent se chevaucher (voir le tableau §5 de la doc gamme).
2. **Gamme** : on reste dans la même gamme ou une gamme voisine. Race ↔ Classic ↔ Audax sont compatibles. Outlands va avec Outlands, ou avec Classic pour un look « gravel chic ».
3. **Ancien + nouveau** : au moins 1 pièce archive (AW25, SS25, `Archive`) et au moins 1 pièce actuelle (SS26, AW26) par tenue, si le mode « mix collections » est activé.
4. **Couleurs** :
   - les cuissards sont presque tous neutres (noir, marine, anthracite, Storm, Water) : prendre la teinte la plus sombre du maillot ;
   - le casque reprend la couleur d'accent du maillot, ou s'accorde avec les chaussures ;
   - les NIMBL 2026 à embout et talon blancs s'accordent bien avec des gants et mitaines blancs ou des chaussettes claires ;
   - pas plus de 2 couleurs vives par tenue.
5. **Ensembles assortis** : les éditions vendues en kit (Bergida et Victoire Factory, MVC, The Grip) sont proposées telles quelles.

---

## Phase 3 : rendu

### 3A : planche flat-lay automatique (recommandé en premier, ≈ 2 jours)

C'est **déterministe et fidèle aux produits**, sans déformation des logos.

- **Outils** : Python, Pillow, `rembg` (détourage par IA, en local).
- **Mise en page** (1080 × 1350, format Instagram portrait) :
  - casque en haut au centre ;
  - maillot au centre, gants à gauche et à droite ;
  - cuissard sous le maillot ;
  - chaussures en bas ;
  - un bandeau avec le nom de la tenue, la gamme, la plage de température et le prix total.
- **Ombres portées douces** et fond uni (crème, gris, ou couleur dérivée du maillot).
- **Livrable** : `out/flatlay/<tenue>.png` et une planche contact de toutes les tenues.

### 3B : rendu porté par IA (≈ 2–3 jours, en option)

- **Modèles d'édition d'image multi-références**, qui prennent en entrée une photo de cycliste et les packshots. Exemples : Gemini Flash Image, FLUX Kontext, Seedream. En open source : IDM-VTON ou CatVTON pour le haut et le bas.
- **Méthode** : générer d'abord le maillot et le cuissard, puis ajouter le casque et les chaussures. Garder un seed et une pose fixes pour que les tenues restent comparables.
- **Limites à prévoir** : motifs complexes (marinière, Merveilles, Custom Dye) et logos parfois déformés. Un **contrôle humain** de chaque image est indispensable avant diffusion.
- **Alternative sans IA** : une vraie séance photo d'une demi-journée, en suivant la liste de tenues de la phase 4. C'est le meilleur rendu, pour un coût plus élevé.

### 3C : configurateur web (≈ 2 jours, en option)

Une page HTML statique qui lit les CSV :

- filtres par gamme, température, saison, homme/femme et « mix ancien/nouveau » ;
- bouton **« Tenue aléatoire cohérente »** qui applique les règles de la phase 2 ;
- assemblage des calques flat-lay en direct et export PNG.

---

## Phase 4 : premières tenues à simuler (sélection de départ)

| # | Nom | Temp. | Maillot | Cuissard / bas | Gants | Casque Specialized | NIMBL | Ancien + nouveau |
|---|---|---|---|---|---|---|---|---|
| 1 | Fournaise | > 25 °C | Laurette Jadeite (SS26) | Marinette Storm (H) / Graziella Storm (F) | Summer Mitts blanc | S-Works Prevail 3 blanc | Ultimate Glide blanc et argent | nouveau |
| 2 | Héritage Riviera | > 25 °C | **Fleurette Water (archive SS25)** | Victoire Navy (SS26) | Summer Mitts noir | Propero 4 | Air | ✅ |
| 3 | Race Factory | 22–32 °C | Bergida Factory (SS26) | Victoire Factory (SS26) | Summer Mitts noir | S-Works Evade 4 | Ultimate Exceed Pro | kit assorti |
| 4 | Audax d'été | 20–30 °C | **Mona Marinière (archive)** | Freida Navy (SS26) | Summer Mitts blanc | S-Works Prevail 3 | Feat | ✅ |
| 5 | Minimaliste | 20–30 °C | **Olympe Red (archive)** | Victoire Black | Summer Mitts noir | S-Works Evade 4 | Ultimate Exceed Pro (Giro) | ✅ |
| 6 | Mi-saison course | 10–18 °C | Constance Water (AW26) | **Adrienne Navy (archive)** | Lightweight gris | Propero 4 | Feat | ✅ |
| 7 | Brevet d'automne | 8–16 °C | Laure (AW26) + gilet Lina | Rosie Navy | Softshell noir | S-Works Prevail 3 | Air | nouveau |
| 8 | Hiver archive | 4–12 °C | **Ingrid Verbena (archive AW25)** | Marie Black (AW26) | Classic bleu | Propero 4 | Ultimate Glide | ✅ |
| 9 | Grand froid | 0–5 °C | Charlie Marinière + veste Albertine (AW26) | Elise Black | Winter Gloves | Propero 4 | Ultimate Exceed + couvre-chaussures | nouveau |
| 10 | Gravel d'automne | 4–12 °C | Solange Verbena (AW26) | Eva Olive (SS26) + jambières Olga | Leather Gravel moutarde | Search | *Outlands Shoes CdC* | ✅ |
| 11 | Gravel d'été | 20–30 °C | **Perrine Navy (archive)** | Eva Water | Summer Mitts | Search | *Outlands Shoes CdC* | ✅ |
| 12 | Classique mérinos (F) | 16–24 °C | Mireille Fog (SS26) | **Mathilde Navy (archive)** | Summer Mitts blanc | S-Works Prevail 3 | Air | ✅ |

---

## Phase 5 : validation et livraison (≈ 0,5 jour)

- Relecture : cohérence des températures, des couleurs et des noms de coloris exacts (vérifier sur la fiche produit, car le CSV contient des codes courts comme `pudd` ou `cdna`).
- Mise à jour des prix (le catalogue bouge selon les soldes) : relancer `scripts/extract_catalog.py`.
- **Livrables** : planches PNG, CSV enrichis et, si retenu, le configurateur web.

## Planning indicatif

| Phase | Durée | Dépendances |
|---|---|---|
| 1 Données | 1 j | — |
| 2 Règles | 0,5 j | 1 |
| 3A Flat-lay | 2 j | 1, 2 |
| 3B Rendu IA (option) | 2–3 j | 3A |
| 3C Configurateur (option) | 2 j | 3A |
| 5 Validation | 0,5 j | 3 |
| **Total** | **4 j (cœur) à 9 j (avec options)** | |

## Sources (casques et chaussures)

- [BikeRadar : S-Works Evade 3 / Prevail 3](https://www.bikeradar.com/news/specialized-sworks-evade-prevail-3-helmets/) ; [BikeRadar : Propero 4](https://www.bikeradar.com/news/specialized-propero-4-and-torch-shoes) ; [Brújula Bike : Evade 4 et Prevail 3 Team](https://en.brujulabike.com/specialized-brings-the-worldtour-and-xc-racing-team-colors-to-the-s-works-evade-4-and-prevail-3-from-the-catalog/)
- [Tour Magazin : collection NIMBL 2026](https://www.tour-magazin.de/en/buying-advice/clothing/shoes/new-cycling-shoes-from-nimbl-2026-collection-with-a-new-look/) ; [Tour Magazin : Ultimate Exceed Pro Giro 2026](https://www.tour-magazin.de/en/buying-advice/clothing/shoes/road-cycling-shoe-in-giro-design-nimbl-ultimate-exceed-pro-giro-2026-in-a-limited-edition/) ; [Velodrom : Ultimate Glide 2026](https://www.velodrom.cc/products/nimbl-ultimate-glide-2026-white-silver) ; [Rouleur : NIMBL × Nike Étoile](https://rouleur.cc/tech/nimbl-x-nike-etoile)
