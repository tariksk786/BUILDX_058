// ============================================================================
// TRUST CARE — Automated Verification & Concurrency Test Suite
// "Right Hospital. Confirmed Resources. Ready Before Arrival."
// ============================================================================

// 1. Headless environment shims
class MockLocalStorage {
  constructor() { this.store = new Map(); }
  getItem(k) { return this.store.has(k) ? this.store.get(k) : null; }
  setItem(k, v) { this.store.set(k, String(v)); }
  removeItem(k) { this.store.delete(k); }
  clear() { this.store.clear(); }
}

globalThis.localStorage = new MockLocalStorage();
globalThis.window = globalThis;

// 2. Import production engines and data
import appState from './js/state.js';
import Storage from './js/storage.js';
import eventBus, { EventTypes } from './js/events.js';
import { generateDemoState } from './js/demo-data.js';
import trustCareEngine, { CaseStatus, ReadinessLevel } from './js/engines/trustcare-engine.js';
import resourceHoldEngine, { HoldStatus } from './js/engines/resource-hold-engine.js';
import bloodReadinessEngine, { BloodReadinessState } from './js/engines/blood-readiness-engine.js';
import handoverEngine, { HandoverStatus } from './js/engines/handover-engine.js';
import queueImpactBridge from './js/engines/queue-impact-bridge.js';
import Auth from './js/auth.js';

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(`Assertion Failed: ${message}`);
  }
  passedTests++;
  console.log(`  ✅ PASS: ${message}`);
}

