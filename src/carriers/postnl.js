// PostNL (Pays-Bas)
// API gratuite : https://developer.postnl.nl → "Track & Trace"
// Clé dans .env : POSTNL_API_KEY

const axios = require('axios');

function mapStatus(phase) {
  const map = {
    '1': 'in_transit',
    '2': 'in_transit',
    '3': 'in_transit',
    '4': 'delivered',
    '5': 'undelivered',
    '6': 'alert',
  };
  return map[String(phase)] || 'in_transit';
}

async function track(trackingNumber) {
  const key = process.env.POSTNL_API_KEY;
  if (!key) {
    return {
      status: 'not_configured',
      error: 'POSTNL_API_KEY manquant — inscription gratuite sur developer.postnl.nl',
    };
  }

  const res = await axios.get(
    `https://api.postnl.nl/shipment/v2/status/barcode/${encodeURIComponent(trackingNumber)}`,
    {
      headers: { apikey: key },
      validateStatus: null,
    }
  );

  if (res.status === 401) throw new Error('Clé API PostNL invalide (401)');
  if (res.status === 404) return { status: 'not_found', events: [] };
  if (res.status !== 200) throw new Error(`PostNL API erreur ${res.status}`);

  const shipment = res.data?.Shipments?.[0];
  if (!shipment) return { status: 'not_found', events: [] };

  const events = (shipment.Events || []).map(e => ({
    date: e.TimeStamp,
    description: e.Description,
    location: e.LocationCode || '',
  }));

  const phase = shipment.Phase?.Phase;
  const status = mapStatus(phase);

  return {
    carrier: 'PostNL',
    carrier_code: 'postnl',
    status,
    last_event: events[0] ? `${events[0].description}${events[0].location ? ' — ' + events[0].location : ''}` : null,
    events,
  };
}

module.exports = { track };
