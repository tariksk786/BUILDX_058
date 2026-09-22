// ============================================================================
// TRUST CARE — OPD Queue Impact Bridge (Module 15)
// Connects Emergency Duty Assignment to Routine Outpatient Waiting Time Updates
// ============================================================================

import appState from '../state.js';
import eventBus from '../events.js';
import trustCareEngine from './trustcare-engine.js';

class QueueImpactBridge {
  /**
   * Assign an OPD physician to an incoming emergency case.
   * Recalculates routine queue ETAs while strictly protecting emergency privacy.
   */
  assignDoctorToEmergencyDuty(doctorId = 'D0001', caseId = 'TC-014', doctorName = 'Dr. Aarav Sharma') {
    const doctors = appState.get().doctors || [];
    const doc = doctors.find(d => d.id === doctorId || d.displayName.includes(doctorName));
    const targetDocId = doc ? doc.id : doctorId;

    // 1. Update doctor status to EMERGENCY_DUTY
    appState.updateItem('doctors', targetDocId, {
      status: 'EMERGENCY_DUTY',
      currentEmergencyCaseId: caseId
    });

    // 2. Find routine queue patients waiting for this physician
    const queueEntries = appState.get().queueEntries || [];
    const affectedQueue = queueEntries.filter(q => q.doctorId === targetDocId && q.status === 'Waiting');

    const addedDelayMinutes = 30; // 30 minute emergency stabilization window
    affectedQueue.forEach(q => {
      const currentEta = q.estimatedWaitMinutes || 15;
      appState.updateItem('queueEntries', q.id, {
        estimatedWaitMinutes: currentEta + addedDelayMinutes,
        operationalNotice: 'Doctor availability has changed due to emergency duty. Your estimated waiting time has been updated.'
      });
    });

    // 3. Update Pre-Arrival Readiness on the Emergency Case
    trustCareEngine.updateReadinessItem(caseId, 'receivingTeam', 'ACKNOWLEDGED', doc ? doc.displayName : doctorName);

    // 4. Record audit event (NO private patient details leaked to OPD!)
    trustCareEngine.recordCaseEvent(caseId, {
      type: 'RECEIVING_TEAM_ASSIGNED',
      description: `${doc ? doc.displayName : doctorName} assigned as Trauma Receiving Lead. OPD queue adjusted (+${addedDelayMinutes}m) with privacy-protected notice.`,
      role: 'hospital_desk',
      actorName: 'Emergency Coordinator',
      metadata: { doctorId: targetDocId, affectedOpdPatientsCount: affectedQueue.length }
    });

    eventBus.emit('DOCTOR_EMERGENCY_DUTY_ASSIGNED', {
      doctorId: targetDocId,
      caseId,
      doctorName: doc ? doc.displayName : doctorName,
      affectedPatientsCount: affectedQueue.length,
      delayMinutes: addedDelayMinutes
    }, { source: 'QueueImpactBridge', role: 'hospital_desk', entityId: caseId });

    return {
      success: true,
      doctorId: targetDocId,
      affectedCount: affectedQueue.length,
      addedDelayMinutes
    };
  }
}

const queueImpactBridge = new QueueImpactBridge();
export default queueImpactBridge;
