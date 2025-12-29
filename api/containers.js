export default async function handler(req, res) {
  // Configuration
  const INCUS_SERVER = process.env.INCUS_SERVER || '109.176.198.25';
  const INCUS_PORT = process.env.INCUS_PORT || '9443';
  const VNC_BASE_URL = `https://${INCUS_SERVER}:${INCUS_PORT}/vnc.html`;
  
  try {
    // Note: Pour obtenir la liste des containers depuis Incus,
    // vous devrez soit :
    // 1. Utiliser l'API Incus (nécessite authentification)
    // 2. Exécuter une commande shell (si disponible sur Vercel)
    // 3. Maintenir une liste statique dans une variable d'environnement
    
    // Pour l'instant, on utilise une liste depuis les variables d'environnement
    // Format: CONTAINERS='{"name":"booker-1","ip":"10.225.44.181"},{"name":"booker-2","ip":"10.225.44.182"}'
    const containersEnv = process.env.CONTAINERS;
    
    let containers = [];
    
    if (containersEnv) {
      try {
        containers = JSON.parse(`[${containersEnv}]`);
      } catch (e) {
        console.error('Erreur parsing CONTAINERS:', e);
      }
    }
    
    // Si pas de containers dans l'env, retourner une liste vide ou exemple
    // Vous pouvez aussi implémenter une vraie requête à l'API Incus ici
    
    // Ajouter l'URL VNC à chaque container
    const containersWithVNC = containers
      .filter(container => container.name && container.name.startsWith('booker-'))
      .map(container => ({
        name: container.name,
        ip: container.ip,
        vncUrl: `${VNC_BASE_URL}?ip=${container.ip}`
      }));
    
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
}

