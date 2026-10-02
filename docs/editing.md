# Édition tracée des sites

Depuis l'étape 9, les données d'un site se modifient directement dans sa fiche (`/sites/[id]`), section par section. Chaque modification est **vérifiée côté serveur**, **tracée** dans le journal d'audit (auteur, date, ancienne et nouvelle valeur, motif facultatif) et **protégée des conflits** champ par champ.

## Principe : une section, un formulaire

Chaque bloc de la fiche issu du registre des champs (`src/domain/fields/`) porte un bouton « Modifier ». Ce bouton n'est visible qu'avec la permission requise (voir plus bas), et jamais sur un site archivé.

Le bloc passe alors en formulaire, en place. Ce formulaire est **généré à partir du registre** : libellés, types de saisie, unités et contraintes.

| Type | Saisie |
|---|---|
| `text` | champ texte |
| `longtext` | zone de texte avec compteur de caractères |
| `area`, `money`, `moneyPerSqm`, `number`, `months` | texte au format français (« 12 345,67 »), unité en suffixe |
| `integer` | champ numérique |
| `date` | sélecteur de date |
| `dateWithPrecision` | date et précision (Jour, Mois, Année) |
| `boolean` | Oui, Non ou Non renseigné |
| `enum`, `select`, `region` | liste déroulante |
| `department` | liste du référentiel avec recherche (numéro ou nom) |
| `coordinates` | latitude et longitude, en décimal |
| `url`, `reference` | champ texte validé (lien http ou https complet pour une URL) |

Fonctionnement du formulaire :
- **Validation** : les erreurs s'affichent à côté du champ, en français. Le premier champ en erreur reçoit le focus et un résumé est annoncé (`role="alert"`).
- **Avertissements** : un panneau les liste, avec « Enregistrer quand même ». Une région incohérente avec le département est proposée par « Appliquer : … ».
- **Motif** : la zone « Motif de la modification (facultatif) » accepte 500 caractères au maximum.
- **Raccourcis** : Ctrl+Entrée enregistre, Échap annule.
- **Changements non enregistrés** : une confirmation est demandée avant d'annuler, de changer d'onglet, de suivre un lien ou de quitter la page.
- **Après l'enregistrement** :
  - une notification « {n} modification(s) enregistrée(s) » s'affiche ;
  - si le statut de conformité a changé, elle l'indique (« Statut : À surveiller → Conforme ») ;
  - la page est rafraîchie (`router.refresh()`), et avec elle la fiche, l'index des sites, la carte et la liste.

## Validation partagée

`src/domain/fields/validation.ts` est utilisé par le formulaire (retour immédiat) **et** par le serveur, qui fait foi. Il fournit :
- **`buildSectionSchema(section)`** : un schéma zod des champs modifiables de la section. Il accepte les chaînes saisies et les **convertit** :
  - nombres au format français avec `parseNumber` de l'import, arrondis à l'échelle de la colonne ;
  - dates avec leur précision ;
  - booléens et listes.

  Une chaîne vide devient `null`. Les bornes, le caractère entier et la longueur maximale viennent de `constraints` (registre). Les longueurs sont lues dans le schéma Prisma par `pnpm fields:lengths`.
- **`crossFieldRules(section, valeurs)`** : les règles entre champs, appliquées aux valeurs **après** modification.

| Niveau | Règle |
|---|---|
| Erreur | date d'effet initiale postérieure à la fin de bail |
| Erreur | préavis hors de 0 à 60 mois |
| Erreur | coordonnées hors de France métropolitaine |
| Erreur | latitude sans longitude, ou l'inverse |
| Avertissement | département incohérent avec la région (la bonne région est proposée) |
| Avertissement | somme des surfaces détaillées supérieure à la surface totale |
| Avertissement | hauteur supérieure à 40 m |
| Avertissement | loyer économique au m² hors de [5 €, 300 €] |

## Liste blanche et champs non modifiables

