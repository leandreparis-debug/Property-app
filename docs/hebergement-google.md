# Hébergement sur Google Cloud (proposition, non mise en œuvre)

> Statut : **proposition** discutée le 1er octobre 2026. Rien n'est déployé. Vigie reste conçu pour le SQL Server de la DSI sur réseau fermé. Ce document sert de base de décision.

## Pourquoi pas BigQuery comme base principale

BigQuery est un entrepôt d'analyse, pas une base transactionnelle. Vigie repose sur ce qu'il ne fait pas bien :

- **petites écritures fréquentes** (un champ, un équipement, une calibration) : environ une seconde par requête, quotas de modifications, conflits entre écritures simultanées ;
- **transactions et verrous** : l'audit est écrit dans la même transaction que la modification, et un verrou de ligne (`UPDLOCK`) départage deux éditions simultanées d'un site ;
- **contraintes d'intégrité** (codes uniques, clés étrangères) : non appliquées par BigQuery ;
- **Prisma** ne prend pas BigQuery en charge : toute la couche de données, l'audit automatique et les migrations seraient à réécrire ;
- **coût** facturé au volume lu par requête : défavorable à une application qui fait de nombreuses petites lectures.

BigQuery reste pertinent **en complément** (voir plus bas).

## Architecture proposée

| Besoin | Service | Remarque |
|---|---|---|
| Base de données | **Cloud SQL pour PostgreSQL** (conseillé) ou Cloud SQL pour SQL Server | Base transactionnelle prise en charge par Prisma. |
| Application | **Cloud Run** | L'application Next.js est déjà construite en mode `standalone`, prête pour un conteneur. |
| Plans et documents | **Cloud Storage** | Stockage permanent (remplace `STORAGE_ROOT` sur disque). |
| Accès des utilisateurs | **IAP** (Identity-Aware Proxy) | Accès réservé aux comptes Google Workspace de l'entreprise ; les rôles Vigie (lecteur, éditeur, administrateur) restent en place. |
| Tableaux de bord | **BigQuery + Looker Studio** | Copie nocturne des données (sites, baux, indicateurs annuels, statuts, équipements), sans données d'audit. |

## Choix de la base sur Cloud SQL

| Option | Travail sur le code | Coût indicatif |
|---|---|---|
| SQL Server géré | Aucun (même moteur qu'aujourd'hui) | Élevé : licence SQL Server, plusieurs centaines d'euros par mois |
| PostgreSQL (conseillé) | 1 à 2 jours, tests compris | Faible : de l'ordre de 10 à 50 € par mois pour Vigie |

Adaptations pour PostgreSQL :

1. `provider = "postgresql"` et adaptateur `@prisma/adapter-pg` dans le schéma ;
2. migrations régénérées (les contraintes `CHECK` écrites à la main sont à réécrire) ;
3. requêtes SQL brutes à adapter, notamment le verrou de site (`WITH (UPDLOCK, ROWLOCK)` → `SELECT … FOR UPDATE`) ;
4. stockage des documents : ajouter une implémentation Cloud Storage à côté du disque local ;
5. passage complet des tests unitaires, d'intégration et e2e.

## Services Google écartés pour la base

- **Firestore** : base de documents sans vraies relations ni transactions complexes, réécriture complète nécessaire.
- **Spanner** : surdimensionné et coûteux pour moins de 200 sites.
- **Google Sheets** : pas de verrous ni d'audit fiable, limites de volume.

## Prérequis avant toute mise en œuvre

- un projet Google Cloud avec facturation activée ;
- l'accord de la DSI : Vigie sortirait du réseau fermé prévu à l'origine ;
- pour un premier essai, uniquement les sites fictifs de démonstration.
