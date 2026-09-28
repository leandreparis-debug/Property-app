# Système de design

Thème unique en V1 : sombre, de type « salle de contrôle », pour ordinateur uniquement. Les tokens sont définis dans `src/app/globals.css` (bloc `@theme`) et affichés sur `/dev/design` (hors production).

## Tokens de couleur

| Token | Valeur | Usage | Classe Tailwind |
|---|---|---|---|
| `--color-bg` | `#07090C` | fond global, derrière la carte | `bg-bg` |
| `--color-surface-1` | `#0D1117` | panneaux | `bg-surface-1` |
| `--color-surface-2` | `#131923` | éléments survolés, champs | `bg-surface-2` |
| `--color-surface-3` | `#1A2230` | éléments actifs | `bg-surface-3` |
| `--color-border` | `#232C3B` | bordures standard | `border-border` |
| `--color-border-strong` | `#33405A` | séparateurs marqués, focus secondaire | `border-border-strong` |
| `--color-text` | `#E6EAF2` | texte principal | `text-text` |
| `--color-text-muted` | `#8B96A8` | texte secondaire, libellés | `text-text-muted` |
| `--color-text-subtle` | `#5B6578` | métadonnées, désactivé | `text-text-subtle` |
| `--color-accent` | `#6E8BFF` | interactions, sélection, focus (jamais un statut) | `bg-accent`, `text-accent` |
| `--color-status-ok` | `#2FB67C` | conforme | `bg-status-ok` |
| `--color-status-warning` | `#F2A93B` | écart à surveiller | `bg-status-warning` |
| `--color-status-critical` | `#F0524F` | écart critique | `bg-status-critical` |
| `--color-status-unknown` | `#5B6578` | statut non calculable | `bg-status-unknown` |

Autres tokens : rayons `--radius-sm` 6 px, `--radius-md` 10 px, `--radius-lg` 14 px ; ombre `--shadow-panel` (profonde et diffuse, classe `shadow-panel`).

### Correspondance shadcn/ui

Les variables shadcn sont **mappées sur nos tokens**, jamais sur ses valeurs par défaut : `--background` → `bg`, `--card`/`--popover` → `surface-1`, `--primary`/`--ring` → `accent`, `--secondary`/`--muted` → `surface-2`, `--muted-foreground` → `text-muted`, `--input` → `border`.

Deux écarts volontaires :
- le rôle shadcn « accent » (fond neutre de survol) est exposé sous le nom **`highlight`** (→ `surface-3`), car notre `accent` désigne la couleur d'interaction ;
- `--destructive` est mappé sur `text`, et les composants n'ont pas de variante `destructive` : le rouge est réservé au statut. Un champ invalide se signale par une bordure claire en pointillés et un message d'erreur.

### Thème clair (plus tard)

Tailwind v4 publie chaque token sous forme de variable CSS sur `:root`, et les utilitaires la lisent via `var()`. Un thème clair consistera à redéfinir les `--color-*` sous un sélecteur (par exemple `.light`), sans modifier les composants.

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

Utilitaire `glass`, pour les panneaux flottants au-dessus de la carte : `surface-1` à 72 % d'opacité, `backdrop-filter: blur(16px)` et bordure `border`. À combiner avec `rounded-lg` et `shadow-panel`. Le composant `Panel` l'applique automatiquement.

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
  - rail : `VigieIcon` de 36 px, décoratif ;
  - écran de connexion : `VigieLogo variant="vertical"` dans le titre `h1` (nom accessible : « Vigie ») ;
  - onglet : `src/app/icon.svg` (dessin 32 px), `favicon.ico` (16 et 32 px) et `apple-icon.png` (180 px).
- **Police de marque** : Unbounded 600, auto-hébergée via `@fontsource/unbounded`. Jeton `--font-brand`, **réservé au logo**.
- **Couleurs de marque** : Nuit `#0B0E12`, Ardoise `#141A21`, Blanc cassé `#EEF1F3`, Signal (cyan) `#7CC8E0`, Signal foncé `#2F6F86` (sur fond clair). Elles ne servent qu'au logo : l'`accent` de l'interface reste `#6E8BFF`.
- **Interdits** : vert, ambre ou rouge dans le logo (réservés aux statuts) ; toute déformation, ombre ou dégradé. Garder autour du logo une zone libre d'au moins 25 % de la hauteur de la tuile.
- Les SVG de référence du kit sont dans `docs/brand/`.

