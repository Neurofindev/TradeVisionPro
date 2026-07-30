# TradeVisionPro — Financial Training

Plateforme web de lecture longue générée à partir de documents Word. Les volumes sont intégrés comme contenu HTML sémantique : aucun visualiseur Word n’est utilisé. Le contenu reste statique, tandis que l’authentification et la série quotidienne reposent sur Supabase.

## Choix technique

Le projet utilise un générateur statique minimal en Node.js, sans dépendance front-end. Ce choix donne des pages pré-rendues et indexables, une navigation instantanée, un hébergement possible sur n’importe quel serveur statique et une surface de maintenance réduite. Le convertisseur Python lit directement l’OOXML des `.docx` pour conserver l’ordre et la sémantique des titres, listes, encadrés, tableaux, liens et images.

Le contenu et la présentation sont séparés :

```text
config/                 mapping des encadrés et métadonnées optionnelles
content/source/         fichiers Word source
content/generated/      JSON typé produit par la conversion
public/media/           images extraites et optimisées
public/sounds/          bruitages locaux et licenciés
scripts/                conversion, import, build et serveur local
src/                    renderer HTML, design system et interactions
supabase/               migrations, fonction serveur et tests SQL
tests/                  tests de fidélité, structure et liens
dist/                   site statique publiable
```

## Prérequis

- Node.js 20 ou plus récent
- Python 3.10 ou plus récent
- Facultatif : Pillow (`python -m pip install Pillow`) pour convertir automatiquement les images en WebP. Sans Pillow, les médias natifs sont copiés dans leur format d’origine.

Le front-end n’a aucune dépendance npm à installer. Supabase CLI et Docker sont nécessaires uniquement pour tester ou déployer la couche serveur.

## Lancement local

À la racine du projet :

```bash
npm run dev
```

Le site est reconstruit puis servi sur [http://127.0.0.1:4173](http://127.0.0.1:4173). Pour connecter l’authentification locale, créer un fichier `.env.local` non versionné :

```dotenv
SUPABASE_URL=https://<projet>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<clé-publiable>
```

Commandes utiles :

```bash
npm run import    # reconvertit tous les DOCX présents
npm run build     # régénère dist/ depuis les JSON
npm run refresh   # conversion + build
npm test          # tests Python et Node
```

Sous Windows PowerShell, si la politique d’exécution bloque `npm.ps1`, utiliser les mêmes commandes avec `npm.cmd` (par exemple `npm.cmd run dev` ou `npm.cmd test`).

## Ajouter ou corriger un volume

1. Déposer le `.docx` dans `content/source/`.
2. Facultatif : ajouter une entrée à `config/volumes.json` pour imposer le titre public, le slug, l’ordre ou des tags. Sans entrée, le fichier est découvert automatiquement et ses métadonnées de couverture sont inférées.
3. Lancer `npm run refresh`.
4. Vérifier le nouveau volume puis lancer `npm test`.

Le manifeste, les cartes, les URLs, le sommaire et l’index de recherche sont générés automatiquement. Si un nouveau document introduit seulement une organisation différente avec les blocs existants, aucune modification de présentation n’est nécessaire. S’il introduit une sémantique réellement nouvelle — par exemple un quiz — ajouter sa détection dans `scripts/convert_docx.py` puis son renderer dans `src/render.mjs`.

## Règles de conversion implémentées

- métadonnées souples extraites avant le premier titre Word ;
- titres `Heading/Titre 1–6` et identifiants stables ;
- dossiers détectés par `DOSSIER \d+`, avec titre et question associés ;
- listes Word natives et paragraphes `Normal` portant un `numPr` ;
- encadrés en paragraphe ombré ou tableau 1×1 ombré ;
- sens des encadrés déterminé d’abord par `config/callout-labels.json`, la couleur n’étant qu’un fallback ;
- tableaux multi-lignes conservés comme données ;
- tableaux mono-ligne « valeur + libellé » convertis en bandeaux statistiques ;
- images extraites de `word/media`, optimisées en WebP lorsque Pillow est disponible, puis associées à leur légende et à leur source ;
- références locales de dossier et bibliographies globales ;
- liens OOXML conservés et URLs en clair rendues cliquables.

Le modèle produit est une liste ordonnée de blocs (`heading`, `paragraph`, `list`, `callout`, `stat_row`, `table`, `figure`, `sources`, `case_dossier_header`). Le renderer ne suppose aucun ordre fixe entre ces blocs.

## Série quotidienne et Supabase

La migration `supabase/migrations/202607290001_daily_streak.sql` crée :

- les trois profils existants avec le fuseau IANA `America/Martinique` (UTC−4 sans changement saisonnier) ;
- l’état courant et le record de série ;
- les validations quotidiennes uniques par utilisateur et date locale ;
- les sessions serveur et la limitation des tentatives de connexion ;
- une transaction PostgreSQL verrouillant l’utilisateur pendant chaque mise à jour.

La fonction `supabase/functions/tradevision-api/index.ts` vérifie le code côté serveur, crée la session, déclenche la transaction de série et expose uniquement les informations nécessaires au navigateur. Les empreintes des codes sont stockées dans le secret Supabase `TVP_ACCESS_CODE_HASHES`, jamais dans le dépôt ni dans le JavaScript public.

Variables et secrets requis :

```text
TVP_ACCESS_CODE_HASHES  objet JSON profile_key → empreinte SHA-256
TVP_RATE_LIMIT_SALT     valeur aléatoire réservée au serveur
TVP_ALLOWED_ORIGINS     origines séparées par des virgules
```

Commandes de vérification :

```bash
npx supabase start
npx supabase test db
npx supabase functions serve tradevision-api --env-file .env.supabase.local
```

## Licence du bruitage

`public/sounds/daily-streak-activation.ogg` provient de **Kenney — Interface Sounds**, fichier original `confirmation_002.ogg`.

- Source : https://kenney.nl/assets/interface-sounds
- Licence : Creative Commons CC0 1.0
- Récupéré le : 29 juillet 2026
- Usage : validation discrète lors du démarrage ou de l’incrément de la série

Le fichier est servi localement ; aucune URL audio externe n’est utilisée par le site.

## Déploiement

Exécuter `npm run build`, puis publier le contenu de `dist/` sur GitHub Pages. Les variables GitHub Actions `SUPABASE_URL` et `SUPABASE_PUBLISHABLE_KEY` doivent viser le projet Supabase gratuit. La fonction Edge et les migrations sont déployées séparément avec Supabase CLI.

Les pages utilisent des URLs de dossier (`/volumes/<slug>/`). Si le site est déployé dans un sous-dossier plutôt qu’à la racine d’un domaine, configurer l’hébergeur pour réécrire la base ou adapter les chemins absolus du renderer.

La progression pédagogique et les réglages de rang existants restent stockés par profil sur l’appareil. La série quotidienne, ses validations, son record et la préférence sonore sont, elles, liées au compte et synchronisées par le serveur.
