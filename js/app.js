// ============================================
// HospitalFlow AI — Main Application Bootstrap
// ============================================

import Config from './config.js';
import appState from './state.js';
import eventBus, { EventTypes, getEventDescription, getEventIcon, getEventColor } from './events.js';
import Storage from './storage.js';
import Auth from './auth.js';
import Router from './router.js';
import i18n from './i18n.js';
import SymptomNormalizer from './engines/symptom-normalizer.js';
import NotificationManager from './notifications.js';
import ChartManager from './charts.js';
import { generateDemoState, initialEvents } from './demo-data.js';
import { escapeHtml, timeAgo } from './utils.js';

// Engines
import FlowEngine from './engines/flow-engine.js';
import BloodEngine from './engines/blood-engine.js';
import CareEngine from './engines/care-engine.js';
import SimulationEngine from './engines/simulation-engine.js';
import PredictionEngine from './engines/prediction-engine.js';
import alertManager from './engines/emergency-alert-manager.js';
import impactEngine from './engines/emergency-impact-engine.js';
import SupabaseSync from './engines/supabase-sync.js';

// TRUST CARE Core Engines
import trustCareEngine, { CaseStatus, ReadinessLevel } from './engines/trustcare-engine.js';
import resourceHoldEngine, { HoldStatus } from './engines/resource-hold-engine.js';
import bloodReadinessEngine, { BloodReadinessState } from './engines/blood-readiness-engine.js';
import handoverEngine, { HandoverStatus } from './engines/handover-engine.js';
import queueImpactBridge from './engines/queue-impact-bridge.js';

// ============================================
// GLOBAL API (window.HospitalFlow)
// ============================================

