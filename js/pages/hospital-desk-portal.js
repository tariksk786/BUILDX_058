// ============================================================================
// TRUST CARE — Hospital Emergency Desk Portal (Metro General Hospital — HOSP-C)
// "Right Hospital. Confirmed Resources. Ready Before Arrival."
// ============================================================================

import appState from '../state.js';
import eventBus from '../events.js';
import trustCareEngine, { CaseStatus } from '../engines/trustcare-engine.js';
import resourceHoldEngine from '../engines/resource-hold-engine.js';
import handoverEngine, { HandoverStatus } from '../engines/handover-engine.js';
import queueImpactBridge from '../engines/queue-impact-bridge.js';
import { renderTrustCareNavbar } from '../components/trustcare-nav.js';

export function renderHospitalDeskPortal(container) {
  let unsubscribeState = null;
  let timerInterval = null;

  function render() {
    const cases = appState.get().trustcareCases || [];
    const activeCase = cases.find(c => c.id === 'TC-014') || cases[0];
    const hospitalId = 'HOSP-C';

    const requests = appState.get().hospitalRequests || [];
    const pendingRequest = requests.find(r => r.hospitalId === hospitalId && r.status === 'REQUEST_SENT');

    const holds = appState.get().resourceHolds || [];
    const activeHold = holds.find(h => h.hospitalId === hospitalId && (h.status === 'HELD' || h.status === 'CONFIRMED'));

    const handovers = appState.get().caseHandovers || [];
    const activeHandover = handovers.find(h => h.caseId === activeCase?.id);

    // Calculate countdown
    let remainingSeconds = 0;
    if (activeHold && activeHold.expiresAt) {
      remainingSeconds = Math.max(0, Math.floor((new Date(activeHold.expiresAt).getTime() - Date.now()) / 1000));
    }
    const mins = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;
    const timeFormatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    container.innerHTML = `
      ${renderTrustCareNavbar('/hospital-desk')}

      <div class="tc-page-container">
        <!-- Page Header -->
        <div class="tc-page-header">
          <div>
            <h1 class="tc-page-title">
              <i class="fas fa-hospital text-primary"></i>
              Metro General Hospital (Hospital C) — Emergency Receiving Console
            </h1>
            <p class="tc-page-subtitle">
              Module 4–8 & 10–12: Pre-Arrival Acceptance, Atomic Resource Hold & Bedside Handover
            </p>
          </div>
          <div style="display:flex; gap:0.5rem; align-items:center;">
            <span class="badge ${activeHold ? 'badge-success' : 'badge-secondary'}" style="font-size:0.85rem; padding:0.4rem 0.75rem;">
              <i class="fas fa-bed"></i> ICU-01: ${activeHold ? `HELD for ${activeHold.caseId}` : 'AVAILABLE'}
            </span>
          </div>
        </div>

        <!-- Incoming Emergency Request Banner (If Pending) -->
        ${pendingRequest ? `
          <div class="alert alert-danger" style="border-left:5px solid #EF4444; background:#FEF2F2; padding:1.25rem 1.5rem; margin-bottom:1.5rem; border-radius:10px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; animation:tc-pulse 2s infinite;">
            <div style="display:flex; align-items:center; gap:1rem;">
              <div style="width:44px; height:44px; border-radius:50%; background:#EF4444; color:white; display:flex; align-items:center; justify-content:center; font-size:1.4rem;">
                <i class="fas fa-bell"></i>
              </div>
              <div>
                <div style="font-weight:800; font-size:1.1rem; color:#991B1B;">
                  INCOMING EMERGENCY REQUEST — CASE ${pendingRequest.caseId}
                </div>
                <div style="font-size:0.85rem; color:#7F1D1D; margin-top:2px;">
                  Ambulance Dispatcher requesting 1 ICU Bed + Trauma Specialist + Blood Readiness.
                </div>
              </div>
            </div>

            <div style="display:flex; gap:0.65rem;">
              <button class="btn btn-success" style="font-weight:700;" onclick="window.TrustCare.acceptHospitalRequest('${pendingRequest.caseId}', '${hospitalId}')">
                <i class="fas fa-check-circle"></i> ACCEPT & HOLD ICU-01
              </button>
              <button class="btn btn-outline-danger" onclick="window.TrustCare.declineHospitalRequestPrompt('${pendingRequest.caseId}', '${hospitalId}')">
                <i class="fas fa-times-circle"></i> Decline
              </button>
            </div>
          </div>
        ` : ''}

        <div style="display:grid; grid-template-columns: 2fr 1fr; gap:1.5rem;">
          <!-- Left Column: Pre-Arrival Preparation Checklist & Actions -->
          <div>
            <!-- Resource Hold & Concurrency Guard Card -->
            <div class="tc-hold-status-card" style="margin-bottom:1.5rem;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1rem;">
                <div>
                  <div style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:#64748B;">
                    Atomic Anti-Double-Allocation Lock
                  </div>
                  <h3 style="font-size:1.15rem; font-weight:800; color:#0F172A; margin:2px 0 0 0;">
                    Resource: HOSP-C-ICU-01 (Intensive Care Bed 1)
                  </h3>
                </div>
                <span class="badge ${activeHold ? 'badge-success' : 'badge-secondary'}" style="font-size:0.8rem; font-weight:700;">
                  ${activeHold ? activeHold.status : 'NO ACTIVE HOLD'}
                </span>
              </div>

              ${activeHold ? `
                <div style="background:#F0FDF4; border:1px solid #86EFAC; border-radius:8px; padding:1rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
                  <div>
                    <div style="font-size:0.82rem; color:#166534; font-weight:600;">
                      <i class="fas fa-lock text-success"></i> Operational Hold Active for Case: <strong>${activeHold.caseId}</strong>
                    </div>
                    <div style="font-size:0.78rem; color:#4B5563; margin-top:2px;">
                      Any other emergency case requesting HOSP-C-ICU-01 will be strictly <strong>BLOCKED</strong> by concurrency mutex.
                    </div>
                  </div>

                  <div style="text-align:right;">
                    <div style="font-size:0.72rem; color:#64748B; font-weight:700; text-transform:uppercase;">Hold Expiration Timer</div>
                    <div class="tc-countdown-display ${remainingSeconds < 180 ? 'critical' : remainingSeconds < 450 ? 'warning' : ''}">
                      <i class="fas fa-clock"></i> ${timeFormatted}
                    </div>
                  </div>
                </div>

                <div style="margin-top:0.75rem; display:flex; justify-content:flex-end; gap:0.5rem;">
                  <button class="btn btn-xs btn-outline-warning" onclick="window.TrustCare.extendHold('${activeHold.id}', 300)" style="font-size:0.75rem;">
                    <i class="fas fa-clock-rotate-left"></i> Extend (+5m)
                  </button>
                  <button class="btn btn-xs btn-outline-danger" onclick="window.TrustCare.releaseHold('${activeHold.id}')" style="font-size:0.75rem;">
                    <i class="fas fa-unlock"></i> Release Hold
                  </button>
                </div>
              ` : `
                <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; padding:1rem; text-align:center; color:#64748B; font-size:0.85rem;">
                  <i class="fas fa-lock-open text-muted"></i> No active hold allocated. Awaiting incoming emergency acceptance.
                </div>
              `}
            </div>

            <!-- Pre-Arrival Preparation Checklist -->
            <div style="background:#FFFFFF; border:1px solid #CBD5E1; border-radius:12px; padding:1.25rem; box-shadow:0 2px 8px rgba(0,0,0,0.05); margin-bottom:1.5rem;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                <h3 style="font-size:1.15rem; font-weight:800; color:#0F172A; margin:0;">
                  <i class="fas fa-clipboard-check text-primary"></i>
                  Pre-Arrival Readiness Checklist (Case ${activeCase?.id || 'TC-014'})
                </h3>
                <span class="badge ${activeCase?.readinessState === 'READY' ? 'badge-success' : activeCase?.readinessState === 'PARTIALLY_READY' ? 'badge-warning' : 'badge-secondary'}" style="font-weight:700; font-size:0.8rem;">
                  Readiness: ${activeCase?.readinessState || 'PENDING'}
                </span>
              </div>

              <!-- Checklist Items -->
              <div class="tc-checklist-item ${activeCase?.emergencyBayStatus === 'READY' ? 'ready' : 'pending'}">
                <div>
                  <div style="font-weight:700; font-size:0.9rem; color:#0F172A;">
                    <i class="fas fa-door-open ${activeCase?.emergencyBayStatus === 'READY' ? 'text-success' : 'text-warning'}"></i>
                    1. Resuscitation Bay 1 Prepared
                  </div>
                  <div style="font-size:0.78rem; color:#64748B;">
                    Monitor on standby, ventilator checked, trauma kit unsealed.
                  </div>
                </div>
                <div>
                  <button class="btn btn-sm ${activeCase?.emergencyBayStatus === 'READY' ? 'btn-outline-success' : 'btn-primary'}" onclick="window.TrustCare.toggleChecklistItem('${activeCase?.id}', 'emergencyBay', '${activeCase?.emergencyBayStatus === 'READY' ? 'PENDING' : 'READY'}')">
                    ${activeCase?.emergencyBayStatus === 'READY' ? 'Ready' : 'Mark Ready'}
                  </button>
                </div>
              </div>

              <div class="tc-checklist-item ${activeHold ? 'ready' : 'pending'}">
                <div>
                  <div style="font-weight:700; font-size:0.9rem; color:#0F172A;">
                    <i class="fas fa-bed ${activeHold ? 'text-success' : 'text-warning'}"></i>
                    2. ICU Bed Hold Confirmed (HOSP-C-ICU-01)
                  </div>
                  <div style="font-size:0.78rem; color:#64748B;">
                    Anti-double-allocation reservation guaranteed.
                  </div>
                </div>
                <div>
                  <span class="badge ${activeHold ? 'badge-success' : 'badge-warning'}">
                    ${activeHold ? 'HELD' : 'PENDING'}
                  </span>
                </div>
              </div>

              <div class="tc-checklist-item ${activeCase?.receivingTeamStatus === 'ACKNOWLEDGED' ? 'ready' : 'pending'}">
                <div>
                  <div style="font-weight:700; font-size:0.9rem; color:#0F172A;">
                    <i class="fas fa-user-doctor ${activeCase?.receivingTeamStatus === 'ACKNOWLEDGED' ? 'text-success' : 'text-warning'}"></i>
                    3. Trauma Receiving Team Acknowledged
                  </div>
                  <div style="font-size:0.78rem; color:#64748B;">
                    Trauma Surgeon on duty. Assigning physician updates routine OPD queue.
                  </div>
                </div>
                <div>
                  ${activeCase?.receivingTeamStatus === 'ACKNOWLEDGED' ? `
                    <span class="badge badge-success"><i class="fas fa-check"></i> Lead Acknowledged</span>
                  ` : `
                    <button class="btn btn-sm btn-primary" onclick="window.TrustCare.assignReceivingPhysician('${activeCase?.id}')">
                      Assign Dr. Aarav Sharma
                    </button>
                  `}
                </div>
              </div>

              <div class="tc-checklist-item ${activeCase?.bloodStatus === 'RESERVED' ? 'ready' : 'pending'}">
                <div>
                  <div style="font-weight:700; font-size:0.9rem; color:#0F172A;">
                    <i class="fas fa-droplet ${activeCase?.bloodStatus === 'RESERVED' ? 'text-success' : 'text-warning'}"></i>
                    4. Emergency Blood Readiness (2U O-)
                  </div>
                  <div style="font-size:0.78rem; color:#64748B;">
                    Blood bank verification & physical shelf reservation for emergency bay.
                  </div>
                </div>
                <div>
                  <span class="badge ${activeCase?.bloodStatus === 'RESERVED' ? 'badge-success' : activeCase?.bloodStatus === 'ACKNOWLEDGED' ? 'badge-primary' : 'badge-warning'}">
                    ${activeCase?.bloodStatus || 'PENDING'}
                  </span>
                </div>
              </div>
            </div>

            <!-- Arrival & Confirmed Bedside Handover Section -->
            <div style="background:#FFFFFF; border:1px solid #CBD5E1; border-radius:12px; padding:1.25rem; box-shadow:0 2px 8px rgba(0,0,0,0.05);">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                <div>
                  <h3 style="font-size:1.15rem; font-weight:800; color:#0F172A; margin:0;">
                    <i class="fas fa-shield-halved text-success"></i>
                    Module 10–12: Arrival & Confirmed Responsibility Handover
                  </h3>
                  <span style="font-size:0.8rem; color:#64748B;">
                    Enforces the critical boundary: <strong>PATIENT ARRIVED ≠ HANDOVER COMPLETED</strong>
                  </span>
                </div>
                <span class="badge ${activeCase?.status === 'HANDOVER_COMPLETED' ? 'badge-success' : activeCase?.status === 'ARRIVED' ? 'badge-warning' : 'badge-secondary'}" style="font-weight:700; font-size:0.8rem;">
                  ${activeCase?.status || 'EN_ROUTE'}
                </span>
              </div>

              ${activeCase?.status === 'ARRIVED' || activeCase?.status === 'HANDOVER_IN_PROGRESS' ? `
                <div style="background:#FFFBEB; border:1px solid #FDE68A; border-radius:8px; padding:1rem; margin-bottom:1rem;">
                  <div style="display:flex; align-items:center; gap:0.5rem; font-weight:700; color:#B45309;">
                    <i class="fas fa-ambulance"></i> Transport Arrived at Emergency Bay. Formal Transfer of Care Required.
                  </div>
                  <p style="font-size:0.82rem; color:#4B5563; margin:0.4rem 0 0.8rem 0;">
                    The patient has physically reached the bay. Paramedic Squad 7 and Receiving Physician must conduct SBAR bedside sign-off before clinical responsibility is transferred.
                  </p>
                  
                  <div class="tc-sbar-grid">
                    <div class="tc-sbar-box">
                      <div class="tc-sbar-tag">S — Situation</div>
                      <div style="font-size:0.8rem; color:#1E293B;">35M polytrauma, high-velocity vehicular collision. GCS 9. Unstable.</div>
                    </div>
                    <div class="tc-sbar-box">
                      <div class="tc-sbar-tag">B — Background</div>
                      <div style="font-size:0.8rem; color:#1E293B;">Extricated at scene. 1L saline given in transit. No known allergies.</div>
                    </div>
                    <div class="tc-sbar-box">
                      <div class="tc-sbar-tag">A — Assessment</div>
                      <div style="font-size:0.8rem; color:#1E293B;">BP 98/60, HR 122, SpO2 91% on NRB. Blunt thoracic trauma.</div>
                    </div>
                    <div class="tc-sbar-box">
                      <div class="tc-sbar-tag">R — Recommendation</div>
                      <div style="font-size:0.8rem; color:#1E293B;">Immediate CT angiography, emergency chest tube tray ready.</div>
                    </div>
                  </div>

                  <div style="display:flex; justify-content:flex-end; gap:0.75rem; margin-top:1rem;">
                    ${activeCase.status === 'ARRIVED' ? `
                      <button class="btn btn-warning" onclick="window.TrustCare.startSbarHandover('${activeCase.id}')">
                        <i class="fas fa-play"></i> Start Bedside SBAR Handover
                      </button>
                    ` : `
                      <button class="btn btn-success" style="font-weight:700;" onclick="window.TrustCare.confirmHandover('${activeCase.id}')">
                        <i class="fas fa-signature"></i> Confirm Handover & Transfer Responsibility
                      </button>
                    `}
                  </div>
                </div>
              ` : activeCase?.status === 'HANDOVER_COMPLETED' ? `
                <div style="background:#F0FDF4; border:1px solid #86EFAC; border-radius:8px; padding:1.25rem; text-align:center;">
                  <div style="color:#15803D; font-size:1.2rem; font-weight:800;">
                    <i class="fas fa-check-circle"></i> Responsibility Handover Confirmed
                  </div>
                  <div style="font-size:0.85rem; color:#166534; margin-top:0.35rem;">
                    Clinical authority transferred to <strong>Dr. Aarav Sharma (Trauma Lead)</strong>.
                    Bed HOSP-C-ICU-01 hold successfully converted to full emergency admission.
                  </div>
                </div>
              ` : `
                <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; padding:1.25rem; text-align:center; color:#64748B; font-size:0.85rem;">
                  <i class="fas fa-truck-medical text-muted"></i> Ambulance is en route (ETA ~${activeCase?.etaMinutes || 9} min). Handover actions unlock upon arrival.
                </div>
              `}
            </div>
          </div>

          <!-- Right Column: Case Info & Failure Recovery Controls -->
          <div>
            <!-- Case Telemetry Card -->
            <div style="background:#FFFFFF; border:1px solid #E2E8F0; border-radius:12px; padding:1.25rem; margin-bottom:1.5rem; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
              <h4 style="font-size:0.95rem; font-weight:800; color:#0F172A; margin:0 0 0.75rem 0;">
                Emergency Case Telemetry
              </h4>
              <div style="font-size:0.82rem; line-height:1.6; color:#334155;">
                <div><strong>Case ID:</strong> ${activeCase?.id}</div>
                <div><strong>Patient:</strong> ${activeCase?.patientIdentifier}</div>
                <div><strong>Paramedic:</strong> ${activeCase?.createdBy}</div>
                <div><strong>Assigned Bed:</strong> HOSP-C-ICU-01</div>
                <div><strong>Blood Match:</strong> 2 Units O- (Negative)</div>
                <div><strong>ETA to Metro:</strong> <span style="font-weight:700; color:#2563EB;">${activeCase?.etaMinutes} mins</span></div>
              </div>
            </div>

            <!-- Failure State Test Actions -->
            <div style="background:#FFF5F5; border:1px solid #FECACA; border-radius:12px; padding:1.25rem;">
              <h4 style="font-size:0.9rem; font-weight:800; color:#991B1B; margin:0 0 0.5rem 0;">
                <i class="fas fa-triangle-exclamation text-danger"></i> Failure Scenarios Testing
              </h4>
              <p style="font-size:0.78rem; color:#7F1D1D; margin:0 0 0.85rem 0;">
                Test emergency re-routing when hospital capacity unexpectedly changes:
              </p>
              <button 
                class="btn btn-outline-danger btn-sm btn-block" 
                style="width:100%; font-size:0.78rem;" 
                onclick="window.TrustCare.withdrawAcceptancePrompt('${activeCase?.id}', '${hospitalId}')"
              >
                <i class="fas fa-hand"></i> Withdraw Acceptance (Mass Surge)
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

  // Local timer for countdown tick
  timerInterval = setInterval(() => {
    const activeHold = (appState.get().resourceHolds || []).find(h => h.hospitalId === 'HOSP-C' && h.status === 'HELD');
    if (activeHold) render();
  }, 1000);

  render();

  return () => {
    if (unsubscribeState) unsubscribeState();
    if (timerInterval) clearInterval(timerInterval);
  };
}
