# Tester Vigie dans GitHub Codespaces

> **Aucune donnée réelle dans un Codespace.** Un Codespace est une machine hébergée par GitHub, en dehors du réseau de Carrefour Property. N'y importez jamais le vrai tableur, de vrais documents ni de vrais comptes. Les données fournies sont fictives (`samples/vigie-sample.xlsx` et 10 sites de démonstration), comme les mots de passe ci-dessous.

Ce guide s'adresse à une personne qui n'est pas développeur. Tout se fait depuis le navigateur : rien à installer sur le PC.

## 1. Ouvrir le Codespace (la première fois)

1. Aller sur la page du dépôt : <https://github.com/leandreparis-debug/Property-app> (être connecté à son compte GitHub).
2. Cliquer sur le bouton vert **Code**, puis sur l'onglet **Codespaces**.
3. Cliquer sur **…** (trois points) à côté de « Create codespace on … », puis sur **New with options…**.
4. Dans **Branch**, choisir **`claude/ecstatic-cerf-mja73l`**. Laisser la région proposée. Dans **Machine type**, garder **4-core** (8 Go de mémoire) : c'est le minimum demandé par Vigie.
5. Cliquer sur **Create codespace**.

## 2. Pendant la préparation

- Un éditeur de code (Visual Studio Code) s'ouvre dans le navigateur. Inutile d'y toucher.
- En bas, un terminal affiche la préparation, étape par étape :
  `▶ 1/7 Vérification de Node.js`, `▶ 2/7 Dépendances`, `▶ 3/7 Fichier d'environnement`, `▶ 4/7 Base de données SQL Server`, `▶ 5/7 Client Prisma et migrations`, `▶ 6/7 Sites de démonstration, comptes de test, jeu d'exemple`, `▶ 7/7 Terminé`.
- **Durée : compter 10 à 15 minutes la première fois** (création de la machine, téléchargement de SQL Server, installation, chargement des données). C'est une estimation : la première ouverture le confirmera.
- À la fin, le terminal affiche « Vigie est prête », l'adresse et les comptes de test. L'application est ensuite construite puis démarrée automatiquement (1 à 3 minutes de plus) : un nouvel onglet du navigateur s'ouvre sur Vigie. **Si le navigateur bloque les fenêtres surgissantes, l'autoriser** pour ce site, ou passer par l'onglet **Ports** (voir ci-dessous).

## 3. Ouvrir Vigie et se connecter

- Si l'onglet ne s'est pas ouvert : dans l'éditeur, panneau du bas, onglet **Ports**, ligne **Vigie (3000)**, cliquer sur l'icône du globe (« Open in Browser »).
- L'adresse ressemble à `https://<nom-du-codespace>-3000.app.github.dev`. Elle est **privée** : seul votre compte GitHub peut l'ouvrir. Ne pas la rendre publique.
- Comptes de test (fictifs) :

| Rôle | Adresse email | Mot de passe |
|---|---|---|
| Administrateur (tout, y compris l'espace Administration) | `admin@vigie.local` | `Recette-Vigie-2026-A` |
| Éditeur (modifie les fiches, documents, plans) | `editeur@vigie.local` | `Recette-Vigie-2026-E` |
| Lecteur (consultation et export) | `lecteur@vigie.local` | `Recette-Vigie-2026-L` |

Pour changer de compte : menu rond en haut à droite, **Se déconnecter**, puis se reconnecter avec un autre compte. Pour comparer deux rôles en même temps, ouvrir le second dans une fenêtre de navigation privée.

### Lancer l'application à la main

Elle démarre seule à chaque ouverture. Si besoin, dans un terminal de l'éditeur (menu ☰ → *Terminal* → *New Terminal*) :

| Usage | Commande |
|---|---|
| **Juger l'application et ses performances** (recommandé) | `pnpm codespace:prod` |
| Développement (pages recompilées à la première visite : lent, réservé aux développeurs) | `pnpm codespace:dev` |

`pnpm codespace:prod` construit la version de production seulement si le code a changé, puis la démarre ; c'est elle qui reflète les performances réelles. Si Vigie tourne déjà, la commande l'indique et ne fait rien. Pour arrêter l'application : cliquer dans son terminal et taper `Ctrl+C`.

## 4. Arrêter le Codespace, puis le reprendre

Un Codespace allumé consomme le quota d'heures du compte GitHub (une machine 4 cœurs compte 4 fois plus qu'une machine 1 cœur).

