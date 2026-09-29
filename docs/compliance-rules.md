# Règles de conformité

Le **statut de conformité** d'un site est calculé à la lecture, côté serveur, par des fonctions pures (`src/domain/compliance/`) qui reçoivent la date du jour en paramètre. Il n'est **jamais stocké** en base : il ne peut donc pas diverger des données.

| Statut | Libellé | Signification |
|---|---|---|
| `critical` | Critique | Au moins une règle critique déclenchée |
| `warning` | À surveiller | Au moins une règle d'avertissement déclenchée, aucune critique |
| `unknown` | Non évalué | Site inactif |
| `ok` | Conforme | Aucune règle déclenchée |

Le statut est la sévérité la plus élevée parmi les règles déclenchées. Les raisons sont triées de la plus grave à la moins grave, dans l'ordre des règles à sévérité égale. Chaque raison porte un détail daté, par exemple « Arbitrage dépassé depuis le 12 mars 2026 ».

## Règles V1 (`rules.ts`)

Les dates sont des dates métier, sans heure. « Aujourd'hui » est la date du jour à Paris (`todayDateOnly()`). « Non signé » signifie que `Lease.renewalConditionsSigned` n'est pas `true` : `false` ou inconnu.

La **date d'arbitrage** est calculée par `arbitrationDate()` (`src/domain/derived.ts`) :
- `noticeDate` − 6 mois ;
- à défaut, `nextExitDate` − durée de préavis − 6 mois ;
- à défaut, aucune date.

| Identifiant | Sévérité | Condition exacte | Seuil | Libellé | Détail |
|---|---|---|---|---|---|
| `LEASE_ARBITRATION_OVERDUE` | critique | date d'arbitrage connue, **strictement antérieure** à aujourd'hui, conditions non signées | — | Arbitrage de bail dépassé | « Arbitrage dépassé depuis le {date} » |
| `LEASE_NOTICE_IMMINENT` | critique | `noticeDate` connue, aujourd'hui ≤ `noticeDate` < aujourd'hui + 3 mois, conditions non signées | `noticeImminentMonths` = 3 | Préavis imminent | « Date de préavis le {date} (dans n jours) » |
| `LEASE_END_PASSED` | critique | date retenue = `nextExitDate` si connue, sinon `endDate` ; date retenue strictement antérieure à aujourd'hui, conditions non signées | — | Bail échu | « Prochaine sortie dépassée depuis le … » ou « Fin de bail dépassée depuis le … » |
| `LEASE_ARBITRATION_SOON` | avertissement | aujourd'hui ≤ date d'arbitrage < aujourd'hui + 6 mois, conditions non signées | `arbitrationSoonMonths` = 6 | Arbitrage de bail à préparer | « Arbitrage le {date} (dans n jours) » |
| `CRITICAL_DATA_MISSING` | avertissement | adresse vide, ville vide, surface de référence inconnue (`referenceArea`) ou détenteur ICPE vide | — | Données essentielles manquantes | « Manquant : adresse, ville… » |
| `LOW_COMPLETENESS` | avertissement | score de complétude < 60 % | `minCompleteness` = 60 | Fiche incomplète | « Complétude 45 % (minimum 60 %) » |

Les seuils sont regroupés dans `COMPLIANCE_THRESHOLDS`.

Cas limites (couverts par les tests) :
- **Jour même** :
  - un arbitrage daté d'aujourd'hui n'est pas encore dépassé, mais il est « à préparer » ;
  - une date de préavis égale à aujourd'hui est imminente ;
  - une prochaine sortie égale à aujourd'hui n'est pas dépassée.
- **Seuil exact** : une date située à exactement 3 mois (préavis) ou 6 mois (arbitrage) ne déclenche pas la règle ; la veille de ce seuil, si.
- **Données de bail insuffisantes** : si une date manque, les règles de bail ne se déclenchent pas. Le manque est reflété par la complétude.
- **Bail échu** : un bail dont la date de fin est passée mais dont la prochaine sortie est dans le futur n'est **pas** échu. Si seule la date de fin est connue, c'est elle qui compte.

### Corrections de l'étape 7

- `LEASE_ARBITRATION_SOON` ne se déclenche plus si les conditions de renouvellement sont signées (`renewalConditionsSigned === true`).
- `LEASE_END_PASSED` utilise la prochaine date de sortie quand elle est connue, sinon la date de fin. Auparavant, les deux dates devaient être connues et dépassées.

## Site inactif

`isActive === false` : statut `unknown`, avec la seule raison « Site inactif », **sans évaluer les autres règles**. La complétude reste calculée. Une valeur `isActive` inconnue (`null`) est évaluée normalement.

## Complétude (`completeness.ts`)

Le score est la somme des poids des champs renseignés, divisée par la somme des poids (30), arrondie à l'entier.

| Groupe | Champ | Poids | Renseigné si |
|---|---|---|---|
| Identité | Nom | 1 | non vide et différent du code |
| | Adresse | 2 | non vide |
| | Code postal | 1 | non vide |
| | Ville | 1 | non vide |
| | Département | 1 | non vide |
| | Région | 1 | non vide |
| | Coordonnées | 2 | latitude et longitude valides |
| | Portefeuille | 1 | non vide |
| | Typologie | 1 | non vide |
| Bail | Code bail | 1 | non vide |
| | Entité porteuse du bail | 1 | non vide |
| | Date de fin de bail | 2 | connue |
| | Prochaine sortie | 2 | connue |
| | Date ou durée de préavis | 2 | l'une des deux connue |
| | Conditions de renouvellement | 1 | `true` ou `false` renseigné |
| Surfaces | Surface de référence | 3 | relevé géomètre ou surface totale > 0 |
| | Surface du terrain | 1 | > 0 |
| | Surface bureaux et locaux sociaux | 1 | > 0 |
| | Nombre de quais | 1 | renseigné |
| ICPE | Détenteur ICPE | 2 | non vide |
| | Rubriques ICPE | 2 | au moins une rubrique |

## Ajouter une règle

1. Ajouter un objet `ComplianceRule` dans `COMPLIANCE_RULES` (`rules.ts`), avec :
   - `id` en majuscules ;
   - `severity` : `warning` ou `critical` ;
   - `labelFr` ;
   - `evaluate(site, today)`, qui renvoie `{ triggered, detailFr }` et reste pure : aucune lecture de l'horloge ni de la base.
2. Si la règle a besoin d'une donnée absente de `ComplianceSite` (`types.ts`), l'ajouter au type, à la requête de `getMapSites` (`src/server/map/sites.ts`) et à la ligne de test.
3. Mettre un éventuel seuil dans `COMPLIANCE_THRESHOLDS`.
4. Écrire les tests : déclenchée, non déclenchée, jour même, veille et lendemain du seuil, données absentes.
5. Compléter ce tableau.

Les **audits** et les **contrôles réglementaires** (étapes suivantes) se brancheront de la même façon : chaque contrôle en retard deviendra une règle. Le moteur, le DTO de la carte et la légende n'ont pas à changer.