const HospitalFlow = {
  router: Router,
  state: appState,
  events: eventBus,
  auth: Auth,
  i18n: i18n,
  symptomNormalizer: SymptomNormalizer,
  flow: FlowEngine,
  blood: BloodEngine,
  care: CareEngine,
  simulation: SimulationEngine,
  prediction: PredictionEngine,
  alerts: alertManager,
  impact: impactEngine,
  sync: SupabaseSync,

  // Direct logout alias
  logout() {
    Auth.logout();
  },

  // ---- Patient & Clinical Actions ----
  checkInPatient(appointmentId) {
    try {
      FlowEngine.checkInPatient(appointmentId);
      const user = Auth.getCurrentUser();
      if (user?.role === 'patient') {
        Router.navigate('/patient/queue');
      } else if (user?.role === 'doctor') {
        Router.navigate('/doctor/queue');
      } else {
        Router.navigate('/admin/flow');
      }
    } catch (err) {
      alert(`Check-in failed: ${err.message}`);
    }
  },

  callPatient(queueEntryId) {
    FlowEngine.callPatient(queueEntryId);
    const user = Auth.getCurrentUser();
    Router.navigate(user?.role === 'doctor' ? '/doctor/dashboard' : '/admin/flow');
  },

  markPatientInRoom(queueEntryId) {
    FlowEngine.markPatientInRoom(queueEntryId);
    const user = Auth.getCurrentUser();
    Router.navigate(user?.role === 'doctor' ? '/doctor/dashboard' : '/admin/flow');
  },

  startConsultation(queueEntryId) {
    FlowEngine.startConsultation(queueEntryId);
    const user = Auth.getCurrentUser();
    Router.navigate(user?.role === 'doctor' ? '/doctor/dashboard' : '/admin/flow');
  },

  completeConsultation(queueEntryId) {
    FlowEngine.completeConsultation(queueEntryId);
    const user = Auth.getCurrentUser();
    Router.navigate(user?.role === 'doctor' ? '/doctor/dashboard' : '/admin/flow');
  },

  createPreArrivalEmergency(data) {
    return FlowEngine.createPreArrivalEmergency(data);
  },

  transferPatient(queueEntryId, toDoctorId) {
    FlowEngine.transferPatient(queueEntryId, toDoctorId);
    const user = Auth.getCurrentUser();
    Router.navigate(user?.role === 'doctor' ? '/doctor/queue' : '/admin/flow');
  },

  changeDoctorStatus(doctorId, status) {
    FlowEngine.changeDoctorStatus(doctorId, status);
    const user = Auth.getCurrentUser();
    if (user?.role === 'doctor') {
      Router.navigate('/doctor/dashboard');
    } else {
      Router.navigate('/admin/doctors');
    }
  },

  showEmergencyInsert() {
    const patientId = prompt('Enter Patient ID (e.g. P-1025):');
    if (!patientId) return;
    const department = prompt('Enter Department (e.g. General Medicine, Cardiology):', 'General Medicine');
    if (!department) return;

    try {
      FlowEngine.insertEmergencyPatient({ patientId, department });
      const user = Auth.getCurrentUser();
      Router.navigate(user?.role === 'doctor' ? '/doctor/queue' : '/admin/flow');
    } catch (err) {
      alert(`Emergency insert failed: ${err.message}`);
    }
  },

  // ---- Emergency & Ambulance Actions ----
  acknowledgeEmergencyAlert(alertId) {
    const user = Auth.getCurrentUser();
    alertManager.acknowledgeAlert(alertId, user?.displayName || 'Staff');
    const banner = document.querySelector(`[id^="active-emergency-banner-"]`);
    if (banner) banner.remove();
  },

  assignEmergencyDoctor(caseId, doctorId, options = {}) {
    try {
      FlowEngine.assignEmergencyDoctor(caseId, doctorId, options);
      const user = Auth.getCurrentUser();
      Router.navigate(user?.role === 'doctor' ? '/doctor/queue' : '/admin/emergency');
    } catch (err) {
      alert(`Assignment failed: ${err.message}`);
    }
  },

  startEmergencyConsultation(caseId) {
    const s = appState.get();
    const emCase = s.emergencyCases.find(c => c.id === caseId || c.caseId === caseId);
    if (emCase && emCase.queueEntryId) {
      FlowEngine.startConsultation(emCase.queueEntryId);
      emCase.status = 'IN_CONSULTATION';
      appState.updateItem('emergencyCases', emCase.id, { status: 'IN_CONSULTATION' });
    }
    const user = Auth.getCurrentUser();
    Router.navigate(user?.role === 'doctor' ? '/doctor/dashboard' : '/admin/emergency');
  },

  completeEmergencyCase(caseId) {
    try {
      FlowEngine.completeEmergencyCase(caseId);
    } catch {
      impactEngine.completeEmergencyCase(caseId);
    }
    alert('Emergency case completed. Doctor capacity restored and queue entering recovery.');
    const user = Auth.getCurrentUser();
    Router.navigate(user?.role === 'doctor' ? '/doctor/dashboard' : '/admin/emergency');
  },

  markAmbulanceArrived(requestId) {
    FlowEngine.markAmbulanceArrived(requestId);
    alert('Ambulance marked arrived. Patient prioritized in emergency queue.');
    Router.navigate('/admin/emergency');
  },

  dispatchAmbulance(requestId, ambulanceId, mins) {
    FlowEngine.dispatchAmbulance(requestId, ambulanceId, mins);
    Router.navigate('/admin/emergency');
  },

  applyEmergencyRecommendation(recId) {
    impactEngine.applyRecommendation(recId);
    Router.navigate('/admin/flow');
  },

  // ---- Blood Bank & Emergency Actions ----
  showSourceResults(requestId) {
    BloodEngine.processRequest(requestId);
    Router.navigate('/admin/emergency');
  },

  reserveBlood(requestId, facilityId, units) {
    try {
      BloodEngine.reserveUnits(requestId, facilityId, units);
      Router.navigate('/admin/emergency');
    } catch (err) {
      alert(`Reserve failed: ${err.message}`);
    }
  },

  issueBlood(requestId) {
    BloodEngine.issueUnits(requestId);
    Router.navigate('/admin/emergency');
  },

  sendDonorWave(requestId) {
    const donors = BloodEngine.sendDonorNotificationWave(requestId);
    if (donors.length === 0) {
      alert('No more eligible donors available for this blood group.');
    }
    Router.navigate('/admin/emergency');
  },

  showOTPVerification(donorId) {
    const otp = prompt('Enter the 6-digit OTP code sent to donor:');
    if (!otp) return;
    const result = BloodEngine.verifyDonorOTP(donorId, otp);
    alert(result.message);
    Router.navigate('/admin/emergency');
  },

  // ---- Care Continuity Actions ----
  toggleMedication(patientId, medName, timeSlot, planId = null) {
    CareEngine.acknowledgeMedication(patientId, medName, timeSlot, planId);
    const user = Auth.getCurrentUser();
    if (user?.role === 'patient') {
      Router.navigate('/patient/care');
    }
  },

  reportWarningSign(patientId) {
    const desc = prompt('Describe the warning sign/symptoms experienced:');
    if (!desc) return;
    CareEngine.reportWarningSign(patientId, desc);
    alert('Warning sign reported. Hospital triage team has been notified.');
  },

  requestReentry(patientId) {
    const reason = prompt('Reason for hospital care re-entry:');
    if (!reason) return;
    CareEngine.requestReentry(patientId, reason);
    alert('Care re-entry requested. Your follow-up is being prioritized.');
  },

  markAllNotificationsRead() {
    NotificationManager.markAllRead();
    const user = Auth.getCurrentUser();
    if (user?.role === 'patient') Router.navigate('/patient/notifications');
    else if (user?.role === 'doctor') Router.navigate('/doctor/notifications');
    else Router.navigate('/admin/notifications');
  }
};

