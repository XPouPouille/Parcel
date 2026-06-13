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

// Carrier code → display name
const CARRIER_NAMES = {
  100003: 'La Poste',
  100006: 'UPS',
  100011: 'FedEx',
  100031: 'DHL',
  100216: 'Colissimo',
  100217: 'Chronopost',
  100218: 'Mondial Relay',
  100132: 'Amazon Logistics',
  100058: 'GLS',
  100256: 'DPD',
  100233: 'TNT',
};

function getHeaders() {
  return { '17token': API_KEY, 'Content-Type': 'application/json' };
}

async function registerTracking(trackingNumber) {
  if (!API_KEY) throw new Error('TRACK17_API_KEY non configuré');

  const res = await axios.post(
    `${API_BASE}/register`,
    [{ number: trackingNumber }],
    { headers: getHeaders() }
  );

  const data = res.data;
  if (data.code !== 0) throw new Error(`17track register error: ${data.message || data.code}`);

  const accepted = data.data?.accepted?.[0];
  const rejected = data.data?.rejected?.[0];

  if (rejected) {
    // Already registered is code 4030 — not an error
    if (rejected.error?.code === 4030) return { already_registered: true };
    throw new Error(`Tracking refusé: ${rejected.error?.message || 'inconnu'}`);
  }

  return accepted || {};
}

async function getTrackingInfo(trackingNumber) {
  if (!API_KEY) throw new Error('TRACK17_API_KEY non configuré');

  const res = await axios.post(
    `${API_BASE}/gettrackinfo`,
    [{ number: trackingNumber }],
    { headers: getHeaders() }
  );

  const data = res.data;
  if (data.code !== 0) throw new Error(`17track gettrackinfo error: ${data.message || data.code}`);

  const accepted = data.data?.accepted?.[0];
  if (!accepted) throw new Error('Numéro de suivi introuvable');

  const trackInfo = accepted.track_info;
  const statusCode = trackInfo?.latest_status?.status ?? 0;
  const statusInfo = STATUS_MAP[statusCode] || STATUS_MAP[0];

  const carrierCode = accepted.carrier;
  const carrierName = CARRIER_NAMES[carrierCode] || trackInfo?.shipping_info?.carrier_name || `Transporteur ${carrierCode}`;

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

async function addAndTrack(trackingNumber) {
  await registerTracking(trackingNumber);
  // Small delay so 17track processes the registration
  await new Promise(r => setTimeout(r, 1500));
  return getTrackingInfo(trackingNumber);
}

module.exports = { registerTracking, getTrackingInfo, addAndTrack, STATUS_MAP };
