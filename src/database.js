const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/parcels.db');

let db;

function getDb() {
  if (!db) {
    const fs = require('fs');
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tracking_number TEXT NOT NULL UNIQUE,
      label TEXT,
      carrier TEXT,
      carrier_code TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      status_code INTEGER DEFAULT 0,
      last_event TEXT,
      events TEXT DEFAULT '[]',
      last_checked DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    );

    CREATE INDEX IF NOT EXISTS idx_status ON packages(status);
    CREATE INDEX IF NOT EXISTS idx_tracking ON packages(tracking_number);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Seed default interval from env (only if not already set by user)
  const defaultInterval = process.env.CHECK_INTERVAL_MINUTES || '60';
  db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('check_interval_minutes', ?)`).run(defaultInterval);
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`).run(key, String(value));
}

module.exports = { getDb, getSetting, setSetting };
