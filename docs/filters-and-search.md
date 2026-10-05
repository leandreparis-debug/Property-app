# Filtres, liens partageables et recherche

La carte (`/`), la liste (`/sites`) et la supervision (`/supervision`) partagent **une seule source de données**, l'index des sites, et **les mêmes filtres**, portés par l'URL. Filtrage, recherche et tri se font dans le navigateur, sans aller-retour serveur.

## Paramètres d'URL

| Paramètre | Critère | Valeurs | Exemple |
|---|---|---|---|
| `status` | Statut de conformité | `critical`, `warning`, `unknown`, `ok` (liste) | `status=critical,warning` |
| `region` | Région | noms de régions (liste) | `region=Île-de-France` |
| `dep` | Département | codes (`69`, `2A`…) (liste) | `dep=69,94` |
| `portfolio` | Portefeuille | liste | |
| `bu` | BU occupante | liste | |
| `typo` | Typologie | liste | |
| `operator` | Exploitant | liste | |
| `rule` | Raison (identifiant de règle) | `LEASE_ARBITRATION_OVERDUE`… (liste) | `rule=LEASE_NOTICE_IMMINENT` |
| `deadline` | Échéance de bail | `overdue`, `lt3m`, `lt6m`, `lt12m`, `gt12m`, `renewed`, `unknown` (liste) | `deadline=overdue,lt3m,lt6m` |
| `active` | Activité | `active` ou `inactive` (défaut : tous) | `active=active` |
| `compl` | Complétude strictement inférieure à … % | 0 à 100 | `compl=60` |
| `q` | Texte libre | code, nom, ville, département, identifiants externes | `q=rungis` |
| `sort` | Tri de la liste | colonne, préfixée de `-` pour l'ordre décroissant | `sort=-area` |
| `site` | Site sélectionné sur la carte | code | `site=SMP-001` |
| `present` | Mode présentation de la supervision | `1` | `present=1` |

**Écriture** (`serializeFilters`) :
- ordre stable (celui du tableau), valeurs triées ;
- valeurs par défaut omises ;
- les virgules et les « % » contenus dans une valeur sont échappés, de sorte que `parseFilters(serializeFilters(f))` restitue `f` (test d'aller-retour).

**Lecture** (`parseFilters`) : validée par zod. Une valeur inconnue ou mal formée est **ignorée silencieusement** ; un lien abîmé n'empêche jamais la page de s'afficher.

**Navigation** : les liens du rail vers `/`, `/sites` et `/supervision` conservent les paramètres de filtre, mais pas `site`, `sort` ni `present`. Les écritures passent par `history.replaceState` : aucune entrée d'historique, aucun rendu serveur.

### Exemples de liens partageables

- Sites critiques d'Île-de-France sur la carte : `/?status=critical&region=Île-de-France`
- Baux à arbitrer dans les 6 mois, dans la liste, par surface décroissante : `/sites?deadline=lt3m,lt6m,overdue&sort=-area`
- Supervision du Rhône et de l'Isère, en mode présentation : `/supervision?dep=38,69&present=1`
- Carte centrée sur un site, filtres conservés : `/?status=warning&site=DEMO-003`

## Règles de combinaison

- **ET** entre les critères, **OU** entre les valeurs d'un même critère : `status=critical,warning&region=Bretagne` donne les sites critiques **ou** à surveiller, **situés en** Bretagne.
- `rule` : un site correspond si **l'une** de ses raisons a l'un des identifiants demandés.
- `q` : chaque mot doit apparaître dans le code, le nom, la ville, le code ou le nom du département, ou les identifiants externes (Qlik, AL, RAMSES, code du bail). La comparaison ignore les accents, la casse et les tirets (`foldText`).
- **Options du panneau** (`buildFilterOptions`) : valeurs présentes dans l'index, avec leur nombre de sites (sur le **total**, pas sur le résultat filtré). Tri par libellé français, sauf les statuts (par sévérité) et les échéances (par urgence).

## Tranches d'échéance de bail

Calculées **côté serveur** (`leaseDeadlineBucket`). Les dates de bail exactes ne sont jamais envoyées au navigateur.

1. Conditions de renouvellement signées → **Renouvelé** (`renewed`).
2. Date de référence :
   - la date d'arbitrage calculée (préavis − 6 mois, ou prochaine sortie − durée de préavis − 6 mois) ;
   - sinon la prochaine date de sortie ;
   - sinon la date de fin.
3. Sans date → **Non renseigné** (`unknown`) ; avant aujourd'hui → **Arbitrage dépassé** (`overdue`) ; puis **< 3 mois**, **< 6 mois**, **< 12 mois**, **> 12 mois**.

Les bornes sont exclusives : une date exactement à 3 mois tombe dans « < 6 mois ».

## Recherche universelle (Ctrl+K)

La recherche est locale, sur l'index : moins de 20 ms pour 200 sites (test de performance). Le texte est replié (`foldText`) : sans accents, en minuscules, avec les tirets et apostrophes remplacés par des espaces.

**Score** des sites (rang 1 = meilleur, puis sévérité, puis nom) :

| Rang | Condition |
|---|---|
| 1 | La requête, **sans espaces**, est égale au code ou à un identifiant externe (`smp001` trouve `SMP-001`) |
| 2 | Le nom, la ville ou le code **commence** par la requête |
| 3 | **Chaque mot** de la requête est contenu dans le texte du site |
| 4 | Approximation : chaque mot d'**au moins 5 lettres** est à une distance d'édition de 1 d'un mot du site (insertion, suppression ou substitution) ; les mots plus courts doivent être contenus |

**Groupes de résultats** :
- **Sites** : au plus 8. Entrée ouvre `/?site=CODE` en conservant les filtres.
- **Lieux** : régions et départements dont le nom contient la requête, ou dont le code est égal à la requête. Entrée applique le filtre et ouvre la carte.
- **Actions** :
  - Afficher les sites critiques ;
  - Afficher les sites à surveiller ;
  - Échéances de bail à moins de 6 mois ;
  - Vue nationale ;
  - Ouvrir la supervision ;
  - Ouvrir la liste des sites ;
  - Effacer les filtres.

  Elles sont filtrées par les mots saisis. À l'ouverture, la palette vide propose les actions principales.

Les mots recherchés sont surlignés en `accent`. Sans résultat : « Aucun résultat pour « … » ».
