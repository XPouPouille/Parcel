(() => {
  'use strict';

  // ── State ──────────────────────────────────────────────
  let packages = [];
  let activeTab = 'in-progress';
  let selectedPkg = null;

  // ── DOM refs ───────────────────────────────────────────
  const addForm         = document.getElementById('add-form');
  const trackingInput   = document.getElementById('tracking-input');
  const labelInput      = document.getElementById('label-input');
  const formError       = document.getElementById('form-error');
  const statusBar       = document.getElementById('status-bar');
  const statusInProgress= document.getElementById('status-in-progress');
  const statusDelivered = document.getElementById('status-delivered');
  const statusInterval  = document.getElementById('status-interval');
  const badgeInProgress = document.getElementById('badge-in-progress');
  const badgeCompleted  = document.getElementById('badge-completed');
  const pkgsInProgress  = document.getElementById('packages-in-progress');
  const pkgsCompleted   = document.getElementById('packages-completed');
  const modal           = document.getElementById('modal');
  const modalTitle      = document.getElementById('modal-title');
  const modalCarrier    = document.getElementById('modal-carrier');
  const modalStatus     = document.getElementById('modal-status-badge');
  const modalTimeline   = document.getElementById('modal-timeline');
  const modalClose      = document.getElementById('modal-close');
  const modalDelete     = document.getElementById('modal-delete');
  const modalRefresh    = document.getElementById('modal-refresh');
  const loadingOverlay  = document.getElementById('loading-overlay');
  const themeToggle          = document.getElementById('theme-toggle');
  const refreshAllBtn        = document.getElementById('refresh-all-btn');
  const carrierAutoBtn       = document.getElementById('carrier-auto-btn');
  const carrierManualBtn     = document.getElementById('carrier-manual-btn');
  const carrierSelectWrapper = document.getElementById('carrier-select-wrapper');
  const carrierSelect        = document.getElementById('carrier-select');
  const configBtn       = document.getElementById('config-btn');
  const configModal     = document.getElementById('config-modal');
  const configModalClose= document.getElementById('config-modal-close');
  const configCancel    = document.getElementById('config-cancel');
  const configSave      = document.getElementById('config-save');
  const intervalValue   = document.getElementById('interval-value');
  const intervalUnitLabel = document.getElementById('interval-unit-label');
  const configPreview   = document.getElementById('config-preview');
  const configError     = document.getElementById('config-error');

  // ── Status config ──────────────────────────────────────
  const STATUS_CONFIG = {
    pending:     { emoji: '⏳', label: 'En attente',          cls: 'status-pending' },
    in_transit:  { emoji: '🚚', label: 'En transit',          cls: 'status-in_transit' },
    pickup:      { emoji: '📬', label: 'Prêt à retirer',      cls: 'status-pickup' },
    undelivered: { emoji: '⚠️', label: 'Tentative échouée',  cls: 'status-undelivered' },
    delivered:   { emoji: '✅', label: 'Livré',               cls: 'status-delivered' },
    alert:       { emoji: '🚨', label: 'Alerte',              cls: 'status-alert' },
    expired:     { emoji: '⏰', label: 'Expiré',              cls: 'status-expired' },
    not_found:   { emoji: '❓', label: 'Introuvable',         cls: 'status-not_found' },
  };

  function statusInfo(s) { return STATUS_CONFIG[s] || STATUS_CONFIG.pending; }

  // ── Theme ──────────────────────────────────────────────
  function initTheme() {
    const saved = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeIcon(saved);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeIcon(next);
  }

  function updateThemeIcon(theme) {
    document.querySelector('.icon-sun').style.display = theme === 'dark' ? 'none' : 'block';
    document.querySelector('.icon-moon').style.display = theme === 'dark' ? 'block' : 'none';
  }

  // ── API ────────────────────────────────────────────────
  async function api(path, opts = {}) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
    return data;
  }

  // ── Load packages ──────────────────────────────────────
  async function loadPackages() {
    try {
      packages = await api('/api/packages');
      render();
      await loadStatus();
    } catch (err) {
      console.error('Erreur chargement:', err);
    }
  }

  async function loadStatus() {
    try {
      const s = await api('/api/status');
      statusBar.classList.remove('hidden');
      statusInProgress.textContent = `${s.in_progress} en cours`;
      statusDelivered.textContent = `${s.delivered} livré${s.delivered > 1 ? 's' : ''}`;
      statusInterval.textContent = `Vérification toutes les ${s.check_interval_minutes} min`;
    } catch (_) {}
  }

  // ── Render ─────────────────────────────────────────────
  function render() {
    const inProgress = packages.filter(p => p.status !== 'delivered' && p.status !== 'expired');
    const completed  = packages.filter(p => p.status === 'delivered' || p.status === 'expired');

    updateBadge(badgeInProgress, inProgress.length);
    updateBadge(badgeCompleted, completed.length);

    renderList(pkgsInProgress, inProgress, 'Aucun colis en cours', 'Ajoutez un numéro de suivi pour commencer', '📭');
    renderList(pkgsCompleted, completed, 'Aucun colis livré', '', '✅');
  }

  function updateBadge(el, count) {
    if (count > 0) {
      el.textContent = count;
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  }

  function renderList(container, list, emptyTitle, emptySub, emptyIcon) {
    if (!list.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">${emptyIcon}</div>
          <p>${emptyTitle}</p>
          ${emptySub ? `<p class="empty-sub">${emptySub}</p>` : ''}
        </div>`;
      return;
    }
    container.innerHTML = list.map(p => renderCard(p)).join('');
    container.querySelectorAll('.pkg-card').forEach(card => {
      card.addEventListener('click', () => openModal(Number(card.dataset.id)));
    });
  }

  function renderCard(p) {
    const s = statusInfo(p.status);
    const name = escHtml(p.label || p.tracking_number);
    const tracking = p.label ? escHtml(p.tracking_number) : '';
    const carrier = escHtml(p.carrier || 'Détection...');
    const date = p.completed_at
      ? `Livré ${formatDate(p.completed_at)}`
      : p.last_checked
        ? `Vérif. ${formatDate(p.last_checked)}`
        : `Ajouté ${formatDate(p.created_at)}`;

    return `
      <div class="pkg-card" data-id="${p.id}">
        <div class="pkg-icon">${s.emoji}</div>
        <div class="pkg-info">
          <div class="pkg-name">${name}</div>
          ${tracking ? `<div class="pkg-tracking">${tracking}</div>` : ''}
          ${p.last_event ? `<div class="pkg-event">${escHtml(p.last_event)}</div>` : ''}
        </div>
        <div class="pkg-meta">
          <span class="status-badge ${s.cls}">${s.label}</span>
          <span class="pkg-carrier">${carrier}</span>
          <span class="pkg-date">${date}</span>
        </div>
      </div>`;
  }

  // ── Modal ──────────────────────────────────────────────
  function openModal(id) {
    selectedPkg = packages.find(p => p.id === id);
    if (!selectedPkg) return;
    renderModal(selectedPkg);
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
    selectedPkg = null;
  }

  function renderModal(p) {
    const s = statusInfo(p.status);
    const name = p.label || p.tracking_number;

    modalTitle.textContent = name;
    modalCarrier.textContent = p.carrier
      ? `${p.carrier} · ${p.tracking_number}`
      : p.tracking_number;
    modalStatus.innerHTML = `<span class="status-badge ${s.cls}">${s.emoji} ${s.label}</span>`;

    const events = Array.isArray(p.events) ? p.events : [];

    if (!events.length) {
      modalTimeline.innerHTML = `<div class="timeline-empty">Aucun événement disponible pour le moment.</div>`;
    } else {
      modalTimeline.innerHTML = events.map((e, i) => {
        const isFirst = i === 0;
        const dotCls = isFirst
          ? (p.status === 'delivered' ? 'dot-delivered' : 'dot-active')
          : '';
        return `
          <div class="timeline-item">
            <div class="timeline-dot ${dotCls}"></div>
            <div class="timeline-content">
              <div class="timeline-desc">${escHtml(e.description || '')}</div>
              ${e.location ? `<div class="timeline-location">📍 ${escHtml(e.location)}</div>` : ''}
              <div class="timeline-date">${formatDateTime(e.date)}</div>
            </div>
          </div>`;
      }).join('');
    }

    modalDelete.dataset.id = p.id;
    modalRefresh.dataset.id = p.id;
  }

  // ── Carrier toggle ─────────────────────────────────────
  let carrierMode = 'auto'; // 'auto' | 'manual'

  async function loadCarriers() {
    try {
      const carriers = await api('/api/carriers');
      carriers.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.code;
        opt.textContent = c.name;
        carrierSelect.appendChild(opt);
      });
    } catch (_) {}
  }

  carrierAutoBtn.addEventListener('click', () => {
    carrierMode = 'auto';
    carrierAutoBtn.classList.add('active');
    carrierManualBtn.classList.remove('active');
    carrierSelectWrapper.classList.add('hidden');
    carrierSelect.value = '';
  });

  carrierManualBtn.addEventListener('click', () => {
    carrierMode = 'manual';
    carrierManualBtn.classList.add('active');
    carrierAutoBtn.classList.remove('active');
    carrierSelectWrapper.classList.remove('hidden');
    carrierSelect.focus();
  });

  // ── Add package ────────────────────────────────────────
  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const tracking = trackingInput.value.trim();
    if (!tracking) return;

    if (carrierMode === 'manual' && !carrierSelect.value) {
      showError('Choisissez un transporteur dans la liste ou utilisez la détection automatique.');
      return;
    }

    hideError();
    loadingOverlay.classList.remove('hidden');

    const body = {
      tracking_number: tracking,
      label: labelInput.value.trim(),
      carrier_code: carrierMode === 'manual' ? carrierSelect.value : null,
    };

    try {
      const pkg = await api('/api/packages', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      packages.unshift(pkg);
      render();
      trackingInput.value = '';
      labelInput.value = '';
      carrierSelect.value = '';

      if (pkg._warning) {
        showError(`Colis ajouté mais tracking indisponible: ${pkg._warning}`);
      }
    } catch (err) {
      showError(err.message);
    } finally {
      loadingOverlay.classList.add('hidden');
    }
  });

  // ── Delete ─────────────────────────────────────────────
  modalDelete.addEventListener('click', async () => {
    const id = Number(modalDelete.dataset.id);
    if (!id) return;
    if (!confirm('Supprimer ce colis ?')) return;

    try {
      await api(`/api/packages/${id}`, { method: 'DELETE' });
      packages = packages.filter(p => p.id !== id);
      render();
      closeModal();
    } catch (err) {
      alert(err.message);
    }
  });

  // ── Refresh single ─────────────────────────────────────
  modalRefresh.addEventListener('click', async () => {
    const id = Number(modalRefresh.dataset.id);
    if (!id) return;

    const svg = modalRefresh.querySelector('svg');
    svg.classList.add('spinning');

    try {
      const updated = await api(`/api/packages/${id}/refresh`, { method: 'POST' });
      const idx = packages.findIndex(p => p.id === id);
      if (idx !== -1) packages[idx] = updated;
      render();
      selectedPkg = updated;
      renderModal(updated);
    } catch (err) {
      alert(err.message);
    } finally {
      svg.classList.remove('spinning');
    }
  });

  // ── Refresh all ────────────────────────────────────────
  refreshAllBtn.addEventListener('click', async () => {
    const svg = refreshAllBtn.querySelector('svg');
    svg.classList.add('spinning');
    try {
      await api('/api/refresh', { method: 'POST' });
      // Reload after a short delay for the backend to process
      setTimeout(loadPackages, 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setTimeout(() => svg.classList.remove('spinning'), 3000);
    }
  });

  // ── Tabs ───────────────────────────────────────────────
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById(`tab-${tab}`).classList.add('active');
      activeTab = tab;
    });
  });

  // ── Modal close ────────────────────────────────────────
  modalClose.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!configModal.classList.contains('hidden')) closeConfigModal();
      else closeModal();
    }
  });

  // ── Theme ──────────────────────────────────────────────
  themeToggle.addEventListener('click', toggleTheme);

  // ── Helpers ────────────────────────────────────────────
  function showError(msg) {
    formError.textContent = msg;
    formError.classList.remove('hidden');
  }

  function hideError() {
    formError.classList.add('hidden');
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'à l\'instant';
    if (diff < 3600000) return `il y a ${Math.floor(diff/60000)} min`;
    if (diff < 86400000) return `il y a ${Math.floor(diff/3600000)}h`;
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  function formatDateTime(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleString('fr-FR', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
      });
    } catch { return iso; }
  }

  // ── Config modal ───────────────────────────────────────
  let currentUnit = 'minutes'; // 'minutes' | 'heures'

  function openConfigModal() {
    configError.classList.add('hidden');
    api('/api/config').then(cfg => {
      const totalMinutes = cfg.check_interval_minutes || 60;
      if (totalMinutes >= 60 && totalMinutes % 60 === 0) {
        currentUnit = 'heures';
        intervalValue.value = totalMinutes / 60;
      } else {
        currentUnit = 'minutes';
        intervalValue.value = totalMinutes;
      }
      document.getElementById(currentUnit === 'minutes' ? 'unit-minutes' : 'unit-heures').checked = true;
      intervalUnitLabel.textContent = currentUnit;
      updatePreview();
    }).catch(() => {
      intervalValue.value = 60;
      document.getElementById('unit-minutes').checked = true;
      intervalUnitLabel.textContent = 'minutes';
      updatePreview();
    });
    configModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => intervalValue.focus(), 100);
  }

  function closeConfigModal() {
    configModal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  function updatePreview() {
    const raw = parseInt(intervalValue.value, 10);
    if (isNaN(raw) || raw < 1) { configPreview.textContent = ''; return; }
    const minutes = currentUnit === 'heures' ? raw * 60 : raw;
    if (minutes < 1 || minutes > 10080) { configPreview.textContent = ''; return; }
    let txt = `Vérification automatique toutes les `;
    if (minutes >= 60 && minutes % 60 === 0) {
      const h = minutes / 60;
      txt += `${h} heure${h > 1 ? 's' : ''}`;
    } else {
      txt += `${minutes} minute${minutes > 1 ? 's' : ''}`;
    }
    txt += `.`;
    configPreview.textContent = txt;
  }

  document.querySelectorAll('input[name="interval-unit"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const prev = parseInt(intervalValue.value, 10);
      currentUnit = radio.value;
      intervalUnitLabel.textContent = currentUnit;
      // Convert existing value
      if (!isNaN(prev) && prev > 0) {
        if (currentUnit === 'heures') {
          intervalValue.value = Math.max(1, Math.round(prev / 60));
        } else {
          intervalValue.value = Math.min(10080, prev * 60);
        }
      }
      updatePreview();
    });
  });

  intervalValue.addEventListener('input', updatePreview);

  configSave.addEventListener('click', async () => {
    const raw = parseInt(intervalValue.value, 10);
    if (isNaN(raw) || raw < 1) {
      configError.textContent = 'Entrez une valeur valide supérieure à 0.';
      configError.classList.remove('hidden');
      return;
    }
    const minutes = currentUnit === 'heures' ? raw * 60 : raw;
    if (minutes < 1 || minutes > 10080) {
      configError.textContent = 'Intervalle entre 1 minute et 7 jours (10 080 min).';
      configError.classList.remove('hidden');
      return;
    }
    configError.classList.add('hidden');
    configSave.disabled = true;
    try {
      await api('/api/config', {
        method: 'PUT',
        body: JSON.stringify({ check_interval_minutes: minutes }),
      });
      closeConfigModal();
      loadStatus();
    } catch (err) {
      configError.textContent = err.message;
      configError.classList.remove('hidden');
    } finally {
      configSave.disabled = false;
    }
  });

  configBtn.addEventListener('click', openConfigModal);
  configModalClose.addEventListener('click', closeConfigModal);
  configCancel.addEventListener('click', closeConfigModal);
  configModal.addEventListener('click', e => { if (e.target === configModal) closeConfigModal(); });

  // ── Auto-refresh every 5 minutes ──────────────────────
  setInterval(loadPackages, 5 * 60 * 1000);

  // ── Init ───────────────────────────────────────────────
  initTheme();
  loadCarriers();
  loadPackages();
})();
