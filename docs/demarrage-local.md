# Faire tourner Vigie sur son PC

> **Aucune donnée réelle sur un poste de test.** Les données fournies sont fictives (`samples/vigie-sample.xlsx` et 10 sites de démonstration), comme les comptes de test. N'importer le vrai tableur que sur le serveur prévu par la DSI.

Deux façons de faire, au choix :

| | **A. Conteneur de développement** (recommandé) | **B. Installation directe** |
|---|---|---|
| Pour qui | Tester l'application, sans connaître les outils | Développer, ou faire travailler Claude Code sur le PC |
| Ce qu'on installe | Docker Desktop, Git, Visual Studio Code | Docker Desktop, Git, Node.js 22 |
| Préparation | Automatique, identique au Codespace | Quelques commandes |
| Durée la première fois | 10 à 20 minutes | 10 à 20 minutes |

**Droits d'administrateur** : installer Docker Desktop (et, sous Windows, WSL 2, qu'il installe lui-même) demande les droits d'administrateur du PC. Sur un poste d'entreprise, il faut souvent passer par le support informatique.

**Machine** : 8 Go de mémoire au moins (16 Go conseillés), 20 Go d'espace disque libre. SQL Server tourne dans Docker et réserve environ 2 Go de mémoire.

## Installer les outils (A et B)

1. **Docker Desktop** : <https://www.docker.com/products/docker-desktop/>. Sous Windows, accepter l'option WSL 2 proposée et redémarrer si demandé. Lancer Docker Desktop et attendre « Engine running » (en bas à gauche).
   - **Mac Apple Silicon (M1, M2…)** : dans *Settings → General*, activer **« Use Rosetta for x86_64/amd64 emulation on Apple Silicon »**, puis redémarrer Docker Desktop (SQL Server n'existe qu'en version Intel).
