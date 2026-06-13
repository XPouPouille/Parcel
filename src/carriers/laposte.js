// La Poste / Colissimo / Chronopost
// API gratuite : https://developer.laposte.fr → créer un compte → "Suivi v2"
// Clé dans .env : LAPOSTE_API_KEY

const axios = require('axios');

const CARRIER_NAMES = {
  laposte:    'La Poste',
  colissimo:  'Colissimo',
  chronopost: 'Chronopost',
};

// Map La Poste status codes → internal
function mapStatus(code, isFinal) {
  if (isFinal) return 'delivered';
  const map = {
    'DI1': 'in_transit',
    'DI2': 'in_transit',
    'DI3': 'in_transit',
    'DI4': 'in_transit',
    'MD2': 'in_transit',
    'DR1': 'in_transit',
    'EP1': 'in_transit',
    'EP2': 'in_transit',
    'DO1': 'undelivered',
    'DO2': 'undelivered',
    'DO3': 'undelivered',
    'AG1': 'pickup',
    'AG2': 'pickup',
  };
  return map[code] || 'in_transit';
}

async function track(trackingNumber, slug) {
  const key = process.env.LAPOSTE_API_KEY;
  if (!key) {
    return {
      status: 'not_configured',
      error: 'LAPOSTE_API_KEY manquant — inscription gratuite sur developer.laposte.fr',
    };
  }

  const res = await axios.get(
    `https://api.laposte.fr/suivi/v2/idships/${encodeURIComponent(trackingNumber)}`,
    {
      headers: { 'X-Okapi-Key': key, Accept: 'application/json' },
      validateStatus: null,
    }
  );

  if (res.status === 401) throw new Error('Clé API La Poste invalide (401) — vérifiez LAPOSTE_API_KEY');
  if (res.status === 404) return { status: 'not_found', events: [] };
  if (res.status !== 200) throw new Error(`La Poste API erreur ${res.status}`);

  const shipment = res.data?.shipment;
  if (!shipment) return { status: 'not_found', events: [] };

  const events = (shipment.event || []).map(e => ({
    date: e.date,
    description: e.label,
    location: e.location || '',
  }));

  const latest = events[0] || null;
  const isFinal = shipment.isFinal === true;
  const lastCode = shipment.event?.[0]?.code || '';
  const status = mapStatus(lastCode, isFinal);

  return {
    carrier: CARRIER_NAMES[slug] || 'La Poste',
    carrier_code: slug,
    status,
    last_event: latest ? `${latest.description}${latest.location ? ' — ' + latest.location : ''}` : null,
    events,
  };
}

module.exports = { track };
