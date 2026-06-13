// Transporteurs sans intégration directe
// Retourne not_configured avec lien vers le site officiel

const CARRIER_INFO = {
  colisprive:    { name: 'Colis Privé',      url: 'https://www.colisprive.com/moncolis/' },
  hermes:        { name: 'Hermes',           url: 'https://www.myhermes.co.uk/track' },
  deutschepost:  { name: 'Deutsche Post',    url: 'https://www.deutschepost.de/en/s/sendungsverfolgung.html' },
  swisspost:     { name: 'Swiss Post',       url: 'https://www.post.ch/en/parcels/parcel-tracking' },
  dbschenker:    { name: 'DB Schenker',      url: 'https://www.dbschenker.com/global/tracking' },
  correos:       { name: 'Correos',          url: 'https://www.correos.es/es/es/herramientas/localizador/envios' },
  posteitaliane: { name: 'Poste Italiane',   url: 'https://www.poste.it/cerca/index.html#/risultati-spedizioni' },
  amazon:        { name: 'Amazon Logistics', url: 'https://www.amazon.fr/gp/css/order-history' },
  cainiao:       { name: 'Cainiao',          url: 'https://global.cainiao.com/newDetail.htm' },
  geodis:        { name: 'GEODIS',           url: 'https://www.geodis.com/track-your-parcel' },
  royalmail:     { name: 'Royal Mail',       url: 'https://www3.royalmail.com/track-your-item' },
};

async function track(trackingNumber, slug) {
  const info = CARRIER_INFO[slug] || { name: slug, url: null };
  return {
    carrier: info.name,
    carrier_code: slug,
    status: 'not_configured',
    error: `Pas d'intégration directe pour ${info.name}.${info.url ? ` Suivre sur : ${info.url}` : ''}`,
    events: [],
  };
}

module.exports = { track, CARRIER_INFO };
