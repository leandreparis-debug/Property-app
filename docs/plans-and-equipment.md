# Plans, calibration, équipements et volume 3D

L'étape 10 ajoute l'onglet **Plan** à la fiche entrepôt (`/sites/[id]?tab=plan`). On y trouve :

- le volume 3D du bâtiment, généré automatiquement ;
- le plan AutoCAD, calibré et superposé à la carte ;
- les équipements, avec leur liste.

Toutes les écritures sont tracées dans le journal d'audit. Le mode de secours fonctionne sans fond de carte détaillé ni orthophotos.

## Procédure pour les utilisateurs

### 1. Exporter le plan depuis AutoCAD

- **Format** : PNG (conseillé pour un plan au trait), JPEG ou WebP. Vigie n'importe pas directement les fichiers DWG ni DXF. Ils restent téléchargeables dans l'onglet Documents.
- **Résolution** : de 4 000 à 6 000 px sur le grand côté. Au-delà de **8 192 px** de côté, le plan est refusé avec le message « Exportez le plan en 8192 px maximum (limite d'affichage) », car les cartes graphiques ne savent pas afficher de texture plus grande.
- **Cadrage** : un seul niveau par image, orienté comme vous le souhaitez, sans cartouche inutile autour du bâtiment. La rotation est calculée par la calibration.
- **Taille** : 50 Mo au maximum, comme pour tout document.

### 2. Ajouter le plan

Deux possibilités, qui demandent toutes deux la permission `plan:calibrate` (éditeur ou administrateur) :

- dans l'onglet **Plan**, cliquer sur « Ajouter un plan », ou sur « Remplacer le plan » s'il en existe déjà un ;
- dans l'onglet Documents, ajouter un document de catégorie **Plan**.

Les dimensions sont lues dans l'en-tête du fichier, d'abord par le navigateur puis par le serveur. Le nouveau plan devient le **plan courant**. Les plans précédents restent dans l'« Historique des plans », où ils sont téléchargeables.

### 3. Calibrer le plan

Cliquer sur « Calibrer le plan » pour ouvrir l'assistant en plein écran.

- **À gauche**, l'image du plan :
  - molette ou boutons + et − pour zoomer, glisser pour se déplacer ;
  - au clavier : flèches, `+`, `-`, et `0` pour ajuster l'image à la zone.
- **À droite**, la carte du site : orthophoto si elle est installée, sinon fond de carte ou mode de secours, avec l'emprise et le volume.

**Placer une paire de points** : cliquer un point sur le plan, puis le **même** point sur la carte. La paire est numérotée des deux côtés. Échap annule le point en cours.

**Saisie numérique** : « Ajouter un point » crée une ligne vide dans le tableau. Chaque valeur (x et y du plan en pixels, latitude, longitude) se modifie au clavier.

**Choisir de bons points de contrôle** :

- au moins **4 points**. Trois points suffisent au calcul, mais il n'y a alors aucun contrôle ;
- aux **angles du bâtiment**, ou à des repères nets visibles sur l'orthophoto (angle de quai, poteau d'éclairage). Éviter les points ambigus ;
- **éloignés les uns des autres**, idéalement près des quatre coins du plan. Des points groupés ou alignés donnent une calibration instable, ou sont refusés (« points alignés ou confondus ») ;
- en mode de secours, sans orthophoto, utiliser les angles de l'emprise du bâtiment ou saisir les coordonnées connues.

**Interpréter l'erreur** : dès 3 points valides, le plan est superposé à la carte en aperçu, et l'**erreur quadratique moyenne** s'affiche en mètres au sol.

| Erreur | Message | Conduite à tenir |
|---|---|---|
| Moins de 1 m | « Calibration précise » | Enregistrer. |
| De 1 à 3 m | « Acceptable » | Suffisant pour situer un équipement. Ajouter ou affiner des points si possible. |
| Plus de 3 m | « Vérifiez les points » | Un point est probablement mal placé. L'enregistrement reste possible après confirmation. |

Un point dont l'erreur dépasse **deux fois la moyenne** est marqué « à vérifier » dans le tableau, et en pointillés sur l'image et sur la carte. Il faut le corriger ou le supprimer.

**Enregistrer** stocke :

- les points et la transformation ;
- l'erreur et la rotation ;
- la date et l'auteur ;
- l'opacité de l'aperçu.

Un motif est facultatif. L'enregistrement est audité.

### 4. Recalibrer

« Recalibrer » rouvre l'assistant avec les points existants. Les équipements posés **sur le plan** (voir plus bas) suivent le plan : leurs coordonnées sont **recalculées** dans la même transaction, sous le même lot d'audit. Avant l'enregistrement, l'assistant annonce le nombre d'équipements concernés et la distance moyenne de leur déplacement.

