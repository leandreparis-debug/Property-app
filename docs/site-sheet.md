# Fiche entrepôt (`/sites/[id]`)

La fiche présente **toutes** les données d'un site, en **lecture seule** (l'édition arrive à l'étape 9). Elle est rendue côté serveur (`requireUser`). Seuls les onglets, la copie des chemins, les infobulles, l'aperçu cartographique et la navigation précédent / suivant s'exécutent dans le navigateur.

## Structure

| Élément | Fichier |
|---|---|
| Existence du site, vrai 404 | `src/app/(app)/sites/[id]/layout.tsx` |
| Page | `src/app/(app)/sites/[id]/page.tsx` |
| Chargement, erreur | `loading.tsx` (squelettes), `error.tsx` (message générique et « Réessayer ») |
| « Site introuvable » | `src/app/(app)/sites/not-found.tsx` |
| Données | `src/server/sites/detail.ts` : `getSiteDetail`, `getFieldProvenance`, `provenanceHint`, `siteExists` |
| En-tête | `src/components/site-sheet/SiteHeader.tsx`, `SheetNavigation.tsx`, `SitePreview.tsx` |
| Onglets | `SiteTabs.tsx` (ARIA) et `panels.tsx` (un composant serveur par onglet) |
| Valeurs | `FieldList.tsx` (`<dl>`, « Non renseigné »), `values.tsx` (provenance, liens, copie) |
| Tableau des indicateurs | `MetricTable.tsx`, `metric-format.ts` |
| Fonctions pures | `src/domain/fields/` (registre), `src/domain/site-sheet/`, `src/domain/geo/area.ts` |

**Chargement serveur** : deux requêtes.
- `getSiteDetail` : un seul appel Prisma pour le site et toutes ses relations. Les calculs sont faits ensuite en mémoire : conformité (`evaluateSite`), séries d'indicateurs, coût d'occupation, surface de l'emprise, données publiques groupées.
- `getFieldProvenance` : une requête fenêtrée sur `audit_logs`, par l'index `site_id`.

La couche `layout.tsx` fait en plus un `COUNT` sur la clé primaire. Il sert à répondre un **vrai 404** avant l'envoi en flux de `loading.tsx`, qui figerait sinon le code 200.

Temps mesuré sur une fiche complète : environ 40 ms à chaud, environ 260 ms au premier appel (connexion comprise).

Un identifiant mal formé (hors `[A-Za-z0-9_-]{1,30}`) répond 404 sans aucune requête. Un site **archivé** reste consultable, avec un bandeau « Site archivé ».

## En-tête

- **Fil d'Ariane** « Sites › {nom} ». Il ramène à `/sites` avec les filtres et le tri d'origine.
- **Nom**, puis en Geist Mono le code, les identifiants externes et le code bail.
- **Statut** avec toutes les raisons et leur détail.
- **Bandeaux** « Site archivé » et « Site inactif ».
- **Repères** : ville, département, région, portefeuille, BU occupante, typologie, surface de référence, complétude (barre neutre).
- **Actions** :
  - « Voir sur la carte » : `/?site=CODE` avec les filtres ;
  - « Modifier » : désactivé, avec l'infobulle « Disponible prochainement » ; absent sans `site:write` ;
  - « Imprimer ».
- **Précédent / suivant** : navigation dans la liste **filtrée et triée**, dans le même ordre que `/sites`. Raccourcis `[` et `]`, inactifs dans un champ de saisie ou une boîte de dialogue.

L'URL de la fiche porte le contexte de la liste (`listContextQuery` : filtres et `sort`, jamais `site`, `present` ni `tab`). Les liens de `/sites` le transmettent.

**Aperçu cartographique** : variante `site` de `NationalMap`.
- Centrée sur le site, zoom 16, inclinaison 55, sans contrôle.
- Seul le site est dessiné : point et emprise en volume.
- Images aériennes si elles sont installées ; mode de secours sinon.
- Un clic (ou le lien « Ouvrir sur la carte », pour le clavier) ouvre la carte principale.

## Onglets (`?tab=`)

`overview` (par défaut), `lease`, `operations`, `finance`, `energy`, `technical`, `icpe`, `documents`.
- Une valeur inconnue affiche `overview`.
- Le changement d'onglet se fait côté client (`history.replaceState`, sans aller-retour serveur) et survit au rechargement.
- Clavier : flèches, Home et End (motif ARIA « tabs », activation automatique).
- Tous les panneaux sont rendus : les inactifs sont masqués à l'écran et tous sont imprimés.

| Onglet | Contenu |
|---|---|
| Vue d'ensemble | Indicateurs (surface de référence, loyer de la dernière année, coût d'occupation au m², énergie au m²), frise du bail, raisons, champs manquants, identité, organisation, localisation |
| Bail | Frise en grand, section `lease`, section `lease_financial` (ou « Accès restreint ») |
| Exploitation | Exploitant, mode d'exploitation, contrat de prestation, ETP, CA marchandise et colis par année |
| Financier | Tableau des indicateurs financiers et du coût d'occupation, graphique loyer et coût d'occupation |
| Énergie | Profil énergétique, tableau des consommations, graphique électricité et gaz au m², graphique de l'eau |
| Technique | Surfaces et barre de répartition, capacités, caractéristiques, historique des travaux, emprise |
| ICPE et risques | Champs ICPE (dont le lien Géorisques), rubriques et régime en toutes lettres, données publiques |
| Documents | Documents par catégorie (téléchargement), références du tableur avec leur type détecté |

**Champs manquants** : les champs pondérés de la complétude non renseignés.
- Regroupés par section du registre et triés par poids.
- Chacun avec son libellé et la ou les colonnes d'origine du tableur.