// ============================================
// TRUST CARE GLOBAL API (window.TrustCare)
// ============================================

const TrustCare = {
  engine: trustCareEngine,
  holds: resourceHoldEngine,
  blood: bloodReadinessEngine,
  handover: handoverEngine,
  queueBridge: queueImpactBridge,

  async requestHospital(caseId, hospitalId) {
    const res = await trustCareEngine.sendHospitalRequest(caseId, hospitalId);
    if (res.success) {
      alert(`Emergency transmission dispatched to ${hospitalId}. Receiving desk alerted.`);
    } else {
      alert(`Request failed: ${res.message}`);
    }
  },

  async acceptHospitalRequest(caseId, hospitalId) {
    const res = await trustCareEngine.acceptCase(caseId, hospitalId);
    if (res.success) {
      alert(`Emergency Case ${caseId} ACCEPTED! Bed HOSP-C-ICU-01 successfully placed on 15-minute operational hold.`);
    } else {
      alert(`Acceptance hold failed: ${res.message}`);
    }
  },

  declineHospitalRequestPrompt(caseId, hospitalId) {
    const reason = prompt('State operational reason for declining (e.g. ICU at capacity, Specialist unavailable):', 'ICU capacity fully saturated');
    if (!reason) return;
    trustCareEngine.declineCase(caseId, hospitalId, reason);
    alert(`Case ${caseId} declined. Dispatcher notified to re-route.`);
  },

  withdrawAcceptancePrompt(caseId, hospitalId) {
    const reason = prompt('URGENT: State reason for withdrawing acceptance (e.g. Inflow surge, Mass casualty diversion):', 'Mass casualty incident surge in resuscitation bay');
    if (!reason) return;
    trustCareEngine.withdrawAcceptance(caseId, hospitalId, reason);
    alert(`Acceptance withdrawn for ${caseId}. Resource hold released.`);
  },

  toggleChecklistItem(caseId, itemKey, status) {
    trustCareEngine.updateReadinessItem(caseId, itemKey, status);
  },

  assignReceivingPhysician(caseId) {
    const res = queueImpactBridge.assignDoctorToEmergencyDuty('D-0001', caseId, 'Dr. Aarav Sharma');
    alert(`Dr. Aarav Sharma assigned as Trauma Lead. Routine OPD queue wait times updated (+${res.addedDelayMinutes}m) with privacy-protected notice.`);
  },

  markArrived(caseId) {
    handoverEngine.markAmbulanceArrival(caseId);
    alert(`Ambulance marked ARRIVED at Emergency Resuscitation Bay. Proceed with bedside clinical handover.`);
  },

  adjustEta(caseId, delta) {
    const cases = appState.get().trustcareCases || [];
    const c = cases.find(item => item.id === caseId);
    if (!c) return;
    const newEta = Math.max(1, (c.etaMinutes || 10) + delta);
    trustCareEngine.updateTransitStatus(caseId, 'EN_ROUTE', newEta);
  },

  startSbarHandover(caseId) {
    handoverEngine.startHandover(caseId, 'Dr. Aarav Sharma (Trauma Lead)');
    alert(`Bedside SBAR handover commenced with Dr. Aarav Sharma.`);
  },

  confirmHandover(caseId) {
    handoverEngine.confirmHandoverCompletion(caseId, {
      doctorName: 'Dr. Aarav Sharma (Trauma Lead)',
      paramedicName: 'Paramedic Squad 7',
      vitalsOnTransfer: 'BP 112/72, HR 96, SpO2 96% on NRB',
      summary: 'Patient transferred to ICU Bed 1. Trauma resuscitation team assumed full clinical care.'
    });
    alert(`CONFIRMED HANDOVER COMPLETED! Clinical authority formally transferred to Dr. Aarav Sharma. Timeline finalized.`);
  },

  acknowledgeBlood(requestId) {
    bloodReadinessEngine.acknowledgeRequest(requestId);
  },

  confirmBloodAvailability(requestId) {
    bloodReadinessEngine.confirmAvailability(requestId);
  },

  reserveBloodUnits(requestId) {
    bloodReadinessEngine.reserveUnits(requestId, 2);
    alert(`2 Units of O- successfully reserved and labeled for Case TC-014.`);
  },

  dispatchBloodToBay(requestId) {
    bloodReadinessEngine.markReceivedAtBay(requestId);
    alert(`Blood units delivered to Resuscitation Bay 1 cooler.`);
  },

  reportBloodUnavailable(requestId) {
    bloodReadinessEngine.flagUnavailable(requestId, 'Inventory depleted, regional blood centre notified');
    alert(`Blood flagged unavailable. Regional escalation alert dispatched.`);
  },

  extendHold(holdId, seconds = 300) {
    resourceHoldEngine.extendHold(holdId, seconds);
    alert(`Hold extended by ${Math.floor(seconds / 60)} minutes.`);
  },

  releaseHold(holdId) {
    resourceHoldEngine.releaseHold(holdId, 'Released by emergency desk');
    alert(`Operational hold released.`);
  },

  async runFullScenario() {
    Router.navigate('/demo');
    if (window.TrustCare.jumpToStage) {
      window.TrustCare.jumpToStage(1);
    }
  },

  async testConcurrencyConflict() {
    // Attempt double allocation for TC-015
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

    const res = await resourceHoldEngine.allocateHold({
      caseId: 'TC-015',
      hospitalId: 'HOSP-C',
      resourceId: 'HOSP-C-ICU-01',
      resourceType: 'ICU',
      durationSeconds: 900,
      createdBy: 'EMS Dispatcher 2'
    });

    if (!res.success) {
      appState.updateItem('trustcareCases', 'TC-015', {
        status: CaseStatus.RESOURCE_UNAVAILABLE,
        failureReason: res.message
      });
      alert(`ANTI-DOUBLE-ALLOCATION MUTEX ENFORCED!\n\n${res.message}\n\nCase TC-015 was strictly BLOCKED from seizing HOSP-C-ICU-01.`);
    } else {
      alert(`Unexpected: Hold succeeded!`);
    }
  },

  testHoldExpiry() {
    const holds = appState.get().resourceHolds || [];
    const activeHold = holds.find(h => h.hospitalId === 'HOSP-C' && h.status === 'HELD');
    if (activeHold) {
      // Set expiresAt to 1 second ago
      const expiredTime = new Date(Date.now() - 1000).toISOString();
      appState.updateItem('resourceHolds', activeHold.id, { expiresAt: expiredTime });
      alert(`Hold expiry timer simulated. The background watchdog will mark the hold as EXPIRED and release the bed.`);
    } else {
      alert(`No active hold on Hospital C to expire. Accept a case first.`);
    }
  },

  async testHospitalTimeout() {
    alert(`Testing 60-second request timeout watchdog. Dispatching request to Hospital B...`);
    await trustCareEngine.sendHospitalRequest('TC-014', 'HOSP-B');
  },

  testHospitalDecline() {
    trustCareEngine.declineCase('TC-014', 'HOSP-A', 'Trauma resuscitation saturated');
    alert(`Hospital A declined request due to ICU saturation.`);
  },

  testAcceptanceWithdrawal() {
    trustCareEngine.withdrawAcceptance('TC-014', 'HOSP-C', 'Emergency mass casualty surge');
    alert(`Hospital C withdrew acceptance. Rerouting required.`);
  },

  resetToBaseline() {
    Storage.remove(Config.STORAGE_KEYS.STATE);
    const demoState = generateDemoState();
    appState.initialize(demoState);
    trustCareEngine.init();
    resourceHoldEngine.init();
    alert(`Trust Care state reset to authoritative baseline.`);
    Router.navigate('/dispatcher');
  },

  createNewEmergencyCaseModal() {
    const cid = prompt('Enter Case ID (e.g. TC-016):', `TC-${Math.floor(100 + Math.random() * 900)}`);
    if (!cid) return;
    const cat = prompt('Emergency Category:', 'Traumatic Brain Injury');
    const bed = prompt('Required Bed (ICU / Trauma):', 'ICU');
    trustCareEngine.createCase({
      caseId: cid,
      emergencyCategory: cat || 'Severe Trauma',
      requiredBedType: bed || 'ICU',
      patientIdentifier: 'Adult Patient',
      paramedicNotes: 'Acute emergency requiring immediate stabilization.',
      ambulanceId: 'AMB-105'
    });
    alert(`Emergency Case ${cid} logged. Candidate hospital matrix evaluated.`);
  },

  switchRolePrompt() {
    const choice = prompt('Select Role to Switch:\n1: Ambulance Dispatcher\n2: Hospital Emergency Desk (Metro General)\n3: Blood Bank Desk\n4: Trust Care Admin\n\nEnter number (1-4):', '1');
    if (choice === '1') {
      Auth._setCurrentUser({ id: 'u-dispatcher', displayName: 'Lead Paramedic Dispatcher', role: 'dispatcher' });
      Router.navigate('/dispatcher');
    } else if (choice === '2') {
      Auth._setCurrentUser({ id: 'u-hosp-desk', displayName: 'Metro Emergency Desk Coordinator', role: 'hospital_desk' });
      Router.navigate('/hospital-desk');
    } else if (choice === '3') {
      Auth._setCurrentUser({ id: 'u-blood-desk', displayName: 'Metro Blood Bank Officer', role: 'blood_bank' });
      Router.navigate('/blood-bank');
    } else if (choice === '4') {
      Auth._setCurrentUser({ id: 'u-admin', displayName: 'Trust Care Operations Director', role: 'admin' });
      Router.navigate('/dispatcher');
    }
  },

  refreshMatchingMatrix() {
    trustCareEngine.matchHospitalsForCase('TC-014');
    alert(`Hospital availability and freshness re-evaluated.`);
  }
};