### 5. Équipements

Ajout (permission `equipment:write`) :

1. choisir le type dans la liste ;
2. cliquer sur « Ajouter un équipement » ;
3. cliquer sur la carte ou sur le plan. Au clavier, utiliser « Placer au centre du site » puis déplacer l'équipement avec les flèches ;
4. compléter le formulaire. Le libellé est proposé automatiquement (« RIA 4 ») ; la référence, le niveau, la date de mise en service et les notes sont facultatifs.

**Position** : la latitude et la longitude sont **toujours** enregistrées. Si un plan calibré est affiché, les coordonnées sur le plan (`planX`, `planY`, en pixels) le sont aussi, par la transformation inverse : l'équipement suivra alors le plan lors d'une recalibration. Une position à plus de **1 km** du site est refusée.

**Déplacement** :

- glisser-déposer l'équipement sélectionné sur la carte ;
- ou, au clavier, les **flèches** (0,5 m par pression, 5 m avec Maj), sur la carte ou sur le pavé « Déplacer » de la fiche de l'équipement ;
- puis cliquer sur « Enregistrer la position ».

**Modifier** et **Archiver** : l'archivage demande une confirmation et accepte un motif facultatif. Un équipement archivé disparaît du plan et de la liste, mais son historique reste dans le journal d'audit.

**Panneau « Équipements »** : filtres par catégorie (avec les décomptes), filtre par type, recherche par libellé ou référence. Chaque ligne sélectionne l'équipement et centre la carte dessus. Cette liste offre une **alternative complète à la carte**.

**Autres affichages** :

- la vue d'ensemble de la fiche donne le nombre d'équipements par catégorie ;
- sur la carte nationale, au-delà du zoom 17, les équipements du site sélectionné s'affichent en lecture seule.

**Côté des quais** : le réglage « Côté des quais : A / B » (permission `site:write`) choisit le grand côté du volume qui porte les quais. Il est audité et le volume est mis à jour immédiatement.

Un **lecteur** voit le plan, le volume et les équipements, sans aucune action d'édition. Un **site archivé** est en lecture seule pour tous.

## Catalogue des équipements (`src/domain/equipment/catalog.ts`)

Le type est stocké sous forme de **code** dans `equipments.type` et validé par zod (`equipmentTypeSchema`). Aucune contrainte `CHECK` ne s'y applique : ajouter un type au catalogue ne demande **aucune migration**. Un code inconnu, par exemple issu de données plus anciennes, s'affiche comme « Autre équipement ».

| Catégorie | Forme du marqueur | Types (code) |
|---|---|---|
| Incendie | rond | extincteur (`FIRE_EXTINGUISHER`), RIA (`FIRE_HOSE_REEL`), poste de contrôle sprinkler (`SPRINKLER_VALVE`), poteau ou bouche incendie (`FIRE_HYDRANT`), réserve d'eau incendie (`FIRE_WATER_RESERVE`), centrale SSI (`FIRE_ALARM_PANEL`), exutoire de désenfumage (`SMOKE_VENT`), commande de désenfumage (`SMOKE_CONTROL`), porte coupe-feu (`FIRE_DOOR`) |
| Électricité | carré | TGBT (`MAIN_LV_PANEL`), poste de transformation (`TRANSFORMER`), groupe électrogène (`GENERATOR`), local de charge (`CHARGING_ROOM`) |
| Fluides | losange | chaufferie (`BOILER_ROOM`), cuve fioul ou gaz (`TANK`), vanne de coupure (`SHUTOFF_VALVE`) |
| Environnement | hexagone | séparateur d'hydrocarbures (`OIL_SEPARATOR`), bassin de rétention (`RETENTION_BASIN`), vanne de barrage (`ISOLATION_VALVE`) |
| Sécurité des personnes | pilule | défibrillateur (`DEFIBRILLATOR`), point de rassemblement (`ASSEMBLY_POINT`) |

Chaque type définit :

- un code ;
- un libellé français ;
- un nom court, qui sert au libellé automatique « RIA 4 » : le plus grand numéro déjà utilisé pour ce type, plus un ;
- une catégorie ;
- une clé de pictogramme.

Pour **ajouter un type**, ajouter une entrée à `EQUIPMENT_TYPES` et, si besoin, un pictogramme à `PICTOGRAMS` (`src/components/plan/pictograms.ts`). Un test unitaire vérifie que chaque type a un code unique, une catégorie et un pictogramme dessiné.

