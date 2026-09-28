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
- **Une session opaque en base** est simple, auditable et révocable. Son coût, une lecture indexée par requête, est négligeable à l'échelle d'Atlas.

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
  - `TRUST_PROXY=false`, exposition directe : Next.js 15 n'expose pas l'adresse du socket aux Server Actions. Il la recopie lui-même dans `X-Forwarded-For`, **mais seulement si le client n'a pas déjà envoyé cet en-tête**. Atlas utilise cette valeur, en sachant qu'un client malveillant peut la falsifier pour échapper à la limite par IP. Le verrouillage par compte reste effectif. **Pour la production, placer Atlas derrière un reverse proxy et activer `TRUST_PROXY=true`.**
- **Journal** : `LOGIN`, `LOGIN_FAILED` et `LOGOUT` sont écrits dans `audit_logs` (`entity_type = "User"`, `entity_id` = identifiant du compte, ou `unknown`). `after_value` contient `{ ip, reason }`. La raison (`bad_password`, `unknown_email`, `locked`, `inactive`, `ip_rate_limited`…) n'est **jamais** montrée à l'utilisateur.

## Cookie

| Attribut | Valeur |
|---|---|
| Nom | `__Host-atlas_session` si `COOKIE_SECURE=true`, sinon `atlas_session` |
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
| `site:write`, `equipment:write`, `document:upload`, `plan:calibrate` | | ✓ | ✓ |
| `import:run`, `enrichment:apply`, `user:manage`, `audit:read`, `settings:manage` | | | ✓ |

Un rôle inconnu n'accorde rien. `assertCan()` lève `ForbiddenError`. La matrice est testée de façon exhaustive (33 couples rôle × action).

## Requêtes intersites et redirections ouvertes
- **Server Actions** (connexion) : vérification d'origine intégrée à Next.js.
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
- **Sérialisation stable** : clés triées, `Decimal` et `BigInt` en chaîne, `Date` en ISO 8601, `null` conservé.

### Règles pour les développeurs
1. **Toujours écrire dans `runWithAuditContext`.** Les Server Actions utilisent `{ actorId: user.id, source: "ui" }`, l'import `{ source: "import", batchId }`, l'enrichissement `{ source: "enrichment", batchId }`, les scripts `{ source: "system" }`.
   Sans contexte, l'écriture **échoue** en développement et en test. En production, elle est attribuée à `system`, avec un avertissement dans la console.
2. **Pas d'écriture imbriquée** sur un modèle audité (`site.create({ data: { lease: { create } } })`, `connect`…) : écrire modèle par modèle, avec la clé étrangère (`lease.create({ data: { siteId } })`). Les opérateurs scalaires (`{ increment: 1 }`) restent permis.
3. **Pas d'opération en masse** (`createMany`, `updateMany`, `deleteMany` et leurs variantes `…AndReturn`) sur un modèle audité : boucler enregistrement par enregistrement.
4. **Grouper les écritures liées** dans `db.$transaction(async (tx) => …)`. La forme tableau de `$transaction` est refusée.
5. **Ne pas utiliser `createPrismaClient()`**, le client **non audité**, dans le code applicatif. Il est réservé aux jeux de données de test et à la maintenance.

### Limites connues
- Le **SQL brut** (`$executeRaw`) et les **suppressions en cascade** faites par la base (suppression d'un site) ne produisent pas de ligne par enregistrement enfant. Seule la suppression du site est tracée, avec son état complet. L'application archive plutôt que de supprimer.
- L'immuabilité est garantie **via le client** : un accès SQL direct avec un compte qui a les droits d'écriture peut toujours modifier `audit_logs`.
- La limite par IP est **en mémoire, pour une seule instance**. L'IP n'est fiable que derrière un proxy de confiance (`TRUST_PROXY=true`).
- `upsert` est exécuté comme une lecture suivie d'un create ou d'un update. En cas de concurrence stricte, deux créations simultanées peuvent entrer en conflit : c'est une erreur d'unicité, pas une perte d'audit.

## Recommandations pour l'étape 12 (déploiement)
- **Compte SQL applicatif dédié**, sans `db_owner` :
  - `SELECT` et `INSERT` sur `audit_logs`, **sans** `UPDATE` ni `DELETE` :
    `DENY UPDATE, DELETE ON dbo.audit_logs TO atlas_app;`
  - droits de lecture et d'écriture sur les autres tables ;
  - un compte distinct, plus privilégié, pour `prisma migrate deploy`.
- **HTTPS** sur le reverse proxy, avec `COOKIE_SECURE=true` et `TRUST_PROXY=true`.
- Planifier `purgeExpiredSessions()` (étape 11) et surveiller le volume de `audit_logs`, par exemple avec un archivage annuel en lecture seule.
- Sauvegarder `audit_logs` avec la base, et conserver les sauvegardes selon la politique de la DSI.
- Si plusieurs instances sont déployées : partager la limite par IP (table SQL) et vérifier l'affinité de session (inutile ici, puisque les sessions sont en base).
