// ============================================================================
// TRUST CARE — Immutable Case Audit Timeline View
// Full Chronological Record: Exact Timestamps, Roles, Transitions & Metadata
// ============================================================================

import appState from '../state.js';
import eventBus from '../events.js';
import { renderTrustCareNavbar } from '../components/trustcare-nav.js';

export function renderCaseTimelinePortal(container) {
  let unsubscribeState = null;
  let selectedCaseId = 'TC-014';
  let roleFilter = 'ALL';

  function render() {
    const cases = appState.get().trustcareCases || [];
    const targetCase = cases.find(c => c.id === selectedCaseId) || cases[0];
    const timeline = (targetCase?.timeline || []).slice().reverse();

    const filteredEvents = roleFilter === 'ALL' 
      ? timeline 
      : timeline.filter(e => e.role?.toLowerCase() === roleFilter.toLowerCase());

    container.innerHTML = `
      ${renderTrustCareNavbar('/timeline')}

      <div class="tc-page-container">
        <!-- Page Header -->
        <div class="tc-page-header">
          <div>
            <h1 class="tc-page-title">
              <i class="fas fa-clock-rotate-left text-primary"></i>
              Immutable Case Audit & Legal Coordination Timeline
            </h1>
            <p class="tc-page-subtitle">
              Authoritative chronological record of every state transition, resource lock, and clinical handover.
            </p>
          </div>
          <div style="display:flex; gap:0.5rem; align-items:center;">
            <!-- Case Selector -->
            <select class="form-control" style="font-size:0.85rem; font-weight:700;" onchange="window.TrustCare.setTimelineCase(this.value)">
              ${cases.map(c => `
                <option value="${c.id}" ${c.id === selectedCaseId ? 'selected' : ''}>
                  Case ${c.id} (${c.status})
                </option>
              `).join('')}
            </select>
          </div>
        </div>

        <!-- Filter Pills Bar -->
        <div style="background:#FFFFFF; border:1px solid #E2E8F0; border-radius:10px; padding:0.75rem 1.25rem; margin-bottom:1.5rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
          <div style="display:flex; gap:0.5rem; align-items:center;">
            <span style="font-size:0.8rem; font-weight:700; color:#64748B;">Filter by Role:</span>
            <button class="btn btn-xs ${roleFilter === 'ALL' ? 'btn-primary' : 'btn-outline-secondary'}" onclick="window.TrustCare.setTimelineFilter('ALL')">All (${timeline.length})</button>
            <button class="btn btn-xs ${roleFilter === 'dispatcher' ? 'btn-primary' : 'btn-outline-secondary'}" onclick="window.TrustCare.setTimelineFilter('dispatcher')">Dispatcher</button>
            <button class="btn btn-xs ${roleFilter === 'hospital_desk' ? 'btn-primary' : 'btn-outline-secondary'}" onclick="window.TrustCare.setTimelineFilter('hospital_desk')">Hospital Desk</button>
            <button class="btn btn-xs ${roleFilter === 'blood_bank' ? 'btn-primary' : 'btn-outline-secondary'}" onclick="window.TrustCare.setTimelineFilter('blood_bank')">Blood Bank</button>
            <button class="btn btn-xs ${roleFilter === 'system' ? 'btn-primary' : 'btn-outline-secondary'}" onclick="window.TrustCare.setTimelineFilter('system')">System / Lock</button>
          </div>

          <div style="font-size:0.8rem; color:#64748B;">
            Total Audited Events: <strong>${filteredEvents.length}</strong>
          </div>
        </div>

        <!-- Timeline Entries -->
        ${filteredEvents.length > 0 ? `
          <div class="tc-timeline-list">
            ${filteredEvents.map((evt, idx) => {
              const roleColors = {
                dispatcher: { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE', badge: 'badge-primary' },
                hospital_desk: { bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0', badge: 'badge-success' },
                blood_bank: { bg: '#FEF2F2', text: '#B91C1C', border: '#FECACA', badge: 'badge-danger' },
                system: { bg: '#F8FAFC', text: '#334155', border: '#E2E8F0', badge: 'badge-secondary' }
              };
              const rc = roleColors[evt.role] || roleColors.system;

              return `
                <div class="tc-timeline-entry">
                  <div class="tc-timeline-bullet" style="background:${rc.text};">
                    <i class="fas fa-check"></i>
                  </div>
                  <div class="tc-timeline-card">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.35rem;">
                      <div style="display:flex; align-items:center; gap:0.5rem;">
                        <span class="badge ${rc.badge}" style="text-transform:uppercase; font-size:0.7rem;">
                          ${evt.role || 'system'}
                        </span>
                        <span style="font-weight:700; font-size:0.92rem; color:#0F172A;">
                          ${evt.type}
                        </span>
                        <span style="font-size:0.8rem; color:#64748B;">
                          by <strong>${evt.actorName || 'System'}</strong>
                        </span>
                      </div>
                      <div class="tc-timeline-time">
                        ${new Date(evt.timestamp).toLocaleTimeString()} · ${new Date(evt.timestamp).toLocaleDateString()}
                      </div>
                    </div>

                    <div style="font-size:0.85rem; color:#334155; line-height:1.4;">
                      ${evt.description}
                    </div>

                    ${evt.previousState || evt.newState ? `
                      <div style="margin-top:0.5rem; font-size:0.75rem; color:#64748B; background:#F8FAFC; padding:0.3rem 0.6rem; border-radius:4px; display:inline-block;">
                        Transition: <code>${evt.previousState || 'NONE'}</code> → <code style="font-weight:700; color:#2563EB;">${evt.newState}</code>
                      </div>
                    ` : ''}

                    ${evt.metadata && Object.keys(evt.metadata).length > 0 ? `
                      <details style="margin-top:0.5rem; font-size:0.75rem; color:#64748B;">
                        <summary style="cursor:pointer; font-weight:600;">View Structured Metadata</summary>
                        <pre style="background:#F1F5F9; padding:0.5rem; border-radius:4px; margin-top:0.25rem; font-size:0.72rem; overflow-x:auto;">${JSON.stringify(evt.metadata, null, 2)}</pre>
                      </details>
                    ` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        ` : `
          <div style="background:#FFFFFF; border:1px solid #E2E8F0; border-radius:12px; padding:3rem; text-align:center; color:#64748B;">
            <i class="fas fa-inbox fa-3x" style="color:#CBD5E1; margin-bottom:1rem;"></i>
            <h4>No Events Found</h4>
            <p>No logged events match the selected filters for Case ${selectedCaseId}.</p>
          </div>
        `}
      </div>
    `;
  }

  window.TrustCare = window.TrustCare || {};
  window.TrustCare.setTimelineCase = (caseId) => {
    selectedCaseId = caseId;
    render();
  };
  window.TrustCare.setTimelineFilter = (role) => {
    roleFilter = role;
    render();
  };

  // Subscribe to reactive state updates
  unsubscribeState = appState.subscribe(() => {
    render();
  });

  render();

  return () => {
    if (unsubscribeState) unsubscribeState();
  };
}
