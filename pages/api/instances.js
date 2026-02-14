import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function extractIpFromStateNetwork(network = {}, ipPrefix = '') {
  if (!network || typeof network !== 'object') {
    return null;
  }
  const interfaces = Object.values(network);
  for (const iface of interfaces) {
    const addresses = Array.isArray(iface?.addresses) ? iface.addresses : [];
    for (const address of addresses) {
      if (address?.family !== 'inet' || !address?.address) continue;
      if (!ipPrefix || address.address.startsWith(ipPrefix)) {
        return address.address;
      }
    }
  }
  return null;
}

function mapIncusInstanceToContainer(instance, ipPrefix) {
  let ip = null;
  let ipSuffix = null;

  // Supporte les deux formats: API custom "ips" et sortie "incus list --format json".
  if (Array.isArray(instance?.ips) && instance.ips.length > 0) {
    const ipObj = instance.ips.find(
      ipItem => ipItem?.address && (!ipPrefix || ipItem.address.startsWith(ipPrefix))
    ) || instance.ips.find(ipItem => ipItem?.address);
    ip = ipObj?.address || null;
  } else {
    ip = extractIpFromStateNetwork(instance?.state?.network, ipPrefix);
  }

  if (ip && ipPrefix && ip.startsWith(ipPrefix)) {
    ipSuffix = ip.replace(ipPrefix, '');
  }

  if (!ipSuffix && instance?.name) {
    const match = instance.name.match(/(\d+)$/);
    if (match) {
      ipSuffix = match[1];
      if (!ip && ipPrefix) {
        ip = `${ipPrefix}${ipSuffix}`;
      }
    }
  }

  return {
    name: instance?.name,
    ipSuffix,
    ip,
    status: instance?.status,
    type: instance?.type
  };
}

async function fetchInstancesFromLocalIncus() {
  const { stdout } = await execFileAsync('incus', ['list', '--format', 'json'], {
    timeout: 12000,
    maxBuffer: 10 * 1024 * 1024
  });
  const parsed = JSON.parse(stdout);
  return Array.isArray(parsed) ? parsed : [];
}

export default async function handler(req, res) {
  try {
    // Configuration depuis les variables d'environnement
    // `INCUS_API_URL` peut être fourni pour override, mais par défaut
    // on le construit à partir de `INCUS_SERVER`.
    const INCUS_SERVER = process.env.INCUS_SERVER;
    const INCUS_API_URL =
      process.env.INCUS_API_URL ||
      (INCUS_SERVER ? `${INCUS_SERVER.replace(/\/$/, '')}/instances` : undefined);
    const INCUS_API_KEY = process.env.INCUS_API_KEY;
    const IP_PREFIX = process.env.IP_PREFIX || '10.22.138.';
    const canUseRemoteApi = Boolean(INCUS_API_URL && INCUS_API_KEY);

    // Vérifier la configuration minimale.
    const missingVars = [];
    if (!IP_PREFIX) missingVars.push('IP_PREFIX');

    if (missingVars.length > 0) {
      console.error('Variables d\'environnement manquantes:', missingVars.join(', '));
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/json');
      res.status(500).json({
        error: 'Configuration incomplète',
        message: `Variables d'environnement manquantes: ${missingVars.join(', ')}. Veuillez les ajouter dans votre fichier .env.`,
        missingVariables: missingVars
      });
      return;
    }

    let instances = [];
    if (canUseRemoteApi) {
      // Requête API distante quand les secrets sont disponibles.
      const response = await fetch(INCUS_API_URL, {
        headers: {
          'x-api-key': INCUS_API_KEY
        }
      });

      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`);
      }

      const data = await response.json();
      instances = Array.isArray(data) ? data : [];
    } else {
      // Fallback local pour environnement de dev local sans secrets.
      instances = await fetchInstancesFromLocalIncus();
    }

    const containers = instances
      .map(instance => mapIncusInstanceToContainer(instance, IP_PREFIX))
      .filter(container => container.ipSuffix);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({
      containers: containers,
      count: containers.length
    });

  } catch (error) {
    console.error('Erreur:', error);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({
      error: 'Erreur lors de la récupération des containers',
      message: error.message
    });
  }
}
