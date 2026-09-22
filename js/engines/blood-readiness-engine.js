// ============================================================================
// TRUST CARE — Case-Linked Blood Readiness Engine
// "Stock Available != Resource Arranged For This Specific Emergency"
// ============================================================================

import Config from '../config.js';
import appState from '../state.js';
import eventBus from '../events.js';
import trustCareEngine from './trustcare-engine.js';

export const BloodReadinessState = {
  NOT_REQUIRED: 'NOT_REQUIRED',
  REQUESTED: 'REQUESTED',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  AVAILABILITY_CONFIRMED: 'AVAILABILITY_CONFIRMED',
  RESERVED: 'RESERVED',
  DISPATCH_OR_COLLECTION_PENDING: 'DISPATCH_OR_COLLECTION_PENDING',
  RECEIVED: 'RECEIVED',
  BLOOD_UNAVAILABLE: 'BLOOD_UNAVAILABLE'
};

class BloodReadinessEngine {
  /**
   * Initialize or attach a blood readiness request to an emergency case
   */
  async createCaseBloodRequest({ caseId, hospitalId, bloodGroup = 'O-', unitsRequested = 2, requestedBy = 'Paramedic / Emergency Desk' }) {
    const requestId = `CBR-${caseId}-${bloodGroup.replace('+', 'P').replace('-', 'N')}`;
    const newRequest = {
      id: requestId,
      caseId,
      hospitalId,
      bloodGroup,
      unitsRequested,
      unitsReserved: 0,
      status: BloodReadinessState.REQUESTED,
      requestedBy,
      createdAt: new Date().toISOString(),
      timestamps: {
        requestedAt: new Date().toISOString()
      }
    };

    const requests = appState.get().caseBloodRequests || [];
    const idx = requests.findIndex(r => r.id === requestId);
    if (idx >= 0) {
      requests[idx] = newRequest;
      appState.update({ caseBloodRequests: [...requests] });
    } else {
      appState.addItem('caseBloodRequests', newRequest);
    }

    trustCareEngine.recordCaseEvent(caseId, {
      type: 'BLOOD_REQUESTED',
      description: `Emergency blood requirement logged: ${unitsRequested} units of ${bloodGroup} needed at ${hospitalId} bay.`,
      role: 'hospital_desk',
      actorName: requestedBy,
      newState: BloodReadinessState.REQUESTED,
      metadata: { bloodGroup, unitsRequested }
    });

    eventBus.emit('CASE_BLOOD_REQUESTED', { request: newRequest }, { source: 'BloodReadinessEngine', role: 'hospital_desk', entityId: caseId });
    return newRequest;
  }

  /**
   * Blood Bank Desk acknowledges incoming requirement
   */
  acknowledgeRequest(requestId, acknowledgedBy = 'Blood Bank Officer') {
    const requests = appState.get().caseBloodRequests || [];
    const req = requests.find(r => r.id === requestId);
    if (!req) return { success: false, message: 'Request not found' };

    const ts = req.timestamps || {};
    ts.acknowledgedAt = new Date().toISOString();

    appState.updateItem('caseBloodRequests', req.id, {
      status: BloodReadinessState.ACKNOWLEDGED,
      acknowledgedBy,
      timestamps: ts
    });

    trustCareEngine.updateReadinessItem(req.caseId, 'blood', BloodReadinessState.ACKNOWLEDGED, acknowledgedBy);

    trustCareEngine.recordCaseEvent(req.caseId, {
      type: 'BLOOD_ACKNOWLEDGED',
      description: `Blood bank acknowledged emergency requirement for Case ${req.caseId} (${req.bloodGroup}). Verifying cross-match units.`,
      role: 'blood_bank',
      actorName: acknowledgedBy,
      newState: BloodReadinessState.ACKNOWLEDGED
    });

    eventBus.emit('CASE_BLOOD_ACKNOWLEDGED', { requestId, caseId: req.caseId }, { source: 'BloodReadinessEngine', role: 'blood_bank', entityId: req.caseId });
    return { success: true };
  }