**Tableaux d'indicateurs** :
- une ligne par indicateur de `src/domain/metrics.ts`, une colonne par année ;
- chaque cellule donne la valeur, la valeur au m² de surface de référence et l'évolution N-1 (flèche et signe, jamais de couleur de statut) ;
- en-têtes et première colonne collants.

## Provenance

Chaque valeur renseignée porte une infobulle, au survol ou au focus clavier : c'est la **dernière écriture** de son champ dans `audit_logs`.
- La requête retient, par (entité, identifiant, champ), la ligne `CREATE` ou `UPDATE` la plus récente (`ROW_NUMBER() … ORDER BY id DESC`).
- Une création d'enregistrement (champ `NULL`) vaut écriture de tous ses champs.
- On garde la plus récente des deux.

Libellés (`resolveProvenanceLabel`) :

| Source | Libellé |
|---|---|
| `import` | « Import du tableur — 28 sept. 2026 » |
| `ui` | « Saisie par Marie Dupont — 3 oct. 2026 » (« Saisie manuelle — … » sans auteur connu) |
| `enrichment` | « Enrichissement (source publique) — … », avec une icône neutre « source publique » à côté de la valeur |
| `system` | « Système — … » (par exemple le jeu de démonstration) |

Les valeurs des indicateurs annuels portent aussi leur provenance.

## Coût d'occupation

Calculé à la lecture (`occupancyCostSeries`) : loyer + charges + taxe foncière + taxe sur les bureaux + taxe sur les parkings + assurances.
- Il n'est calculé que pour les années où le **loyer est renseigné**.
- `TAXES_TOTAL` n'y entre pas, pour éviter un double compte.
- Si une composante manque, l'année est marquée partielle : « partiel : charges non renseignées ».
- L'infobulle de la cellule donne la composition.
- Valeur au m² sur la surface de référence.

## Garantie décennale

Pour une construction ou une extension, la fiche affiche « Fin de garantie décennale estimée : {date + 10 ans} — estimation à partir de la date de travaux » (`decennialEstimate`).
- La précision de la date de travaux est conservée : une date connue à l'année donne une année.
- La mention reste affichée tant que la fin la plus tardive possible n'est pas dépassée : fin de l'année ou du mois quand la date est imprécise.
- Affichage seul : l'estimation ne produit **aucun statut**.

## Liens et chemins

- Seuls les liens `http:` et `https:` bien formés deviennent des liens (`safeExternalUrl`). Tout autre schéma (`javascript:`, `data:`, `file:`, `vbscript:`…) est affiché en texte.
- Un lien s'ouvre dans un nouvel onglet (`target="_blank" rel="noopener noreferrer"`), avec une icône de lien externe et l'infobulle « Nécessite un accès internet depuis votre poste ». **Le serveur ne les appelle jamais.**
- Les chemins réseau (`\\serveur\partage\…`) et locaux (`C:\…`, `/mnt/…`) sont affichés en texte avec un bouton « Copier ». Jamais de lien `file://`.
- La copie utilise l'API presse-papiers, ou une zone de texte cachée sur une origine intranet en `http`.
- Références du tableur (`BAIL`, `PLANS`, `DOSSIER ADMINISTRATIF`, `DOCUMENTS ADMINISTRATIFS ICPE`) : type détecté par `detectReference`, parmi lien, chemin réseau, chemin local, oui/non ou texte.

## Données publiques

Les données de `site_public_data` sont groupées par fournisseur. Chaque groupe affiche sa source, sa date et « Donnée publique indicative, non vérifiée ».
- Un formateur par clé connue : `seismicZone`, `radonClass`, `communeRisks`, `icpeNearby`, `parcels`, `parcelsTotalAreaM2`, `urbanZones`, `companyCandidates`.
- Une clé inconnue s'affiche en paires clé / valeur (`flattenPairs`), jamais en JSON brut.
- Les valeurs sont toujours rendues comme du texte, jamais comme du balisage.

## Documents

- Les documents sont regroupés par catégorie, avec leurs libellés français (`DocumentCategory`) : titre, type, taille, date, auteur, « Télécharger ».
- Le téléchargement passe par `GET /api/documents/[id]` (voir `docs/security.md`).
- Sans document : « Aucun document enregistré », avec la mention de l'ajout à venir.

## Permission `finance:read`

Sans `finance:read`, les éléments suivants sont remplacés par « Accès restreint » :
- l'onglet Financier ;
- la section « Conditions financières du bail » (champs `financial` du registre) ;
- les indicateurs loyer et coût d'occupation de la vue d'ensemble.

Ces données ne sont alors **pas rendues du tout** : elles ne partent pas vers le navigateur.

La permission est accordée aux trois rôles. Pour la **retirer** à un rôle, supprimer `"finance:read"` de la ligne de ce rôle dans `PERMISSIONS` (`src/server/auth/permissions.ts`), puis mettre à jour la matrice attendue de `tests/unit/permissions.test.ts`.

## Impression

`@media print` (fin de `src/app/globals.css`) :
- les tokens passent en fond blanc et texte noir ;
- le rail, la barre de commande, l'aperçu cartographique, les boutons et les infobulles sont masqués ;
- tous les onglets sont déroulés, chacun avec son titre (`h2`) ;
- les tableaux sont complets, sans hauteur maximale ;
- les tableaux de données des graphiques et la liste des jalons sont imprimés ;
- le statut est écrit en toutes lettres (« Statut : Critique ») ;
- l'en-tête est « Vigie — Fiche {nom} ({code}) — imprimée le {date} ».
