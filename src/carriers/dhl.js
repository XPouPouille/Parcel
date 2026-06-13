// DHL Express
// API gratuite : https://developer.dhl.com → "Track and Trace"
// Clé dans .env : DHL_API_KEY

const axios = require('axios');

function mapStatus(s) {
  const map = {
    'pre-transit': 'in_transit',
    'transit':     'in_transit',
    'delivered':   'delivered',
    'failure':     'alert',
    'unknown':     'pending',
  };
  return map[(s || '').toLowerCase()] || 'in_transit';
}

async function track(trackingNumber) {
  const key = process.env.DHL_API_KEY;
  if (!key) {
    return {
      status: 'not_configured',
      error: 'DHL_API_KEY manquant — inscription gratuite sur developer.dhl.com',
    };
  }

  const res = await axios.get(
    `https://api.dhl.com/track/shipments?trackingNumber=${encodeURIComponent(trackingNumber)}`,
    {
      headers: { 'DHL-API-Key': key },
      validateStatus: null,
    }
  );

  if (res.status === 401) throw new Error('Clé API DHL invalide (401) — vérifiez DHL_API_KEY');
  if (res.status === 404) return { status: 'not_found', events: [] };
  if (res.status !== 200) throw new Error(`DHL API erreur ${res.status}: ${JSON.stringify(res.data)}`);

  const shipment = res.data?.shipments?.[0];
  if (!shipment) return { status: 'not_found', events: [] };

  const events = (shipment.events || []).map(e => ({
    date: e.timestamp,
    description: e.description,
    location: e.location?.address?.addressLocality || '',
  }));

  const latest = events[0] || null;
  const status = mapStatus(shipment.status?.status);

  return {
    carrier: 'DHL',
    carrier_code: 'dhl',
    status,
    last_event: latest ? `${latest.description}${latest.location ? ' — ' + latest.location : ''}` : null,
    events,
  };
}

module.exports = { track };
