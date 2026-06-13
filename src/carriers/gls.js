// GLS — endpoint public, aucune clé requise
const axios = require('axios');

function mapStatus(events) {
  if (!events.length) return 'pending';
  const last = (events[0].evtDscr || '').toLowerCase();
  if (last.includes('livré') || last.includes('delivered') || last.includes('zugestellt')) return 'delivered';
  if (last.includes('avis') || last.includes('absent') || last.includes('failed')) return 'undelivered';
  if (last.includes('retrait') || last.includes('pick') || last.includes('depot')) return 'pickup';
  return 'in_transit';
}

async function track(trackingNumber) {
  const res = await axios.get(
    `https://gls-group.com/app/service/open/rest/EU/en/rstt001?match=${encodeURIComponent(trackingNumber)}`,
    {
      headers: { Accept: 'application/json' },
      validateStatus: null,
      timeout: 10000,
    }
  );

  if (res.status === 404 || !res.data) return { status: 'not_found', events: [] };
  if (res.status !== 200) throw new Error(`GLS API erreur ${res.status}`);

  const data = res.data;
  const parcel = Array.isArray(data) ? data[0] : data;
  if (!parcel) return { status: 'not_found', events: [] };

  const rawEvents = parcel.history || parcel.tuStatus?.[0]?.history || [];
  const events = rawEvents.map(e => ({
    date: e.date ? `${e.date}T${e.time || '00:00:00'}` : null,
    description: e.evtDscr || e.description || '',
    location: e.address?.city || e.location || '',
  }));

  const status = mapStatus(events);

  const latest = events[0] || null;
  return {
    carrier: 'GLS',
    carrier_code: 'gls',
    status,
    last_event: latest ? `${latest.description}${latest.location ? ' — ' + latest.location : ''}` : null,
    events,
  };
}

module.exports = { track };
