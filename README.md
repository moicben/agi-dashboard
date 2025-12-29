# Visualiseur de Containers Incus

Une application web simple pour visualiser tous vos containers Incus commençant par "booker-" dans une grille responsive.

## Fonctionnalités

- ✅ Grille responsive qui s'adapte automatiquement au nombre de containers
- ✅ Affichage en temps réel via iframes VNC
- ✅ Actualisation automatique toutes les 30 secondes
- ✅ Interface moderne et intuitive
- ✅ Compatible mobile et desktop

## Configuration

### Variables d'environnement Vercel

Dans votre projet Vercel, configurez les variables d'environnement suivantes :

1. **CONTAINERS** : Liste JSON des containers (optionnel si vous utilisez l'API Incus)
   ```
   Format: {"name":"booker-1","ip":"10.225.44.181"},{"name":"booker-2","ip":"10.225.44.182"}
   ```

2. **INCUS_SERVER** : Adresse du serveur Incus (optionnel, défaut: 109.176.198.25)
3. **INCUS_PORT** : Port du serveur Incus (optionnel, défaut: 9443)

### Configuration manuelle

Si vous préférez configurer directement dans le code, modifiez `api/containers.js` :

```javascript
// Option 1: Liste statique
const containers = [
    { name: 'booker-1', ip: '10.225.44.181' },
    { name: 'booker-2', ip: '10.225.44.182' },
    // ... autres containers
];

// Option 2: Utiliser l'API Incus
// Implémentez votre logique de récupération ici
```

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
- L'URL VNC est générée automatiquement : `https://{INCUS_SERVER}:{INCUS_PORT}/vnc.html?ip={IP}`
- La grille s'adapte automatiquement selon la taille de l'écran
- Actualisation automatique toutes les 30 secondes

