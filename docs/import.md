# Import du référentiel depuis le tableur

L'import charge le tableur des entrepôts (une ligne par entrepôt, environ 200 colonnes) dans la base Vigie. Il est **rejouable** : un nouvel import du même fichier ne modifie rien. Il **tolère les données sales** : une valeur illisible ne bloque jamais l'import, elle est signalée. Il ne **supprime jamais** de site. C'est une commande en ligne **réservée aux administrateurs** ; l'écran de pilotage viendra à l'étape 11.

- Code : `src/server/import/`. Les analyseurs, les en-têtes, la correspondance, les contrôles et la planification sont des fonctions pures ; seul `writer.ts` écrit en base.
- Correspondance colonne par colonne : [`source-mapping.md`](source-mapping.md), reprise à l'identique dans `mapping.ts`. Un test vérifie que les deux concordent.

## Procédure pour l'import réel

1. **Exporter le tableur en `.xlsx`.** Dans Google Sheets : *Fichier → Télécharger → Microsoft Excel (.xlsx)*. Seul ce format est accepté, 20 Mo au maximum. Les formules sont lues par leur **valeur calculée** : l'export `.xlsx` les enregistre.
2. **Copier le fichier sur le serveur Vigie**, par exemple dans `STORAGE_ROOT/imports/sources/`.
3. **Lancer d'abord la simulation.** Elle n'écrit rien en base, pas même l'historique des imports :
   ```bash
   pnpm import:spreadsheet --file referentiel.xlsx --actor admin@vigie.local --dry-run
   ```
4. **Lire le rapport**, dans le dossier affiché à la fin : `STORAGE_ROOT/imports/dry-run-<date>/`.
   - `report.csv` : les anomalies, ligne par ligne. Il s'ouvre directement dans Excel (UTF-8, séparateur `;`).
   - `changes.csv` : les créations et modifications prévues, champ par champ, ainsi que les champs préservés.
   - `summary.json` : les chiffres clés, également affichés dans la console.
5. **Corriger dans le tableur** ce qui doit l'être (erreurs, puis avertissements), exporter à nouveau et **relancer la simulation**, jusqu'à obtenir un rapport acceptable.
6. **Lancer l'import réel** avec la même commande, sans `--dry-run`. Le rapport est écrit dans `STORAGE_ROOT/imports/<identifiant du lot>/`.
7. **Vérifier** : `pnpm db:sql -Q "SELECT status, file_name, started_at FROM import_batches ORDER BY started_at DESC"`.

Options :

| Option | Rôle |
|---|---|
| `--file <chemin>` | Fichier `.xlsx` (**obligatoire**) |
| `--actor <email>` | Administrateur **actif**, auteur de toutes les modifications dans le journal d'audit (**obligatoire**) |
| `--sheet <nom>` | Feuille à lire (par défaut, la première) |
| `--activity-year <aaaa>` | Année des colonnes d'activité sans année : ETP, CA, colis (par défaut, l'année courante moins 1) |
| `--dry-run` | Simulation : analyse, validation, comparaison avec la base et rapport, **sans aucune écriture** |
| `--force` | Désactive la règle de préservation, après une confirmation interactive (taper `ECRASER`) |

## Codes de sortie

| Code | Signification |
|---|---|
| `0` | Succès : toutes les lignes ont été importées |
| `2` | Succès partiel : au moins une ligne a été rejetée (code manquant ou en double, échec d'écriture d'un site). Les autres sites sont importés. |
| `1` | Échec : fichier refusé, acteur non autorisé, colonne ENTREPOT absente, erreur inattendue |

## Règles de l'import

- **Une transaction par site.** Un site en erreur est annulé seul, les autres sont conservés. Les sites sont écrits par 4 en parallèle (transactions indépendantes).
- **Aucune suppression de site.** Un site présent en base mais absent du fichier n'est ni supprimé ni archivé : il est seulement listé dans le rapport.
- **Colonne absente du fichier = champ inchangé.** Une cellule **vide** dans une colonne présente vide le champ (sauf s'il est préservé).
- **Idempotence.** Rejouer le même fichier ne produit aucune écriture ni ligne d'audit métier. Seuls s'ajoutent l'`ImportBatch` et une ligne d'audit `IMPORT` par site : `after_value` contient `{ sourceRow, sheetModifiedAt, batchId }`, et « Date modif » y est conservée.
- **Audit complet.** Chaque création, modification ou suppression est tracée avec `source = import`, le `batch_id` et l'administrateur passé dans `--actor`.
- **Listes synchronisées.** Identifiants externes, travaux (sur la clé `kind` + date) et rubriques ICPE (sur le code) : ce qui manque est créé, ce qui n'est plus dans le fichier est supprimé, sauf si c'est préservé.
- **Indicateurs annuels.** Une cellule vide supprime la ligne importée correspondante, sauf si elle a été saisie à la main ou par l'enrichissement.

### Règle de préservation

Un champ dont la **dernière écriture** dans le journal d'audit provient de la source `ui` (modification dans l'application) ou `enrichment` **n'est pas écrasé** par l'import. Il est compté dans « Champs préservés » et détaillé dans `changes.csv`, avec l'action « préservé ». Les indicateurs annuels dont la `source` vaut `manual` ou `enrichment` sont préservés de la même façon.

