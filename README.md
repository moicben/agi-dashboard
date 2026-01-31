# Visualiseur de Containers Incus

Une application web simple pour visualiser tous vos containers Incus commençant par "booker-" dans une grille responsive.

## Fonctionnalités

- ✅ Grille responsive qui s'adapte automatiquement au nombre de containers
- ✅ Affichage en temps réel via iframes VNC
- ✅ Actualisation automatique toutes les 30 secondes
- ✅ Interface moderne et intuitive
- ✅ Compatible mobile et desktop

## Configuration

### Variables d'environnement

Toutes les valeurs sensibles sont stockées dans un fichier `.env` à la racine du projet.

1. **Créez un fichier `.env`** à partir du template `.env.example` :
   ```bash
   cp .env.example .env
   ```

2. **Configurez les variables suivantes dans `.env`** :

   ```env
   # Configuration Incus
   INCUS_SERVER=https://agi.worksbace.space
   IP_PREFIX=10.225.44.

   # API Incus
   INCUS_API_URL=https://agi.worksbace.space/instances
   INCUS_API_KEY=your-api-key-here

   # Port du serveur (optionnel)
   PORT=3000
   ```

3. **Variables d'environnement disponibles** :
   - `INCUS_SERVER` : URL complète du serveur Incus (format: `https://domain.com` ou `https://domain.com:port`) (requis)
   - `IP_PREFIX` : Préfixe IP des containers (requis)
   - `INCUS_API_URL` : URL de l'API Incus pour récupérer les instances (requis)
   - `INCUS_API_KEY` : Clé API pour authentifier les requêtes vers l'API Incus (requis)
   - `PORT` : Port sur lequel le serveur Express écoute (optionnel, défaut: 3000)

### Sécurité

⚠️ **Important** : Le fichier `.env` contient des informations sensibles et ne doit **jamais** être commité dans Git. Il est déjà inclus dans `.gitignore`.

Pour le déploiement sur Vercel ou d'autres plateformes, configurez ces variables d'environnement dans le dashboard de votre plateforme.

## Déploiement sur Vercel

1. Installez Vercel CLI (si ce n'est pas déjà fait) :
   ```bash
   npm i -g vercel
   ```

2. Déployez le projet :
   ```bash
   vercel
   ```

3. Configurez les variables d'environnement dans le dashboard Vercel

## Développement local

```bash
npm install
vercel dev
```

## Structure du projet

```
.
├── api/
│   └── containers.js    # API route pour récupérer les containers
├── index.html           # Page principale
├── app.js              # Logique JavaScript côté client
├── styles.css          # Styles CSS
├── package.json        # Configuration npm
├── vercel.json        # Configuration Vercel
└── README.md          # Documentation
```

## Notes

- Les containers sont filtrés pour n'afficher que ceux commençant par "booker-"
- L'URL VNC est générée automatiquement à partir de `INCUS_SERVER` : `{INCUS_SERVER}/vnc.html?ip={IP}`
- La grille s'adapte automatiquement selon la taille de l'écran
- Actualisation automatique toutes les 30 secondes

