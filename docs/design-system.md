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

## Accessibilité

- **Contraste AA** : `text` et `text-muted` dépassent 4,5:1 sur toutes les surfaces ; `accent` dépasse 4,5:1 en texte sur les panneaux et comme fond de bouton (texte `bg`). `text-subtle` (≈ 3,2:1) est réservé aux textes désactivés, aux grands textes (≥ 24 px) et aux éléments non textuels. Ces seuils sont vérifiés par `tests/unit/design-tokens.test.ts`.
- **Focus** : `:focus-visible` affiche un anneau de 2 px couleur `accent`, sur tous les éléments.
- **Clavier** : la coque se parcourt entièrement au clavier (lien d'évitement, rail, barre de commande). Ctrl+K (⌘K sur macOS) ouvre la palette et Échap la ferme.
- **Boutons-icônes** : ils portent toujours un `aria-label`, et les icônes sont `aria-hidden`.
- **Animations** : toutes sont désactivées si `prefers-reduced-motion: reduce`. Le halo critique utilise `motion-safe:`.
- **Langue** : `<html lang="fr">`.
