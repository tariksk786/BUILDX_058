// ============================================================================
// TRUST CARE — Top Navigation & Interactive Simulation Control Bar
// "Right Hospital. Confirmed Resources. Ready Before Arrival."
// ============================================================================

import appState from '../state.js';
import Router from '../router.js';
import Auth from '../auth.js';
import trustCareEngine, { CaseStatus } from '../engines/trustcare-engine.js';
import resourceHoldEngine from '../engines/resource-hold-engine.js';
import bloodReadinessEngine, { BloodReadinessState } from '../engines/blood-readiness-engine.js';
import handoverEngine from '../engines/handover-engine.js';
import queueImpactBridge from '../engines/queue-impact-bridge.js';

export function renderTrustCareNavbar(activeRoute = '/dispatcher') {
  const user = Auth.getCurrentUser() || { role: 'dispatcher', displayName: 'Aarav Mehta' };
  const role = user.role || 'dispatcher';
  const cases = appState.get().trustcareCases || [];
  const activeCase = cases[0] || null;

  // Build role-specific navigation links
  let linksHtml = '';
  if (role === 'dispatcher') {
    linksHtml = `
      <a href="#/dispatcher" class="tc-nav-link ${activeRoute === '/dispatcher' ? 'active' : ''}">
        <i class="fas fa-truck-medical"></i> Dispatcher Operations
      </a>
      <a href="#/timeline" class="tc-nav-link ${activeRoute === '/timeline' ? 'active' : ''}">
        <i class="fas fa-clock-rotate-left"></i> Transit Timeline
      </a>
      <a href="#/emergency-request" class="tc-nav-link">
        <i class="fas fa-phone-volume"></i> Incoming Public Calls
      </a>
    `;
  } else if (role === 'hospital_desk') {
    linksHtml = `
      <a href="#/hospital-desk" class="tc-nav-link ${activeRoute === '/hospital-desk' ? 'active' : ''}">
        <i class="fas fa-hospital"></i> Emergency Receiving Desk
      </a>
      <a href="#/timeline" class="tc-nav-link ${activeRoute === '/timeline' ? 'active' : ''}">
        <i class="fas fa-clock-rotate-left"></i> Handover Timeline
      </a>
      <a href="#/doctor/queue" class="tc-nav-link" title="Affected OPD Queue">
        <i class="fas fa-stethoscope"></i> OPD Impact
      </a>
    `;
  } else if (role === 'blood_bank') {
    linksHtml = `
      <a href="#/blood-bank" class="tc-nav-link ${activeRoute === '/blood-bank' ? 'active' : ''}">
        <i class="fas fa-droplet"></i> Case Blood Requests
      </a>
      <a href="#/timeline" class="tc-nav-link ${activeRoute === '/timeline' ? 'active' : ''}">
        <i class="fas fa-clock-rotate-left"></i> Blood Readiness Timeline
      </a>
    `;
  } else {
    // Admin / Supervisor View
    linksHtml = `
      <a href="#/dispatcher" class="tc-nav-link ${activeRoute === '/dispatcher' ? 'active' : ''}">
        <i class="fas fa-truck-medical"></i> Dispatcher
      </a>
      <a href="#/hospital-desk" class="tc-nav-link ${activeRoute === '/hospital-desk' ? 'active' : ''}">
        <i class="fas fa-hospital"></i> Emergency Desk
      </a>
      <a href="#/blood-bank" class="tc-nav-link ${activeRoute === '/blood-bank' ? 'active' : ''}">
        <i class="fas fa-droplet"></i> Blood Bank
      </a>
      <a href="#/timeline" class="tc-nav-link ${activeRoute === '/timeline' ? 'active' : ''}">
        <i class="fas fa-clock-rotate-left"></i> Audit Timeline
      </a>
    `;
  }

  // Common Demo link for hackathon evaluation
  linksHtml += `
    <a href="#/demo" class="tc-nav-link ${activeRoute === '/demo' ? 'active' : ''}" style="color: #38BDF8; font-weight: 700;">
      <i class="fas fa-wand-magic-sparkles"></i> Demo Runner
    </a>
  `;

  return `
    <nav class="tc-navbar">
      <div class="tc-brand">
        <div class="tc-brand-logo">
          <i class="fas fa-heart-pulse"></i>
        </div>
        <div>
          <div class="tc-brand-title">TRUST CARE</div>
          <div class="tc-brand-tagline">Right Hospital. Confirmed Resources. Ready Before Arrival.</div>
        </div>
      </div>

      <div class="tc-nav-links">
        ${linksHtml}
      </div>

      <div style="display: flex; align-items: center; gap: 0.75rem;">
        <span class="tc-live-pill">
          <span class="tc-live-dot"></span>
          REALTIME
        </span>
        ${activeCase ? `
          <span class="badge ${activeCase.status === 'HANDOVER_COMPLETED' ? 'badge-success' : activeCase.status === 'RESOURCE_UNAVAILABLE' ? 'badge-danger' : 'badge-primary'}" style="font-weight:700; font-size: 0.75rem;">
            ${activeCase.id}: ${activeCase.status}
          </span>
        ` : ''}
        
        <!-- Authenticated Identity & Role Switcher for Hackathon -->
        <div style="display: flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.08); padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.12);">
          <div style="font-size: 0.75rem; text-align: right;">
            <div style="font-weight: 700; color: #F1F5F9; line-height: 1.1;">${user?.displayName || 'Authorized User'}</div>
            <div style="font-size: 0.65rem; color: #38BDF8; text-transform: uppercase; font-weight: 600;">${user?.role?.replace('_', ' ') || 'Role'}</div>
          </div>
          <button class="btn btn-sm btn-outline-secondary" onclick="window.TrustCare.switchRolePrompt()" title="Switch Operational Role" style="border-color:#475569; color:#CBD5E1; font-size:0.75rem; padding: 2px 6px;">
            <i class="fas fa-repeat"></i>
          </button>
        </div>

        <button onclick="window.HospitalFlow.auth.logout()" class="btn btn-sm btn-outline-danger" title="Sign Out" style="font-size:0.75rem; padding: 4px 8px;">
          <i class="fas fa-arrow-right-from-bracket"></i>
        </button>
      </div>
    </nav>

    <!-- Master Interactive Simulation & Failure State Bar -->
    <div class="tc-simulation-bar">
      <div class="tc-sim-label">
        <i class="fas fa-flask"></i> Scenario Controls
      </div>
      <div class="tc-sim-actions">
        <button class="tc-sim-btn primary" onclick="window.TrustCare.runFullScenario()">
          <i class="fas fa-play"></i> Run TC-014 Flow
        </button>
        <button class="tc-sim-btn danger" onclick="window.TrustCare.testConcurrencyConflict()">
          <i class="fas fa-shield-halved"></i> Test Anti-Double Allocation (TC-015)
        </button>
        <button class="tc-sim-btn warning" onclick="window.TrustCare.testHoldExpiry()">
          <i class="fas fa-hourglass-end"></i> Test Hold Expiry
        </button>
        <button class="tc-sim-btn" onclick="window.TrustCare.testHospitalTimeout()">
          <i class="fas fa-stopwatch"></i> Test Timeout
        </button>
        <button class="tc-sim-btn" onclick="window.TrustCare.testHospitalDecline()">
          <i class="fas fa-ban"></i> Test Decline
        </button>
        <button class="tc-sim-btn" onclick="window.TrustCare.testAcceptanceWithdrawal()">
          <i class="fas fa-triangle-exclamation"></i> Test Withdrawal
        </button>
        <button class="tc-sim-btn" onclick="window.TrustCare.resetToBaseline()" style="color: #94A3B8;">
          <i class="fas fa-rotate-left"></i> Reset
        </button>
      </div>
    </div>
  `;
}
