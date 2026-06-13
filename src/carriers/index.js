const laposte     = require('./laposte');
const dhl         = require('./dhl');
const ups         = require('./ups');
const fedex       = require('./fedex');
const gls         = require('./gls');
const usps        = require('./usps');
const postnl      = require('./postnl');
const dpd         = require('./dpd');
const mondialrelay= require('./mondialrelay');
const generic     = require('./generic');

// Liste complète des transporteurs — exposée à l'API /api/carriers
const CARRIER_LIST = [
  { slug: 'laposte',       name: 'La Poste',           needs_key: 'LAPOSTE_API_KEY' },
  { slug: 'colissimo',     name: 'Colissimo',           needs_key: 'LAPOSTE_API_KEY' },
  { slug: 'chronopost',    name: 'Chronopost',          needs_key: 'LAPOSTE_API_KEY' },
  { slug: 'mondialrelay',  name: 'Mondial Relay',       needs_key: null },
  { slug: 'colisprive',    name: 'Colis Privé',         needs_key: null },
  { slug: 'dhl',           name: 'DHL',                 needs_key: 'DHL_API_KEY' },
  { slug: 'ups',           name: 'UPS',                 needs_key: 'UPS_CLIENT_ID' },
  { slug: 'fedex',         name: 'FedEx',               needs_key: 'FEDEX_CLIENT_ID' },
  { slug: 'gls',           name: 'GLS',                 needs_key: null },
  { slug: 'dpd',           name: 'DPD',                 needs_key: null },
  { slug: 'tnt',           name: 'TNT',                 needs_key: 'FEDEX_CLIENT_ID' },
  { slug: 'usps',          name: 'USPS',                needs_key: 'USPS_USER_ID' },
  { slug: 'postnl',        name: 'PostNL',              needs_key: 'POSTNL_API_KEY' },
  { slug: 'royalmail',     name: 'Royal Mail',          needs_key: null },
  { slug: 'hermes',        name: 'Hermes',              needs_key: null },
  { slug: 'deutschepost',  name: 'Deutsche Post',       needs_key: 'DHL_API_KEY' },
  { slug: 'swisspost',     name: 'Swiss Post',          needs_key: null },
  { slug: 'dbschenker',    name: 'DB Schenker',         needs_key: null },
  { slug: 'correos',       name: 'Correos (Espagne)',   needs_key: null },
  { slug: 'posteitaliane', name: 'Poste Italiane',      needs_key: null },
  { slug: 'amazon',        name: 'Amazon Logistics',    needs_key: null },
  { slug: 'cainiao',       name: 'Cainiao',             needs_key: null },
  { slug: 'geodis',        name: 'GEODIS',              needs_key: null },
];

const CARRIER_MAP = Object.fromEntries(CARRIER_LIST.map(c => [c.slug, c]));

// Auto-detection from tracking number format (best-effort)
function detectSlug(trackingNumber) {
  const n = trackingNumber.toUpperCase().replace(/\s/g, '');

  if (/^1Z[A-Z0-9]{16}$/.test(n)) return 'ups';
  if (/^[A-Z]{2}\d{9}US$/.test(n)) return 'usps';
  if (/^(94|93|92|91|90)\d{18}$/.test(n)) return 'usps';
  if (/^[A-Z]{2}\d{9}FR$/.test(n)) return 'laposte';
  if (/^(6[ABC789C]|8[LMR]|9V)\d{9,11}/.test(n)) return 'colissimo';
  if (/^(6A|CH|CY|XK)\d+/.test(n)) return 'chronopost';
  if (/^JD\d{18}/.test(n)) return 'dhl';
  if (/^[0-9]{10}$/.test(n)) return 'dhl';
  if (/^\d{12}$/.test(n) || /^\d{15}$/.test(n) || /^\d{20}$/.test(n)) return 'fedex';
  if (/^\d{8}$/.test(n)) return 'mondialrelay';
  if (/^[0-9]{11}$/.test(n)) return 'gls';
  if (/^[0-9]{14}$/.test(n)) return 'dpd';
  if (/^[A-Z]{2}\d{9}NL$/.test(n)) return 'postnl';
  if (/^[A-Z]{2}\d{9}GB$/.test(n)) return 'royalmail';
  if (/^[A-Z]{2}\d{9}DE$/.test(n)) return 'deutschepost';
  if (/^[A-Z]{2}\d{9}CN$/.test(n)) return 'cainiao';

  return null;
}

// Route to the right carrier module
async function track(trackingNumber, slug) {
  switch (slug) {
    case 'laposte':
    case 'colissimo':
    case 'chronopost':
      return laposte.track(trackingNumber, slug);

    case 'dhl':
    case 'deutschepost':
      return dhl.track(trackingNumber);

    case 'ups':
      return ups.track(trackingNumber);

    case 'fedex':
    case 'tnt':
      return fedex.track(trackingNumber, slug);

    case 'gls':
      return gls.track(trackingNumber);

    case 'usps':
      return usps.track(trackingNumber);

    case 'postnl':
      return postnl.track(trackingNumber);

    case 'dpd':
      return dpd.track(trackingNumber);

    case 'mondialrelay':
      return mondialrelay.track(trackingNumber);

    default:
      return generic.track(trackingNumber, slug);
  }
}

module.exports = { track, detectSlug, CARRIER_LIST, CARRIER_MAP };
