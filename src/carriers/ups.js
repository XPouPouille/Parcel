// UPS
// API gratuite : https://developer.ups.com → "Track Single Package"
// Clés dans .env : UPS_CLIENT_ID + UPS_CLIENT_SECRET

const axios = require('axios');

let cachedToken = null;
let tokenExpiry = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const res = await axios.post(
    'https://onlinetools.ups.com/security/v1/oauth/token',
    new URLSearchParams({ grant_type: 'client_credentials' }),
    {
      auth: {
        username: process.env.UPS_CLIENT_ID,
        password: process.env.UPS_CLIENT_SECRET,
      },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      validateStatus: null,
    }
  );
  if (res.status !== 200) throw new Error(`UPS OAuth erreur ${res.status}`);
  cachedToken = res.data.access_token;
  tokenExpiry = Date.now() + (res.data.expires_in - 60) * 1000;
  return cachedToken;
}

function mapStatus(s) {
  const map = {
    'I': 'in_transit',
    'P': 'in_transit',
    'M': 'in_transit',
    'O': 'in_transit',
    'D': 'delivered',
    'X': 'alert',
    'RS': 'undelivered',
  };
  return map[s] || 'in_transit';
}

async function track(trackingNumber) {
  if (!process.env.UPS_CLIENT_ID || !process.env.UPS_CLIENT_SECRET) {
    return {
      status: 'not_configured',
      error: 'UPS_CLIENT_ID / UPS_CLIENT_SECRET manquants — inscription gratuite sur developer.ups.com',
    };
  }

  const token = await getToken();
  const res = await axios.get(
    `https://onlinetools.ups.com/api/track/v1/details/${encodeURIComponent(trackingNumber)}`,
    {
      headers: { Authorization: `Bearer ${token}`, transId: '1', transactionSrc: 'parcel-tracker' },
      validateStatus: null,
    }
  );

  if (res.status === 404) return { status: 'not_found', events: [] };
  if (res.status !== 200) throw new Error(`UPS API erreur ${res.status}`);

  const pkg = res.data?.trackResponse?.shipment?.[0]?.package?.[0];
  if (!pkg) return { status: 'not_found', events: [] };

  const events = (pkg.activity || []).map(a => ({
    date: `${a.date}T${a.time}`,
    description: a.status?.description || '',
    location: [a.location?.address?.city, a.location?.address?.countryCode].filter(Boolean).join(', '),
  }));

  const statusCode = pkg.currentStatus?.code || '';
  const status = mapStatus(statusCode);

  return {
    carrier: 'UPS',
    carrier_code: 'ups',
    status,
    last_event: events[0] ? `${events[0].description}${events[0].location ? ' — ' + events[0].location : ''}` : null,
    events,
  };
}

module.exports = { track };
