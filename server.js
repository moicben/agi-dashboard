import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const INCUS_SERVER = process.env.INCUS_SERVER || '109.176.198.25';
const INCUS_PORT = process.env.INCUS_PORT || '9443';
const VNC_BASE_URL = `https://${INCUS_SERVER}:${INCUS_PORT}/vnc.html`;

// Middleware pour parser le JSON
app.use(express.json());

// Servir les fichiers statiques
app.use(express.static(__dirname));

// Route API pour les containers
app.get('/api/containers', async (req, res) => {
  try {
    // Récupérer les containers depuis les variables d'environnement
    // Format simplifié: CONTAINERS='181,182' ou CONTAINERS='["181", "182"]'
    const containersEnv = process.env.CONTAINERS;
    const IP_PREFIX = '10.225.44.';
    
    let ipSuffixes = [];
    
    if (containersEnv) {
      try {
        // Essayer de parser comme JSON array d'abord
        if (containersEnv.trim().startsWith('[')) {
          ipSuffixes = JSON.parse(containersEnv);
        } else if (containersEnv.trim().startsWith('{')) {
          // Format avec accolades: {"181", "182"} - extraire les valeurs entre guillemets
          const matches = containersEnv.match(/"([^"]+)"/g);
          ipSuffixes = matches ? matches.map(m => m.replace(/"/g, '')) : [];
        } else {
          // Format simple: 181,182 ou "181", "182"
          ipSuffixes = containersEnv.split(',').map(s => s.trim().replace(/['"]/g, ''));
        }
      } catch (e) {
        // Si le parsing JSON échoue, traiter comme une liste séparée par des virgules
        ipSuffixes = containersEnv.split(',').map(s => s.trim().replace(/['"]/g, ''));
      }
    }
    
    // Générer les containers avec noms et IPs automatiques
    const containersWithVNC = ipSuffixes
      .filter(suffix => suffix) // Filtrer les valeurs vides
      .map((suffix, index) => {
        const ip = `${IP_PREFIX}${suffix}`;
        return {
          name: `booker-${index + 1}`,
          ip: ip,
          vncUrl: `${VNC_BASE_URL}?ip=${ip}`
        };
      });
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({
      containers: containersWithVNC,
      count: containersWithVNC.length
    });
    
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({
      error: 'Erreur lors de la récupération des containers',
      message: error.message
    });
  }
});

// Route pour servir index.html pour toutes les autres routes (SPA)
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
  console.log(`📡 API disponible sur http://localhost:${PORT}/api/containers`);
});

