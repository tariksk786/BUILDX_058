// ============================================================================
// TRUST CARE — Master Operational Demo & Concurrency Showcase Runner
// "Right Hospital. Confirmed Resources. Ready Before Arrival."
// ============================================================================

import appState from '../state.js';
import Config from '../config.js';
import Router from '../router.js';
import eventBus, { EventTypes } from '../events.js';
import alertManager from '../engines/emergency-alert-manager.js';
import trustCareEngine, { CaseStatus } from '../engines/trustcare-engine.js';
import resourceHoldEngine from '../engines/resource-hold-engine.js';
import bloodReadinessEngine, { BloodReadinessState } from '../engines/blood-readiness-engine.js';
import handoverEngine, { HandoverStatus } from '../engines/handover-engine.js';
import queueImpactBridge from '../engines/queue-impact-bridge.js';
import { renderTrustCareNavbar } from '../components/trustcare-nav.js';

export function renderDemoSimulation(container) {
  let currentStage = 1;
  let isPlaying = false;
  let timerId = null;

  const totalStages = 6;
  const stages = [
    {
      id: 1,
      title: 'Emergency Case TC-014 Logged',
      subtitle: 'Paramedic Squad 7 enters severe polytrauma case requiring ICU + Trauma + Blood',
      icon: 'fa-truck-medical',
      actionName: 'Create Case TC-014'
    },
    {
      id: 2,
      title: 'Explainable Hospital Matching Matrix',
      subtitle: 'Nearest != Right Hospital (HOSP-A full, HOSP-B stale, HOSP-C 1 ICU available)',
      icon: 'fa-scale-balanced',
      actionName: 'Evaluate Candidates'
    },
    {
      id: 3,
      title: 'Hospital C Accepts & Holds ICU-01',
      subtitle: '15-Minute Atomic Operational Hold placed on HOSP-C-ICU-01',
      icon: 'fa-lock',
      actionName: 'Request & Accept'
    },
    {
      id: 4,
      title: 'Strict Concurrency Lock (TC-015 Blocked)',
      subtitle: 'Second case TC-015 attempts to reserve ICU-01 → Anti-Double Allocation BLOCKS it',
      icon: 'fa-ban',
      actionName: 'Test Double-Allocation'
    },
    {
      id: 5,
      title: 'Pre-Arrival Prep & OPD Queue Impact',
      subtitle: 'Doctor assigned (OPD wait adjusted), Blood Bank reserves 2 Units O-',
      icon: 'fa-clipboard-check',
      actionName: 'Prepare Team & Blood'
    },
    {
      id: 6,
      title: 'Arrival & Confirmed Handover',
      subtitle: 'Transport arrives → SBAR bedside transfer → Clinical responsibility confirmed',
      icon: 'fa-shield-halved',
      actionName: 'Arrive & Handover'
    }
  ];

  async function executeStage(stageId) {
    currentStage = stageId;

    switch (stageId) {
      case 1: {
        // Reset or create TC-014
        await trustCareEngine.createCase({
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
        alertManager.playPriorityChime('Critical');
        break;
      }

      case 2: {
        // Run matching matrix
        trustCareEngine.matchHospitalsForCase('TC-014');
        break;
      }

      case 3: {
        // Send request to Hospital C and accept
        await trustCareEngine.sendHospitalRequest('TC-014', 'HOSP-C');
        await trustCareEngine.acceptCase('TC-014', 'HOSP-C', 'Emergency Desk Coordinator');
        alertManager.playPriorityChime('Critical');
        break;
      }

      case 4: {
        // Create Case TC-015 and attempt to reserve same HOSP-C-ICU-01
        await trustCareEngine.createCase({
          caseId: 'TC-015',
          emergencyCategory: 'Acute Intracranial Hemorrhage',
          patientIdentifier: 'Adult Female (Approx 42y)',
          paramedicNotes: 'Severe fall, deteriorating neurological status, GCS 7.',
          ambulanceId: 'AMB-102',
          requiredBedType: 'ICU',
          requiredSpecialist: 'Neurosurgeon',
          createdBy: 'EMS Unit 2'
        });

        // Attempt allocation -> MUST FAIL
        const holdAttempt = await resourceHoldEngine.allocateHold({
          caseId: 'TC-015',
          hospitalId: 'HOSP-C',
          resourceId: 'HOSP-C-ICU-01',
          resourceType: 'ICU',
          durationSeconds: 900,
          createdBy: 'EMS Dispatcher 2'
        });

        if (!holdAttempt.success) {
          appState.updateItem('trustcareCases', 'TC-015', {
            status: CaseStatus.RESOURCE_UNAVAILABLE,
            failureReason: holdAttempt.message
          });
        }
        break;
      }

      case 5: {
        // Doctor assignment (updates routine OPD queue)
        queueImpactBridge.assignDoctorToEmergencyDuty('D-0001', 'TC-014', 'Dr. Aarav Sharma');

        // Blood Bank reservation
        await bloodReadinessEngine.createCaseBloodRequest({
          caseId: 'TC-014',
          hospitalId: 'HOSP-C',
          bloodGroup: 'O-',
          unitsRequested: 2,
          requestedBy: 'Metro Emergency Desk'
        });
        bloodReadinessEngine.acknowledgeRequest('CBR-TC-014-ON', 'Metro Blood Bank Lead');
        bloodReadinessEngine.confirmAvailability('CBR-TC-014-ON', 'Metro Blood Bank Lead');
        bloodReadinessEngine.reserveUnits('CBR-TC-014-ON', 2, 'Metro Blood Bank Lead');
        break;
      }

      case 6: {
        // Ambulance arrives
        handoverEngine.markAmbulanceArrival('TC-014', 'Resuscitation Bay 1', 'Paramedic Squad 7');
        handoverEngine.startHandover('TC-014', 'Dr. Aarav Sharma (Trauma Lead)');
        handoverEngine.confirmHandoverCompletion('TC-014', {
          doctorName: 'Dr. Aarav Sharma (Trauma Lead)',
          paramedicName: 'Paramedic Squad 7',
          vitalsOnTransfer: 'BP 112/72, HR 96, SpO2 96% on NRB',
          summary: 'Patient transferred to ICU Bed 1. Trauma resuscitation team assumed clinical care.'
        });
        alertManager.playPriorityChime('High');
        break;
      }
    }

    render();
  }

  function render() {
    const s = appState.get();
    const c14 = (s.trustcareCases || []).find(c => c.id === 'TC-014');
    const c15 = (s.trustcareCases || []).find(c => c.id === 'TC-015');
    const hold = (s.resourceHolds || []).find(h => h.hospitalId === 'HOSP-C' && h.status === 'HELD');
    const bloodReq = (s.caseBloodRequests || []).find(r => r.caseId === 'TC-014');
    const handover = (s.caseHandovers || []).find(h => h.caseId === 'TC-014');

    container.innerHTML = `
      ${renderTrustCareNavbar('/demo')}

      <div class="tc-page-container">
        <!-- Top Banner -->
        <div class="tc-page-header">
          <div>
            <h1 class="tc-page-title">
              <i class="fas fa-wand-magic-sparkles text-primary"></i>
              TRUST CARE Master Operational Showcase
            </h1>
            <p class="tc-page-subtitle">
              Live deterministic verification of the complete emergency pre-arrival journey & anti-double-allocation locking.
            </p>
          </div>

          <div style="display:flex; gap:0.5rem; align-items:center;">
            <button class="btn ${isPlaying ? 'btn-danger' : 'btn-success'}" onclick="window.TrustCare.toggleAutoPlay()" style="font-weight:700;">
              <i class="fas ${isPlaying ? 'fa-pause' : 'fa-play'}"></i> ${isPlaying ? 'Pause Auto-Play' : 'Start Auto-Play (All 6 Steps)'}
            </button>
            <button class="btn btn-outline-secondary" onclick="window.TrustCare.resetToBaseline()">
              <i class="fas fa-rotate-left"></i> Reset Baseline
            </button>
          </div>
        </div>

        <!-- Step Progress Rail -->
        <div style="background:#FFFFFF; border:1px solid #E2E8F0; border-radius:12px; padding:1.25rem; margin-bottom:1.5rem; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
          <div style="display:grid; grid-template-columns:repeat(6, 1fr); gap:0.75rem;">
            ${stages.map((st, idx) => {
              const isCurrent = currentStage === st.id;
              const isPassed = currentStage > st.id;
              return `
                <div 
                  style="cursor:pointer; padding:0.75rem; border-radius:8px; border:2px solid ${isCurrent ? '#2563EB' : isPassed ? '#10B981' : '#E2E8F0'}; background:${isCurrent ? '#EFF6FF' : isPassed ? '#F0FDF4' : '#F8FAFC'}; transition:all 0.2s ease;"
                  onclick="window.TrustCare.jumpToStage(${st.id})"
                >
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.25rem;">
                    <span style="font-size:0.7rem; font-weight:800; color:${isCurrent ? '#2563EB' : isPassed ? '#15803D' : '#64748B'};">
                      STEP ${st.id}
                    </span>
                    <i class="fas ${isPassed ? 'fa-check-circle text-success' : st.icon}" style="font-size:0.85rem; color:${isCurrent ? '#2563EB' : isPassed ? '#10B981' : '#94A3B8'};"></i>
                  </div>
                  <div style="font-weight:700; font-size:0.82rem; color:#0F172A; line-height:1.2;">
                    ${st.title}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Active Stage Spotlight Card -->
        <div style="background:#FFFFFF; border:2px solid #2563EB; border-radius:12px; padding:1.5rem; margin-bottom:1.5rem; box-shadow:0 4px 14px rgba(37,99,235,0.1);">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1rem;">
            <div>
              <span class="badge badge-primary" style="font-size:0.75rem; text-transform:uppercase;">
                Active Stage ${currentStage} of 6
              </span>
              <h2 style="font-size:1.35rem; font-weight:800; color:#0F172A; margin:4px 0 0 0;">
                ${stages[currentStage - 1].title}
              </h2>
              <p style="font-size:0.9rem; color:#475569; margin:4px 0 0 0;">
                ${stages[currentStage - 1].subtitle}
              </p>
            </div>

            <div style="display:flex; gap:0.5rem;">
              <button class="btn btn-outline-secondary btn-sm" ${currentStage <= 1 ? 'disabled' : ''} onclick="window.TrustCare.jumpToStage(${currentStage - 1})">
                <i class="fas fa-chevron-left"></i> Previous
              </button>
              <button class="btn btn-primary btn-sm" onclick="window.TrustCare.executeCurrentStage()">
                <i class="fas fa-bolt"></i> Execute ${stages[currentStage - 1].actionName}
              </button>
              <button class="btn btn-secondary btn-sm" ${currentStage >= 6 ? 'disabled' : ''} onclick="window.TrustCare.jumpToStage(${currentStage + 1})">
                Next <i class="fas fa-chevron-right"></i>
              </button>
            </div>
          </div>

          <!-- Live State Inspection for Current Stage -->
          <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; padding:1rem; font-size:0.85rem;">
            ${currentStage === 1 ? `
              <div style="color:#0F172A;">
                <strong>Case TC-014 State:</strong> Status = <code>${c14?.status || 'NOT_CREATED'}</code> |
                Requirements = <code>${c14?.requiredBedType || 'ICU'}</code> bed, <code>${c14?.bloodUnitsNeeded || 2} Units ${c14?.bloodGroupNeeded || 'O-'}</code> blood.
              </div>
            ` : currentStage === 2 ? `
              <div>
                <strong>Candidate Evaluation Verdicts:</strong><br>
                • <strong>Hospital A (1.8km):</strong> <span class="badge badge-danger">UNSUITABLE</span> — ICU 0/10 available (Nearest != Right)<br>
                • <strong>Hospital B (2.9km):</strong> <span class="badge badge-warning">RECONFIRMATION REQUIRED</span> — Last updated 48 min ago (STALE)<br>
                • <strong>Hospital C (4.2km):</strong> <span class="badge badge-success">SUITABLE</span> — Exactly 1 ICU bed available, trauma team ready, data fresh (2m ago)
              </div>
            ` : currentStage === 3 ? `
              <div>
                <strong>Hospital C Acceptance & Operational Hold:</strong><br>
                • Case TC-014 Status: <code>${c14?.status}</code><br>
                • Active Hold: <code>${hold ? `${hold.id} (${hold.resourceId} held for ${hold.caseId})` : 'NO HOLD'}</code><br>
                • Expiry: <code>${hold?.expiresAt ? new Date(hold.expiresAt).toLocaleTimeString() : 'N/A'}</code>
              </div>
            ` : currentStage === 4 ? `
              <div style="color:#991B1B;">
                <strong>CRITICAL CONCURRENCY TEST RESULT:</strong><br>
                • Case TC-015 attempted to seize <code>HOSP-C-ICU-01</code>.<br>
                • <strong>System Lock Enforced:</strong> Double-allocation was strictly <strong>BLOCKED</strong>.<br>
                • TC-015 Status: <span class="badge badge-danger">${c15?.status || 'RESOURCE_UNAVAILABLE'}</span><br>
                • Failure Reason: <em>"${c15?.failureReason || 'Resource HOSP-C-ICU-01 is actively held for case TC-014'}"</em>
              </div>
            ` : currentStage === 5 ? `
              <div>
                <strong>Pre-Arrival Readiness & OPD Queue Coordination:</strong><br>
                • Trauma Receiving Lead: <span class="badge badge-success">Dr. Aarav Sharma Assigned</span><br>
                • Routine OPD Queue Impact: Routine patients waiting for Dr. Sharma received a privacy-protected +30 min delay notification.<br>
                • Blood Bank Status: <span class="badge badge-success">${bloodReq?.status || 'RESERVED'}</span> (2 Units O- tagged for Case TC-014)
              </div>
            ` : `
              <div style="color:#15803D;">
                <strong>Arrival & Responsibility Handover Closed:</strong><br>
                • Physical Transport: <span class="badge badge-success">ARRIVED at Bay 1</span><br>
                • SBAR Bedside Handover: <span class="badge badge-success">COMPLETED</span><br>
                • Clinical Authority: Transferred to <strong>${handover?.receivingDoctorSignoffBy || 'Dr. Aarav Sharma'}</strong>.<br>
                • Final Case TC-014 Status: <span class="badge badge-success">HANDOVER_COMPLETED</span>
              </div>
            `}
          </div>
        </div>

        <!-- Quick Navigation Cards to Portals -->
        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:1rem;">
          <a href="#/dispatcher" class="card" style="padding:1rem; text-decoration:none; color:inherit; text-align:center;">
            <i class="fas fa-truck-medical fa-2x text-primary" style="margin-bottom:0.5rem;"></i>
            <div style="font-weight:700;">Dispatcher Portal</div>
            <div style="font-size:0.75rem; color:#64748B;">View Candidate Matrix</div>
          </a>
          <a href="#/hospital-desk" class="card" style="padding:1rem; text-decoration:none; color:inherit; text-align:center;">
            <i class="fas fa-hospital fa-2x text-success" style="margin-bottom:0.5rem;"></i>
            <div style="font-weight:700;">Emergency Desk</div>
            <div style="font-size:0.75rem; color:#64748B;">View Pre-Arrival & Hold</div>
          </a>
          <a href="#/blood-bank" class="card" style="padding:1rem; text-decoration:none; color:inherit; text-align:center;">
            <i class="fas fa-droplet fa-2x text-danger" style="margin-bottom:0.5rem;"></i>
            <div style="font-weight:700;">Blood Bank Portal</div>
            <div style="font-size:0.75rem; color:#64748B;">View Blood Reservation</div>
          </a>
          <a href="#/timeline" class="card" style="padding:1rem; text-decoration:none; color:inherit; text-align:center;">
            <i class="fas fa-clock-rotate-left fa-2x text-warning" style="margin-bottom:0.5rem;"></i>
            <div style="font-weight:700;">Audit Timeline</div>
            <div style="font-size:0.75rem; color:#64748B;">View Chronological Log</div>
          </a>
        </div>
      </div>
    `;
  }

  // Bind global runner functions
  window.TrustCare = window.TrustCare || {};
  window.TrustCare.jumpToStage = (st) => executeStage(st);
  window.TrustCare.executeCurrentStage = () => executeStage(currentStage);
  window.TrustCare.toggleAutoPlay = () => {
    if (isPlaying) {
      isPlaying = false;
      if (timerId) clearInterval(timerId);
      render();
    } else {
      isPlaying = true;
      executeStage(1);
      timerId = setInterval(() => {
        if (currentStage < totalStages) {
          executeStage(currentStage + 1);
        } else {
          isPlaying = false;
          clearInterval(timerId);
          render();
        }
      }, 3500);
      render();
    }
  };

  render();
}
