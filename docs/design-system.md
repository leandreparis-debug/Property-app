# Système de design

Thème clair et chaud, pour ordinateur uniquement : fond crème, cartes blanches arrondies, un seul accent bleu. Barre de navigation horizontale en haut. Les tokens sont définis dans `src/app/globals.css` (bloc `@theme`) et affichés sur `/dev/design` (hors production).

> **Accent provisoire.** Le bleu `#1B4F9C` sera remplacé par la valeur exacte de la charte Carrefour Property dès qu'elle sera fournie (un seul token à changer : `--color-accent`, et ses variantes `-strong` et `-soft`).

## Tokens de couleur

| Token | Valeur | Usage | Classe Tailwind |
|---|---|---|---|
| `--color-bg` | `#F5F2EC` | fond global (crème) | `bg-bg` |
| `--color-surface-1` | `#FFFFFF` | cartes, panneaux, barre du haut | `bg-surface-1` |
| `--color-surface-2` | `#FAF8F4` | champs, éléments survolés | `bg-surface-2` |
| `--color-surface-3` | `#EFEAE1` | éléments actifs, pistes de barres | `bg-surface-3` |
| `--color-border` | `#E7E1D7` | bordures standard | `border-border` |
| `--color-border-strong` | `#CFC5B5` | séparateurs marqués, survol | `border-border-strong` |
| `--color-text` | `#1D1B18` | texte principal | `text-text` |
| `--color-text-muted` | `#635D54` | texte secondaire, libellés | `text-text-muted` |
| `--color-text-subtle` | `#8A8378` | métadonnées, désactivé, grand texte | `text-text-subtle` |
| `--color-accent` | `#1B4F9C` | interactions, sélection, focus (jamais un statut) | `bg-accent`, `text-accent` |
| `--color-accent-strong` | `#123A75` | texte sur fond `accent-soft`, survol | `text-accent-strong` |
| `--color-accent-soft` | `#E8EEF8` | fond des éléments sélectionnés (onglets, puces) | `bg-accent-soft` |
| `--color-on-accent` | `#FFFFFF` | texte sur fond `accent` | `text-on-accent` |
| `--color-status-ok` | `#2F8F5B` | conforme | `bg-status-ok` |
| `--color-status-warning` | `#C98512` | écart à surveiller | `bg-status-warning` |
| `--color-status-critical` | `#CF3B32` | écart critique | `bg-status-critical` |
| `--color-status-unknown` | `#8B867D` | statut non calculable | `bg-status-unknown` |

Autres tokens : rayons `--radius-sm` 8 px, `--radius-md` 12 px, `--radius-lg` 16 px ; ombre `--shadow-panel` (douce et chaude, classe `shadow-panel`). Contrastes vérifiés par test : `text` et `text-muted` ≥ 4,5:1 sur toutes les surfaces, `accent` ≥ 4,5:1 comme texte et comme fond de bouton.

### Correspondance shadcn/ui

Les variables shadcn sont **mappées sur nos tokens**, jamais sur ses valeurs par défaut : `--background` → `bg`, `--card`/`--popover` → `surface-1`, `--primary`/`--ring` → `accent`, `--secondary`/`--muted` → `surface-2`, `--muted-foreground` → `text-muted`, `--input` → `border`.

Deux écarts volontaires :
- le rôle shadcn « accent » (fond neutre de survol) est exposé sous le nom **`highlight`** (→ `surface-3`), car notre `accent` désigne la couleur d'interaction ;
- `--destructive` est mappé sur `text`, et les composants n'ont pas de variante `destructive` : le rouge est réservé au statut. Un champ invalide se signale par une bordure claire en pointillés et un message d'erreur.

### Thème sombre (plus tard)

Tailwind v4 publie chaque token sous forme de variable CSS sur `:root`, et les utilitaires la lisent via `var()`. Un thème sombre (par exemple pour la supervision en réunion) consistera à redéfinir les `--color-*` sous un sélecteur, sans modifier les composants.

## Mise en page

