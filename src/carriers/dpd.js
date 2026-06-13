// DPD France — endpoint public JSON (sans clé API)
const axios = require('axios');

function mapStatus(events) {
  if (!events.length) return 'pending';
  const last = (events[0].description || '').toLowerCase();
  if (last.includes('livr') || last.includes('delivered')) return 'delivered';
  if (last.includes('absent') || last.includes('avis') || last.includes('failed')) return 'undelivered';
  if (last.includes('relais') || last.includes('pickup') || last.includes('retrait')) return 'pickup';
  return 'in_transit';
}

async function track(trackingNumber) {
  // DPD France public tracking JSON endpoint
  const res = await axios.get(
    `https://tracking.dpd.fr/parcels/fr/fr/${encodeURIComponent(trackingNumber)}/`,
    {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      validateStatus: null,
      timeout: 10000,
    }
  );

  // Fallback: try DE endpoint (often works for cross-border)
  if (res.status !== 200) {
    const res2 = await axios.get(
      `https://tracking.dpd.de/parcelstatus?query=${encodeURIComponent(trackingNumber)}&locale=fr_FR`,
      { headers: { Accept: 'application/json' }, validateStatus: null, timeout: 10000 }
    );
    if (res2.status !== 200) return { status: 'not_found', events: [] };

    const data2 = res2.data;
    const scans2 = data2?.data?.shipmentTrackingNumber ? data2?.data?.scanInfo?.scan || [] : [];
    const events2 = scans2.map(s => ({
      date: s.date,
      description: s.scanType?.description || '',
      location: s.depotCity || '',
    }));
    return {
      carrier: 'DPD',
      carrier_code: 'dpd',
      status: mapStatus(events2),
      last_event: events2[0] ? `${events2[0].description}${events2[0].location ? ' — ' + events2[0].location : ''}` : null,
      events: events2,
    };
  }

  const data = res.data;
  const scans = data?.data?.scanInfo?.scan || [];
  const events = scans.map(s => ({
    date: s.date,
    description: s.scanType?.description || s.description || '',
    location: s.depotCity || '',
  }));

  return {
    carrier: 'DPD',
    carrier_code: 'dpd',
    status: mapStatus(events),
    last_event: events[0] ? `${events[0].description}${events[0].location ? ' — ' + events[0].location : ''}` : null,
    events,
  };
}

module.exports = { track };