## Génération du volume (`src/domain/volume/build.ts`)

`buildBuildingVolume({ footprint, heightM, cellCount, dockCount, dockSide, referenceArea, center })` est une fonction pure, qui s'exécute en moins de 5 ms par site. Tous les calculs se font en Web Mercator, en mètres, autour du site. Les dimensions au sol sont converties avec l'échelle locale, `1 / cos(latitude)`.

| Élément | Règle |
|---|---|
| Emprise | Celle de `SiteGeometry`. À défaut, un **rectangle 2:1 orienté est-ouest** de surface égale à la surface de référence, centré sur le site (`approximate`, rendu en filaire translucide). À défaut de surface ou de coordonnées : aucun volume. |
| Axe | Rectangle orienté minimal de l'emprise (pieds à coulisse tournants sur l'enveloppe convexe). Le côté A est le premier grand côté, le côté B le côté opposé. |
| Cellules | Le rectangle est découpé en `cellCount` bandes égales, perpendiculaires à l'axe long, chacune découpée par l'emprise (Sutherland–Hodgman). Une seule cellule si `cellCount` est absent ou vaut 1 ou moins. |
| Murs coupe-feu | Retrait de 0,6 m entre deux cellules, matérialisé par un mur qui dépasse le toit de 1 m. |
| Arêtes de toit | Acrotère de 0,35 m sur le pourtour de chaque cellule, 0,4 m au-dessus du toit (partie `edge`). |
| Quais | `dockCount` volumes de 3,5 × 1,5 × 4,5 m, régulièrement répartis le long du côté `dockSide`, à l'extérieur. Au plus **120**, et pas plus qu'il n'en tient sur la façade (un tous les 3,6 m). |
| Hauteur | `SiteTechnical.heightM`, sinon `SiteGeometry.heightM`, sinon 12 m (`heightEstimated`). |

Le résultat est une FeatureCollection. Chaque partie porte les propriétés `part` (`cell`, `firewall`, `dock` ou `edge`), `index`, `heightM` et `baseM`, et des métadonnées sont jointes : approximation, hauteur estimée, nombre de cellules et de quais réellement générés, angle, longueur et largeur.

Le serveur calcule les volumes des sites visibles, c'est-à-dire non archivés (`getFootprints`, `footprintsFromRows`), et les envoie avec les emprises, **sans aucun champ financier**. Sur la carte, chaque cellule est une entité ; les murs, quais et acrotères sont regroupés par site pour alléger les données.

Le crochet de test `window.__vigieMap.volumeParts` expose `{ cells, docks }` pour le site sélectionné.

## Géométrie (`src/domain/geometry/`)

Tout est écrit à la main, sans dépendance, sous forme de fonctions pures testées (`tests/unit/geometry.test.ts`) :

- `mercator.ts` : `toMercator`, `fromMercator`, `mercatorScale` ;
- `hull.ts` : enveloppe convexe (chaîne monotone) ;
- `obb.ts` : rectangle orienté minimal ;
- `clip.ts` : découpage par un polygone convexe (Sutherland–Hodgman), polygones à trous et multipolygones ;
- `affine.ts` : `solveAffine` (moindres carrés sur au moins 3 couples, erreur en mètres au sol, rotation, échelle, erreur explicite sur des points alignés), `applyAffine`, `invertAffine` ;
- surface géodésique : réutilisée depuis `src/domain/geo/area.ts`.

La transformation stockée (`site_plans.transform_json`) passe des **pixels du plan** (y vers le bas) au **Web Mercator** : `X = a·x + b·y + c`, `Y = d·x + e·y + f`. Les quatre coins de l'image (`imageCorners`) alimentent la source MapLibre `image`.

## Rattachement des futurs modules

Les modules suivants, prévus après la V1, s'appuieront sur les **lignes `Equipment`** et jamais sur le catalogue :

- **N100** : une ligne `n100_items` par équipement concerné (`equipment_id`, référence N100, état, criticité, action). Le filtrage par catégorie et par type utilise l'index `(site_id, type)` ;
- **contrôles réglementaires** : `regulatory_controls.equipment_id`, pour les RIA, sprinklers, portes coupe-feu, TGBT… Le rapport est un `Document` de catégorie `CONTROL_REPORT`. Une échéance dépassée pourra alimenter le statut de conformité du site : c'est alors que les couleurs de statut pourront apparaître, dans les listes de contrôles, **jamais sur les pictogrammes** ;
- **audits 360° et visites** : `equipment_id` facultatif sur un constat.

Un équipement archivé conserve son identifiant et son historique : les enregistrements rattachés restent valides.
