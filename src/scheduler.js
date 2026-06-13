const cron = require('node-cron');
const { getTrackingInfo } = require('./tracker');
const { notify } = require('./telegram');

const INTERVAL = parseInt(process.env.CHECK_INTERVAL_MINUTES || '60', 10);

// Build cron expression from minutes interval
function buildCron(minutes) {
  if (minutes < 60) return `*/${minutes} * * * *`;
  const hours = Math.floor(minutes / 60);
  return `0 */${hours} * * *`;
}

function startScheduler(db) {
  const cronExpr = buildCron(INTERVAL);
  console.log(`[Scheduler] Vérification toutes les ${INTERVAL} min (cron: ${cronExpr})`);

  cron.schedule(cronExpr, () => checkAllPackages(db));
}

async function checkAllPackages(db) {
  console.log('[Scheduler] Vérification des colis en cours...');

  const packages = db.prepare(`
    SELECT * FROM packages
    WHERE status NOT IN ('delivered', 'expired', 'not_found')
    ORDER BY created_at ASC
  `).all();

  console.log(`[Scheduler] ${packages.length} colis à vérifier`);

  for (const pkg of packages) {
    try {
      await checkPackage(db, pkg);
      // Avoid rate limiting
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
    // No change — just update last_checked
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

  // Notify only if meaningful status change
  if (oldStatus !== info.status) {
    await notify({ ...pkg, ...info }, oldStatus);
  }
}

module.exports = { startScheduler, checkAllPackages, checkPackage };
