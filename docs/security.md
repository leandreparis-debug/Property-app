# Sécurité : authentification, rôles et journal d'audit

## Modèle de session

- À la connexion, le serveur tire un **jeton aléatoire de 32 octets** (`crypto.randomBytes`), encodé en base64url (43 caractères). Il l'envoie au navigateur dans un cookie `HttpOnly`.
- La table `sessions` ne stocke que **l'empreinte SHA-256** du jeton, en hexadécimal, qui sert d'identifiant de session. Une fuite de la base ne donne donc aucun jeton utilisable.
- **Deux expirations** :
  - absolue : `SESSION_ABSOLUTE_HOURS` après la création (12 h par défaut) ;
  - inactivité : `SESSION_IDLE_MINUTES` (240 min par défaut). Cette échéance glissante est renouvelée **au plus une fois toutes les 5 minutes**, pour limiter les écritures, et ne dépasse jamais l'échéance absolue.
- **Validation à chaque requête protégée** (`validateSession`). La session est refusée et supprimée si :
  - elle est expirée ;
  - l'utilisateur est désactivé ;
  - le mot de passe a changé après sa création.
- **Invalidation** : la déconnexion supprime la session. La désactivation d'un compte et le changement de mot de passe suppriment **toutes** ses sessions. `purgeExpiredSessions()` est appelée au démarrage du serveur (planification prévue à l'étape 11).

### Pourquoi pas Auth.js, et pourquoi pas de JWT
- **Auth.js** vise surtout OAuth, OIDC et les fournisseurs externes, inutiles sur un réseau fermé avec des comptes locaux. Son adaptateur pour SQL Server et Prisma 7 n'est pas maintenu, et il ajouterait une surface de configuration (callbacks, stratégies) sans bénéfice.
- **Les JWT sans état** ne se révoquent pas : désactiver un compte ou changer un mot de passe devrait prendre effet immédiatement, ce qu'une session en base permet par une simple suppression de ligne.
- **Une session opaque en base** est simple, auditable et révocable. Son coût, une lecture indexée par requête, est négligeable à l'échelle d'Vigie.

## Mots de passe
- **Hachage** : argon2id via `@node-rs/argon2`, qui fournit des binaires précompilés par npm, sans compilation ni appel réseau. Paramètres de l'OWASP : **m = 19 456 Kio, t = 2, p = 1**. Format PHC, sel aléatoire, environ 20 ms par hachage.
- **Politique** (inspirée du NIST SP 800-63B, sans règles de composition) :
  - entre 12 et 128 caractères ;
  - refusé s'il figure dans `src/server/auth/common-passwords.txt` (1 000 entrées, comparaison insensible à la casse) ;
  - refusé s'il contient la partie locale de l'email, dès qu'elle fait au moins 3 caractères.
  > La liste a été constituée hors ligne : mots et prénoms courants en français et en anglais, suffixes usuels (123, 2024, !), suites de touches. À remplacer par une liste de référence si la DSI en fournit une.
- **Aucun mot de passe en argument ni par défaut** : `pnpm user:create` et `pnpm user:reset-password` le demandent deux fois, en saisie masquée.

## Connexion et limitation des tentatives
- **Pas d'énumération des comptes.** Email inconnu, compte sans mot de passe, désactivé ou verrouillé, mauvais mot de passe : la réponse est toujours `{ ok: false, error: "Identifiants invalides." }`. Une vérification argon2 est **toujours** exécutée, contre un hachage factice si le compte n'existe pas, pour que le temps de réponse soit comparable.
- **Par compte.** 5 échecs consécutifs fixent `locked_until` à maintenant + 15 minutes. La durée double à chaque verrouillage suivant (30 min, 1 h, 2 h…), jusqu'à 24 heures au plus. Les tentatives pendant un verrouillage ne le prolongent pas. Une connexion réussie remet le compteur à zéro. `pnpm user:reset-password` déverrouille aussi le compte.
- **Par adresse IP.** Fenêtre glissante de **20 tentatives par tranche de 15 minutes**, conservée **en mémoire**.
  > ⚠ Cette limite ne vaut que pour **une seule instance** du serveur, et elle est remise à zéro au redémarrage. Avec plusieurs instances derrière un répartiteur, il faudra la déplacer dans un stockage partagé (table SQL, par exemple).