- **Barre du haut** (`CommandBar` + `MainNav`, collante) : logo et nom, liens texte (l'actif souligné en `accent`, `aria-current="page"`), champ de recherche (Ctrl K), menu utilisateur. Sur les vues des sites (carte, liste, supervision), une seconde rangée porte le bouton « Filtres » et les puces des filtres actifs.
- **Contenu** : colonne centrée de 1 440 px au plus (`PageContainer`), titres de page en 30 px gras.
- **Cartes** : fond blanc, bordure `border`, rayon 16 px, ombre douce.

## Règle d'usage des couleurs de statut

> Le vert, l'ambre et le rouge **indiquent uniquement le statut de conformité d'un site**.

1. **Réservées** : aucun bouton, lien, graphique non-statut, illustration ou décoration ne les utilise. Pour les interactions, on utilise `accent` ; pour le reste, les neutres.
2. **Jamais décoratives** : une couleur de statut n'apparaît que là où un statut est affiché.
3. **Toujours doublées d'un libellé** : la couleur n'est jamais la seule information transmise. `StatusBadge` affiche le libellé (Conforme, À surveiller, Critique, Non évalué). En mode compact (`hideLabel`), il expose le libellé via `role="img"` et `aria-label`. `StatusDot` seul est décoratif (`aria-hidden`), sauf si un `label` lui est fourni.
4. Les libellés, tokens et ordres de gravité viennent exclusivement de `src/lib/status.ts`.

## Niveaux d'emphase

| Statut | Emphase | Rendu |
|---|---|---|
| `critical` | `salient`, la plus saillante | pastille pleine, anneau et halo pulsé discret ; badge teinté, texte en gras |
| `warning` | `elevated` | pastille pleine ; badge légèrement teinté |
| `unknown` | `neutral` | pastille grise ; badge sur `surface-2` |
| `ok` | `subtle`, discrète | pastille à opacité réduite ; badge sans fond |

Ordre de tri (`compareStatusSeverity`) : critical > warning > unknown > ok.

## Style verre

Utilitaire `glass`, pour les panneaux flottants au-dessus de la carte : `surface-1` (blanc) à 92 % d'opacité, `backdrop-filter: blur(12px)` et bordure `border`. À combiner avec `rounded-lg` et `shadow-panel`. Le composant `Panel` l'applique automatiquement.

## Typographie

- **Sans** (Geist, `font-sans`) : toute l'interface.
- **Mono** (Geist Mono, `font-mono`) : codes, identifiants, coordonnées.
- **Chiffres** : `font-variant-numeric: tabular-nums` est appliqué par défaut sur `body`, donc toute valeur numérique affichée est tabulaire. L'utilitaire `numeric` (mono + tabulaire) sert aux colonnes de chiffres et aux valeurs clés.
- Les polices sont auto-hébergées via le paquet npm `geist`. `next/font/google` est interdit par une règle ESLint.
- Formatage des valeurs : toujours passer par `src/lib/format.ts` (fr-FR). Une valeur absente ou invalide s'affiche « — ».

## Logo

Kit de marque « vigie-brand » : un phare dans une tuile arrondie, une lanterne et des faisceaux cyan, et le nom **VIGIE** en Unbounded semi-gras.
- **Composant** : `src/components/brand/VigieLogo.tsx`.
  - `VigieIcon` (symbole seul) ;
  - `VigieLogo` : `horizontal`, `vertical` ou `icon` ; thèmes `dark`, `light` et `mono`.
  - Sous 48 px, le composant utilise automatiquement les dessins simplifiés du favicon (32 puis 16 px). Le symbole complet n'est jamais réduit à 16 px.
- **Usages** :
  - barre du haut : `VigieIcon` de 32 px, décoratif, suivi du nom « Vigie » (lien vers l'accueil) ;
  - écran de connexion : `VigieLogo variant="vertical"` dans le titre `h1` (nom accessible : « Vigie ») ;
  - onglet : `src/app/icon.svg` (dessin 32 px), `favicon.ico` (16 et 32 px) et `apple-icon.png` (180 px).
- **Police de marque** : Unbounded 600, auto-hébergée via `@fontsource/unbounded`. Jeton `--font-brand`, **réservé au logo**.
- **Couleurs de marque** : Nuit `#0B0E12`, Ardoise `#141A21`, Blanc cassé `#EEF1F3`, Signal (cyan) `#7CC8E0`, Signal foncé `#2F6F86` (sur fond clair). Elles ne servent qu'au logo : l'`accent` de l'interface est `#1B4F9C` (provisoire).
- **Interdits** : vert, ambre ou rouge dans le logo (réservés aux statuts) ; toute déformation, ombre ou dégradé. Garder autour du logo une zone libre d'au moins 25 % de la hauteur de la tuile.
- Les SVG de référence du kit sont dans `docs/brand/`.

## Carte

**Page d'accueil « Carte du portefeuille »** (`src/app/(app)/page.tsx`) : titre et date, bouton « Nouveau site », trois cartes (`PortfolioBriefs` : **Échéances** sous 6 mois, fiches **À compléter** sous 60 %, décompte **Conformité**), puis la carte dans une carte blanche, avec à droite une colonne de 380 px : le résumé du site sélectionné (`SitePeek`), la liste des sites, ou une invitation à choisir un site.

**Étiquettes des sites** (`site-pins.ts`) : chaque site isolé est une pastille blanche (marqueur HTML, aucune police de carte nécessaire) avec la pastille de statut et, au choix (« Étiquette » : Surface / Échéance / Code), la surface de référence, la tranche d'échéance du bail ou le code. Le site sélectionné passe en `accent` (texte blanc). Les groupes (jusqu'au zoom 7) restent des disques neutres cerclés de la sévérité la plus grave.

**Fonds de carte.** **Seules les couleurs neutres** construisent le fond : les couleurs de statut n'apparaissent que sur les sites, et `accent` uniquement pour la sélection et le focus. Des tests vérifient l'absence de ces couleurs dans les styles du fond.

- **IGN Géoplateforme, en ligne** (par défaut, `MAP_BASEMAP=ign`, `style/ign-style.ts`) : « Plan IGN » (légèrement désaturé, −30 %) et photographies aériennes (BD ORTHO), tuiles WMTS chargées par le navigateur. Bascule « Plan IGN / Photo aérienne » sur la carte ; la fiche et l'onglet Plan s'ouvrent sur la photo aérienne. Voir `docs/security.md` pour l'exception au réseau fermé.
- **Fond hors ligne** (`MAP_BASEMAP=offline`, `style/basemap-style.ts`, dérivé des jetons) : terres `#F1ECE3`, eau `#D6E0E6`, routes blanches, autoroutes sable `#D9C7A4` avec un halo, limites régionales en pointillés, noms de villes en `text-muted`, bâtiments extrudés à partir du zoom 15, points d'intérêt retirés.
- **Fond de secours** (`style/fallback-style.ts`), quand rien n'est disponible : silhouettes des pays (Natural Earth 1:50 millions), France en `#F1ECE3`, voisins atténués, mer `#D6E0E6`, aucun texte ; un bandeau discret signale « Fond de carte détaillé non installé ».

**Hiérarchie des sites** (points des variantes compactes — supervision, aperçu de la fiche — et halo des sites critiques sous les pastilles), du plus discret au plus visible :

| Statut | Rendu |
|---|---|
| Conforme | petit point (rayon 3,5), opacité 55 % |
| Non évalué | cercle creux gris |
| À surveiller | point plein, rayon 6 |
| Critique | point plein, rayon 7, **halo pulsé** (rayon de 8 à 20, opacité 45 % → 0, cycle de 1,8 s) |

- Les points critiques sont dessinés par-dessus les autres (`circle-sort-key`).
- **Halo** : sur une couche séparée. Seules ses propriétés de peinture sont animées, à environ 15 images par seconde, et l'animation se met en pause quand l'onglet est caché. Avec `prefers-reduced-motion`, le halo est fixe.
- **Groupes** (jusqu'au zoom 7) : disque `surface-2` dont le contour prend la couleur de la sévérité **la plus grave** du groupe. Le nombre de sites est affiché en Geist Mono par un marqueur HTML, car Geist n'existe pas en glyphes de carte.
- **Sélection** : anneau `accent` autour du point, et volume du bâtiment teinté en `accent` atténué avec un liseré `accent`.

**Volumes des bâtiments** (à partir du zoom 14, étape 10, règles de génération dans `docs/plans-and-equipment.md`) :
- **cellules** en `fill-extrusion`, dans deux tons chauds clairs alternés à peine distincts (`#ECE6DB` et `#E3DCCF`) pour lire le découpage ;
- **murs coupe-feu** plus foncés (`#CFC5B5`), dépassant le toit de 1 m ;
- **arêtes de toit** soulignées par un acrotère fin (`#A89C88`, 0,35 m de large, 0,4 m de haut), qui remplace une ligne : MapLibre ne sait pas tracer une ligne en altitude ;
- **quais** plus foncés (`#8F8472`), 4,5 m de haut, le long du côté choisi ;
- liseré au sol de la couleur du statut du site (inchangé) ; au-dessus du dégradé vertical de MapLibre, aucune autre couleur ;
- **site sélectionné** : cellules en `accent` éclairci (`#9FB6DC`), acrotères en `accent`, via l'état global `selectedSiteId` (aucune donnée à recharger) ;
- **volume approximatif** (emprise non renseignée) : **filaire translucide**, avec des cellules, murs et quais à 22 % d'opacité, des acrotères pleins qui dessinent les arêtes et un liseré au sol en pointillés. `SitePeek` affiche « Volume approximatif (emprise non renseignée) », et « Hauteur estimée (12 m par défaut) » si la hauteur manque.

**Équipements** (`src/components/plan/`) :
- **pictogrammes dessinés à la main** en SVG dans le dépôt (`pictograms.ts`), transformés à l'exécution en images MapLibre (canvas → `map.addImage`, à 2×), sans sprite ni police ;
- **jamais de couleur de statut** : fond blanc, contour `text-muted`, trait du pictogramme en `text`. La **catégorie** se lit à la **forme** (rond pour Incendie, carré pour Électricité, losange pour Fluides, hexagone pour Environnement, pilule pour Sécurité des personnes), le **type** à l'icône ;
- `accent` est réservé à la sélection : anneau de 2,5 px autour de l'équipement sélectionné, et contour de la ligne sélectionnée dans la liste ;
- taille de 32 px, lisible dès le zoom 18 (réduite à 55 % au zoom 15). En dessous du zoom 17, les équipements sont **regroupés** en disques `surface-2` neutres ;
- le même SVG sert dans l'interface (`Pictogram`) : la liste et la carte parlent le même langage.

**Superposition du plan** (onglet Plan) :
- source MapLibre `image`, placée par ses quatre coins calculés par la transformation affine, et dessinée **sous** les volumes ;
- opacité réglable de 0 à 100 % (70 % par défaut), bouton « Masquer le plan » (`aria-pressed`) ;
- quand le plan est visible, le volume passe à 25 % d'opacité pour ne pas masquer le plan ;
- dans l'assistant de calibration, les points de contrôle sont des pastilles numérotées `surface-2` au contour `accent`, reprises à l'identique sur l'image et sur la carte ; un point suspect a un contour en pointillés `text-muted`, jamais une couleur de statut.

**Images aériennes hors ligne** (`style/ortho.ts`) : visibles à partir du zoom 14, légèrement désaturées (−0,25), pour ne jamais concurrencer les couleurs de statut.

**Panneaux** :
- `SitePeek` : colonne de droite de 380 px dans la carte. L'animation d'entrée est coupée avec `prefers-reduced-motion`.
- Aperçu au survol : carte verre qui suit le curseur sans sortir de l'écran.
- Contrôles (à droite de la carte), sélecteurs « Étiquette » et « Fond de carte » (en haut), légende avec décomptes en chiffres tabulaires et pastille des sites non localisés (en bas à gauche).
- La barre de complétude reste neutre (`text-muted` sur `surface-3`), jamais en couleur de statut.

**Mouvement** : vol de caméra `flyTo` de 1,6 s (zoom 16, inclinaison 60°). Avec `prefers-reduced-motion`, toutes les transitions de caméra sont instantanées.

## Vues denses

**Filtres partagés** (carte, liste, supervision) :
- bouton « Filtres » à droite de la barre de recherche, avec un badge `accent` qui compte les critères actifs ;
- panneau verre à gauche (320 px), une section par critère, cases à cocher avec le nombre de sites, recherche interne au-delà de 8 valeurs ;
- puces des filtres actifs sous la barre : chaque puce est un bouton « Retirer le filtre … », précédé du compteur « n / total sites » (`aria-live="polite"`).

**Légende cliquable** : un statut est un bouton (`aria-pressed`) qui ajoute ou retire ce statut du filtre. Les statuts non retenus sont atténués (45 %). Le total reste affiché ; le nombre filtré le précède quand un filtre est actif.

**Tableau** (`/sites`) :
- vrai `<table>` avec `aria-sort` sur la colonne triée ; lignes de 36 px, en-tête collant ;
- défilement vertical et horizontal dans son propre conteneur ;
- chiffres en `numeric`, alignés à droite ;
- statut : pastille et libellé court ;
- pied avec le nombre de sites affichés et la surface totale.
- Une ligne entière est cliquable et focalisable (Entrée ouvre la fiche). L'icône « Voir sur la carte » est un lien distinct.

**Supervision** :
- grille dense sur un écran (cible 1920×1080, lisible dès 1440×900) ;
- grands chiffres en Geist Mono ;
- cartes `surface-1` avec bordure ;
- titres de section en petites capitales `text-muted`.

**Couleurs dans les graphiques** :
- **Répartitions par statut** (barre empilée, barres par région) : couleurs de statut, **toujours avec une légende ou un libellé**. Le segment « Conforme » est atténué (70 %).
- **Tout autre graphique** : tokens neutres uniquement. L'histogramme des échéances est en `surface-3`, sauf la tranche « Arbitrage dépassé » en `status-critical`, avec son libellé. `accent` marque seulement la sélection (région ou tranche filtrée).
- Aucune bibliothèque de graphiques : barres en HTML/CSS.

**Mode présentation** (`?present=1`) :
- rail et barre de commande masqués ;
- plein écran si le navigateur le permet ;
- typographie agrandie de 15 % (taille racine) ;
- heure et date de mise à jour en haut à droite ;
- rafraîchissement toutes les 5 minutes ;
- Échap, la sortie du plein écran ou « Quitter » en sortent.

## Graphiques (`src/components/charts/`)

Tous les graphiques sont en **SVG écrit à la main**, sans bibliothèque. Ils sont rendus côté serveur ; seul le bouton « Voir les données » s'exécute dans le navigateur. Chacun a un **titre** et un **équivalent accessible** (tableau ou liste).

Couleurs :
- `accent` pour la série principale ;
- tons neutres (`text-muted` en pointillés, `border-strong`…) pour les autres.

Les couleurs de statut restent réservées au statut. Seule exception : le contour du jalon d'arbitrage de la frise, **uniquement** quand une règle de bail est déclenchée.

**`TrendChart`** : courbe par année.
- Points, axe de **toutes** les années de l'intervalle (une année manquante reste visible), graduations « rondes » (`niceTicks`).
- Valeurs au survol, en CSS seul (`group-hover`).
- Légende.
- Une année manquante **coupe la courbe** : jamais d'interpolation.
- « Voir les données » affiche le tableau. Replié, il reste lisible par les lecteurs d'écran (`sr-only`) et il est toujours imprimé.

**`LeaseTimeline`** (frise du bail) :
- jalons sur un axe du temps, étiquettes réparties sur quatre couloirs ;
- « Aujourd'hui » en `accent`, pointillé ;
- jalons dépassés atténués (opacité 0,45) ;
- jalon d'arbitrage entouré de la couleur du statut seulement si une règle de bail est déclenchée ;
- jalons absents omis ; sans jalon, un `EmptyState` compact ;
- la liste des jalons est donnée en texte : visible en grand format, `sr-only` sinon, imprimée dans tous les cas.

**`BreakdownBar`** (barre de répartition) :
- barre horizontale en nuances neutres, purement décorative (`aria-hidden`) ;
- sa légende (valeur et part) porte l'information.

Elle sert à la répartition des surfaces de l'onglet Technique.

**Dimensions** : `viewBox` larges (880 à 1 120 unités), pour un rendu proche de 1:1 dans la fiche et un texte qui garde sa taille.

## Fiche entrepôt

- **Valeurs** en `<dl>` (`FieldList`) ; les nombres en `numeric`.
- **Valeur absente** : « — » visible (`aria-hidden`), « Non renseigné » pour les lecteurs d'écran.
- **Provenance** : infobulle au survol et au focus clavier (valeur focusable), et icône neutre « source publique » (globe) pour les valeurs issues de l'enrichissement.
- **Évolutions N-1** : flèche et signe, en `text-muted`, jamais en couleur de statut.
- **Barre de complétude** de l'en-tête : neutre (`text-muted` sur `surface-3`).
- **Tableaux d'indicateurs** : en-têtes et première colonne collants. Le conteneur défilant est `relative`, pour que les textes `sr-only` (en position absolue) restent dans son débordement.

## Formulaires d'édition (`src/components/editing/`)

- **Champs** :
  - chaque champ a un `<label>` associé ;
  - l'unité apparaît en suffixe dans le champ (et dans le nom accessible) ;
  - les nombres sont en `numeric`.
- **Erreur** :
  - bordure en tirets, et message en texte à côté du champ, relié par `aria-describedby` ;
  - `aria-invalid` sur le champ ;
  - résumé en `role="alert"` et focus sur le premier champ en erreur ;
  - jamais de couleur de statut : `destructive` vaut la couleur du texte.
- **Section en cours d'édition** : bordure `accent`.
- **Avertissements** : panneau neutre (`surface-2`), avec « Enregistrer quand même ».
- **Notifications** : en bas à droite (`role="status"`, verre), fermées après 6 s.
- **Dialogues** (conflit, historique, suppression, archivage, nouveau site) : `Dialog` de Radix, avec un titre et une description.
- **Clavier** : Ctrl+Entrée enregistre, Échap annule ; une confirmation est demandée avant d'abandonner des changements.
- **Frise du bail** : les étiquettes trop proches se répartissent sur deux rangées, au-dessus et au-dessous de l'axe (`layoutMilestoneLabels`, fonction pure testée). Un trait de rappel relie une étiquette décalée à son jalon.

## Impression

La feuille `@media print` est à la fin de `globals.css`.
- **Couleurs** : les tokens sont redéfinis (fond `#fff`, texte `#000`, `accent` plus foncé), ce qui convertit tous les composants sans règle dédiée.
- **Éléments masqués** : rail, barre de commande, infobulles, aperçu cartographique, boutons de `main`.
- **Contenu déroulé** : chaque panneau d'onglet porte `print:block` et un titre `h2` visible à l'impression seulement.
- **Tableaux** : complets (`print:max-h-none`, `print:overflow-visible`).
- **Statut** : écrit en toutes lettres.
- **En-tête** : `data-slot="print-header"`.

## Accessibilité

- **Contraste AA** : `text` et `text-muted` dépassent 4,5:1 sur toutes les surfaces ; `accent` dépasse 4,5:1 en texte sur les panneaux et comme fond de bouton (texte `bg`). `text-subtle` (≈ 3,2:1) est réservé aux textes désactivés, aux grands textes (≥ 24 px) et aux éléments non textuels. Ces seuils sont vérifiés par `tests/unit/design-tokens.test.ts`.
- **Focus** : `:focus-visible` affiche un anneau de 2 px couleur `accent`, sur tous les éléments.
- **Clavier** : la coque se parcourt entièrement au clavier (lien d'évitement, rail, barre de commande). Ctrl+K (⌘K sur macOS) ouvre la palette et Échap la ferme.
- **Boutons-icônes** : ils portent toujours un `aria-label`, et les icônes sont `aria-hidden`.
- **Animations** : toutes sont désactivées si `prefers-reduced-motion: reduce`. Le halo critique utilise `motion-safe:`. Sur la carte, les vols de caméra deviennent des sauts et le halo est figé.
- **Vues denses** : tout se fait au clavier. Les puces sont des boutons au nom explicite. Le nombre de résultats est annoncé (`aria-live`). Le tableau est sémantique (`aria-sort`). Dans la palette Ctrl+K, chaque statut est aussi lu en texte masqué.
- **Carte** :
  - région `role="region"` nommée « Carte des entrepôts » ;
  - `SitePeek` est une région `aria-live="polite"` ;
  - le bouton « Liste des sites » ouvre une liste de boutons, triée par sévérité, qui sélectionne les sites exactement comme un clic : la carte n'est jamais le seul moyen d'accès.
- **Langue** : `<html lang="fr">`.
