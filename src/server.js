require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDb, getSetting, setSetting } = require('./database');
const { addAndTrack, getTrackingInfo, CARRIERS } = require('./tracker');
const { initBot, notifyNew } = require('./telegram');
const { startScheduler, reloadScheduler, checkAllPackages, getCurrentInterval } = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const db = getDb();
const bot = initBot(db);
startScheduler(db);

// GET all packages
app.get('/api/packages', (req, res) => {
  const packages = db.prepare(`
    SELECT * FROM packages ORDER BY
      CASE status WHEN 'delivered' THEN 1 ELSE 0 END ASC,
      created_at DESC
  `).all();

  const result = packages.map(p => ({
    ...p,
    events: JSON.parse(p.events || '[]'),
  }));

  res.json(result);
});

// GET single package
app.get('/api/packages/:id', (req, res) => {
  const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(req.params.id);
  if (!pkg) return res.status(404).json({ error: 'Colis introuvable' });
  res.json({ ...pkg, events: JSON.parse(pkg.events || '[]') });
});

// GET carriers list (with configured status)
app.get('/api/carriers', (req, res) => {
  const list = CARRIERS.map(c => ({
    code: c.code,
    name: c.name,
    configured: !c.needs_key || !!process.env[c.needs_key],
    needs_key: c.needs_key || null,
  }));
  res.json(list);
});

// POST add package
app.post('/api/packages', async (req, res) => {
  const { tracking_number, label, carrier_code, postal_code } = req.body;

  if (!tracking_number?.trim()) {
    return res.status(400).json({ error: 'Numéro de suivi requis' });
  }

  if (carrier_code === 'mondialrelay' && !postal_code?.trim()) {
    return res.status(400).json({ error: 'Mondial Relay nécessite le code postal du destinataire' });
  }

  const number = tracking_number.trim().toUpperCase();
  const postalCode = postal_code?.trim() || null;

  // Check duplicate
  const existing = db.prepare('SELECT id FROM packages WHERE tracking_number = ?').get(number);
  if (existing) {
    return res.status(409).json({ error: 'Ce colis est déjà suivi' });
  }

  // Insert pending immediately so UI responds fast
  const insert = db.prepare(`
    INSERT INTO packages (tracking_number, label, postal_code, carrier_code, status)
    VALUES (?, ?, ?, ?, 'pending')
  `);
  const result = insert.run(number, label?.trim() || null, postalCode, carrier_code || null);
  const newId = result.lastInsertRowid;

  // Fetch tracking info async
  try {
    const info = await addAndTrack(number, carrier_code || null, postalCode);

    db.prepare(`
      UPDATE packages SET
        carrier = ?,
        carrier_code = ?,
        status = ?,
        status_code = ?,
        last_event = ?,
        events = ?,
        last_checked = CURRENT_TIMESTAMP,
        completed_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END
      WHERE id = ?
    `).run(
      info.carrier,
      info.carrier_code,
      info.status,
      info.status_code,
      info.last_event,
      JSON.stringify(info.events),
      info.status === 'delivered' ? 1 : 0,
      newId
    );

    const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(newId);
    await notifyNew({ ...pkg, events: JSON.parse(pkg.events || '[]') });

    res.status(201).json({ ...pkg, events: JSON.parse(pkg.events || '[]') });
  } catch (err) {
    console.error('[API] Erreur tracking:', err.message);
    // Return the pending package — scheduler will retry
    const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(newId);
    res.status(201).json({ ...pkg, events: [], _warning: err.message });
  }
});

// PATCH update label
app.patch('/api/packages/:id', (req, res) => {
  const { label } = req.body;
  const pkg = db.prepare('SELECT id FROM packages WHERE id = ?').get(req.params.id);
  if (!pkg) return res.status(404).json({ error: 'Colis introuvable' });

  db.prepare('UPDATE packages SET label = ? WHERE id = ?').run(label?.trim() || null, req.params.id);
  const updated = db.prepare('SELECT * FROM packages WHERE id = ?').get(req.params.id);
  res.json({ ...updated, events: JSON.parse(updated.events || '[]') });
});

