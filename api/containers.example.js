// Exemple de configuration avec liste statique
// Copiez ce fichier vers containers.js et modifiez la liste selon vos besoins

export default async function handler(req, res) {
  const INCUS_SERVER = process.env.INCUS_SERVER || '109.176.198.25';
  const INCUS_PORT = process.env.INCUS_PORT || '9443';
  const VNC_BASE_URL = `https://${INCUS_SERVER}:${INCUS_PORT}/vnc.html`;
  
  try {
    // LISTE STATIQUE - Remplacez par vos containers réels
    const containers = [
      { name: 'booker-1', ip: '10.225.44.181' },
      { name: 'booker-2', ip: '10.225.44.182' },
      { name: 'booker-3', ip: '10.225.44.183' },
      // Ajoutez vos autres containers ici
    ];
    
    // Filtrer et formater les containers
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