async function runTestSuite() {
  console.log('\n======================================================================');
  console.log('🩺 TRUST CARE: RUNNING AUTHORITATIVE CONCURRENCY & WORKFLOW TEST SUITE');
  console.log('======================================================================\n');

  // Initialize fresh baseline state
  const demoState = generateDemoState();
  appState.initialize(demoState);
  trustCareEngine.init();
  resourceHoldEngine.init();

  // --------------------------------------------------------------------------
  console.log('--- TEST GROUP 1: Emergency Case TC-014 Creation & Requirements ---');
  // --------------------------------------------------------------------------
  const case14 = await trustCareEngine.createCase({
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

  assert(case14.id === 'TC-014', 'Case TC-014 was created successfully');
  assert(case14.status === CaseStatus.CASE_CREATED, 'Case starts in CASE_CREATED status');
  assert(case14.requiredBedType === 'ICU', 'Requirements specify ICU bed');
  assert(case14.bloodUnitsNeeded === 2 && case14.bloodGroupNeeded === 'O-', 'Requires 2 Units of O- blood');

  // --------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: Explainable Candidate Hospital Matching Matrix ---');
  // --------------------------------------------------------------------------
  const candidates = trustCareEngine.matchHospitalsForCase('TC-014');
  assert(candidates.length === 3, 'Evaluated 3 candidate hospitals');

  const hospA = candidates.find(h => h.id === 'HOSP-A');
  const hospB = candidates.find(h => h.id === 'HOSP-B');
  const hospC = candidates.find(h => h.id === 'HOSP-C');

  assert(hospA && hospA.suitabilityState === 'UNSUITABLE', 'Hospital A (1.8km, nearest) is marked UNSUITABLE (0 ICU available)');
  assert(hospB && hospB.suitabilityState === 'RECONFIRMATION REQUIRED', 'Hospital B (2.9km) is marked RECONFIRMATION REQUIRED (data stale 48m ago)');
  assert(hospC && hospC.suitabilityState === 'SUITABLE', 'Hospital C (4.2km) is marked SUITABLE (1 ICU available, fresh 2m ago, trauma team ready)');

  // --------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: Request Dispatch & Hospital C Acceptance ---');
  // --------------------------------------------------------------------------
  const reqResult = await trustCareEngine.sendHospitalRequest('TC-014', 'HOSP-C');
  assert(reqResult.success, 'Emergency request sent to Hospital C');

  const acceptResult = await trustCareEngine.acceptCase('TC-014', 'HOSP-C', 'Emergency Desk Coordinator');
  assert(acceptResult.success, 'Hospital C accepted emergency case');

  const c14AfterAccept = appState.get().trustcareCases.find(c => c.id === 'TC-014');
  assert(c14AfterAccept.status === CaseStatus.HOSPITAL_ACCEPTED, 'TC-014 transitioned to HOSPITAL_ACCEPTED');
  assert(c14AfterAccept.bedHoldId !== null, 'ICU bed hold record attached to case');

  const holds = appState.get().resourceHolds || [];
  const icuHold = holds.find(h => h.id === c14AfterAccept.bedHoldId);
  assert(icuHold && icuHold.resourceId === 'HOSP-C-ICU-01', 'HOSP-C-ICU-01 successfully placed on operational hold');
  assert(icuHold.status === HoldStatus.HELD, 'Hold status is HELD');
  assert(new Date(icuHold.expiresAt).getTime() > Date.now(), 'Hold has active future expiration timestamp');

  // --------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 4: STRICT CONCURRENCY LOCK (ANTI-DOUBLE ALLOCATION) ---');
  // --------------------------------------------------------------------------
  // While HOSP-C-ICU-01 is actively held for TC-014, Case TC-015 attempts to reserve the same resource
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

  const doubleAllocAttempt = await resourceHoldEngine.allocateHold({
    caseId: 'TC-015',
    hospitalId: 'HOSP-C',
    resourceId: 'HOSP-C-ICU-01',
    resourceType: 'ICU',
    durationSeconds: 900,
    createdBy: 'EMS Dispatcher 2'
  });

  assert(!doubleAllocAttempt.success, 'Database/concurrency engine REJECTED double-allocation attempt');
  assert(doubleAllocAttempt.error === 'RESOURCE_ALREADY_HELD', 'Error correctly flagged as RESOURCE_ALREADY_HELD');
  assert(doubleAllocAttempt.conflictCaseId === 'TC-014', 'Identified conflicting active case as TC-014');

  // Verify Hospital C matrix now reflects 0 available beds for subsequent checks!
  const candidatesForTC15 = trustCareEngine.matchHospitalsForCase('TC-015');
  const hospCFor15 = candidatesForTC15.find(h => h.id === 'HOSP-C');
  assert(hospCFor15.liveAvailableBeds === 0, 'Hospital C live available beds decremented to 0 due to active TC-014 hold');
  assert(hospCFor15.suitabilityState === 'UNSUITABLE', 'Hospital C is now marked UNSUITABLE for TC-015 (All resources reserved)');

  // --------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 5: Pre-Arrival Readiness & Routine OPD Queue Impact ---');
  // --------------------------------------------------------------------------
  // Assign Dr. Aarav Sharma to emergency duty
  const opdBridgeResult = queueImpactBridge.assignDoctorToEmergencyDuty('D-0001', 'TC-014', 'Dr. Aarav Sharma');
  assert(opdBridgeResult.success, 'Dr. Aarav Sharma assigned to emergency duty');
  assert(opdBridgeResult.addedDelayMinutes === 30, 'Routine OPD queue waiting time updated with +30m delay');

  const doc = appState.get().doctors.find(d => d.displayName.includes('Sharma'));
  assert(doc.status === 'EMERGENCY_DUTY', 'Physician status set to EMERGENCY_DUTY');

  // Case-linked blood reservation
  const bloodReq = await bloodReadinessEngine.createCaseBloodRequest({
    caseId: 'TC-014',
    hospitalId: 'HOSP-C',
    bloodGroup: 'O-',
    unitsRequested: 2,
    requestedBy: 'Emergency Desk'
  });
  assert(bloodReq.status === BloodReadinessState.REQUESTED, 'Blood request starts in REQUESTED state');

  bloodReadinessEngine.acknowledgeRequest(bloodReq.id, 'Blood Bank Officer');
  bloodReadinessEngine.confirmAvailability(bloodReq.id, 'Blood Bank Officer');
  const reserveBloodRes = bloodReadinessEngine.reserveUnits(bloodReq.id, 2, 'Blood Bank Officer');
  assert(reserveBloodRes.success, '2 Units of O- physically reserved & tagged for Case TC-014');

  const updatedReq = appState.get().caseBloodRequests.find(r => r.id === bloodReq.id);
  assert(updatedReq.status === BloodReadinessState.RESERVED, 'Blood request transitioned to RESERVED');

  const c14Readiness = appState.get().trustcareCases.find(c => c.id === 'TC-014');
  assert(c14Readiness.readinessState === ReadinessLevel.READY, 'Overall pre-arrival readiness reached READY');

  // --------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 6: Transport Arrival & Confirmed Clinical Handover ---');
  // --------------------------------------------------------------------------
  // Ambulance arrives
  const arrResult = handoverEngine.markAmbulanceArrival('TC-014', 'Resuscitation Bay 1', 'Paramedic Squad 7');
  assert(arrResult.success, 'Ambulance marked ARRIVED at bay');

  const c14Arrived = appState.get().trustcareCases.find(c => c.id === 'TC-014');
  assert(c14Arrived.status === CaseStatus.ARRIVED, 'Case status is ARRIVED');
  assert(c14Arrived.ambulanceStatus === 'ARRIVED', 'Ambulance status is ARRIVED');

  // Handover started
  handoverEngine.startHandover('TC-014', 'Dr. Aarav Sharma (Trauma Lead)');
  const c14HandoverInProgress = appState.get().trustcareCases.find(c => c.id === 'TC-014');
  assert(c14HandoverInProgress.status === CaseStatus.HANDOVER_IN_PROGRESS, 'Case transitioned to HANDOVER_IN_PROGRESS');

  // Complete Confirmed Handover
  const confirmResult = handoverEngine.confirmHandoverCompletion('TC-014', {
    doctorName: 'Dr. Aarav Sharma (Trauma Lead)',
    paramedicName: 'Paramedic Squad 7',
    vitalsOnTransfer: 'BP 112/72, HR 96, SpO2 96% on NRB',
    summary: 'Patient transferred to ICU Bed 1. Trauma resuscitation team assumed full care.'
  });
  assert(confirmResult.success, 'Responsibility handover confirmed');

  const c14Completed = appState.get().trustcareCases.find(c => c.id === 'TC-014');
  assert(c14Completed.status === CaseStatus.HANDOVER_COMPLETED, 'Case status finalized to HANDOVER_COMPLETED');

  const confirmedHold = appState.get().resourceHolds.find(h => h.id === c14Completed.bedHoldId);
  assert(confirmedHold.status === HoldStatus.CONFIRMED, 'Resource hold converted permanently to CONFIRMED on admission');

  // --------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 7: Persistent Audit Timeline & Reload Simulation ---');
  // --------------------------------------------------------------------------
  const timelineEvents = c14Completed.timeline || [];
  assert(timelineEvents.length >= 7, `Chronological timeline contains ${timelineEvents.length} audited events`);

  const eventTypesRecorded = timelineEvents.map(e => e.type);
  assert(eventTypesRecorded.includes('CASE_CREATED'), 'Timeline includes CASE_CREATED');
  assert(eventTypesRecorded.includes('HOSPITAL_ACCEPTED'), 'Timeline includes HOSPITAL_ACCEPTED');
  assert(eventTypesRecorded.includes('BLOOD_RESERVED'), 'Timeline includes BLOOD_RESERVED');
  assert(eventTypesRecorded.includes('PATIENT_ARRIVED'), 'Timeline includes PATIENT_ARRIVED');
  assert(eventTypesRecorded.includes('HANDOVER_COMPLETED'), 'Timeline includes HANDOVER_COMPLETED');

  // Test Storage Serialization & Refresh
  Storage.saveState(appState.get());
  const reloadedState = Storage.loadState();
  assert(reloadedState !== null, 'State successfully reloaded from simulated persistent storage');
  assert(reloadedState.trustcareCases[0].status === CaseStatus.HANDOVER_COMPLETED, 'Case status survived storage reload');
  assert(reloadedState.trustcareCases[0].timeline.length === timelineEvents.length, 'Audit timeline survived storage reload');

  // --------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 8: Failure States & Edge Cases ---');
  // --------------------------------------------------------------------------
  // A. Hospital Rejection / Decline
  await trustCareEngine.createCase({ caseId: 'TC-099', emergencyCategory: 'Cardiac Arrest', requiredBedType: 'ICU' });
  await trustCareEngine.sendHospitalRequest('TC-099', 'HOSP-A');
  trustCareEngine.declineCase('TC-099', 'HOSP-A', 'Trauma resuscitation saturated');
  const c99 = appState.get().trustcareCases.find(c => c.id === 'TC-099');
  assert(c99.status === CaseStatus.REQUEST_DECLINED, 'Hospital rejection correctly sets status to REQUEST_DECLINED');

  // B. Acceptance Withdrawal
  await trustCareEngine.createCase({ caseId: 'TC-098', emergencyCategory: 'Burn Injury', requiredBedType: 'ICU' });
  await trustCareEngine.sendHospitalRequest('TC-098', 'HOSP-B');
  await trustCareEngine.acceptCase('TC-098', 'HOSP-B', 'Desk B');
  trustCareEngine.withdrawAcceptance('TC-098', 'HOSP-B', 'Emergency mass casualty surge');
  const c98 = appState.get().trustcareCases.find(c => c.id === 'TC-098');
  assert(c98.status === CaseStatus.ACCEPTANCE_WITHDRAWN, 'Surge withdrawal correctly sets status to ACCEPTANCE_WITHDRAWN');

  // C. Blood Stock Depleted
  const brFailed = await bloodReadinessEngine.createCaseBloodRequest({ caseId: 'TC-097', hospitalId: 'HOSP-C', bloodGroup: 'AB-' });
  bloodReadinessEngine.flagUnavailable(brFailed.id, 'Rare blood group stock zero');
  const brFailedRec = appState.get().caseBloodRequests.find(r => r.id === brFailed.id);
  assert(brFailedRec.status === BloodReadinessState.BLOOD_UNAVAILABLE, 'Blood shortage correctly triggers BLOOD_UNAVAILABLE state');

  // D. Hold Expiration Watchdog
  const holdToExpire = await resourceHoldEngine.allocateHold({
    caseId: 'TC-096',
    hospitalId: 'HOSP-A',
    resourceId: 'HOSP-A-ICU-02',
    resourceType: 'ICU',
    durationSeconds: 1, // 1 second hold
    createdBy: 'Tester'
  });
  assert(holdToExpire.success, 'Temporary 1s hold created');

  // Fast-forward expiration in memory
  holdToExpire.hold.expiresAt = new Date(Date.now() - 5000).toISOString();
  appState.updateItem('resourceHolds', holdToExpire.hold.id, { expiresAt: holdToExpire.hold.expiresAt });

  resourceHoldEngine._evaluateActiveHoldExpirations();
  const expiredHold = appState.get().resourceHolds.find(h => h.id === holdToExpire.hold.id);
  assert(expiredHold.status === HoldStatus.EXPIRED, 'Expired hold was automatically transitioned to EXPIRED by watchdog');

  // E. RBAC Permissions Guard
  Auth._setCurrentUser({ id: 'u-pat-test', role: 'patient', displayName: 'Patient User' });
  const patUser = Auth.getCurrentUser();
  assert(!Auth.canAccessRoute('/doctor/dashboard', patUser).allowed, 'Patient cannot access /doctor/dashboard');
  assert(!Auth.canAccessRoute('/admin/command', patUser).allowed, 'Patient cannot access /admin/command');
  assert(Auth.canAccessRoute('/dispatcher', patUser).allowed, 'Dispatcher view is accessible');

  console.log('\n======================================================================');
  console.log(`🎉 ALL ${passedTests} / ${totalTests} TESTS PASSED SUCCESSFULLY!`);
  console.log('Deterministic state machines, anti-double-allocation locking, and audit logs fully verified.');
  console.log('======================================================================\n');
  process.exit(0);
}

runTestSuite().catch(err => {
  console.error('\n❌ Test Suite Aborted with Error:', err);
  process.exit(1);
});
