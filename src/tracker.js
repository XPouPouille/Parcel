const axios = require('axios');

const API_BASE = 'https://api.17track.net/track/v2.2';
const API_KEY = process.env.TRACK17_API_KEY;

// 17track status code → internal status
const STATUS_MAP = {
  0: { status: 'not_found', label: 'Introuvable' },
  10: { status: 'in_transit', label: 'En transit' },
  20: { status: 'expired', label: 'Expiré' },
  30: { status: 'pickup', label: 'Prêt à retirer' },
  35: { status: 'undelivered', label: 'Tentative échouée' },
  40: { status: 'delivered', label: 'Livré' },
  50: { status: 'alert', label: 'Alerte' },
};

// Carrier code → display name (sorted alphabetically for the UI)
const CARRIERS = [
  { code: 100132, name: 'Amazon Logistics' },
  { code: 100217, name: 'Chronopost' },
  { code: 100216, name: 'Colissimo' },
  { code: 100031, name: 'DHL' },
  { code: 100256, name: 'DPD' },
  { code: 100011, name: 'FedEx' },
  { code: 100058, name: 'GLS' },
  { code: 100003, name: 'La Poste' },
  { code: 100218, name: 'Mondial Relay' },
  { code: 100102, name: 'PostNL' },
  { code: 100233, name: 'TNT' },
  { code: 100006, name: 'UPS' },
  { code: 100005, name: 'USPS' },
  { code: 100014, name: 'DB Schenker' },
  { code: 100077, name: 'Colis Privé' },
  { code: 100034, name: 'Correos (Espagne)' },
  { code: 100035, name: 'Poste Italiane' },
  { code: 100045, name: 'Deutsche Post' },
  { code: 100047, name: 'Swiss Post' },
  { code: 100070, name: 'Royal Mail' },
  { code: 100048, name: 'Hermes' },
  { code: 100164, name: 'Cainiao' },
  { code: 100680, name: 'GEODIS' },
];

const CARRIER_NAME_MAP = Object.fromEntries(CARRIERS.map(c => [c.code, c.name]));

function getHeaders() {
  return { '17token': API_KEY, 'Content-Type': 'application/json' };
}

// carrierCode is optional — when provided, skips auto-detection
async function registerTracking(trackingNumber, carrierCode) {
  if (!API_KEY) throw new Error('TRACK17_API_KEY non configuré dans le fichier .env');

  const payload = { number: trackingNumber };
  if (carrierCode) payload.carrier = parseInt(carrierCode, 10);

  let res;
  try {
    res = await axios.post(`${API_BASE}/register`, [payload], { headers: getHeaders() });
  } catch (err) {
    if (err.response?.status === 401) throw new Error('Clé API 17track invalide ou expirée (401) — vérifiez TRACK17_API_KEY dans .env');
    throw err;
  }

  const data = res.data;
  if (data.code === 401) throw new Error('Clé API 17track invalide ou expirée (401) — vérifiez TRACK17_API_KEY dans .env');
  if (data.code !== 0) throw new Error(`17track register error ${data.code}: ${data.message || ''}`);

  const accepted = data.data?.accepted?.[0];
  const rejected = data.data?.rejected?.[0];

  if (rejected) {
    // Already registered (4030) — not an error
    if (rejected.error?.code === 4030) return { already_registered: true };
    throw new Error(`Tracking refusé: ${rejected.error?.message || 'inconnu'}`);
  }

  return accepted || {};
}

async function getTrackingInfo(trackingNumber) {
  if (!API_KEY) throw new Error('TRACK17_API_KEY non configuré dans le fichier .env');

  let res;
  try {
    res = await axios.post(`${API_BASE}/gettrackinfo`, [{ number: trackingNumber }], { headers: getHeaders() });
  } catch (err) {
    if (err.response?.status === 401) throw new Error('Clé API 17track invalide ou expirée (401) — vérifiez TRACK17_API_KEY dans .env');
    throw err;
  }

  const data = res.data;
  if (data.code === 401) throw new Error('Clé API 17track invalide ou expirée (401) — vérifiez TRACK17_API_KEY dans .env');
  if (data.code !== 0) throw new Error(`17track gettrackinfo error ${data.code}: ${data.message || ''}`);

  const accepted = data.data?.accepted?.[0];
  if (!accepted) throw new Error('Numéro de suivi introuvable');

  const trackInfo = accepted.track_info;
  const statusCode = trackInfo?.latest_status?.status ?? 0;
  const statusInfo = STATUS_MAP[statusCode] || STATUS_MAP[0];

  const carrierCode = accepted.carrier;
  const carrierName = CARRIER_NAME_MAP[carrierCode]
    || trackInfo?.shipping_info?.carrier_name
    || `Transporteur ${carrierCode}`;

  const events = (trackInfo?.tracking?.providers?.[0]?.events || []).map(e => ({
    date: e.time_utc || e.time_iso,
    description: e.description,
    location: e.location,
  }));

  const latestEvent = events[0] || null;

  return {
    tracking_number: trackingNumber,
    carrier: carrierName,
    carrier_code: String(carrierCode),
    status: statusInfo.status,
    status_code: statusCode,
    status_label: statusInfo.label,
    last_event: latestEvent ? `${latestEvent.description}${latestEvent.location ? ' — ' + latestEvent.location : ''}` : null,
    events,
  };
}

async function addAndTrack(trackingNumber, carrierCode) {
  await registerTracking(trackingNumber, carrierCode);
  await new Promise(r => setTimeout(r, 1500));
  return getTrackingInfo(trackingNumber);
}

module.exports = { registerTracking, getTrackingInfo, addAndTrack, STATUS_MAP, CARRIERS };
