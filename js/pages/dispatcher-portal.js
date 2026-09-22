// ============================================================================
// TRUST CARE — Dispatcher & Paramedic Command Portal
// "Right Hospital. Confirmed Resources. Ready Before Arrival."
// ============================================================================

import appState from '../state.js';
import eventBus from '../events.js';
import trustCareEngine, { CaseStatus } from '../engines/trustcare-engine.js';
import { renderTrustCareNavbar } from '../components/trustcare-nav.js';

export function renderDispatcherPortal(container) {
  let unsubscribeState = null;

  function render() {
    const cases = appState.get().trustcareCases || [];
    let activeCase = cases.find(c => c.id === 'TC-014') || cases[0];

    // Ensure default TC-014 exists
    if (!activeCase) {
      trustCareEngine.createCase({
        caseId: 'TC-014',
        emergencyCategory: 'Severe Polytrauma & Crush Injury',
        patientIdentifier: 'Adult Male (Approx 35y)',
        paramedicNotes: 'High-velocity road collision. GCS 9, blunt chest trauma, unstable vitals.',
        location: { name: 'Western Express Highway, Flyover 4B', lat: 19.0760, lng: 72.8777 },
        ambulanceId: 'AMB-108',
        requiredBedType: 'ICU',
        requiredSpecialist: 'Trauma Surgeon',
        requiresBlood: true,
        bloodGroupNeeded: 'O-',
        bloodUnitsNeeded: 2,
        createdBy: 'Paramedic Squad 7'
      });
      activeCase = (appState.get().trustcareCases || []).find(c => c.id === 'TC-014');
    }

    // Evaluate explainable matching matrix
    const candidateHospitals = trustCareEngine.matchHospitalsForCase(activeCase ? activeCase.id : 'TC-014');
    const holds = appState.get().resourceHolds || [];
    const activeHold = holds.find(h => h.caseId === activeCase?.id && (h.status === 'HELD' || h.status === 'CONFIRMED'));

    container.innerHTML = `
      ${renderTrustCareNavbar('/dispatcher')}

      <div class="tc-page-container">
        <!-- Page Header -->
        <div class="tc-page-header">
          <div>
            <h1 class="tc-page-title">
              <i class="fas fa-truck-medical text-primary"></i>
              Ambulance Dispatch & Suitable Hospital Matching
            </h1>
            <p class="tc-page-subtitle">
              Module 1–3: Authoritative Emergency Requirements & Explainable Decision Support
            </p>
          </div>
          <div style="display:flex; gap:0.5rem;">
            <button class="btn btn-sm btn-outline-primary" onclick="window.TrustCare.createNewEmergencyCaseModal()">
              <i class="fas fa-plus"></i> New Emergency Case
            </button>
            <button class="btn btn-sm btn-secondary" onclick="window.TrustCare.refreshMatchingMatrix()">
              <i class="fas fa-sync-alt"></i> Refresh Availability
            </button>
          </div>
        </div>

        <!-- Active Case Summary Banner -->
        <div class="tc-case-banner ${activeHold ? 'held' : activeCase.status === 'RESOURCE_UNAVAILABLE' ? 'conflict' : ''}">
          <div style="display:flex; align-items:center; gap:1rem; flex-wrap:wrap;">
            <span class="tc-case-id-badge">${activeCase.id}</span>
            <div>
              <div style="font-weight:700; font-size:1.05rem; color:#0F172A;">
                ${activeCase.emergencyCategory} — ${activeCase.patientIdentifier}
              </div>
              <div style="font-size:0.82rem; color:#475569; margin-top:2px;">
                <i class="fas fa-location-dot text-danger"></i> ${activeCase.location.name} |
                <i class="fas fa-truck-medical text-primary"></i> Unit ${activeCase.ambulanceId} |
                <i class="fas fa-notes-medical"></i> ${activeCase.paramedicNotes}
              </div>
            </div>
          </div>

          <div style="display:flex; align-items:center; gap:1.25rem; flex-wrap:wrap;">
            <div style="text-align:right;">
              <div style="font-size:0.75rem; color:#64748B; text-transform:uppercase; font-weight:700;">Status</div>
              <div style="font-weight:800; font-size:0.95rem; color:#1E293B;">
                ${activeCase.status}
              </div>
            </div>

            <div style="text-align:right;">
              <div style="font-size:0.75rem; color:#64748B; text-transform:uppercase; font-weight:700;">Requirements</div>
              <div style="font-weight:700; font-size:0.85rem; color:#2563EB;">
                ${activeCase.requiredBedType} Bed + ${activeCase.bloodUnitsNeeded}U ${activeCase.bloodGroupNeeded}
              </div>
            </div>

            <div style="text-align:right;">
              <div style="font-size:0.75rem; color:#64748B; text-transform:uppercase; font-weight:700;">Ambulance ETA</div>
              <div style="font-weight:800; font-size:1.1rem; color:#059669;">
                ${activeCase.ambulanceStatus === 'ARRIVED' ? 'ARRIVED' : `${activeCase.etaMinutes} mins`}
              </div>
            </div>
          </div>
        </div>

        <!-- Alert Bar if Case is Conflicted or Withdrawn -->
        ${activeCase.status === 'RESOURCE_UNAVAILABLE' ? `
          <div class="alert alert-danger" style="margin-bottom:1.5rem; display:flex; align-items:center; gap:0.75rem; border-left: 4px solid #DC2626;">
            <i class="fas fa-ban fa-lg text-danger"></i>
            <div>
              <strong>CONCURRENCY LOCK ALERT:</strong> ${activeCase.failureReason || 'Selected hospital resource is already held for another emergency case. Double-allocation was blocked.'}
              <div style="margin-top:4px; font-size:0.85rem;">Select another candidate hospital from the matrix below to safely divert.</div>
            </div>
          </div>
        ` : ''}

        ${activeCase.status === 'ACCEPTANCE_WITHDRAWN' ? `
          <div class="alert alert-warning" style="margin-bottom:1.5rem; display:flex; align-items:center; gap:0.75rem; border-left: 4px solid #D97706;">
            <i class="fas fa-triangle-exclamation fa-lg text-warning"></i>
            <div>
              <strong>HOSPITAL ACCEPTANCE WITHDRAWN:</strong> ${activeCase.withdrawalReason || 'Hospital had to divert due to emergency surge.'}
              <div style="margin-top:4px; font-size:0.85rem;">Emergency re-routing is required immediately. Select alternative candidate below.</div>
            </div>
          </div>
        ` : ''}

        <!-- Section Title: Explainable Matching Matrix -->
        <div style="margin-bottom:1rem; display:flex; justify-content:space-between; align-items:flex-end;">
          <div>
            <h3 style="font-size:1.15rem; font-weight:800; margin:0; color:#0F172A;">
              Explainable Hospital Matching Matrix
            </h3>
            <span style="font-size:0.82rem; color:#64748B;">
              Deterministic matching rule: <strong>NEAREST ≠ RIGHT HOSPITAL. AVAILABLE ≠ CONFIRMED.</strong>
            </span>
          </div>
          <div style="font-size:0.8rem; color:#475569;">
            Data Freshness Standard: <span class="badge badge-success">Fresh &lt;15m</span> <span class="badge badge-warning">Stale &gt;30m</span>
          </div>
        </div>

        <!-- Candidate Cards Grid -->
        <div class="tc-matrix-grid">
          ${candidateHospitals.map(h => {
            const isSuit = h.suitabilityState === 'SUITABLE';
            const isUnsuit = h.suitabilityState === 'UNSUITABLE';
            const isReconf = h.suitabilityState === 'RECONFIRMATION REQUIRED';
            const cardClass = isSuit ? 'suitable' : isUnsuit ? 'unsuitable' : 'reconfirm';
            const pillClass = isSuit ? 'suitable' : isUnsuit ? 'unsuitable' : 'reconfirm';
            const isTargetSelected = activeCase.selectedHospitalId === h.id;

            return `
              <div class="tc-hospital-card ${cardClass}">
                <div class="tc-card-status-strip ${cardClass}"></div>
                
                <div>
                  <div class="tc-hosp-header">
                    <div>
                      <div class="tc-hosp-name">${h.name}</div>
                      <div class="tc-hosp-meta">
                        <span><i class="fas fa-road"></i> ${h.distanceKm} km</span>
                        <span><i class="fas fa-clock"></i> ~${h.driveTimeMinutes} min ETA</span>
                      </div>
                    </div>
                    <span class="tc-verdict-pill ${pillClass}">
                      <i class="fas ${isSuit ? 'fa-circle-check' : isUnsuit ? 'fa-ban' : 'fa-triangle-exclamation'}"></i>
                      ${h.suitabilityState}
                    </span>
                  </div>

                  <!-- Matrix Table -->
                  <table class="tc-metric-table">
                    <tr>
                      <td class="tc-metric-label"><i class="fas fa-bed"></i> Required ICU Beds:</td>
                      <td class="tc-metric-val" style="color: ${h.liveAvailableBeds > 0 ? '#15803D' : '#DC2626'};">
                        ${h.liveAvailableBeds} / ${h.reportedIcuCapacity} Available
                      </td>
                    </tr>
                    <tr>
                      <td class="tc-metric-label"><i class="fas fa-user-doctor"></i> Trauma Specialist:</td>
                      <td class="tc-metric-val" style="color: ${h.hasTraumaTeam ? '#15803D' : '#DC2626'};">
                        ${h.hasTraumaTeam ? 'On Active Duty' : 'Call-out Required'}
                      </td>
                    </tr>
                    <tr>
                      <td class="tc-metric-label"><i class="fas fa-droplet"></i> Blood Bank:</td>
                      <td class="tc-metric-val" style="color: ${h.bloodBankOnSite ? '#15803D' : '#D97706'};">
                        ${h.bloodBankOnSite ? 'On-Site Available' : 'External Transfer'}
                      </td>
                    </tr>
                    <tr>
                      <td class="tc-metric-label"><i class="fas fa-satellite-dish"></i> Data Freshness:</td>
                      <td class="tc-metric-val" style="color: ${h.matrix.freshnessCategory === 'FRESH' ? '#15803D' : '#D97706'};">
                        ${h.matrix.dataFreshness}
                      </td>
                    </tr>
                  </table>

                  <!-- Explainability Box -->
                  <div class="tc-explanation-box">
                    <strong>Operational Verdict:</strong> ${h.explanation}
                  </div>
                </div>

                <!-- Action Button -->
                <div>
                  ${isTargetSelected ? `
                    <div style="background:#EFF6FF; border:1px solid #BFDBFE; border-radius:6px; padding:0.5rem; text-align:center; font-size:0.85rem; font-weight:700; color:#1D4ED8;">
                      <i class="fas fa-circle-check"></i> Request Active (${activeCase.status})
                    </div>
                  ` : `
                    <button 
                      class="btn btn-block ${isSuit ? 'btn-primary' : isReconf ? 'btn-warning' : 'btn-outline-danger'}" 
                      style="width: 100%; font-weight:700;"
                      onclick="window.TrustCare.requestHospital('${activeCase.id}', '${h.id}')"
                    >
                      <i class="fas fa-paper-plane"></i> ${isSuit ? 'Transmit Request (Recommended)' : isReconf ? 'Request with Reconfirmation' : 'Force Divert (High Risk)'}
                    </button>
                  `}
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Ambulance Transit Control Bar -->
        <div style="background:#FFFFFF; border:1px solid #E2E8F0; border-radius:12px; padding:1.25rem 1.5rem; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
            <div>
              <div style="font-size:0.8rem; font-weight:700; text-transform:uppercase; color:#64748B;">
                Ambulance In-Transit Telemetry (Unit ${activeCase.ambulanceId})
              </div>
              <div style="font-weight:800; font-size:1.1rem; color:#0F172A; margin-top:2px;">
                Status: <span class="badge ${activeCase.ambulanceStatus === 'ARRIVED' ? 'badge-success' : 'badge-primary'}">${activeCase.ambulanceStatus}</span>
                — Destination: ${activeCase.selectedHospitalId ? activeCase.selectedHospitalId : 'Hospital Selection Pending'}
              </div>
            </div>

            <div style="display:flex; align-items:center; gap:0.75rem;">
              <button 
                class="btn btn-outline-secondary btn-sm" 
                onclick="window.TrustCare.adjustEta('${activeCase.id}', -2)"
                title="Decrease ETA by 2 minutes"
              >
                <i class="fas fa-minus"></i> 2m
              </button>
              <button 
                class="btn btn-outline-secondary btn-sm" 
                onclick="window.TrustCare.adjustEta('${activeCase.id}', 2)"
                title="Increase ETA (Traffic Delay)"
              >
                <i class="fas fa-plus"></i> 2m (Traffic Delay)
              </button>
              <button 
                class="btn ${activeCase.ambulanceStatus === 'ARRIVED' ? 'btn-success disabled' : 'btn-success'}" 
                onclick="window.TrustCare.markArrived('${activeCase.id}')"
              >
                <i class="fas fa-location-crosshairs"></i> Mark Ambulance Arrived
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Subscribe to reactive state updates
  unsubscribeState = appState.subscribe(() => {
    render();
  });

  render();

  return () => {
    if (unsubscribeState) unsubscribeState();
  };
}