// ============================================
// BOOTSTRAP INITIALIZATION
// ============================================
async function bootstrap() {
  console.log(`%c TRUST CARE v${Config.VERSION} — Right Hospital. Confirmed Resources. Ready Before Arrival. `, 'background: #2563EB; color: white; font-weight: bold; padding: 4px 12px; border-radius: 6px; font-size: 14px;');

  // 1. Initialize persistent or synthetic demo dataset
  const savedState = Storage.loadState();
  if (savedState && savedState.patients && savedState.patients.length > 0) {
    appState.initialize(savedState);
  } else {
    const demoState = generateDemoState();
    appState.initialize(demoState);
  }

  // 2. Initialize TRUST CARE Core Engines
  trustCareEngine.init();
  resourceHoldEngine.init();

  // 3. Ensure default Case TC-014 exists
  const cases = appState.get().trustcareCases || [];
  if (!cases.some(c => c.id === 'TC-014')) {
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
  }

  // 4. Load audit events into event bus
  if (eventBus.history.length === 0) {
    initialEvents.forEach(evt => eventBus.history.unshift(evt));
  }

  // 5. Recalculate dashboard analytics
  appState.recalculateDashboard();

  // 6. Initialize Authentication
  await Auth.init();

  // 7. Initialize Supabase Realtime Synchronization
  await SupabaseSync.init();

  // 8. Initialize Router
  Router.init();
}

// Expose globally
window.HospitalFlow = HospitalFlow;
window.TrustCare = TrustCare;

// Launch on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