Un champ modifié dans l'application puis réécrit par un import `--force` redevient un champ « import » : les imports suivants le mettent à jour normalement.

`--force` désactive la règle : **toutes** les valeurs du fichier sont appliquées, y compris sur les champs corrigés à la main. Une confirmation interactive est demandée. À réserver à un rechargement complet et délibéré.

## Interprétation des anomalies

Sévérités : **erreur**, la ligne ou la valeur n'est pas importée ; **avertissement**, la valeur est importée ou ignorée, à vérifier ; **info**, pour information, rien à faire en général.

| Type (`kind`) | Sévérité | Signification et action |
|---|---|---|
| `missing_code` | erreur | Ligne sans code ENTREPOT : rejetée. Renseigner le code. |
| `duplicate_code` | erreur | Même code sur plusieurs lignes : seule la première est importée. Dédoublonner. |
| `external_id_conflict` | erreur | Clé Qlik, code AL ou RAMSES déjà rattaché à un autre site : ce code seul n'est pas importé. |
| `site_write_failed` | erreur | L'écriture du site a échoué, par exemple sur une contrainte en base : site non importé, les autres le sont. |
| `missing_entrepot_column` | erreur | Colonnes ENTREPOT et NOM ENTREPOT introuvables dans les 10 premières lignes : import impossible. |
| `placeholder` | info | « NC », « - », « à venir »… : valeur considérée comme vide. |
| `not_a_number`, `not_a_boolean`, `invalid_date` | avertissement | Valeur illisible : champ laissé vide. Corriger la cellule. |
| `out_of_bounds` | avertissement | Surface, hauteur ou montant hors des bornes plausibles : valeur **conservée**, à vérifier. |
| `invalid_duration` | avertissement | Préavis non convertible en mois : le texte d'origine est conservé, la durée en mois reste vide. |
| `text_truncated` | avertissement | Texte plus long que la colonne en base : tronqué. |
| `date_precision_lost` | info | Date incomplète (mois ou année seuls) dans un champ de date simple : enregistrée au premier jour de la période. |
| `missing_name` | avertissement | Nom vide : « Entrepôt {code} » utilisé. |
| `invalid_department`, `department_normalized`, `department_from_postal_code` | avertissement / info | Département non reconnu, normalisé (nom → code) ou déduit du code postal. |
| `former_region_name`, `invalid_region`, `region_from_department` | avertissement / info | Ancien nom de région remplacé, région inconnue conservée telle quelle, ou région déduite du département. |
| `department_region_mismatch` | avertissement | Le département n'appartient pas à la région indiquée. |
| `swapped_coordinates` | avertissement | Latitude et longitude inversées : **corrigées**. |
| `coordinates_outside_france`, `incomplete_coordinates` | avertissement | Coordonnées hors de la France métropolitaine ou incomplètes : **ignorées**. Le site sera géocodé à l'étape 5. |
| `address_unparsed` | avertissement | Code postal et ville non trouvés dans ADRESSE : adresse conservée entière. |
| `status_activity_mismatch` | avertissement | STATUT (« fermé », « vacant »…) incohérent avec EN ACTIVITE. |
| `arbitration_date_mismatch` | avertissement | La date d'arbitrage du tableur diffère de celle calculée par Vigie (date de préavis − 6 mois, ou prochaine sortie − préavis − 6 mois). Vigie ne stocke que la date calculée. |
| `per_sqm_mismatch` | avertissement | Une valeur au m² du tableur est incohérente (écart de plus de 1 % sur toutes les surfaces). Vigie recalcule ces valeurs. |
| `water_magnitude` | avertissement | Consommation d'eau au m² incohérente avec des m³ (litres ?). |
| `office_tax_conflict` | avertissement | TAXE BUREAU et TAXE BUREAU IDF diffèrent pour une même année : la valeur IDF est retenue. |
| `georisques_conflict` | avertissement | « URL Géorisques » et « Lien Géorisques » diffèrent : l'URL est retenue. |
| `icpe_unparsed`, `icpe_regime_unknown` | avertissement / info | Aucun code de rubrique reconnu, ou régime non précisé (`UNKNOWN`). Le texte d'origine est toujours conservé. |
| `metric_out_of_range` | avertissement | Indicateur de 100 milliards ou plus : non enregistrable avec précision, ignoré. |
| `unknown_column`, `missing_column`, `duplicate_column` | avertissement | Colonne inconnue (ignorée), attendue mais absente, ou en double (seule la première occurrence est lue). |
| `excel_cell_error` | avertissement | Cellule en erreur Excel (`#N/A`, `#REF!`…) ou formule sans valeur calculée : ignorée. |
| `preserved_field` | info | Champ modifié dans l'application : valeur actuelle conservée. |
| `activity_year` | info | Année attribuée aux colonnes ETP, CA et colis. |