## Carte

La carte nationale (`src/components/map/`) garde l'ambiance « salle de contrôle ». **Seules les couleurs neutres** construisent le fond : les couleurs de statut n'apparaissent que sur les sites, et `accent` uniquement pour la sélection et le focus. Des tests vérifient l'absence de ces couleurs dans les styles du fond.

**Thème du fond** (`style/basemap-style.ts`, dérivé des jetons) :
- terres `#0B0F15`, eau `#05070A`, végétation et occupation du sol à peine distinctes ;
- frontières en `border-strong`, limites régionales en pointillés à 45 % d'opacité ;
- **autoroutes et voies rapides** mises en valeur comme axes de desserte : trait gris-bleu `#3A4A66` avec un halo flou. Les autres routes restent très discrètes (`surface-2` et `surface-3`) ;
- noms de villes en `text-muted`, seulement les villes principales avant le zoom 7 ;
- bâtiments du fond extrudés discrètement à partir du zoom 15 (`surface-2` vers `surface-3` selon la hauteur) ;
- points d'intérêt (icônes colorées) et flèches de sens unique retirés.

**Fond de secours** (`style/fallback-style.ts`), utilisé quand le fond détaillé n'est pas installé :
- silhouettes des pays (Natural Earth 1:50 millions, paquet `world-atlas`) ;
- France en `#0B0F15` avec une frontière `border-strong`, voisins atténués, mer en `bg` ;
- aucun texte, aucune police, aucun symbole ;
- un bandeau discret signale « Fond de carte détaillé non installé ».

**Hiérarchie des sites**, du plus discret au plus visible, pour que l'œil aille aux anomalies :

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

**Emprises** (à partir du zoom 14) :
- volume simple `fill-extrusion` de la hauteur connue, ou de 12 m par défaut avec la mention « Volume estimé (hauteur par défaut) » ;
- couleur neutre `surface-3` ;
- liseré au sol de la couleur du statut du site ;
- le volume détaillé viendra à l'étape 10.

**Images aériennes** (`style/ortho.ts`) : visibles à partir du zoom 14, **désaturées** (saturation −0,7), **assombries** (luminosité maximale 0,55) et légèrement contrastées (+0,12), pour ne jamais concurrencer les couleurs de statut.

**Panneaux** :
- `SitePeek` : panneau verre de 380 px qui glisse depuis la droite. L'animation est coupée avec `prefers-reduced-motion`.
- Aperçu au survol : carte verre qui suit le curseur sans sortir de l'écran.
- Contrôles, légende avec décomptes en chiffres tabulaires, pastille des sites non localisés.
- La barre de complétude reste neutre (`text-muted` sur `surface-3`), jamais en couleur de statut.

**Mouvement** : vol de caméra `flyTo` de 1,6 s (zoom 16, inclinaison 60°). Avec `prefers-reduced-motion`, toutes les transitions de caméra sont instantanées.

## Accessibilité

- **Contraste AA** : `text` et `text-muted` dépassent 4,5:1 sur toutes les surfaces ; `accent` dépasse 4,5:1 en texte sur les panneaux et comme fond de bouton (texte `bg`). `text-subtle` (≈ 3,2:1) est réservé aux textes désactivés, aux grands textes (≥ 24 px) et aux éléments non textuels. Ces seuils sont vérifiés par `tests/unit/design-tokens.test.ts`.
- **Focus** : `:focus-visible` affiche un anneau de 2 px couleur `accent`, sur tous les éléments.
- **Clavier** : la coque se parcourt entièrement au clavier (lien d'évitement, rail, barre de commande). Ctrl+K (⌘K sur macOS) ouvre la palette et Échap la ferme.
- **Boutons-icônes** : ils portent toujours un `aria-label`, et les icônes sont `aria-hidden`.
- **Animations** : toutes sont désactivées si `prefers-reduced-motion: reduce`. Le halo critique utilise `motion-safe:`. Sur la carte, les vols de caméra deviennent des sauts et le halo est figé.
- **Carte** :
  - région `role="region"` nommée « Carte des entrepôts » ;
  - `SitePeek` est une région `aria-live="polite"` ;
  - le bouton « Liste des sites » ouvre une liste de boutons, triée par sévérité, qui sélectionne les sites exactement comme un clic : la carte n'est jamais le seul moyen d'accès.
- **Langue** : `<html lang="fr">`.