  /**
   * Blood Bank Officer confirms physical inventory availability
   */
  confirmAvailability(requestId, verifiedBy = 'Blood Bank Officer') {
    const requests = appState.get().caseBloodRequests || [];
    const req = requests.find(r => r.id === requestId);
    if (!req) return { success: false, message: 'Request not found' };

    const ts = req.timestamps || {};
    ts.availabilityConfirmedAt = new Date().toISOString();

    appState.updateItem('caseBloodRequests', req.id, {
      status: BloodReadinessState.AVAILABILITY_CONFIRMED,
      timestamps: ts
    });

    trustCareEngine.recordCaseEvent(req.caseId, {
      type: 'BLOOD_AVAILABILITY_CONFIRMED',
      description: `Blood Bank confirmed physical shelf availability of ${req.unitsRequested} units ${req.bloodGroup}. Ready for reservation.`,
      role: 'blood_bank',
      actorName: verifiedBy,
      newState: BloodReadinessState.AVAILABILITY_CONFIRMED
    });

    eventBus.emit('CASE_BLOOD_CONFIRMED', { requestId, caseId: req.caseId }, { source: 'BloodReadinessEngine', role: 'blood_bank', entityId: req.caseId });
    return { success: true };
  }

  /**
   * Reserve units specifically for this case (STOCK AVAILABLE != ARRANGED FOR THIS CASE)
   */
  reserveUnits(requestId, unitsToReserve = 2, reservedBy = 'Blood Bank Officer') {
    const requests = appState.get().caseBloodRequests || [];
    const req = requests.find(r => r.id === requestId);
    if (!req) return { success: false, message: 'Request not found' };

    const ts = req.timestamps || {};
    ts.reservedAt = new Date().toISOString();

    appState.updateItem('caseBloodRequests', req.id, {
      status: BloodReadinessState.RESERVED,
      unitsReserved: unitsToReserve,
      reservedBy,
      timestamps: ts
    });

    // Update overall case readiness
    trustCareEngine.updateReadinessItem(req.caseId, 'blood', BloodReadinessState.RESERVED, reservedBy);

    trustCareEngine.recordCaseEvent(req.caseId, {
      type: 'BLOOD_RESERVED',
      description: `CONFIRMED: ${unitsToReserve} units of ${req.bloodGroup} placed on active reservation for Case ${req.caseId}.`,
      role: 'blood_bank',
      actorName: reservedBy,
      newState: BloodReadinessState.RESERVED,
      metadata: { unitsReserved: unitsToReserve }
    });

    eventBus.emit('CASE_BLOOD_RESERVED', { requestId, caseId: req.caseId, unitsReserved: unitsToReserve }, { source: 'BloodReadinessEngine', role: 'blood_bank', entityId: req.caseId });
    return { success: true };
  }

  /**
   * Blood units handed over/received at trauma resuscitation bay
   */
  markReceivedAtBay(requestId, receivedBy = 'Trauma Resuscitation Team') {
    const requests = appState.get().caseBloodRequests || [];
    const req = requests.find(r => r.id === requestId);
    if (!req) return { success: false, message: 'Request not found' };

    const ts = req.timestamps || {};
    ts.receivedAt = new Date().toISOString();

    appState.updateItem('caseBloodRequests', req.id, {
      status: BloodReadinessState.RECEIVED,
      receivedBy,
      timestamps: ts
    });

    trustCareEngine.recordCaseEvent(req.caseId, {
      type: 'BLOOD_RECEIVED',
      description: `${req.unitsReserved} units of ${req.bloodGroup} received at trauma resuscitation bay by ${receivedBy}. Ready for transfusion.`,
      role: 'hospital_desk',
      actorName: receivedBy,
      newState: BloodReadinessState.RECEIVED
    });

    eventBus.emit('CASE_BLOOD_RECEIVED', { requestId, caseId: req.caseId }, { source: 'BloodReadinessEngine', role: 'hospital_desk', entityId: req.caseId });
    return { success: true };
  }

  /**
   * Failure path: Blood group inventory insufficient
   */
  flagUnavailable(requestId, reason = 'Inventory critically depleted, external transfer requested') {
    const requests = appState.get().caseBloodRequests || [];
    const req = requests.find(r => r.id === requestId);
    if (!req) return { success: false };

    appState.updateItem('caseBloodRequests', req.id, {
      status: BloodReadinessState.BLOOD_UNAVAILABLE,
      unavailabilityReason: reason
    });

    trustCareEngine.recordCaseEvent(req.caseId, {
      type: 'BLOOD_UNAVAILABLE',
      description: `WARNING: Blood requirement unavailable at hospital blood desk. ${reason}.`,
      role: 'blood_bank',
      actorName: 'Blood Bank Officer',
      newState: BloodReadinessState.BLOOD_UNAVAILABLE
    });

    eventBus.emit('CASE_BLOOD_UNAVAILABLE', { requestId, caseId: req.caseId, reason }, { source: 'BloodReadinessEngine', role: 'blood_bank', entityId: req.caseId });
    return { success: true };
  }
}

const bloodReadinessEngine = new BloodReadinessEngine();
export default bloodReadinessEngine;