### Statistiques du résumé
- **Surface utilisée par le tableur pour ses valeurs au m²** : chaque valeur « /M² » ou « PAR M² » du tableur est recalculée sur la surface de référence (géomètre, sinon totale), la surface totale et la surface du bail. La surface qui explique le plus de valeurs est indiquée. Elle sert à trancher l'ambiguïté A15 de `source-mapping.md`.
- **Eau** : médiane en m³/m² et verdict (cohérent avec des m³, ou plutôt des litres). Elle sert à trancher l'ambiguïté A1.
- **Colonnes de référence** (BAIL, PLANS, DOSSIER ADMINISTRATIF, DOCUMENTS ADMINISTRATIFS ICPE) : répartition entre `url`, `unc_path` (`\\serveur\…`), `local_path`, `yes_no`, `empty` et `other`. Elle sert à préparer la reprise des documents (ambiguïté A2).
- **Sites avec plusieurs clés Qlik**, et **sites en base absents du fichier**.

## Décisions de correspondance intégrées

| Sujet | Décision |
|---|---|
| TAXE BUREAU / TAXE BUREAU IDF | Même indicateur `OFFICE_TAX`. En cas de conflit sur une même année, la valeur IDF est retenue, avec un avertissement. |
| Géorisques | « URL Géorisques » est prioritaire sur « Lien Géorisques ». Avertissement si les deux diffèrent. Pour une cellule avec lien hypertexte, c'est la **cible** du lien qui est retenue. |
| EN ACTIVITE / STATUT | EN ACTIVITE devient le booléen `is_active` ; STATUT reste un texte libre. Leur cohérence est contrôlée. |
| Nom vide | « Entrepôt {code} », avec un avertissement. |
| ETP MOYEN, CA MARCHANDISE, NOMBRE DE COLIS ANNUEL | Rattachés à l'année `--activity-year` (par défaut, l'année courante moins 1). |
| DATE DE CONSTRUCTION, DE REHABILITATION, D'EXTENSION | Lignes `building_works`, une par date. Plusieurs dates par cellule sont acceptées. Précision `year` (« 2019 », stocké au 1er janvier), `month` ou `day`. |
| ENTREE EN ACTIVITE | Date avec sa précision (`activity_start_date_precision`). |
| ANNEE DE REFERENCE CONSO … EN KWH | Consommation en kWh de l'année de référence. |
| RAMSES, CODE AL | Espaces supprimés, mis en majuscules. |
| CLES QLICKSENS | Plusieurs clés par site acceptées (séparateurs `;` `,` `/` `|` et retour à la ligne). |
| Date modif | Aucun champ : conservée dans la ligne d'audit `IMPORT` du site. |
| PAYS vide | `FR`. |
| DEPARTEMENT | Code, nom (avec ou sans accents ni tirets) ou « 95 - Val-d'Oise ». À défaut, déduit du code postal de l'adresse. |
| REGION | Nom actuel, abréviation (IDF, PACA…) ou ancien nom (« Rhône-Alpes » → « Auvergne-Rhône-Alpes », avec un avertissement). À défaut, déduite du département. |
| Colonnes calculées (/M², PAR M², EVOLUTION, M² BUREAUX/M²TOTAL, DATE D'ARBITRAGE) | Jamais importées ; lues uniquement pour les contrôles de cohérence. **Exceptions** : LOYER ECONOMIQUE / M² et PRIX BUREAUX / M2, données contractuelles stockées dans `leases`. |
| Nouvelle année (2027…) | Reconnue automatiquement par les motifs (`LOYER 2027`, `2027 CONSO ELEC EN KWH`…), sans modification du code. |

## Fichier de test synthétique

`samples/vigie-sample.xlsx`, **entièrement fictif**, est régénéré par `pnpm sample:build` (`scripts/build-sample-spreadsheet.ts`). Il contient :
- toutes les colonnes réelles, dans l'ordre ;
- 2 lignes de titre au-dessus des en-têtes, et des en-têtes sur plusieurs lignes ;
- 21 lignes de sites fictifs, une ligne vide, un code en double et une ligne sans code, couvrant les cas sales : formats français avec « € » et « m² », « NC » et « - », dates variées, années seules, dates multiples, préavis en toutes lettres, coordonnées inversées ou hors de France, département en toutes lettres, ancien nom de région, nom vide, plusieurs clés Qlik, liens hypertextes et chemins réseau, conflit de taxe sur les bureaux, valeur au m² incohérente, eau en litres, colonne inconnue et valeur calculée par formule.

La colonne `TAXE BUREAU 2022`, absente du vrai tableur, y est ajoutée pour provoquer le conflit avec `TAXE BUREAU IDF 2022`.

## Performances (poste de développement, SQL Server sous Docker)

| Opération | 20 sites | 200 sites |
|---|---|---|
| Simulation | 0,6 s | 0,8 s |
| Premier import | 5 s environ | 30 s environ |
| Réimport sans changement | 1 s environ | 3 s environ |