- **Arrêter** : aller sur <https://github.com/codespaces>, cliquer sur **…** à droite du Codespace, puis **Stop codespace**. GitHub l'arrête aussi tout seul après 30 minutes d'inactivité.
- **Reprendre** : même page, cliquer sur le nom du Codespace. La base de données redémarre automatiquement, puis l'application ; compter 1 à 2 minutes. Les données saisies sont conservées.
- **Supprimer** (en fin de recette) : **…** → **Delete**. Tout est effacé.

## 5. Récupérer les dernières modifications de la branche

Dans un terminal de l'éditeur :

```bash
git pull
pnpm codespace:setup
```

`pnpm codespace:setup` installe les nouvelles dépendances et applique les nouvelles migrations, sans effacer les données ni créer de doublon. Ensuite, arrêter l'application (`Ctrl+C` dans son terminal) et la relancer avec `pnpm codespace:prod` : elle est reconstruite automatiquement.

## 6. Repartir d'une base vide

```bash
pnpm db:reset
pnpm codespace:setup
```

`pnpm db:reset` efface **toutes** les données de la base de test (il demande de taper `vigie` pour confirmer). `pnpm codespace:setup` recharge ensuite les sites de démonstration, le jeu d'exemple et les trois comptes de test. Relancer l'application si elle tournait.

## 7. Problèmes fréquents

| Ce qu'on voit | Cause probable | Que faire |
|---|---|---|
| « Préparation pas encore terminée », page d'erreur, ou « base de données injoignable » sur `/api/health` | La base n'est pas encore prête (préparation en cours, ou Codespace qui vient de reprendre) | Attendre la fin de la préparation (« Vigie est prête » dans le terminal). Sinon, taper `pnpm db:up`, attendre « Bases … prêtes », puis `pnpm codespace:prod`. |
| Aucun onglet ne s'ouvre ; rien dans l'onglet **Ports** | L'application ne tourne pas, ou le port n'est pas transféré | Taper `pnpm codespace:prod` et attendre « Ready ». Si le port 3000 n'apparaît toujours pas : onglet **Ports** → **Forward a Port** → `3000`. |
| La connexion ne fait rien, ou erreur « Invalid Server Actions request » / action refusée pour cause d'origine | L'adresse du Codespace ne correspond pas à celle du fichier `.env` (fichier créé ailleurs, ou Codespace renommé) | Taper `echo https://$CODESPACE_NAME-3000.$GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN` : c'est l'adresse attendue. Dans `.env`, mettre cette adresse dans `APP_URL` et son nom d'hôte (sans `https://`) dans `SERVER_ACTIONS_ALLOWED_ORIGINS`, puis relancer l'application. **Ne pas supprimer `.env`** : il contient le mot de passe de la base déjà créée. |
| Retour sur la page de connexion après « Se connecter » | Cookie sécurisé refusé : ouverture par une adresse en `http://` | Toujours passer par l'adresse `https://…app.github.dev` de l'onglet **Ports** (`COOKIE_SECURE=true` dans `.env`). |
| La carte s'affiche sans fond (gris, ou seulement les contours des pays avec le bandeau « Fond de carte détaillé non installé ») | Le fond de carte IGN est chargé par votre navigateur depuis `data.geopf.fr`, que votre réseau peut bloquer ; le fond détaillé hors ligne n'est pas installé dans un Codespace | **Comportement normal** : les sites, statuts et fiches fonctionnent. Pour afficher volontairement le fond de secours, mettre `MAP_BASEMAP=offline` dans `.env` et relancer l'application. |
| « Le Codespace ne peut pas être créé » / machine trop petite | Le type de machine 4 cœurs n'est pas disponible pour le compte | Choisir la plus grande machine proposée (au moins 4 cœurs et 8 Go) ou contacter l'administrateur de l'organisation GitHub. |

## Ce que fait la préparation (pour information)

Le fichier `.devcontainer/devcontainer.json` décrit la machine : Node.js 22.22.2, pnpm, Docker (pour SQL Server), 4 cœurs et 8 Go au minimum, port 3000 transféré. À la création, `scripts/codespace-setup.sh` installe les dépendances, crée `.env` s'il est absent (mot de passe de base généré au hasard, adresse HTTPS du Codespace, cookies sécurisés), démarre SQL Server, applique les migrations, charge les données d'exemple et crée les comptes de test. À chaque reprise, `scripts/codespace-start.sh` relance SQL Server ; à chaque ouverture, `scripts/codespace-run.sh` démarre l'application. Toutes ces étapes peuvent être rejouées sans risque.
