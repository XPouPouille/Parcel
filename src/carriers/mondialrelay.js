// Mondial Relay — endpoint JSON interne (sans clé API)
// Nécessite le code postal du destinataire pour certains colis
const axios = require('axios');

function mapStatus(events) {
  if (!events.length) return 'pending';
  const last = (events[0].description || '').toLowerCase();
  if (last.includes('livr') || last.includes('remis')) return 'delivered';
  if (last.includes('relais') || last.includes('disponible') || last.includes('dépôt')) return 'pickup';
  if (last.includes('absent') || last.includes('échec')) return 'undelivered';
  return 'in_transit';
}

async function track(trackingNumber, postalCode) {
  let url = `https://www.mondialrelay.fr/api/package/${encodeURIComponent(trackingNumber)}/tracking`;
  if (postalCode) url += `?zipCode=${encodeURIComponent(postalCode)}`;

  const res = await axios.get(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Referer: 'https://www.mondialrelay.fr/suivi-de-colis/',
    },
    validateStatus: null,
    timeout: 10000,
  });

  if (res.status === 404 || res.status === 400) {
    return { status: 'not_found', events: [] };
  }

  if (res.status !== 200 || !res.data) {
    // Si 403/autre : peut nécessiter un code postal
    return {
      status: 'not_configured',
      error: 'Mondial Relay : suivi impossible sans code postal destinataire. Ajoutez le code postal dans le libellé (ex: "colis 75001").',
      events: [],
    };
  }

  const steps = res.data?.steps || res.data?.tracking || res.data?.events || [];
  const events = steps.map(s => ({
    date: s.date || s.timestamp || s.dateTime,
    description: s.label || s.description || s.status || '',
    location: s.location || s.city || '',
  }));

  return {
    carrier: 'Mondial Relay',
    carrier_code: 'mondialrelay',
    status: mapStatus(events),
    last_event: events[0] ? `${events[0].description}${events[0].location ? ' — ' + events[0].location : ''}` : null,
    events,
  };
}

module.exports = { track };