2. **Git** : <https://git-scm.com/downloads> (sous Windows : « Git for Windows », options par défaut). Il fournit aussi *Git Bash*, utilisé plus bas.
3. Selon la méthode :
   - **A** : **Visual Studio Code** (<https://code.visualstudio.com/>), puis, dans VS Code, l'extension **Dev Containers** (icône des extensions à gauche, chercher « Dev Containers », éditeur Microsoft, *Install*).
   - **B** : **Node.js 22 LTS** (<https://nodejs.org/>, version « 22 », pas la plus récente).

Le dépôt GitHub est privé : la première fois que Git le télécharge, une fenêtre demande de se connecter à GitHub. Utiliser le compte qui a accès au dépôt.

## A. Conteneur de développement (recommandé)

C'est exactement l'environnement du Codespace, mais sur le PC : même préparation automatique, mêmes comptes de test.

1. Docker Desktop doit être lancé.
2. Dans VS Code : touche **F1**, taper **« Dev Containers: Clone Repository in Container Volume »**, Entrée.
3. Coller l'adresse `https://github.com/leandreparis-debug/Property-app`, puis choisir la branche **`claude/ecstatic-cerf-mja73l`**.
   *Le code est rangé dans un volume Docker, pas dans les dossiers Windows : c'est nettement plus rapide.*
4. La préparation s'affiche dans le terminal du bas, comme dans le Codespace (`▶ 1/7 …` jusqu'à `▶ 7/7 Terminé`), puis l'application est construite et démarrée.
5. Ouvrir **<http://localhost:3000>** dans le navigateur (un onglet s'ouvre souvent tout seul).

Comptes de test (fictifs) :

| Rôle | Adresse email | Mot de passe |
|---|---|---|
| Administrateur | `admin@vigie.local` | `Recette-Vigie-2026-A` |
| Éditeur | `editeur@vigie.local` | `Recette-Vigie-2026-E` |
| Lecteur | `lecteur@vigie.local` | `Recette-Vigie-2026-L` |

**Les fois suivantes** : lancer Docker Desktop, ouvrir VS Code ; le conteneur figure dans *File → Open Recent* (nom suivi de « [Dev Container] »). La base et l'application redémarrent seules.

**Récupérer les dernières modifications** : dans le terminal de VS Code, `git pull`, puis `pnpm codespace:setup` ; arrêter l'application (`Ctrl+C` dans son terminal) et la relancer avec `pnpm codespace:prod`.

Toutes les commandes et les problèmes fréquents de [`demarrage-codespaces.md`](demarrage-codespaces.md) valent aussi ici, avec l'adresse `http://localhost:3000` au lieu de `https://…app.github.dev`.

## B. Installation directe

### Windows : une fois pour toutes

Les commandes du projet sont des scripts *bash*. Dans **Git Bash** (menu Démarrer → « Git Bash ») :

```bash
corepack enable
pnpm config set script-shell "C:\\Program Files\\Git\\bin\\bash.exe"
```

La première ligne active pnpm (si elle est refusée, ouvrir Git Bash en administrateur). La seconde fait exécuter les scripts du projet par Git Bash. Toutes les commandes ci-dessous se tapent dans **Git Bash**.

### Préparer le projet

```bash
git clone https://github.com/leandreparis-debug/Property-app.git
cd Property-app
git switch claude/ecstatic-cerf-mja73l
corepack enable
pnpm install
pnpm codespace:setup
```

`pnpm codespace:setup` fait tout, et peut être relancé sans risque : il crée `.env` (mot de passe de base tiré au hasard, adresse `http://localhost:3000`), démarre SQL Server dans Docker, applique les migrations, charge les 10 sites de démonstration, le jeu d'exemple et les trois comptes de test.

### Lancer l'application

```bash
pnpm codespace:prod   # version de production (reflète les vraies performances)
# ou
pnpm dev              # mode développement (pages recompilées à chaque modification)
```

Puis ouvrir <http://localhost:3000>. Arrêter : `Ctrl+C`. Après un redémarrage du PC : lancer Docker Desktop, puis `pnpm db:up` et de nouveau `pnpm codespace:prod`.

### Lancer les tests

```bash
pnpm verify            # types, lint, tests unitaires, garde hors ligne, construction
pnpm test:integration  # base vigie_test (réinitialisée à chaque fois)
pnpm test:e2e          # base vigie_e2e (réinitialisée), navigateur Playwright
```

Les tests de bout en bout ont besoin du navigateur de Playwright, à installer une fois : `pnpm exec playwright install chromium`.

## Continuer avec Claude Code sur le PC

Avec l'installation directe (B), Claude Code peut lancer lui-même l'application, la base et tous les tests sur le PC.

1. Installer Claude Code (application de bureau Claude, onglet **Code**, ou ligne de commande : <https://claude.com/claude-code>).
2. Ouvrir le dossier `Property-app` cloné à l'étape B.
3. Premier message : « Lis `CLAUDE.md` et `docs/reprise.md`, puis continue avec … » (la tâche voulue).

Claude demandera l'autorisation avant les commandes sensibles (réinitialiser une base de test, pousser sur GitHub). La base de développement `vigie` n'est jamais réinitialisée sans accord explicite.

## Problèmes fréquents

| Ce qu'on voit | Cause probable | Que faire |
|---|---|---|
| `Cannot connect to the Docker daemon` / `docker: command not found` | Docker Desktop n'est pas lancé | Lancer Docker Desktop, attendre « Engine running », relancer la commande. |
| `$'\r': command not found` ou `bad interpreter` | Scripts récupérés avec des fins de ligne Windows (dépôt cloné avant l'ajout de `.gitattributes`) | Dans le dossier du projet : `git rm -r --cached -q . && git reset --hard` (efface les modifications locales non enregistrées dans Git). |
| `'bash' n'est pas reconnu…` | pnpm n'utilise pas Git Bash | Refaire `pnpm config set script-shell …` (section Windows ci-dessus). |
| `port is already allocated` (1433) | Un autre SQL Server tourne déjà sur le PC | L'arrêter, ou changer le port dans `docker-compose.yml` et dans `DATABASE_URL`. |
| SQL Server s'arrête tout seul au démarrage | Mémoire insuffisante pour Docker | Docker Desktop → *Settings → Resources* : au moins 4 Go de mémoire. |
| La carte s'affiche sans fond | Le PC ne joint pas `data.geopf.fr` (proxy d'entreprise) | Les sites et fiches fonctionnent. Pour le fond de secours sans internet : `MAP_BASEMAP=offline` dans `.env`, puis relancer. |
