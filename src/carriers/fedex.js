// FedEx (inclut TNT depuis le rachat)
// API gratuite : https://developer.fedex.com → "Track API"
// Clés dans .env : FEDEX_CLIENT_ID + FEDEX_CLIENT_SECRET

const axios = require('axios');

let cachedToken = null;
let tokenExpiry = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const res = await axios.post(
    'https://apis.fedex.com/oauth/token',
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.FEDEX_CLIENT_ID,
      client_secret: process.env.FEDEX_CLIENT_SECRET,
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      validateStatus: null,
    }
  );
  if (res.status !== 200) throw new Error(`FedEx OAuth erreur ${res.status}`);
  cachedToken = res.data.access_token;
  tokenExpiry = Date.now() + (res.data.expires_in - 60) * 1000;
  return cachedToken;
}

function mapStatus(s) {
  const map = {
    'IT': 'in_transit',
    'OD': 'in_transit',
    'PU': 'in_transit',
    'DL': 'delivered',
    'DE': 'undelivered',
    'CA': 'alert',
    'RS': 'alert',
  };
  return map[s] || 'in_transit';
}

async function track(trackingNumber, slug) {
  if (!process.env.FEDEX_CLIENT_ID || !process.env.FEDEX_CLIENT_SECRET) {
    return {
      status: 'not_configured',
      error: 'FEDEX_CLIENT_ID / FEDEX_CLIENT_SECRET manquants — inscription gratuite sur developer.fedex.com',
    };
  }

  const token = await getToken();
  const res = await axios.post(
    'https://apis.fedex.com/track/v1/trackingnumbers',
    {
      includeDetailedScans: true,
      trackingInfo: [{ trackingNumberInfo: { trackingNumber } }],
    },
    {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      validateStatus: null,
    }
  );

  if (res.status === 404) return { status: 'not_found', events: [] };
  if (res.status !== 200) throw new Error(`FedEx API erreur ${res.status}`);

  const result = res.data?.output?.completeTrackResults?.[0]?.trackResults?.[0];
  if (!result) return { status: 'not_found', events: [] };

  const events = (result.scanEvents || []).map(e => ({
    date: e.date,
    description: e.eventDescription,
    location: e.scanLocation?.city || '',
  }));

  const statusCode = result.latestStatusDetail?.code || '';
  const status = mapStatus(statusCode);

  return {
    carrier: slug === 'tnt' ? 'TNT' : 'FedEx',
    carrier_code: slug || 'fedex',
    status,
    last_event: events[0] ? `${events[0].description}${events[0].location ? ' — ' + events[0].location : ''}` : null,
    events,
  };
}

module.exports = { track };
