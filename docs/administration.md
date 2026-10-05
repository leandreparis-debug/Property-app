# Guide de l'administrateur

Ce guide décrit l'espace *Administration* de Vigie. Il est accessible depuis la barre du haut aux comptes qui détiennent au moins une permission d'administration ; chaque rubrique n'apparaît que si l'on a sa permission, et un accès direct sans la permission affiche « Accès refusé ». L'exploitation technique (tâches planifiées, exports, purges) est décrite dans [`exploitation.md`](exploitation.md).

| Rubrique | Permission | Rôle qui la détient |
|---|---|---|
| Exploitation | `settings:manage` | Administrateur |
| Utilisateurs | `user:manage` | Administrateur |
| Journal d'audit | `audit:read` | Administrateur |
| Imports | `import:run` | Administrateur |
| Enrichissement | `enrichment:apply` | Administrateur |

Les statuts affichés dans ces écrans (tâches, comptes, divergences) n'utilisent jamais le vert, l'ambre ou le rouge, réservés au statut de conformité des sites : une icône et un libellé suffisent.

## Utilisateurs

*Administration → Utilisateurs* : liste des comptes (nom, email, rôle, statut, dernière connexion, date de création), recherche par nom ou email, filtres par rôle et par statut.

### Créer un compte

1. *Nouvel utilisateur* : email, nom, rôle (Lecteur, Éditeur, Administrateur).
2. Vigie génère un **mot de passe temporaire**, affiché **une seule fois**. Le copier et le transmettre à la personne par un canal séparé (téléphone, remise en main propre) : il n'est conservé nulle part en clair et n'apparaît dans aucun journal.
3. À sa première connexion, la personne doit choisir son propre mot de passe : toutes les pages la renvoient vers *Changer le mot de passe* tant que ce n'est pas fait.

L'email est unique, sans tenir compte des majuscules.

### Actions sur un compte (menu « … »)

| Action | Effet |
|---|---|
| Changer le rôle | Nouveau rôle ; les sessions ouvertes sont fermées |
| Réinitialiser le mot de passe | Nouveau mot de passe temporaire (affiché une fois), compte déverrouillé, sessions fermées |
| Révoquer les sessions | Ferme toutes les sessions : la personne doit se reconnecter |
| Désactiver / Réactiver | Un compte désactivé ne peut plus se connecter (même message que des identifiants invalides) ; ses sessions sont fermées |

Garde-fous, vérifiés par le serveur :
- on ne peut ni se désactiver soi-même ni changer son propre rôle ;
- le **dernier administrateur actif** ne peut être ni désactivé ni rétrogradé ;
- un compte n'est **jamais supprimé** : le journal d'audit référence ses actions.

Toutes ces actions sont tracées dans le journal d'audit, sans aucune valeur secrète (le mot de passe apparaît comme `[redacted]`, une révocation comme un nombre de sessions).

Chacun peut changer son propre mot de passe depuis le menu utilisateur (*Changer mon mot de passe*) ; ses autres sessions sont alors fermées.

## Journal d'audit

*Administration → Journal d'audit* (lecture seule) : toutes les modifications, des plus récentes aux plus anciennes, 50 par page (*Lignes plus anciennes* pour continuer).

- **Filtres combinables**, conservés dans l'adresse (un lien copié restitue la même vue) : période, acteur (ou « Système »), source, action, type d'entité, site (partie du code ou du nom), champ (nom technique, avec suggestions), lot.
- Chaque ligne : date, acteur et source, action et entité (avec le code du site), champ (libellé de la fiche), ancienne et nouvelle valeur, motif, lot. **Cliquer sur un lot** affiche toutes les modifications de ce lot (un enregistrement de la fiche, un import, une application d'enrichissement, une exécution de tâche).
- Sans la permission `finance:read`, les valeurs financières sont **masquées** (cadenas, « Masqué (donnée financière) »).
- Depuis la fiche d'un site, *Voir dans le journal d'audit* ouvre le journal filtré sur ce site.
- *Exporter en CSV* télécharge le résultat filtré, au plus **50 000 lignes** (les plus récentes ; un message prévient si le filtre en compte davantage), avec le même masquage.

## Imports

*Administration → Imports* : historique des imports réels et des simulations du tableur (date, acteur, fichier, statut, lignes lues, sites créés et modifiés, lignes rejetées, champs préservés) et téléchargement des rapports (`report.csv`, `changes.csv`, `summary.json`).

L'import se lance **uniquement en ligne de commande**, toujours en simulation d'abord (voir [`import.md`](import.md)).

### Verrou d'import

Une fois l'import du tableur validé, **verrouiller l'import** (*Verrouiller l'import*, permission `settings:manage`, motif facultatif, action tracée) :
- un bandeau permanent rappelle : « La base est la source de vérité. Ne plus réimporter le tableur. » ;
- la ligne de commande refuse tout import réel avec le même message (code de sortie 1) ; la simulation reste possible.

Tant que l'import n'est pas verrouillé et qu'au moins un import réel a réussi, un encart invite à le faire.

## Enrichissement

*Administration → Enrichissement* : historique des paquets appliqués (date, acteur, fichier, champs remplis, divergences, ignorés) et **revue des divergences**. Le paquet s'applique en ligne de commande (`pnpm enrichment:apply`, voir [`offline-bundle.md`](offline-bundle.md)).

Une **divergence** est une valeur publique différente de la valeur actuelle d'un champ. Elle n'est jamais appliquée automatiquement. Il n'en existe qu'une à examiner par site, champ et valeur proposée.

- La liste (statut « À examiner » par défaut) se filtre par site, champ, source et statut. Valeur actuelle et valeur proposée sont côte à côte, avec un lien vers la fiche.
- **Conserver la valeur actuelle** : la divergence est écartée (motif facultatif). Elle ne réapparaît pas pour la même valeur proposée. Possible sur une sélection (case à cocher, *Conserver la valeur actuelle (n)*).
- **Adopter la valeur proposée** : une divergence à la fois. La valeur est écrite comme une modification de la fiche (mêmes contrôles, journal d'audit avec la source « Enrichissement » et le lot du paquet). L'adoption est refusée, avec un message, si la valeur actuelle a changé depuis la détection, si le site est archivé, ou si le champ n'est pas modifiable dans la fiche (emprise, hauteur BD TOPO : à corriger à la source).

## Exports à la demande

- Sur *Sites*, *Exporter* (permission `export:read`) télécharge la liste **telle qu'elle est filtrée**, en classeur Excel (feuilles Sites, Indicateurs annuels, Dictionnaire) ou en CSV, avec les mêmes colonnes que l'export nocturne. Sans `finance:read`, les colonnes financières sont absentes.
- Chaque export à la demande (liste ou journal) laisse une ligne « Export » dans le journal d'audit : auteur, date, périmètre (filtres), nombre de lignes.
