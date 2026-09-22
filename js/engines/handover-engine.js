// ============================================================================
// TRUST CARE — Arrival & Confirmed Handover Engine
// "Patient Arrived != Handover Completed"
// ============================================================================

import Config from '../config.js';
import appState from '../state.js';
import eventBus from '../events.js';
import trustCareEngine, { CaseStatus } from './trustcare-engine.js';
import resourceHoldEngine from './resource-hold-engine.js';

export const HandoverStatus = {
  EN_ROUTE: 'EN_ROUTE',
  ARRIVED: 'ARRIVED',
  HANDOVER_IN_PROGRESS: 'HANDOVER_IN_PROGRESS',
  HANDOVER_COMPLETED: 'HANDOVER_COMPLETED'
};

class HandoverEngine {
  /**
   * Mark transport arrival at emergency receiving bay
   */
  markAmbulanceArrival(caseId, bayNumber = 'Resuscitation Bay 1', recordedBy = 'EMS Paramedic') {
    const cases = appState.get().trustcareCases || [];
    const c = cases.find(item => item.id === caseId);
    if (!c) return { success: false, message: 'Case not found' };

    const arrivedAt = new Date().toISOString();

    const handoverRecord = {
      id: `HND-${caseId}`,
      caseId,
      hospitalId: c.selectedHospitalId || 'HOSP-C',
      ambulanceId: c.ambulanceId || 'AMB-108',
      arrivedAt,
      handoverStartedAt: null,
      handoverCompletedAt: null,
      receivingBay: bayNumber,
      paramedicSignoffBy: recordedBy,
      receivingDoctorSignoffBy: null,
      status: HandoverStatus.ARRIVED,
      clinicalNotes: c.paramedicNotes || ''
    };

    const handovers = appState.get().caseHandovers || [];
    const idx = handovers.findIndex(h => h.caseId === caseId);
    if (idx >= 0) {
      handovers[idx] = handoverRecord;
      appState.update({ caseHandovers: [...handovers] });
    } else {
      appState.addItem('caseHandovers', handoverRecord);
    }

    // Update case status
    appState.updateItem('trustcareCases', c.id, {
      status: CaseStatus.ARRIVED,
      ambulanceStatus: 'ARRIVED',
      etaMinutes: 0
    });

    trustCareEngine.recordCaseEvent(caseId, {
      type: 'PATIENT_ARRIVED',
      description: `Ambulance ${c.ambulanceId} arrived at ${bayNumber}. Transport phase concluded. Clinical handover pending.`,
      role: 'dispatcher',
      actorName: recordedBy,
      previousState: c.status,
      newState: CaseStatus.ARRIVED,
      metadata: { bayNumber, arrivedAt }
    });

    eventBus.emit('PATIENT_ARRIVED', { caseId, bayNumber, arrivedAt }, { source: 'HandoverEngine', role: 'dispatcher', entityId: caseId });
    return { success: true, handover: handoverRecord };
  }

  /**
   * Start bedside verbal clinical handover (SBAR protocol)
   */
  startHandover(caseId, doctorName = 'Dr. Aarav Sharma (Trauma Lead)') {
    const handovers = appState.get().caseHandovers || [];
    const h = handovers.find(item => item.caseId === caseId);
    if (!h) return { success: false, message: 'Handover record not found' };

    const startedAt = new Date().toISOString();
    appState.updateItem('caseHandovers', h.id, {
      status: HandoverStatus.HANDOVER_IN_PROGRESS,
      handoverStartedAt: startedAt,
      receivingDoctorSignoffBy: doctorName
    });

    appState.updateItem('trustcareCases', caseId, {
      status: CaseStatus.HANDOVER_IN_PROGRESS
    });

    trustCareEngine.recordCaseEvent(caseId, {
      type: 'HANDOVER_IN_PROGRESS',
      description: `SBAR clinical handover commenced between EMS and ${doctorName}. Transferring patient monitoring.`,
      role: 'hospital_desk',
      actorName: doctorName,
      newState: CaseStatus.HANDOVER_IN_PROGRESS
    });

    eventBus.emit('HANDOVER_IN_PROGRESS', { caseId, doctorName, startedAt }, { source: 'HandoverEngine', role: 'hospital_desk', entityId: caseId });
    return { success: true };
  }

  /**
   * Complete Confirmed Responsibility Handover!
   * Enforces that ARRIVAL != CONFIRMED HANDOVER.
   */
  confirmHandoverCompletion(caseId, { doctorName = 'Dr. Aarav Sharma (Trauma Lead)', paramedicName = 'Paramedic Squad 7', vitalsOnTransfer = 'BP 110/70, HR 98, SpO2 96%', summary = 'Patient transferred to ICU Bed 1. Trauma resuscitation team assumed full care.' }) {
    const handovers = appState.get().caseHandovers || [];
    const h = handovers.find(item => item.caseId === caseId);
    if (!h) return { success: false, message: 'Handover record not found' };

    const completedAt = new Date().toISOString();

    appState.updateItem('caseHandovers', h.id, {
      status: HandoverStatus.HANDOVER_COMPLETED,
      handoverCompletedAt: completedAt,
      receivingDoctorSignoffBy: doctorName,
      paramedicSignoffBy: paramedicName,
      vitalsOnTransfer,
      summary
    });

    // Update case status to finished
    appState.updateItem('trustcareCases', caseId, {
      status: CaseStatus.HANDOVER_COMPLETED,
      handoverCompletedAt: completedAt
    });

    // Confirm resource hold permanently converts into active admission
    const c = (appState.get().trustcareCases || []).find(item => item.id === caseId);
    if (c && c.bedHoldId) {
      resourceHoldEngine.confirmHold(c.bedHoldId, doctorName);
    }

    trustCareEngine.recordCaseEvent(caseId, {
      type: 'HANDOVER_COMPLETED',
      description: `RESPONSIBILITY HANDOVER CONFIRMED. Clinical authority formally transferred to ${doctorName}. Full emergency pre-arrival timeline closed.`,
      role: 'hospital_desk',
      actorName: doctorName,
      previousState: CaseStatus.HANDOVER_IN_PROGRESS,
      newState: CaseStatus.HANDOVER_COMPLETED,
      metadata: { doctorName, paramedicName, completedAt, vitalsOnTransfer }
    });

    eventBus.emit('HANDOVER_COMPLETED', {
      caseId,
      doctorName,
      paramedicName,
      completedAt
    }, { source: 'HandoverEngine', role: 'hospital_desk', entityId: caseId });

    return { success: true, completedAt };
  }
}

const handoverEngine = new HandoverEngine();
export default handoverEngine;