Seuls les champs marqués `editable: true` dans le registre sont acceptés. **Tout autre champ reçu est refusé**, jamais ignoré en silence :
- le schéma est strict et renvoie « Champ non modifiable : … » ;
- `saveSiteSection` vérifie en plus la liste de la section (`refusedKeys`) ;
- rien n'est écrit.

Champs non modifiables (95 champs modifiables, 4 non modifiables, auxquels s'ajoutent les 26 exclusions techniques du registre) :

| Champ | Raison |
|---|---|
| `Site.code` | clé de l'import et de l'adresse de la fiche |
| `Site.coordinatesSource` | renseigné par le système (`manual` dès que les coordonnées sont modifiées ici) |
| `Lease.noticePeriodRaw` | texte d'origine du tableur, conservé pour la traçabilité |
| `SiteIcpe.headingsRaw` | texte d'origine du tableur ; les rubriques se modifient dans leur liste |

Les champs techniques (`id`, `version`, horodatages, `archivedAt`…) ne sont pas dans le registre, donc jamais acceptés. Les valeurs calculées (au m², évolutions, date d'arbitrage, coût d'occupation) ne sont pas stockées.

## Enregistrement et conflits (`src/server/sites/edit.ts`)

La Server Action `saveSiteSection({ siteId, section, changes, comment?, confirmWarnings? })` reçoit `changes = { champ: { from, to } }`.
- `from` est la valeur **affichée à l'ouverture du formulaire**, sous forme canonique (`WireValue` : texte, nombre, booléen, `AAAA-MM-JJ`, `{ date, precision }` ou `null`).
- `to` est la valeur saisie.

```mermaid
sequenceDiagram
  participant F as Formulaire
  participant A as saveSiteSection
  participant DB as SQL Server
  F->>F: validation (schéma du registre, règles entre champs)
  F->>A: { champ: { from, to } }, motif
  A->>A: permissions, liste blanche, validation (fait foi)
  A->>DB: transaction : verrou de la ligne du site (UPDLOCK)
  A->>DB: lecture des valeurs actuelles
  alt valeur actuelle ≠ from pour un champ demandé
    A-->>F: conflits (votre valeur, valeur actuelle, auteur, date, motif) — rien n'est écrit
    F->>F: dialogue : « Garder la leur » / « Remplacer par la mienne » / « Annuler »
    F->>A: nouvel envoi avec from = valeur actuelle
  else aucun conflit
    A->>A: règles entre champs (erreurs bloquantes, avertissements à confirmer)
    A->>DB: écriture des seuls champs modifiés (création de l'enregistrement 1-1 s'il manque)
    A->>DB: Site.version + 1 ; lignes d'audit (source ui, auteur, batchId, motif)
    A-->>F: { ok, changedCount, status: { before, after } }
  end
```

- **Conflit champ par champ** :
  - seul un champ **demandé** dont la valeur actuelle diffère de son `from` est en conflit ;
  - deux personnes qui modifient des champs différents d'une même section enregistrent toutes les deux ;
  - en cas de conflit, rien n'est écrit, et le dialogue indique qui a modifié le champ, quand, et avec quel motif ;
  - les champs sans conflit restent dans le formulaire.
- **Atomicité** : la vérification et l'écriture ont lieu dans la même transaction, après un verrou `UPDLOCK` sur la ligne du site. Deux enregistrements simultanés sur un même site sont donc traités l'un après l'autre.
- **Écritures** :
  - elles se font uniquement dans `runWithAuditContext({ actorId, source: "ui", batchId, comment })` ;
  - chaque enregistrement a **un `batchId`** (`ui_…`), et le **motif** est écrit sur chacune de ses lignes d'audit (`audit_logs.comment`) ;
  - seuls les champs réellement modifiés sont écrits : un enregistrement sans changement n'écrit rien.
- **Création implicite** : une écriture sur une entité 1-1 inexistante (par exemple le premier champ d'un bail) crée l'enregistrement.
- **Coordonnées** : quand elles sont modifiées, `coordinatesSource` passe à `manual`.
- **Site archivé** : il n'est plus modifiable. Il faut d'abord le désarchiver.

## Historique d'un champ

L'infobulle de provenance de chaque valeur propose « Historique ». Cliquer sur la valeur, ou appuyer sur Entrée quand elle a le focus, ouvre aussi le panneau d'historique. Le panneau affiche, de la plus récente à la plus ancienne :
- la date ;
- l'auteur ;
- la source ;
- **ancienne valeur → nouvelle valeur**, formatées par `formatFieldValue` ;
- le motif.

Données : `GET /api/sites/[id]/history?entity=Lease&field=endDate`.
- Protection `site:read`, plus `finance:read` pour un champ financier.
- 50 entrées au maximum.
- La création de l'enregistrement compte comme première valeur.

## Séries annuelles

Dans les onglets Financier, Énergie et Exploitation, « Modifier les valeurs » rend le tableau des indicateurs éditable, cellule par cellule :
- saisie au format français ;
- une cellule vidée supprime l'`AnnualMetric` ;
- « Ajouter une année » ajoute une colonne.

La Server Action `saveAnnualMetrics({ siteId, changes: [{ metric, year, from, to }], comment? })` :
- applique le même mécanisme `from` / `to` et les mêmes conflits ;
- écrit les valeurs avec `source = "manual"` ;
- valide avec `metricValueSchema` : valeur finie, inférieure à 10¹¹ en valeur absolue, 4 décimales au plus ;
- exige `finance:read` pour les indicateurs financiers (y compris le CA marchandise).

## Listes

Rubriques ICPE, travaux et identifiants externes se modifient ligne par ligne : ajout, modification, suppression après confirmation, motif facultatif. Server Actions `saveListItem` et `deleteListItem`, auditées.

Validation (`src/domain/fields/lists.ts`) :
- **rubrique ICPE** : code à 4 chiffres, régime de l'énumération ;
- **travaux** : type, date avec sa précision, description ;
- **identifiant externe** : système de l'énumération ; valeur unique par système **sur tous les sites**. Une valeur déjà prise est refusée avec le code du site qui la porte.

## Documents

Dans l'onglet Documents :
- **Ajout** : zone de dépôt ou bouton « Ajouter un document », catégorie obligatoire, titre (le nom de fichier nettoyé par défaut), barre de progression, erreurs en français.
- **Suppression** : confirmation et motif facultatif. Le fichier part à la corbeille du serveur.

Règles d'envoi et de stockage : voir `docs/security.md`.

## Création et archivage

- **« Nouveau site »** (`/sites`, `site:write`) :
  - champs : code (obligatoire, unique, en majuscules, `A-Z 0-9 -`), nom, adresse, code postal, ville, département, coordonnées facultatives ;
  - la région suit le département ;
  - la création est auditée, avec `coordinatesSource = "manual"` si des coordonnées sont saisies ;
  - la fiche du nouveau site s'ouvre ensuite.
- **Archivage** (administrateurs uniquement, `site:archive`) :
  - menu « Plus d'actions » de la fiche, puis « Archiver le site », avec un **motif obligatoire** ;
  - le site disparaît de la carte, de la liste, de la recherche et de la supervision ;
  - sa fiche reste accessible par son adresse, avec un bandeau et le bouton « Désarchiver » ;
  - sur `/sites`, « Afficher les sites archivés » liste les sites archivés (administrateurs).

## Interaction avec l'import du tableur

Règle de préservation (étape 4) : un champ dont la **dernière écriture** vient de l'interface (`source = "ui"`) ou de l'enrichissement n'est plus écrasé par l'import du tableur. C'est pourquoi le formulaire indique « Les valeurs saisies ici ne seront plus écrasées par un import du tableur ».

L'import peut forcer l'écrasement avec `--force` (voir `docs/import.md`). Un test d'intégration vérifie la règle après une modification faite dans l'interface.
