// Mondial Relay
// Leur API SOAP nécessite un compte marchand :
//   MONDIALRELAY_ENSEIGNE   = code enseigne (ex: BDTEST pour les tests)
//   MONDIALRELAY_PRIVATE_KEY = clé privée fournie par Mondial Relay
//
// Sans compte marchand → lien direct vers la page de suivi officielle.
// Obtenir un compte : https://www.mondialrelay.fr/solutions-professionnels/

const axios = require('axios');
const crypto = require('crypto');

const WSDL = 'https://www.mondialrelay.fr/webservice/WebService.asmx';

function md5Security(enseigne, numExpedition, privateKey) {
  const raw = (enseigne + numExpedition + privateKey).toUpperCase();
  return crypto.createHash('md5').update(raw).digest('hex').toUpperCase();
}

function buildSoapEnvelope(enseigne, numExpedition, security) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <WSI2_TracerColis xmlns="http://www.mondialrelay.fr/webservice/">
      <Enseigne>${enseigne}</Enseigne>
      <Num_Expedition>${numExpedition}</Num_Expedition>
      <Langue>FR</Langue>
      <Security>${security}</Security>
    </WSI2_TracerColis>
  </soap:Body>
</soap:Envelope>`;
}

// Parse the SOAP XML response
function parseSoapResponse(xml) {
  const errorMatch = xml.match(/<STAT>(\d+)<\/STAT>/);
  const statCode = errorMatch ? errorMatch[1] : null;

  // STAT 0 = OK, anything else = error
  if (statCode && statCode !== '0') {
    if (statCode === '80') return { status: 'not_found', events: [] }; // numéro inconnu
    throw new Error(`Mondial Relay SOAP erreur STAT=${statCode}`);
  }

  // Extract relay points / events
  const retours = [...xml.matchAll(/<Retour>([\s\S]*?)<\/Retour>/g)].map(m => m[1]);
  const events = retours.map(r => {
    const date  = (r.match(/<Date>(.*?)<\/Date>/)  || [])[1] || '';
    const heure = (r.match(/<Heure>(.*?)<\/Heure>/) || [])[1] || '';
    const lib   = (r.match(/<Libelle>(.*?)<\/Libelle>/) || [])[1] || '';
    const lieu  = (r.match(/<Lieu>(.*?)<\/Lieu>/)   || [])[1] || '';
    return {
      date: date ? `${date} ${heure}`.trim() : null,
      description: lib,
      location: lieu,
    };
  }).filter(e => e.description);

  return events;
}

function mapStatus(events) {
  if (!events.length) return 'in_transit';
  const last = (events[0].description || '').toLowerCase();
  if (last.includes('livr') || last.includes('remis')) return 'delivered';
  if (last.includes('disponible') || last.includes('retrait') || last.includes('relais')) return 'pickup';
  if (last.includes('absent') || last.includes('échec') || last.includes('non livr')) return 'undelivered';
  return 'in_transit';
}

async function track(trackingNumber, postalCode) {
  const enseigne   = process.env.MONDIALRELAY_ENSEIGNE;
  const privateKey = process.env.MONDIALRELAY_PRIVATE_KEY;

  if (!enseigne || !privateKey) {
    return {
      carrier: 'Mondial Relay',
      carrier_code: 'mondialrelay',
      status: 'not_configured',
      error: [
        'Mondial Relay nécessite un compte marchand.',
        'Renseignez MONDIALRELAY_ENSEIGNE et MONDIALRELAY_PRIVATE_KEY dans .env',
        '(fournis par Mondial Relay sur mondialrelay.fr/solutions-professionnels)',
        '',
        postalCode
          ? `Suivi manuel : https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition=${encodeURIComponent(trackingNumber)}&codePostal=${encodeURIComponent(postalCode)}`
          : `Suivi manuel : https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition=${encodeURIComponent(trackingNumber)}`,
      ].join('\n'),
      events: [],
    };
  }

  const security = md5Security(enseigne, trackingNumber, privateKey);
  const soap = buildSoapEnvelope(enseigne, trackingNumber, security);

  let res;
  try {
    res = await axios.post(WSDL, soap, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://www.mondialrelay.fr/webservice/WSI2_TracerColis',
      },
      validateStatus: null,
      timeout: 15000,
    });
  } catch (err) {
    throw new Error(`Mondial Relay SOAP connexion échouée : ${err.message}`);
  }

  if (res.status === 401) throw new Error('Mondial Relay : enseigne ou clé privée invalide (401)');
  if (res.status !== 200) throw new Error(`Mondial Relay SOAP erreur HTTP ${res.status}`);

  let events;
  try {
    events = parseSoapResponse(res.data);
  } catch (err) {
    throw new Error(`Mondial Relay parsing : ${err.message}`);
  }

  if (!events.length) return { carrier: 'Mondial Relay', carrier_code: 'mondialrelay', status: 'not_found', events: [] };

  const status = mapStatus(events);
  const latest = events[0];

  return {
    carrier: 'Mondial Relay',
    carrier_code: 'mondialrelay',
    status,
    last_event: `${latest.description}${latest.location ? ' — ' + latest.location : ''}`,
    events,
  };
}

module.exports = { track };