// POST force refresh single package
app.post('/api/packages/:id/refresh', async (req, res) => {
  const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(req.params.id);
  if (!pkg) return res.status(404).json({ error: 'Colis introuvable' });

  try {
    const { checkPackage } = require('./scheduler');
    await checkPackage(db, pkg);
    const updated = db.prepare('SELECT * FROM packages WHERE id = ?').get(pkg.id);
    res.json({ ...updated, events: JSON.parse(updated.events || '[]') });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST force refresh all
app.post('/api/refresh', async (req, res) => {
  checkAllPackages(db).catch(console.error);
  res.json({ message: 'Vérification lancée en arrière-plan' });
});

// DELETE package
app.delete('/api/packages/:id', (req, res) => {
  const pkg = db.prepare('SELECT id FROM packages WHERE id = ?').get(req.params.id);
  if (!pkg) return res.status(404).json({ error: 'Colis introuvable' });

  db.prepare('DELETE FROM packages WHERE id = ?').run(req.params.id);
  res.json({ message: 'Colis supprimé' });
});

// GET status info
app.get('/api/status', (req, res) => {
  const counts = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status NOT IN ('delivered','expired') THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered
    FROM packages
  `).get();
  res.json({
    ...counts,
    last_check: new Date().toISOString(),
    check_interval_minutes: getCurrentInterval(),
    telegram: !!process.env.TELEGRAM_BOT_TOKEN,
    tracking_api: !!process.env.TRACK17_API_KEY,
  });
});

// API key definitions exposed to the UI
const API_KEY_DEFS = [
  { key: 'LAPOSTE_API_KEY',         label: 'La Poste / Colissimo / Chronopost', hint: 'developer.laposte.fr' },
  { key: 'DHL_API_KEY',             label: 'DHL / Deutsche Post',               hint: 'developer.dhl.com' },
  { key: 'UPS_CLIENT_ID',           label: 'UPS — Client ID',                   hint: 'developer.ups.com' },
  { key: 'UPS_CLIENT_SECRET',       label: 'UPS — Client Secret',               hint: 'developer.ups.com' },
  { key: 'FEDEX_CLIENT_ID',         label: 'FedEx / TNT — Client ID',           hint: 'developer.fedex.com' },
  { key: 'FEDEX_CLIENT_SECRET',     label: 'FedEx / TNT — Client Secret',       hint: 'developer.fedex.com' },
  { key: 'USPS_USER_ID',            label: 'USPS — User ID',                    hint: 'registration.shippingapis.com' },
  { key: 'POSTNL_API_KEY',          label: 'PostNL',                            hint: 'developer.postnl.nl' },
  { key: 'MONDIALRELAY_ENSEIGNE',   label: 'Mondial Relay — Enseigne',          hint: 'mondialrelay.fr/solutions-professionnels' },
  { key: 'MONDIALRELAY_PRIVATE_KEY',label: 'Mondial Relay — Clé privée',        hint: 'mondialrelay.fr/solutions-professionnels' },
];

// GET api keys (current values)
app.get('/api/keys', (req, res) => {
  const result = {};
  for (const def of API_KEY_DEFS) {
    result[def.key] = process.env[def.key] || '';
  }
  res.json({ defs: API_KEY_DEFS, values: result });
});

// PUT api keys (save to DB + apply immediately)
app.put('/api/keys', (req, res) => {
  const updates = req.body;
  const validKeys = new Set(API_KEY_DEFS.map(d => d.key));
  for (const [key, value] of Object.entries(updates)) {
    if (!validKeys.has(key)) continue;
    const v = (value || '').trim();
    if (v) {
      setSetting(`apikey_${key}`, v);
      process.env[key] = v;
    } else {
      setSetting(`apikey_${key}`, '');
      delete process.env[key];
    }
  }
  const result = {};
  for (const def of API_KEY_DEFS) result[def.key] = process.env[def.key] || '';
  res.json({ values: result });
});

// GET config
app.get('/api/config', (req, res) => {
  res.json({
    check_interval_minutes: parseInt(getSetting('check_interval_minutes') || '60', 10),
  });
});

// PUT config
app.put('/api/config', (req, res) => {
  const { check_interval_minutes } = req.body;

  if (check_interval_minutes !== undefined) {
    const val = parseInt(check_interval_minutes, 10);
    if (isNaN(val) || val < 1 || val > 10080) {
      return res.status(400).json({ error: 'Intervalle invalide (1 min — 7 jours)' });
    }
    setSetting('check_interval_minutes', val);
    reloadScheduler();
  }

  res.json({
    check_interval_minutes: parseInt(getSetting('check_interval_minutes') || '60', 10),
  });
});

app.listen(PORT, () => {
  console.log(`[Server] Parcel Tracker démarré sur http://localhost:${PORT}`);
  console.log(`[Server] URL publique: ${process.env.APP_URL || 'non configurée'}`);
});
