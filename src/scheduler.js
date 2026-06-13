const cron = require('node-cron');
const { getTrackingInfo } = require('./tracker');
const { notify } = require('./telegram');

let currentTask = null;
let currentInterval = null;
let dbRef = null;

function buildCron(minutes) {
  const m = Math.max(1, Math.floor(minutes));
  if (m < 60) return `*/${m} * * * *`;
  const hours = Math.floor(m / 60);
  return `0 */${Math.max(1, hours)} * * *`;
}

function getIntervalFromDb() {
  const { getSetting } = require('./database');
  return parseInt(getSetting('check_interval_minutes') || '60', 10);
}

function startScheduler(db) {
  dbRef = db;
  const minutes = getIntervalFromDb();
  scheduleWith(minutes);
}

function scheduleWith(minutes) {
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
  }
  currentInterval = minutes;
  const cronExpr = buildCron(minutes);
  console.log(`[Scheduler] Vérification toutes les ${minutes} min (cron: ${cronExpr})`);
  currentTask = cron.schedule(cronExpr, () => checkAllPackages(dbRef));
}

// Called by the config API after saving a new interval
function reloadScheduler() {
  const minutes = getIntervalFromDb();
  if (minutes !== currentInterval) {
    console.log(`[Scheduler] Rechargement — nouvel intervalle: ${minutes} min`);
    scheduleWith(minutes);
  }
}

async function checkAllPackages(db) {
  console.log('[Scheduler] Vérification des colis en cours...');

  const packages = (db || dbRef).prepare(`
    SELECT * FROM packages
    WHERE status NOT IN ('delivered', 'expired', 'not_found')
    ORDER BY created_at ASC
  `).all();

  console.log(`[Scheduler] ${packages.length} colis à vérifier`);

  for (const pkg of packages) {
    try {
      await checkPackage(db || dbRef, pkg);
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.error(`[Scheduler] Erreur colis ${pkg.tracking_number}:`, err.message);
    }
  }

  console.log('[Scheduler] Vérification terminée');
}

async function checkPackage(db, pkg) {
  const info = await getTrackingInfo(pkg.tracking_number);
  const oldStatus = pkg.status;

  if (info.status === oldStatus && info.last_event === pkg.last_event) {
    db.prepare('UPDATE packages SET last_checked = CURRENT_TIMESTAMP WHERE id = ?').run(pkg.id);
    return;
  }

  const isDelivered = info.status === 'delivered';

  db.prepare(`
    UPDATE packages SET
      carrier = ?,
      carrier_code = ?,
      status = ?,
      status_code = ?,
      last_event = ?,
      events = ?,
      last_checked = CURRENT_TIMESTAMP,
      completed_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE completed_at END
    WHERE id = ?
  `).run(
    info.carrier,
    info.carrier_code,
    info.status,
    info.status_code,
    info.last_event,
    JSON.stringify(info.events),
    isDelivered ? 1 : 0,
    pkg.id
  );

  console.log(`[Scheduler] ${pkg.tracking_number}: ${oldStatus} → ${info.status}`);

  if (oldStatus !== info.status) {
    await notify({ ...pkg, ...info }, oldStatus);
  }
}

function getCurrentInterval() { return currentInterval; }

module.exports = { startScheduler, reloadScheduler, checkAllPackages, checkPackage, getCurrentInterval };
