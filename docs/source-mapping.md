# Correspondance tableur → base de données

Ce document fait correspondre **chacune des colonnes** du tableur de référence (une ligne par entrepôt, environ 200 colonnes) à sa destination dans la base Vigie. Il sert de spécification à l'import de l'étape 4.

## Conventions

- **Destination** : `table.colonne` (nom physique SQL Server). Les indicateurs annuels sont notés `annual_metrics : CODE / année`, soit une ligne (`site_id`, `year`, `metric`, `value`, `source = 'import'`). Les codes sont définis dans `src/domain/metrics.ts`.
- **calculé** : la colonne est **ignorée à l'import**, car sa valeur est recalculée à l'affichage par `src/domain/derived.ts`. Cela concerne les valeurs au m², les évolutions N-1, le ratio bureaux et la date d'arbitrage. Les valeurs dérivées ne sont jamais stockées.
- **remplacé par le journal d'audit** : l'information est portée par `audit_logs`.
- Tous les champs métier sont facultatifs, sauf ENTREPOT et NOM ENTREPOT. Une cellule vide ou illisible donne `NULL`, et une valeur illisible est signalée dans le rapport d'import : **l'import n'échoue jamais sur une valeur absente**.
- Surfaces : `Decimal(12,2)` ; montants : `Decimal(14,2)` ; indicateurs : `Decimal(18,4)` (valeur absolue inférieure à 10¹¹, voir `docs/data-model.md`) ; coordonnées : `Decimal(9,6)` ; dates : `DATE`, normalisées par `toDateOnly()`.
- Les références entre crochets (A1…A24) renvoient à la [liste des ambiguïtés](#ambiguïtés-à-trancher).

## Tableau de correspondance

| # | Colonne du tableur | Destination | Transformation |
|---:|---|---|---|
| 1 | ENTREPOT | `sites.code` | Texte, espaces supprimés. **Obligatoire** : clé d'import (upsert). Ligne rejetée si vide. |
| 2 | CODE BAIL | `leases.code` | Texte, espaces superflus supprimés ; vide → NULL ; unique si renseigné (index unique filtré) |
| 3 | CLES QLICKSENS | `site_external_ids.value` (system = `QLIK_SENSE`) | Texte, espaces superflus supprimés ; vide → NULL ; plusieurs clés par site acceptées (séparateurs ; , / | retour à la ligne) — décision A20 |
| 4 | CODE AL | `site_external_ids.value` (system = `AL_CODE`) | Espaces supprimés, majuscules ; unique par (système, valeur) — décision A24 |
| 5 | N° | `sites.legacy_number` | Conservé en texte (évite la perte des zéros de tête) |
| 6 | NOM ENTREPOT | `sites.name` | Texte. **Obligatoire** : si vide, « Entrepôt {code} » + avertissement (décision A19) |
| 7 | PORTEFEUILLE PROPERTY | `sites.portfolio` | Texte, espaces superflus supprimés ; vide → NULL |
| 8 | BU OCCUPANTE | `sites.occupying_bu` | Texte, espaces superflus supprimés ; vide → NULL |
| 9 | BASSIN BU | `sites.bu_basin` | Texte, espaces superflus supprimés ; vide → NULL |
| 10 | PAYS | `sites.country` | Normalisé en code ISO 3166-1 alpha-2 (« France » → `FR`) ; défaut `FR` |
| 11 | RESPONSABLE DE REGION (DLR) | `sites.regional_director` | Texte, espaces superflus supprimés ; vide → NULL |
| 12 | RESPONSABLE TECHNIQUE REGIONAL (RTR) | `sites.regional_technical_manager` | Texte, espaces superflus supprimés ; vide → NULL |
| 13 | RAMSES | `site_external_ids.value` (system = `RAMSES`) | Espaces supprimés, majuscules ; unique par (système, valeur) — décision A24 |
| 14 | ENTITE PORTANT LE BAIL | `leases.holding_entity` | Texte, espaces superflus supprimés ; vide → NULL |
| 15 | STATUT D'OCCUPATION | `sites.occupancy_status` | Texte, espaces superflus supprimés ; vide → NULL (valeurs libres en V1) |
| 16 | PROPRIETAIRE DES MURS | `sites.walls_owner` | Texte, espaces superflus supprimés ; vide → NULL |
| 17 | SCI SUR ACTIF | `sites.sci_on_asset` | Texte, espaces superflus supprimés ; vide → NULL |
| 18 | PROPERTY MANAGER | `sites.property_manager` | Texte, espaces superflus supprimés ; vide → NULL |
| 19 | STATUT | `sites.status` | Texte, espaces superflus supprimés ; vide → NULL (valeurs libres en V1) |
| 20 | EN ACTIVITE | `sites.is_active` | Oui/Non (O/N, X, vide) → booléen ; autre valeur → NULL + avertissement |
| 21 | MODE D'EXPLOITATION | `sites.operating_mode` | Texte, espaces superflus supprimés ; vide → NULL |
| 22 | EXPLOITANT LOGISTIQUE | `sites.logistics_operator` | Texte, espaces superflus supprimés ; vide → NULL |
| 23 | ADRESSE | `sites.address_line`, `sites.postal_code`, `sites.city` | Extraction du code postal (5 chiffres) et de la ville qui le suit ; le reste → `address_line`. Si l'extraction échoue : texte entier dans `address_line` + avertissement (ambiguïté A4) |
| 24 | DEPARTEMENT | `sites.department_code` | Code sur 2-3 caractères (`1` → `01`, `2A`, `2B`) ; un nom de département est converti en code (ambiguïté A5) |
| 25 | REGION | `sites.region` | Texte, espaces superflus supprimés ; vide → NULL |
| 26 | LAT | `sites.latitude` + `sites.coordinates_source = 'import'` | Décimal (6 décimales), virgule acceptée ; hors métropole (41–51,2° N) → NULL + avertissement |
| 27 | LONG | `sites.longitude` | Décimal (6 décimales), virgule acceptée ; hors métropole (−5,3–9,7° E) → NULL + avertissement |
| 28 | SECTEUR DE DISTRIBUTION | `sites.distribution_sector` | Texte, espaces superflus supprimés ; vide → NULL |
| 29 | TYPOLOGIE | `sites.typology` | Texte, espaces superflus supprimés ; vide → NULL |
| 30 | ACTIVITE CIBLE | `sites.target_activity` | Texte, espaces superflus supprimés ; vide → NULL |
| 31 | MAGASINS DESSERVIS | `sites.stores_served_description` | Texte, espaces superflus supprimés ; vide → NULL |
| 32 | NOMBRE MAGASIN DESSERVIS | `sites.stores_served_count` | Entier ; vide/illisible → NULL + avertissement |
| 33 | BAIL | `leases.document_reference` | Référence texte conservée telle quelle ; le fichier lui-même rejoindra `documents` (catégorie `LEASE`) — ambiguïté A2 |
| 34 | PLANS | `site_technicals.plans_reference` | Référence texte conservée telle quelle ; fichiers → `documents` (catégorie `PLAN`) — ambiguïté A2 |
| 35 | DOSSIER ADMINISTRATIF | `sites.admin_file_reference` | Référence texte conservée telle quelle ; fichiers → `documents` (catégorie `ADMIN`) — ambiguïté A2 |
| 36 | ENTREE EN ACTIVITE | `sites.activity_start_date` | Date (JJ/MM/AAAA ou date Excel) → `toDateOnly()` ; vide/illisible → NULL + avertissement ; précision conservée dans `sites.activity_start_date_precision` (`year` : stockée au 1er janvier, affichée « 2019 ») — décision A8 |
| 37 | DATE D'EFFET BAIL INITIAL | `leases.initial_effective_date` | Date (JJ/MM/AAAA ou date Excel) → `toDateOnly()` ; vide/illisible → NULL + avertissement |
| 38 | DATE D'EFFET DERNIER AVENANT | `leases.last_amendment_date` | Date (JJ/MM/AAAA ou date Excel) → `toDateOnly()` ; vide/illisible → NULL + avertissement |
| 39 | MODALITES DU BAIL EN COURS | `leases.current_terms` | Texte long conservé tel quel |
| 40 | FRANCHISE DE LOYER INITIAL | `leases.initial_rent_free` | Texte conservé tel quel (ambiguïté A18) |
| 41 | DATE DE FIN DE BAIL | `leases.end_date` | Date (JJ/MM/AAAA ou date Excel) → `toDateOnly()` ; vide/illisible → NULL + avertissement |
| 42 | PROCHAINE DATE DE SORTIE | `leases.next_exit_date` | Date (JJ/MM/AAAA ou date Excel) → `toDateOnly()` ; vide/illisible → NULL + avertissement |
| 43 | DUREE DE PREAVIS | `leases.notice_period_raw` + `leases.notice_period_months` | Texte d'origine conservé ; extraction en mois (« 6 mois » → 6, « 1 an » → 12) ; non interprétable → months NULL + avertissement (ambiguïté A7) |
| 44 | DATE DE PREAVIS | `leases.notice_date` | Date (JJ/MM/AAAA ou date Excel) → `toDateOnly()` ; vide/illisible → NULL + avertissement |
| 45 | DATE D'ARBITRAGE POUR ECHEANCE CONTRACTUELLE (6 MOIS AVANT) | **calculé** — `arbitrationDate()` | Ignorée. Date de préavis − 6 mois, sinon prochaine sortie − préavis − 6 mois. Un écart avec la valeur du tableur est signalé dans le rapport d'import |
| 46 | AVANCEMENT NEGOCIATION | `leases.negotiation_progress` | Texte long |
| 47 | ACTUALITES | `leases.news` | Texte long |
| 48 | CONDITIONS RENOUVELLEMENT SIGNEES | `leases.renewal_conditions_signed` | Oui/Non (O/N, X, vide) → booléen ; autre valeur → NULL + avertissement |
| 49 | LOYER 2022 | `annual_metrics` : `RENT` / 2022 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (€) |
| 50 | LOYER 2023 | `annual_metrics` : `RENT` / 2023 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (€) |
| 51 | LOYER 2023 /M² | **calculé** — `perSqm()` sur `RENT` | Ignorée (valeur au m² recalculée à l'affichage) |
| 52 | LOYER 2024 | `annual_metrics` : `RENT` / 2024 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (€) |
| 53 | LOYER 2024 /M² | **calculé** — `perSqm()` sur `RENT` | Ignorée (valeur au m² recalculée à l'affichage) |
| 54 | EVOLUTION 2024 LOYER N-1 | **calculé** — `yearOverYear()` sur `RENT` | Ignorée (évolution N-1 recalculée à l'affichage) |
| 55 | LOYER 2025 | `annual_metrics` : `RENT` / 2025 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (€) |
| 56 | LOYER 2025 /M² | **calculé** — `perSqm()` sur `RENT` | Ignorée (valeur au m² recalculée à l'affichage) |
| 57 | EVOLUTION 2025 LOYER N-1 | **calculé** — `yearOverYear()` sur `RENT` | Ignorée (évolution N-1 recalculée à l'affichage) |
| 58 | LOYER 2026 | `annual_metrics` : `RENT` / 2026 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (€) |
| 59 | LOYER 2026 /M² | **calculé** — `perSqm()` sur `RENT` | Ignorée (valeur au m² recalculée à l'affichage) |
| 60 | EVOLUTION 2026 LOYER N-1 | **calculé** — `yearOverYear()` sur `RENT` | Ignorée (évolution N-1 recalculée à l'affichage) |
| 61 | LOYER PERCU 2026 | `annual_metrics` : `RENT_COLLECTED` / 2026 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement |
| 62 | MONTANT FRANCHISE | `leases.rent_free_amount` | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (€) |
| 63 | FRANCHISE MOIS | `leases.rent_free_months` | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (mois, décimales admises) |
| 64 | DUREE SUPPLEMENTAIRE | `leases.additional_duration` | Texte, espaces superflus supprimés ; vide → NULL |
| 65 | LOYER ECONOMIQUE / M² | `leases.economic_rent_per_sqm` | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement. Donnée contractuelle saisie, **pas** une valeur dérivée : exception à la règle « /M² ignorées » (ambiguïté A17) |
| 66 | VLM | `leases.market_rent_value` | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (valeur locative de marché) |
| 67 | INDEXATION | `leases.indexation` | Texte, espaces superflus supprimés ; vide → NULL |
| 68 | REVISION DE LOYER | `leases.rent_review` | Texte, espaces superflus supprimés ; vide → NULL |
| 69 | M² BUREAUX/M²TOTAL | **calculé** — `officeRatio()` | Ignorée. BLS ÷ surface de référence (ambiguïté A16) |
| 70 | PRIX BUREAUX / M2 | `leases.office_price_per_sqm` | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement. Donnée contractuelle : exception à la règle « /M² ignorées » (ambiguïté A17) |
| 71 | COMMENTAIRES LOYER | `leases.rent_comments` | Texte long |
| 72 | PORTEUR DE L'ICPE | `site_icpes.holder` | Texte, espaces superflus supprimés ; vide → NULL |
| 73 | PRINCIPALES RUBRIQUES ICPE | `site_icpes.headings_raw` + lignes `icpe_headings` | Texte d'origine conservé ; extraction des codes à 4 chiffres (ex. 1510) et du régime (A, E, D, DC, NC) ; régime absent → `UNKNOWN` |
| 74 | Lien Géorisques | `site_icpes.georisques_url` | Utilisée seulement si « URL Géorisques » est vide ; cible du lien hypertexte si la cellule en a un (URL jamais chargée par l'application) — décision A3 |
| 75 | URL Géorisques | `site_icpes.georisques_url` (si « Lien Géorisques » est vide) | **Prioritaire** sur « Lien Géorisques » ; si les deux diffèrent, l'URL est retenue + avertissement — décision A3 |
| 76 | DOCUMENTS ADMINISTRATIFS ICPE | `site_icpes.documents_reference` | Référence texte ; fichiers → `documents` (catégorie `ICPE`) |
| 77 | ANNEE DE REFERENCE | `site_energy_profiles.reference_year` | Entier ; vide/illisible → NULL + avertissement (année sur 4 chiffres) |
| 78 | ANNEE DE REFERENCE CONSO ELEC EN KWH | `site_energy_profiles.reference_electricity_kwh` | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (kWh de l'année de référence — ambiguïté A23) |
| 79 | ANNEE DE REFERENCE CONSO GAZ EN KWH | `site_energy_profiles.reference_gas_kwh` | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (kWh) |
| 80 | 2020 CONSO ELEC EN KWH | `annual_metrics` : `ELECTRICITY` / 2020 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (kWh) |
| 81 | 2020 CONSO ELEC PAR M² | **calculé** — `perSqm()` sur `ELECTRICITY` | Ignorée (valeur au m² recalculée à l'affichage) |
| 82 | 2020 CONSO GAZ EN KWH | `annual_metrics` : `GAS` / 2020 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (kWh) |
| 83 | 2020 CONSO GAZ PAR M² | **calculé** — `perSqm()` sur `GAS` | Ignorée (valeur au m² recalculée à l'affichage) |
| 84 | 2021 CONSO ELEC EN KWH | `annual_metrics` : `ELECTRICITY` / 2021 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (kWh) |
| 85 | 2021 CONSO ELEC PAR M² | **calculé** — `perSqm()` sur `ELECTRICITY` | Ignorée (valeur au m² recalculée à l'affichage) |
| 86 | 2021 CONSO GAZ EN KWH | `annual_metrics` : `GAS` / 2021 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (kWh) |
| 87 | 2021 CONSO GAZ PAR M² | **calculé** — `perSqm()` sur `GAS` | Ignorée (valeur au m² recalculée à l'affichage) |
| 88 | Refacturation Gestion Technique Oui/Non | `site_energy_profiles.technical_management_rebilled` | Oui/Non (O/N, X, vide) → booléen ; autre valeur → NULL + avertissement |
| 89 | Détail si refacturation gestion technique | `site_energy_profiles.technical_management_rebill_detail` | Texte long |
| 90 | 2022 CONSO ELEC EN KWH | `annual_metrics` : `ELECTRICITY` / 2022 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (kWh) |
| 91 | 2022 CONSO ELEC PAR M² | **calculé** — `perSqm()` sur `ELECTRICITY` | Ignorée (valeur au m² recalculée à l'affichage) |
| 92 | 2022 CONSO GAZ EN KWH | `annual_metrics` : `GAS` / 2022 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (kWh) |
| 93 | 2022 CONSO GAZ PAR M² | **calculé** — `perSqm()` sur `GAS` | Ignorée (valeur au m² recalculée à l'affichage) |
| 94 | 2022 EAU | `annual_metrics` : `WATER` / 2022 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (m³ — unité à confirmer, ambiguïté A1) |
| 95 | 2022 EAU/M² | **calculé** — `perSqm()` sur `WATER` | Ignorée (valeur au m² recalculée à l'affichage) |
| 96 | 2023 CONSO ELEC EN KWH | `annual_metrics` : `ELECTRICITY` / 2023 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (kWh) |
| 97 | 2023 CONSO ELEC PAR M² | **calculé** — `perSqm()` sur `ELECTRICITY` | Ignorée (valeur au m² recalculée à l'affichage) |
| 98 | 2023 CONSO GAZ EN KWH | `annual_metrics` : `GAS` / 2023 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (kWh) |
| 99 | 2023 CONSO GAZ PAR M² | **calculé** — `perSqm()` sur `GAS` | Ignorée (valeur au m² recalculée à l'affichage) |
| 100 | 2023 EAU | `annual_metrics` : `WATER` / 2023 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (m³ — unité à confirmer, ambiguïté A1) |
| 101 | 2023 EAU/M² | **calculé** — `perSqm()` sur `WATER` | Ignorée (valeur au m² recalculée à l'affichage) |
| 102 | CERTIFICATS OPERAT | `site_energy_profiles.operat_certificates` | Référence texte |
| 103 | CHARGES 2021 | `annual_metrics` : `CHARGES` / 2021 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (€) |
| 104 | CHARGES / M² 2021 | **calculé** — `perSqm()` sur `CHARGES` | Ignorée (valeur au m² recalculée à l'affichage) |
| 105 | CHARGES 2022 | `annual_metrics` : `CHARGES` / 2022 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (€) |
| 106 | CHARGES / M² 2022 | **calculé** — `perSqm()` sur `CHARGES` | Ignorée (valeur au m² recalculée à l'affichage) |
| 107 | CHARGES 2023 | `annual_metrics` : `CHARGES` / 2023 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (€) |
| 108 | CHARGES/M² 2023 | **calculé** — `perSqm()` sur `CHARGES` | Ignorée (valeur au m² recalculée à l'affichage) |
| 109 | PROVISIONS CHARGES 2024 | `annual_metrics` : `CHARGES_PROVISION` / 2024 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement |
| 110 | CHARGES 2024 | `annual_metrics` : `CHARGES` / 2024 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (€) |
| 111 | CHARGES/M² 2024 | **calculé** — `perSqm()` sur `CHARGES` | Ignorée (valeur au m² recalculée à l'affichage) |
| 112 | CHARGES 2026 | `annual_metrics` : `CHARGES` / 2026 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (€) |
| 113 | CHARGES 2026 /M² | **calculé** — `perSqm()` sur `CHARGES` | Ignorée (valeur au m² recalculée à l'affichage) |
| 114 | ASSURANCES 2026 | `annual_metrics` : `INSURANCE` / 2026 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (€) |
| 115 | EVOLUTION PROVISIONS N-1 | **calculé** — `metricSeries()` | Ignorée (ambiguïté A13 : une seule année de provisions) |
| 116 | ASSURANCES 2021 | `annual_metrics` : `INSURANCE` / 2021 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (€) |
| 117 | ASSURANCES / M² 2021 | **calculé** — `perSqm()` sur `INSURANCE` | Ignorée (valeur au m² recalculée à l'affichage) |
| 118 | ASSURANCES 2022 | `annual_metrics` : `INSURANCE` / 2022 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (€) |
| 119 | ASSURANCES / M² 2022 | **calculé** — `perSqm()` sur `INSURANCE` | Ignorée (valeur au m² recalculée à l'affichage) |
| 120 | ASSURANCES 2023 | `annual_metrics` : `INSURANCE` / 2023 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (€) |
| 121 | ASSURANCES/M² 2023 | **calculé** — `perSqm()` sur `INSURANCE` | Ignorée (valeur au m² recalculée à l'affichage) |
| 122 | ASSURANCES 2024 | `annual_metrics` : `INSURANCE` / 2024 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (€) |
| 123 | ASSURANCES/m² 2024 | **calculé** — `perSqm()` sur `INSURANCE` | Ignorée (valeur au m² recalculée à l'affichage) |
| 124 | EVOLUTION ASSURANCES N-1 | **calculé** — `yearOverYear()` sur `INSURANCE` | Ignorée (évolution N-1 recalculée à l'affichage) |
| 125 | TF 2021 | `annual_metrics` : `PROPERTY_TAX` / 2021 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (€) |
| 126 | TF / M² 2021 | **calculé** — `perSqm()` sur `PROPERTY_TAX` | Ignorée (valeur au m² recalculée à l'affichage) |
| 127 | TF 2022 | `annual_metrics` : `PROPERTY_TAX` / 2022 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (€) |
| 128 | TF / M² 2022 | **calculé** — `perSqm()` sur `PROPERTY_TAX` | Ignorée (valeur au m² recalculée à l'affichage) |
| 129 | TF 2023 | `annual_metrics` : `PROPERTY_TAX` / 2023 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (€) |
| 130 | TF/M² 2023 | **calculé** — `perSqm()` sur `PROPERTY_TAX` | Ignorée (valeur au m² recalculée à l'affichage) |
| 131 | EVOLUTION TF N-1 | **calculé** — `yearOverYear()` sur `PROPERTY_TAX` | Ignorée (évolution N-1 recalculée à l'affichage) |
| 132 | TF 2024 | `annual_metrics` : `PROPERTY_TAX` / 2024 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (€) |
| 133 | TF/M² 2024 | **calculé** — `perSqm()` sur `PROPERTY_TAX` | Ignorée (valeur au m² recalculée à l'affichage) |
| 134 | EVOLUTION TF 24 N-1 | **calculé** — `yearOverYear()` sur `PROPERTY_TAX` | Ignorée (évolution N-1 recalculée à l'affichage) |
| 135 | TAXES 2026 | `annual_metrics` : `TAXES_TOTAL` / 2026 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement |
| 136 | TAXE BUREAU IDF 2021 | `annual_metrics` : `OFFICE_TAX` / 2021 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (€) |
| 137 | TAXE BUREAU IDF / M² 2021 | **calculé** — `perSqm()` sur `OFFICE_TAX` | Ignorée (valeur au m² recalculée à l'affichage) |
| 138 | TAXE BUREAU IDF 2022 | `annual_metrics` : `OFFICE_TAX` / 2022 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (€) |
| 139 | TAXE BUREAU IDF / M² 2022 | **calculé** — `perSqm()` sur `OFFICE_TAX` | Ignorée (valeur au m² recalculée à l'affichage) |
| 140 | TAXE BUREAU 2023 | `annual_metrics` : `OFFICE_TAX` / 2023 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (€) |
| 141 | TAXE BUREAU /M² 2023 | **calculé** — `perSqm()` sur `OFFICE_TAX` | Ignorée (valeur au m² recalculée à l'affichage) |
| 142 | TAXE BUREAU 2024 | `annual_metrics` : `OFFICE_TAX` / 2024 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (€) |
| 143 | TAXE BUREAU /M² 2024 | **calculé** — `perSqm()` sur `OFFICE_TAX` | Ignorée (valeur au m² recalculée à l'affichage) |
| 144 | EVOLUTION TAXE BUREAU N-1 | **calculé** — `yearOverYear()` sur `OFFICE_TAX` | Ignorée (évolution N-1 recalculée à l'affichage) |
| 145 | TAXE PARKING 2024 | `annual_metrics` : `PARKING_TAX` / 2024 | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement |
| 146 | PRISE D'EFFET DU CONTRAT DE PRESTATION | `service_contracts.effective_date` | Date (JJ/MM/AAAA ou date Excel) → `toDateOnly()` ; vide/illisible → NULL + avertissement |
| 147 | CLAUSE IMMOBILIERE => CONTRAT DE PRESTATION (Oui/Non) | `service_contracts.has_real_estate_clause` | Oui/Non (O/N, X, vide) → booléen ; autre valeur → NULL + avertissement |
| 148 | DUREE DU CONTRAT DE PRESTATION | `service_contracts.duration_raw` | Texte d'origine conservé |
| 149 | DATE DE FIN DE CONTRAT DE PRESTATION | `service_contracts.end_date` | Date (JJ/MM/AAAA ou date Excel) → `toDateOnly()` ; vide/illisible → NULL + avertissement |
| 150 | RECONDUCTION DU CONTRAT DE PRESTATION | `service_contracts.renewal` | Texte, espaces superflus supprimés ; vide → NULL |
| 151 | PREAVIS DU CONTRAT DE PRESTATION | `service_contracts.notice` | Texte, espaces superflus supprimés ; vide → NULL |
| 152 | ANTERIORIETE | `service_contracts.seniority` | Texte, espaces superflus supprimés ; vide → NULL |
| 153 | DATE DE 1ERE RESILIATION | `service_contracts.first_termination_date` | Date (JJ/MM/AAAA ou date Excel) → `toDateOnly()` ; vide/illisible → NULL + avertissement |
| 154 | ETP MOYEN | `annual_metrics` : `HEADCOUNT_FTE` / **année courante** | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement ; rattachement à l'année courante signalé dans le rapport (ambiguïté A10) |
| 155 | CA MARCHANDISE | `annual_metrics` : `MERCHANDISE_REVENUE` / **année courante** | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement ; idem |
| 156 | NOMBRE DE COLIS ANNUEL | `annual_metrics` : `PARCELS` / **année courante** | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement ; idem |
| 157 | QUALITE BATIMENT | `site_technicals.building_quality` | Texte, espaces superflus supprimés ; vide → NULL |
| 158 | DATE DE CONSTRUCTION | `building_works` (kind = `CONSTRUCTION`).date | Date (JJ/MM/AAAA ou date Excel) → `toDateOnly()` ; vide/illisible → NULL + avertissement ; une ligne par date (plusieurs dates par cellule acceptées), précision dans `building_works.date_precision` — décision A9 |
| 159 | DATE DE REHABILITATION | `building_works` (kind = `REHABILITATION`).date | Idem |
| 160 | DATE D'EXTENSION | `building_works` (kind = `EXTENSION`).date | Idem ; plusieurs dates dans la cellule → plusieurs lignes |
| 161 | ENTREPOTS (TOTAL BAIL) | `site_technicals.lease_warehouse_area` | Surface m² : Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement |
| 162 | TERRAIN | `site_technicals.land_area` | Surface m² : Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement |
| 163 | SURFACE ENTREPOT TOTAL | `site_technicals.total_warehouse_area` | Surface m² : Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement |
| 164 | ENTREPOT A TEMPERATURE CONTROLE | `site_technicals.temperature_controlled_area` | Surface m² : Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement |
| 165 | ENTREPOT SEC | `site_technicals.dry_area` | Surface m² : Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement |
| 166 | EMBALLAGE | `site_technicals.packaging_area` | Surface m² : Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement |
| 167 | LOCAL DE CHARGES | `site_technicals.charging_room_area` | Surface m² : Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement |
| 168 | LOCAUX TECHNIQUES | `site_technicals.technical_rooms_area` | Surface m² : Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement |
| 169 | BLS | `site_technicals.social_office_area` | Surface m² : Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (bureaux et locaux sociaux) |
| 170 | POSTE DE GARDE | `site_technicals.guard_house_area` | Surface m² : Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement |
| 171 | HAUTEUR (M) | `site_technicals.height_m` | Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement (mètres) |
| 172 | NOMBRE DE PLACE VL | `site_technicals.car_spaces` | Entier ; vide/illisible → NULL + avertissement |
| 173 | NOMBRE DE PLACE PL | `site_technicals.truck_spaces` | Entier ; vide/illisible → NULL + avertissement |
| 174 | NOMBRE DE QUAIS | `site_technicals.dock_count` | Entier ; vide/illisible → NULL + avertissement |
| 175 | ENTREPOTS TOTAL (RELEVE DE GEOMETRE) | `site_technicals.surveyed_total_area` | Surface m² : Nombre (virgule décimale, espaces, « € » retirés) ; vide/illisible → NULL + avertissement ; surface de référence prioritaire |
| 176 | BASSIN DE RETENTION | `site_technicals.retention_basin` | Texte, espaces superflus supprimés ; vide → NULL |
| 177 | CAPACITE D'EXTENTION | `site_technicals.extension_capacity` | Texte, espaces superflus supprimés ; vide → NULL |
| 178 | NOMBRE CELLULES | `site_technicals.cell_count` | Entier ; vide/illisible → NULL + avertissement |
| 179 | SPECIFICITES TECHNIQUES | `site_technicals.technical_specifics` | Texte long |
| 180 | CERTIFICATION | `site_technicals.certification` | Texte, espaces superflus supprimés ; vide → NULL |
| 181 | BORNES | `site_technicals.ev_charging` | Texte, espaces superflus supprimés ; vide → NULL (bornes de recharge) |
| 182 | PHOTOVOLTAIQUE | `site_technicals.photovoltaic` | Texte, espaces superflus supprimés ; vide → NULL |
| 183 | Date modif | **remplacé par le journal d'audit** | Aucun champ : conservée comme métadonnée (`sheetModifiedAt`) de la ligne d'audit `IMPORT` du site ; chaque modification est tracée dans `audit_logs` — décision A21 |

## Synthèse

| Destination | Colonnes |
|---|---:|
| Champs stockés (tables `sites`, `leases`, `service_contracts`, `site_technicals`, `site_icpes`, `site_energy_profiles`, `site_external_ids`, `building_works`, `icpe_headings`) | 101 |
| Lignes `annual_metrics` | 40 |
| Calculées (ignorées) | 41 |
| Remplacée par le journal d'audit | 1 |
| **Total** | **183** |

## Ambiguïtés : décisions et points ouverts

Les décisions prises à l'étape 4 sont intégrées dans `src/server/import/mapping.ts` (voir aussi [`import.md`](import.md)). Les points encore ouverts sont éclairés par les statistiques du rapport d'import.

| # | Sujet | Hypothèse initiale | Question | Statut (étape 4) |
|---|---|---|---|---|
| A1 | **Unité de l'eau** (2022 EAU, 2023 EAU) | m³ | L'unité est-elle bien le m³, et non des litres ou des euros ? | **Ouvert** — le rapport d'import donne la médiane en m³/m² et un verdict (m³ ou litres). |
| A2 | **Format des colonnes BAIL, PLANS et DOSSIER ADMINISTRATIF** | Texte de référence conservé tel quel | Ces cellules contiennent-elles un chemin réseau, un lien SharePoint, un nom de fichier ou un simple « Oui/Non » ? Les fichiers seront-ils fournis pour être rangés dans `documents` ? | **Ouvert** — valeur conservée (cible du lien hypertexte si présent, sinon texte) ; le rapport donne la répartition url / chemin réseau / chemin local / oui-non / autre. |
| A3 | **« Lien Géorisques » et « URL Géorisques »** | Une seule colonne `georisques_url` ; « Lien » est prioritaire | Quelle différence entre les deux (fiche de l'installation, fiche de la commune, lien hypertexte Excel dont le texte diffère de la cible) ? Faut-il garder les deux ? Rappel : l'application ne charge jamais ces URL. | **Décidé** — « URL Géorisques » prioritaire, avertissement si les deux diffèrent ; cible du lien hypertexte retenue. |
| A4 | ADRESSE | Extraction du code postal et de la ville | La colonne contient-elle l'adresse complète (rue, code postal, ville) ou seulement la voie ? | **Décidé** — extraction du code postal (5 chiffres) et de la ville ; sinon adresse entière + avertissement. |
| A5 | DEPARTEMENT | Code (`69`, `2A`) | La colonne contient-elle le code, le nom, ou « 69 - Rhône » ? | **Décidé** — code, nom (sans accents ni tirets), « 95 - Val-d'Oise » ; à défaut, déduit du code postal. |
| A6 | EN ACTIVITE et STATUT | Deux champs distincts | Quelles sont les valeurs possibles de STATUT ? EN ACTIVITE fait-il doublon avec STATUT ? | **Décidé** — EN ACTIVITE → `is_active` (booléen), STATUT texte libre ; incohérence signalée. |
| A7 | DUREE DE PREAVIS | Extraction en mois, texte d'origine conservé | Existe-t-il des formulations non convertibles (« à chaque échéance triennale », « 6 mois avant la fin de chaque période ») ? | **Décidé** — texte d'origine toujours conservé ; « six mois », « 1 an », « 3 ans ferme » convertis ; le reste → avertissement. |
| A8 | ENTREE EN ACTIVITE | Date ; année seule → 1er janvier | La colonne contient-elle une date complète ou seulement une année ? | **Décidé** — précision stockée (`day`, `month`, `year`) ; année seule au 1er janvier, affichée « 2019 ». |
| A9 | DATE DE CONSTRUCTION, DATE DE REHABILITATION, DATE D'EXTENSION | Une ligne `building_works` par date ; année seule → 1er janvier | Une cellule peut-elle contenir plusieurs dates ou une description ? Une année seule est-elle fréquente ? | **Décidé** — une ligne `building_works` par date, plusieurs dates par cellule, précision stockée. |
| A10 | ETP MOYEN, CA MARCHANDISE, NOMBRE DE COLIS ANNUEL (sans année) | Rattachés à l'année courante | Faut-il plutôt les rattacher à l'année de la dernière clôture, ou à une année saisie au moment de l'import ? | **Décidé** — option `--activity-year` (par défaut année courante − 1), signalée dans le rapport. |
| A11 | Années absentes (CHARGES 2025, ASSURANCES 2025, TF 2025–2026, énergie 2024–2025) | Aucune ligne créée | Ces trous sont-ils voulus ? L'évolution N-1 de 2026 ne sera pas calculable sans 2025. | **Constat** — aucune ligne créée pour une année absente ; nouvelles années reconnues automatiquement par motif. |
| A12 | TAXE BUREAU IDF (2021–2022) et TAXE BUREAU (2023–2024) | Même indicateur `OFFICE_TAX` | S'agit-il bien de la même taxe, renommée ? | **Décidé** — même indicateur `OFFICE_TAX` ; en cas de conflit la valeur IDF est retenue + avertissement. |
| A13 | EVOLUTION PROVISIONS N-1 | Ignorée | Les provisions n'existent que pour 2024 : à quoi cette évolution se comparait-elle (charges 2023 ?) ? | **Constat** — colonne ignorée (calculée). |
| A14 | EVOLUTION TF N-1 et EVOLUTION TF 24 N-1 | Ignorées, recalculées par année | Confirmer que la première compare 2023 à 2022 et la seconde 2024 à 2023. | **Constat** — colonnes ignorées ; évolutions recalculées année par année. |
| A15 | Surface de référence des colonnes « /M² » | Relevé de géomètre, sinon surface entrepôt totale | Quelle surface le tableur utilisait-il ? Les valeurs recalculées peuvent différer de l'historique. | **Ouvert** — le rapport indique quelle surface (référence, totale, bail) explique les valeurs au m² du tableur. |
| A16 | M² BUREAUX/M²TOTAL | BLS ÷ surface de référence | Les « bureaux » correspondent-ils à la BLS ? Quel dénominateur (total bail, total entrepôt, géomètre) ? | **Ouvert** — colonne ignorée ; ratio recalculé sur la BLS. |
| A17 | LOYER ECONOMIQUE / M² et PRIX BUREAUX / M2 | Stockés, car ce sont des données contractuelles | Confirmer qu'il s'agit de valeurs saisies et non calculées. | **Décidé** — stockés (données contractuelles), exception à la règle « /M² ignorées ». |
| A18 | FRANCHISE DE LOYER INITIAL, MONTANT FRANCHISE et FRANCHISE MOIS | Trois champs distincts | Quel lien entre la franchise initiale (texte) et la franchise en cours (montant, mois) ? | **Ouvert** — trois champs distincts conservés. |
| A19 | NOM ENTREPOT vide | Repli sur le code ENTREPOT | Acceptable, ou faut-il rejeter la ligne ? | **Décidé** — « Entrepôt {code} » + avertissement. |
| A20 | CLES QLICKSENS | Une clé par site | Une cellule peut-elle contenir plusieurs clés ? Le modèle en accepte une par système et par site. | **Décidé** — plusieurs clés par site (unicité (site, système) supprimée, (système, valeur) conservée). |
| A21 | Date modif | Ignorée | Faut-il l'utiliser comme date de l'événement `IMPORT` initial dans `audit_logs` ? | **Décidé** — métadonnée de la ligne d'audit `IMPORT` du site. |
| A22 | Montants | Stockés tels quels | Les loyers, charges et taxes sont-ils HT ? Hors charges ? | **Ouvert** — montants stockés tels quels. |
| A23 | ANNEE DE REFERENCE CONSO ELEC / GAZ EN KWH | Consommation en kWh de l'année de référence | Confirmer qu'il s'agit d'une consommation et non d'une année. | **Décidé** — consommation en kWh. |
| A24 | RAMSES, CODE AL | Identifiants textuels | Formats attendus (longueur, préfixe) pour les contrôler à l'import ? | **Décidé** — espaces supprimés, majuscules ; conflit avec un autre site → erreur sur ce code seulement. |