- **Adresse IP.**
  - `TRUST_PROXY=true`, derrière **un** reverse proxy qui ajoute l'adresse du client à `X-Forwarded-For` : on retient la **dernière** valeur, celle écrite par le proxy de confiance.
  - `TRUST_PROXY=false`, exposition directe : Next.js 15 n'expose pas l'adresse du socket aux Server Actions. Il la recopie lui-même dans `X-Forwarded-For`, **mais seulement si le client n'a pas déjà envoyé cet en-tête**. Vigie utilise cette valeur, en sachant qu'un client malveillant peut la falsifier pour échapper à la limite par IP. Le verrouillage par compte reste effectif. **Pour la production, placer Vigie derrière un reverse proxy et activer `TRUST_PROXY=true`.**
- **Journal** : `LOGIN`, `LOGIN_FAILED` et `LOGOUT` sont écrits dans `audit_logs` (`entity_type = "User"`, `entity_id` = identifiant du compte, ou `unknown`). `after_value` contient `{ ip, reason }`. La raison (`bad_password`, `unknown_email`, `locked`, `inactive`, `ip_rate_limited`…) n'est **jamais** montrée à l'utilisateur.

## Cookie

| Attribut | Valeur |
|---|---|
| Nom | `__Host-vigie_session` si `COOKIE_SECURE=true`, sinon `vigie_session` |
| `HttpOnly` | toujours (le cookie n'est pas lisible par `document.cookie`) |
| `SameSite` | `Lax` |
| `Path` | `/` |
| `Secure` | si `COOKIE_SECURE=true` |
| `Max-Age` | durée absolue de la session |

`COOKIE_SECURE` vaut `true` par défaut en production et `false` sinon. Le serveur interne pouvant être servi en HTTP, la variable est configurable. Au démarrage, **en production avec `COOKIE_SECURE=false`**, un avertissement explicite est affiché : le cookie circule alors en clair sur le réseau. **Recommandation : HTTPS et `COOKIE_SECURE=true`.**

## Contrôle d'accès
- **Le middleware** ne vérifie que la **présence** du cookie, pour rediriger au plus tôt :
  - pages : redirection vers `/login?next=…` ;
  - `/api/*` : réponse 401 JSON.

  Routes publiques : `/login`, `/api/health`, `/api/auth/logout` (qui accepte une session absente), les ressources statiques, et `/dev/*` hors production.
- **La validation réelle** passe par la couche d'accès `src/server/auth/current-user.ts` :
  - `getCurrentUser()`, mis en cache pour la durée de la requête ;
  - `requireUser()`, qui redirige vers la connexion ;
  - `requireRole()` et `requirePermission()`, qui lèvent `ForbiddenError` ;
  - `requirePagePermission()`, qui affiche la page « Accès refusé » avec un code HTTP 403 (`forbidden()`) ;
  - `requireApiUser()`.

  Elle est appelée par le layout `(app)`, par chaque page restreinte et par chaque Server Action. Les route handlers passent par `withApiAuth()` : 401 ou 403 en JSON, jamais de redirection.
- **La navigation** masque « Administration » aux non-administrateurs. C'est un confort visuel : `/admin` est protégé côté serveur.

### Matrice des permissions (`src/server/auth/permissions.ts`)

| Action | Lecteur (`viewer`) | Éditeur (`editor`) | Administrateur (`admin`) |
|---|:-:|:-:|:-:|
| `site:read`, `export:read` | ✓ | ✓ | ✓ |
| `finance:read` | ✓ | ✓ | ✓ |
| `site:write`, `equipment:write`, `document:upload`, `plan:calibrate` | | ✓ | ✓ |
| `site:archive` | | | ✓ |
| `import:run`, `enrichment:apply`, `user:manage`, `audit:read`, `settings:manage` | | | ✓ |

Un rôle inconnu n'accorde rien. `assertCan()` lève `ForbiddenError`. La matrice est testée de façon exhaustive (39 couples rôle × action).

### Données financières (`finance:read`)

`finance:read` protège sur la fiche entrepôt :
- l'onglet Financier ;
- les conditions financières du bail (champs `financial: true` du registre) ;
- le loyer et le coût d'occupation de la vue d'ensemble.

Sans cette permission, la page rend « Accès restreint » **à la place** de ces données, qui ne sont donc jamais envoyées au navigateur.

La permission est accordée **rôle par rôle** dans `PERMISSIONS`. La retirer à un rôle, c'est supprimer `"finance:read"` de sa ligne, puis mettre à jour la matrice attendue du test.

### Téléchargement des documents (`GET /api/documents/[id]`)

- **Protection** : `withApiAuth` avec `site:read`. Sans session : 401 JSON.
- **Identifiant** : filtré (`[A-Za-z0-9_-]{1,30}`) avant toute requête.
- **Chemin** : le chemin stocké en base (`storage_path`, relatif) est résolu par `resolveStoragePath` **sous `STORAGE_ROOT`**. Un chemin absolu, un `..` ou toute évasion est refusé : 404, journalisé comme « chemin refusé ».
- **Fichier absent** : un fichier manquant sur le disque donne un 404 journalisé (« fichier absent du stockage »), sans détail technique pour le client.
- **Réponse** :
  - envoi en flux (`createReadStream`), avec `Content-Length` ;
  - `Content-Type` issu de la base (sinon `application/octet-stream`), jamais deviné ;
  - `Content-Disposition: attachment`, avec un nom ASCII de repli et le nom exact encodé selon la RFC 5987 (`filename*=UTF-8''…`). Guillemets, séparateurs de chemin et caractères de contrôle sont retirés (`src/server/http/content-disposition.ts`) ;
  - `X-Content-Type-Options: nosniff` et `Cache-Control: private, no-store`.

**Variante en ligne** (`?inline=1`, étape 10) : elle sert à superposer le plan sur la carte et à l'afficher dans l'assistant de calibration.
- Autorisée **uniquement** pour un document de catégorie `PLAN` dont le type MIME, déterminé par la signature à l'envoi, est PNG, JPEG ou WebP. Tout autre document répond 403 « Affichage en ligne réservé aux images de plan » et doit être téléchargé.
- Réponse avec `Content-Disposition: inline`, sans nom de fichier, et les mêmes `nosniff` et `private, no-store`. Le `Content-Type` vient toujours de la base.
- Aucun SVG ni HTML ne peut être servi en ligne : ces types ne sont pas acceptés à l'envoi.

Les **liens externes** affichés par la fiche (Géorisques, GED…) sont ouverts par le navigateur de l'utilisateur, jamais par le serveur :
- seuls `http:` et `https:` deviennent des liens ;
- ils portent `rel="noopener noreferrer"` ;
- les chemins réseau ne deviennent jamais des liens `file://`.

### Édition (étape 9)

Toutes les permissions sont vérifiées **côté serveur**, dans chaque Server Action et chaque route. L'interface ne fait que masquer ce qui n'est pas autorisé.

| Action | Permission |
|---|---|
| Modifier une section, une liste, une série non financière | `site:write` |
| Modifier un champ ou un indicateur financier | `site:write` **et** `finance:read` |
| Ajouter ou supprimer un document | `document:upload` |
| Créer un site | `site:write` |
| Archiver ou désarchiver un site | `site:archive` (administrateurs uniquement) |
| Ajouter un plan (document `PLAN`), le calibrer ou le recalibrer | `plan:calibrate` (et `document:upload` pour l'envoi) |
| Créer, déplacer, modifier ou archiver un équipement | `equipment:write` |
| Choisir le côté des quais du volume 3D | `site:write` |

Règles de sécurité de l'édition :
- **Liste blanche** : seuls les champs `editable: true` du registre sont acceptés. Tout autre champ fait refuser la requête entière.
- **Motif** : 500 caractères au maximum ; il est obligatoire pour archiver.
- **Traçabilité** : les écritures passent par `runWithAuditContext({ source: "ui", actorId, batchId, comment })`.
- **Site archivé** : il n'est pas modifiable.
- **Server Actions** : Next.js vérifie leur origine.
- **Routes** : les routes qui modifient des données passent par `withApiAuth`, qui exige un en-tête `Origin` identique à `APP_URL` (403 sinon, y compris sans en-tête).

### Ajout et suppression de documents

**Ajout** : `POST /api/sites/[id]/documents` (multipart, `document:upload`, `Origin` vérifié).
- **Taille** : **50 Mo** au maximum. `Content-Length` est contrôlé **avant** toute lecture, puis le flux est compté pendant la lecture (`readLimitedBody`), si bien qu'un en-tête absent ou mensonger ne permet pas de dépasser la limite. Au-delà : 413 « Fichier trop volumineux (50 Mo maximum) ».
- **Types autorisés** : PDF, PNG, JPEG, WebP, DOCX, XLSX, PPTX, DWG, DXF. Ils sont vérifiés **par la signature du contenu**, pas seulement par l'extension (`src/domain/documents.ts`) :
  - octets magiques pour PDF, PNG, JPEG, WebP et DWG ;
  - archive ZIP contenant `[Content_Types].xml` et la partie attendue (`word/`, `xl/`, `ppt/`) pour DOCX, XLSX et PPTX ;
  - texte sans octet nul commençant par un groupe `0 / SECTION` pour DXF.

  Un contenu qui ne correspond pas à son extension est refusé (415).
- **Plans** (catégorie `PLAN`, étape 10) : les contrôles sont plus stricts.
  - Seules les images PNG, JPEG et WebP sont acceptées ; un PDF, un DWG ou un DXF est refusé (415) avec un message invitant à exporter le plan AutoCAD en image.
  - Les dimensions sont lues dans l'en-tête par une fonction pure, sans décodage (`src/domain/image-size.ts`). Au-delà de 8 192 px de côté : 400.
  - La permission `plan:calibrate` est exigée (403 sinon).
  - Le `SitePlan` courant est créé dans la même transaction auditée que le `Document`.
- **Nom de fichier** : nettoyé (chemin retiré ; lettres, chiffres, espaces et `- _ . , ( ) ' &` uniquement ; 150 caractères au plus) et utilisé comme titre par défaut.
- **Stockage** : `STORAGE_ROOT/documents/{siteId}/{documentId}.{ext}`, chemin résolu sous `STORAGE_ROOT`. Le nom stocké est **généré** : le nom fourni par le navigateur n'est jamais utilisé comme chemin.
- **Base** : le `sha256`, la taille et le type MIME déterminé par la signature sont enregistrés. La création du `Document` est auditée.

**Suppression** : `DELETE /api/documents/[id]` (même permission, `Origin` vérifié, motif facultatif).
- La suppression de la ligne est auditée.
- Le fichier est **déplacé** dans `STORAGE_ROOT/trash/documents/`, jamais effacé ; la purge viendra à l'étape 11.
- Un document encore rattaché à un plan est refusé (409).

**Téléchargement** : inchangé, `Content-Disposition: attachment` et `X-Content-Type-Options: nosniff`, donc aucun document n'est affiché par le navigateur dans l'origine de l'application.

**Absence d'antivirus** : le réseau fermé ne dispose d'**aucun antivirus** côté serveur. Les documents déposés ne sont pas analysés. Le risque est limité par :
- la liste fermée de types vérifiés par signature (pas d'exécutable, de HTML ni de SVG) ;
- le téléchargement forcé en pièce jointe ;
- l'absence de toute exécution ou conversion côté serveur ;
- la réservation de l'ajout aux rôles `document:upload`.

Il reste recommandé d'analyser les fichiers sur les postes (antivirus local) et, au déploiement (étape 12), d'étudier le branchement d'un analyseur si l'infrastructure en propose un.

### Plans et équipements (étape 10)

- **Server Actions** : `savePlanCalibration`, `setDockSide`, `createEquipment`, `updateEquipment`, `moveEquipment` et `archiveEquipment` délèguent à `src/server/plans/edit.ts` et `src/server/equipment/edit.ts`, qui vérifient la permission, verrouillent la ligne du site (`UPDLOCK`), refusent un site archivé et écrivent dans une transaction auditée (`source: "ui"`, un `batchId` par action, motif facultatif).
- **Recalibration** : les coordonnées des équipements posés sur le plan sont recalculées dans la **même** transaction, avec le **même** `batchId` que la calibration.
- **Validation** :
  - le type d'équipement doit appartenir au catalogue (zod) ;
  - les points de contrôle sont des nombres finis, 20 au maximum, avec une latitude dans ±85° ;
  - des points alignés sont refusés ;
  - une position d'équipement à plus de 1 km du site est refusée ;
  - les textes ont une longueur limitée.
- **Lecture pour la carte nationale** : `GET /api/sites/[id]/equipments` (`site:read`) ne renvoie que l'identifiant, le type, le libellé et la position des équipements non archivés d'un site non archivé.
- **Pictogrammes** : SVG écrits dans le dépôt et transformés en images dans le navigateur (`data:`, déjà autorisé par `img-src`). Aucun SVG fourni par un utilisateur n'est jamais affiché.

## Fond de carte IGN en ligne (exception au réseau fermé)

Par défaut (`MAP_BASEMAP=ign`), le **navigateur** de chaque utilisateur charge le « Plan IGN » et les photographies aériennes sur la Géoplateforme de l'IGN (`https://data.geopf.fr`, données publiques, licence Etalab). C'est un choix assumé de la refonte visuelle ; ses limites :

- **Le serveur n'appelle jamais internet** : seuls les postes des utilisateurs contactent `data.geopf.fr`. Ils doivent y avoir accès (proxy de l'entreprise).
- **CSP** : cette seule origine est ajoutée, et seulement à `img-src` et `connect-src` (`src/lib/basemap.ts`, `src/lib/csp.ts`). Aucun script, style, police ni cadre externe. Un test unitaire le vérifie.
- **Ce qui sort** : des demandes de tuiles (zoom, x, y), donc la zone consultée. Aucune donnée métier : ni code, ni nom, ni statut de site. L'IGN voit l'adresse IP de sortie et l'en-tête `Referer` est réduit à l'origine (`Referrer-Policy: same-origin` : aucun `Referer` vers un autre site).
- **Mode fermé** : `MAP_BASEMAP=offline` revient au fond installé sur le serveur (étape 5) ou au fond de secours, sans aucune requête externe. Les tests e2e tournent dans ce mode et vérifient qu'aucune requête ne quitte l'origine.

## Requêtes intersites et redirections ouvertes
- **Server Actions** (connexion) : vérification d'origine intégrée à Next.js. Derrière un proxy qui réécrit l'en-tête `Host` (GitHub Codespaces, reverse proxy), seul l'hôte de `APP_URL` est ajouté aux origines acceptées (`next.config.ts`), plus, dans un Codespace, son adresse de redirection de port.
- **Route handlers** qui modifient des données (POST, PUT, PATCH, DELETE) : l'en-tête `Origin` doit correspondre exactement à l'origine de `APP_URL` (`isSameOrigin`). Une origine absente est refusée. `withApiAuth()` et la route de déconnexion l'appliquent.
- **`SameSite=Lax`** : le cookie n'est pas envoyé sur les sous-requêtes intersites.
- **`?next=`** (`safeRedirectPath`) : n'accepte que des chemins internes qui commencent par `/`. Sont refusés `//…`, `/\…`, les caractères de contrôle, les URL absolues, `javascript:` et `/login`. Tout le reste renvoie vers `/`.
- **Déconnexion** : un POST de formulaire renvoie un 303 vers `/login` avec `Clear-Site-Data: "cache"`. La page est rechargée entièrement, si bien qu'aucune page protégée ne reste dans le cache du routeur côté client, et le bouton « précédent » redemande la page au serveur, qui renvoie vers la connexion.

## Journal d'audit

### Fonctionnement
- Une **extension du client Prisma** (`src/server/audit/extension.ts`) intercepte les écritures sur les modèles audités, c'est-à-dire tous les modèles métier et `User` (liste dans `src/server/audit/config.ts`). `AuditLog`, `ImportBatch` et `Session` ne sont pas audités.
- **Contexte** : `runWithAuditContext({ actorId, source, batchId? }, fn)` le transmet par `AsyncLocalStorage`. Le résultat de `fn` est attendu **dans** le contexte, car les requêtes Prisma sont paresseuses. Le stockage est unique pour tout le processus (symbole global), puisque Next.js peut charger le module dans plusieurs couches.
- **Ce qui est écrit** :
  - **create** : une ligne `CREATE`, `after_value` = l'objet complet ;
  - **update** : lecture de l'état précédent, modification, puis **une ligne par champ modifié** (`field`, `before_value`, `after_value`). Une modification sans effet n'écrit rien ;
  - **delete** : une ligne `DELETE`, `before_value` = l'objet complet ;
  - **upsert** : traité comme un create ou un update, selon le cas ;
  - **`site_id`** : l'identifiant du site pour `Site`, sinon le champ `siteId` de l'entité.
- **Champs ignorés** : `createdAt`, `updatedAt`, `version`. Pour `User`, également `failedLoginCount`, `lockedUntil` et `lastLoginAt`, déjà couverts par les événements de connexion.
- **Champs masqués** : `User.passwordHash`. Il vaut `"[redacted]"` dans `CREATE`, et un changement de hachage écrit une ligne `field = "passwordHash"` avec `"[redacted]"` avant et après.
- **Même transaction.** Les lignes d'audit sont écrites dans la transaction de la modification. Hors transaction, l'extension en ouvre une. Dans `db.$transaction(async (tx) => …)`, toutes les opérations, auditées ou non, et leurs lignes d'audit partagent la transaction de l'appelant. Si elle est annulée, l'audit l'est aussi.
- **Ajout seul.** `update`, `upsert`, `delete`, `updateMany` et `deleteMany` sur `AuditLog` lèvent une erreur via le client.
- **Jamais supprimé, même en test.** Aucun code ne supprime de ligne d'audit, ni l'application, ni les scripts, ni les tests. `tests/unit/audit-never-deleted.test.ts` parcourt `src/`, `tests/`, `scripts/`, `tools/` et `prisma/` (hors migrations) et échoue sur `DELETE FROM audit_logs`, `TRUNCATE`/`DROP TABLE audit_logs` ou `auditLog.delete(Many)`. Les tests travaillent sur des bases dédiées (`vigie_test` pour l'intégration, `vigie_e2e` pour Playwright) recréées entières à chaque lancement ; la base `vigie` n'est jamais utilisée par les tests.
- **Sérialisation stable** : clés triées, `Decimal` et `BigInt` en chaîne, `Date` en ISO 8601, `null` conservé.

### Règles pour les développeurs
1. **Toujours écrire dans `runWithAuditContext`.** Les Server Actions utilisent `{ actorId: user.id, source: "ui" }`, l'import `{ source: "import", batchId }`, l'enrichissement `{ source: "enrichment", batchId }`, les scripts `{ source: "system" }`.
   Sans contexte, l'écriture **échoue** en développement et en test. En production, elle est attribuée à `system`, avec un avertissement dans la console.
2. **Pas d'écriture imbriquée** sur un modèle audité (`site.create({ data: { lease: { create } } })`, `connect`…) : écrire modèle par modèle, avec la clé étrangère (`lease.create({ data: { siteId } })`). Les opérateurs scalaires (`{ increment: 1 }`) restent permis.
3. **Pas d'opération en masse** (`createMany`, `updateMany`, `deleteMany` et leurs variantes `…AndReturn`) sur un modèle audité : boucler enregistrement par enregistrement.
4. **Grouper les écritures liées** dans `db.$transaction(async (tx) => …)`. La forme tableau de `$transaction` est refusée.
5. **Ne pas utiliser `createPrismaClient()`**, le client **non audité**, dans le code applicatif. Il est réservé aux jeux de données de test et à la maintenance.

### SQL brut dans une transaction

Depuis l'étape 11, le SQL brut (`$queryRaw`, `$executeRaw`) exécuté dans `db.$transaction(fn)` passe par la transaction : un verrou `WITH (UPDLOCK)` (verrou de site de l'édition, comptage des administrateurs actifs) tient jusqu'au commit. Auparavant, ces requêtes partaient hors transaction et le verrou était relâché aussitôt (correctif `fix(audit)`, tests de non-régression dans `tests/integration/audit.test.ts`).

### Comptes et mots de passe temporaires (étape 11)
- Le mot de passe temporaire d'un compte créé ou réinitialisé par un administrateur est généré par le serveur (16 caractères aléatoires, politique vérifiée), affiché une seule fois, jamais journalisé.
- `users.must_change_password` : tant qu'il est vrai, toute page renvoie vers `/account/password` et toute route API répond 403. Le changement ferme les autres sessions et en ouvre une nouvelle.
- Désactivation, changement de rôle et réinitialisation ferment toutes les sessions du compte ; chaque révocation est tracée (nombre de sessions, jamais d'empreinte).

### Limites connues
- Le **SQL brut** (`$executeRaw`) et les **suppressions en cascade** faites par la base (suppression d'un site) ne produisent pas de ligne par enregistrement enfant. Seule la suppression du site est tracée, avec son état complet. L'application archive plutôt que de supprimer.
- L'immuabilité est garantie **via le client** : un accès SQL direct avec un compte qui a les droits d'écriture peut toujours modifier `audit_logs`.
- La limite par IP est **en mémoire, pour une seule instance**. L'IP n'est fiable que derrière un proxy de confiance (`TRUST_PROXY=true`).
- `upsert` est exécuté comme une lecture suivie d'un create ou d'un update. En cas de concurrence stricte, deux créations simultanées peuvent entrer en conflit : c'est une erreur d'unicité, pas une perte d'audit.

## Crochets de test (`VIGIE_E2E_TEST_HOOKS`)

La suite e2e démarre le build de production avec `VIGIE_E2E_TEST_HOOKS=1`, qui expose `window.__vigieMap` (état de la carte) au navigateur. Le crochet ne contient aucune donnée sensible : un booléen et le code du site sélectionné. Il ne doit pourtant jamais exister en production.
- Au démarrage (`src/instrumentation-node.ts`), si la variable est définie alors que `NODE_ENV=production`, le serveur écrit un **avertissement de sécurité explicite** dans son journal. Le démarrage n'est pas bloqué, car Playwright en a besoin.
- Un test e2e démarre le même build sans la variable et vérifie que le crochet est absent.
- **Ne jamais définir cette variable** dans un déploiement (étape 12).

## Recommandations pour l'étape 12 (déploiement)
- **Compte SQL applicatif dédié**, sans `db_owner` :
  - `SELECT` et `INSERT` sur `audit_logs`, **sans** `UPDATE` ni `DELETE` :
    `DENY UPDATE, DELETE ON dbo.audit_logs TO vigie_app;`
  - droits de lecture et d'écriture sur les autres tables ;
  - un compte distinct, plus privilégié, pour `prisma migrate deploy`.
- **HTTPS** sur le reverse proxy, avec `COOKIE_SECURE=true` et `TRUST_PROXY=true`.
- **Fuseau horaire du serveur** : Europe/Paris (les tâches planifiées calculent toujours en heure de Paris, mais les journaux du système sont plus lisibles ainsi).
- **Variables d'exploitation** (étape 11) : `OPS_SCHEDULER=on` sur **une seule** instance, `OPS_DAILY_AT`, `EXPORT_RETENTION_DAYS`, `EXPORT_RETENTION_MONTHS`, `SESSION_PURGE_DAYS`, `TRASH_RETENTION_DAYS` (voir [`exploitation.md`](exploitation.md)).
- **Sauvegarde SQL Server par le DBA** (complète, différentielle, journaux) : l'export nocturne n'est **pas** une sauvegarde. Sauvegarder aussi le dossier `STORAGE_ROOT` (documents, plans, carte).
- **Surveiller l'espace disque de `STORAGE_ROOT`** (documents, exports, carte) et le volume de `audit_logs` (jamais purgé), par exemple avec un archivage annuel en lecture seule.
- Sauvegarder `audit_logs` avec la base, et conserver les sauvegardes selon la politique de la DSI.
- Si plusieurs instances sont déployées : partager la limite par IP (table SQL) et vérifier l'affinité de session (inutile ici, puisque les sessions sont en base).
