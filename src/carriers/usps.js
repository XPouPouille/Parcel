// USPS (États-Unis)
// API gratuite : https://registration.shippingapis.com
// Clé dans .env : USPS_USER_ID

const axios = require('axios');

function mapStatus(summary) {
  const s = (summary || '').toLowerCase();
  if (s.includes('delivered')) return 'delivered';
  if (s.includes('out for delivery')) return 'in_transit';
  if (s.includes('available for pickup') || s.includes('notice left')) return 'pickup';
  if (s.includes('delivery attempted') || s.includes('no access')) return 'undelivered';
  if (s.includes('alert') || s.includes('exception')) return 'alert';
  return 'in_transit';
}

async function track(trackingNumber) {
  const userId = process.env.USPS_USER_ID;
  if (!userId) {
    return {
      status: 'not_configured',
      error: 'USPS_USER_ID manquant — inscription gratuite sur registration.shippingapis.com',
    };
  }

  const xml = `<TrackFieldRequest USERID="${userId}"><Revision>1</Revision><ClientIp>127.0.0.1</ClientIp><SourceId>parcel-tracker</SourceId><TrackID ID="${trackingNumber}"/></TrackFieldRequest>`;

  const res = await axios.get(
    `http://production.shippingapis.com/ShippingAPI.dll?API=TrackV2&XML=${encodeURIComponent(xml)}`,
    { validateStatus: null, timeout: 15000 }
  );

  if (res.status !== 200) throw new Error(`USPS API erreur ${res.status}`);

  const body = res.data;
  if (body.includes('<Error>')) {
    const desc = body.match(/<Description>(.*?)<\/Description>/)?.[1] || 'Introuvable';
    if (desc.toLowerCase().includes('not found') || desc.toLowerCase().includes('invalid')) {
      return { status: 'not_found', events: [] };
    }
    throw new Error(`USPS: ${desc}`);
  }

  const summary = body.match(/<TrackSummary>(.*?)<\/TrackSummary>/s)?.[1] || '';
  const detailsRaw = [...body.matchAll(/<TrackDetail>(.*?)<\/TrackDetail>/gs)].map(m => m[1]);

  function parseEvent(raw) {
    const desc = raw.match(/<EventTime>(.*?)<\/EventTime>/)?.[1] || '';
    const date = raw.match(/<EventDate>(.*?)<\/EventDate>/)?.[1] || '';
    const event = raw.match(/<Event>(.*?)<\/Event>/)?.[1] || '';
    const city = raw.match(/<EventCity>(.*?)<\/EventCity>/)?.[1] || '';
    const state = raw.match(/<EventState>(.*?)<\/EventState>/)?.[1] || '';
    return {
      date: date ? `${date} ${desc}` : null,
      description: event,
      location: [city, state].filter(Boolean).join(', '),
    };
  }

  const events = [parseEvent(summary), ...detailsRaw.map(parseEvent)].filter(e => e.description);
  const status = mapStatus(events[0]?.description || '');

  return {
    carrier: 'USPS',
    carrier_code: 'usps',
    status,
    last_event: events[0] ? `${events[0].description}${events[0].location ? ' — ' + events[0].location : ''}` : null,
    events,
  };
}

module.exports = { track };
