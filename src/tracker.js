const carriers = require('./carriers/index');

// Re-export carrier list for server.js /api/carriers route
const CARRIERS = carriers.CARRIER_LIST.map(c => ({ code: c.slug, name: c.name, needs_key: c.needs_key }));

// Internal status → human label
const STATUS_LABELS = {
  pending:        'En attente',
  in_transit:     'En transit',
  pickup:         'Prêt à retirer',
  undelivered:    'Tentative échouée',
  delivered:      'Livré',
  alert:          'Alerte',
  not_found:      'Introuvable',
  not_configured: 'Non configuré',
  expired:        'Expiré',
};

async function getTrackingInfo(trackingNumber, slugHint) {
  const slug = slugHint || carriers.detectSlug(trackingNumber);

  if (!slug) {
    return {
      tracking_number: trackingNumber,
      carrier: 'Inconnu',
      carrier_code: null,
      status: 'not_found',
      status_label: 'Transporteur non reconnu — sélectionnez-le manuellement',
      last_event: null,
      events: [],
    };
  }

  const result = await carriers.track(trackingNumber, slug);

  const carrierInfo = carriers.CARRIER_MAP[slug];
  return {
    tracking_number: trackingNumber,
    carrier: result.carrier || carrierInfo?.name || slug,
    carrier_code: result.carrier_code || slug,
    status: result.status || 'pending',
    status_code: 0,
    status_label: STATUS_LABELS[result.status] || result.status,
    last_event: result.last_event || null,
    events: result.events || [],
    _error: result.error || null,
  };
}

// addAndTrack: same as getTrackingInfo (no registration step needed without 17track)
async function addAndTrack(trackingNumber, slugHint) {
  return getTrackingInfo(trackingNumber, slugHint);
}

module.exports = { getTrackingInfo, addAndTrack, CARRIERS };
