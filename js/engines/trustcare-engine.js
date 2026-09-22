// ============================================================================
// TRUST CARE — Core Operational State Machine & Hospital Matching Engine
// "Right Hospital. Confirmed Resources. Ready Before Arrival."
// ============================================================================

import Config from '../config.js';
import appState from '../state.js';
import eventBus from '../events.js';
import Auth from '../auth.js';
import resourceHoldEngine, { HoldStatus } from './resource-hold-engine.js';
import { generateId } from '../utils.js';

export const CaseStatus = {
  CASE_CREATED: 'CASE_CREATED',
  HOSPITAL_SEARCH: 'HOSPITAL_SEARCH',
  REQUEST_SENT: 'REQUEST_SENT',
  HOSPITAL_ACCEPTED: 'HOSPITAL_ACCEPTED',
  EN_ROUTE: 'EN_ROUTE',
  NEAR_HOSPITAL: 'NEAR_HOSPITAL',
  ARRIVED: 'ARRIVED',
  HANDOVER_IN_PROGRESS: 'HANDOVER_IN_PROGRESS',
  HANDOVER_COMPLETED: 'HANDOVER_COMPLETED',
  // Failure / Re-routing States
  REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
  REQUEST_DECLINED: 'REQUEST_DECLINED',
  ACCEPTANCE_WITHDRAWN: 'ACCEPTANCE_WITHDRAWN',
  RESOURCE_UNAVAILABLE: 'RESOURCE_UNAVAILABLE'
};

export const ReadinessLevel = {
  READY: 'READY',
  PARTIALLY_READY: 'PARTIALLY_READY',
  NOT_READY: 'NOT_READY',
  RECONFIRMATION_REQUIRED: 'RECONFIRMATION_REQUIRED'
};

class TrustCareEngine {
  constructor() {
    this._activeTimers = new Map();
    this.DEFAULT_REQUEST_TIMEOUT_SECONDS = 60; // 60s timeout for demo responsiveness
  }

  init() {
    this._ensureInitialHospitalsAndResources();
  }

  /**
   * Module 1: Create a verified emergency case entered by authorized paramedic/dispatcher
   */
  async createCase({
    caseId = 'TC-014',
    emergencyCategory = 'Severe Polytrauma & Crush Injury',
    patientIdentifier = 'Adult Male (Approx 35y)',
    paramedicNotes = 'High-velocity road collision. GCS 9, blunt chest trauma, unstable vitals.',
    location = { name: 'Western Express Highway, Flyover 4B', lat: 19.0760, lng: 72.8777 },
    ambulanceId = 'AMB-108',
    requiredCapabilities = ['ICU', 'Trauma', 'Blood Readiness'],
    requiredBedType = 'ICU',
    requiredSpecialist = 'Trauma Surgeon',
    requiresBlood = true,
    createdBy = 'Paramedic Squad 7',
    isBootstrap = false
  }) {
    // Role Authorization Check
    const currentUser = appState.get().currentUser;
    if (!isBootstrap && currentUser && !Auth.can('create_emergency_case', currentUser)) {
      Auth.assertCan('create_emergency_case', currentUser);
    }
    const existing = (appState.get().trustcareCases || []).find(c => c.id === caseId);
    if (existing) {
      return existing;
    }

    const newCase = {
      id: caseId,
      caseNumber: caseId,
      emergencyCategory,
      patientIdentifier,
      paramedicNotes,
      location,
      ambulanceId,
      requiredCapabilities,
      requiredBedType,
      requiredSpecialist,
      requiresBlood,
      bloodGroupNeeded,
      bloodUnitsNeeded,
      status: CaseStatus.CASE_CREATED,
      selectedHospitalId: null,
      ambulanceStatus: 'DISPATCHED',
      etaMinutes: 10,
      readinessState: ReadinessLevel.NOT_READY,
      receivingTeamStatus: 'PENDING',
      bloodStatus: requiresBlood ? 'REQUESTED' : 'NOT_REQUIRED',
      emergencyBayStatus: 'PENDING',
      bedHoldId: null,
      createdBy,
      createdAt: new Date().toISOString(),
      timeline: []
    };

    // Add to appState
    appState.addItem('trustcareCases', newCase);

    // Record initial case event
    this.recordCaseEvent(caseId, {
      type: 'CASE_CREATED',
      description: `Emergency Case ${caseId} logged (${emergencyCategory}) requiring ${requiredBedType} & ${bloodUnitsNeeded} units ${bloodGroupNeeded}`,
      role: 'dispatcher',
      actorName: createdBy,
      newState: CaseStatus.CASE_CREATED
    });

    eventBus.emit('TRUSTCARE_CASE_CREATED', { caseObj: newCase }, { source: 'TrustCareEngine', role: 'dispatcher', entityId: caseId });
    this._persistCase(newCase);
    return newCase;
  }

  /**
   * Module 2 & 3: Case-Specific Explainable Hospital Matching Matrix
   * Core principle: NEAREST != RIGHT HOSPITAL. AVAILABLE != CONFIRMED.
   */
  matchHospitalsForCase(caseId) {
    const cases = appState.get().trustcareCases || [];
    const targetCase = cases.find(c => c.id === caseId) || cases[0];
    if (!targetCase) return [];

    const facilities = appState.get().facilities || [];
    const resources = appState.get().hospitalResources || [];
    const holds = appState.get().resourceHolds || [];
    const now = Date.now();

    const candidateHospitals = [
      {
        id: 'HOSP-A',
        name: 'City Trauma Care (Hospital A)',
        distanceKm: 1.8,
        driveTimeMinutes: 5,
        reportedIcuCapacity: 10,
        availableIcu: 0,
        hasTraumaTeam: true,
        bloodBankOnSite: false,
        lastDataUpdateMinutesAgo: 3,
        freshnessState: 'FRESH'
      },
      {
        id: 'HOSP-B',
        name: 'Apex Medical Center (Hospital B)',
        distanceKm: 2.9,
        driveTimeMinutes: 7,
        reportedIcuCapacity: 8,
        availableIcu: 2,
        hasTraumaTeam: true,
        bloodBankOnSite: true,
        lastDataUpdateMinutesAgo: 48,
        freshnessState: 'STALE'
      },
      {
        id: 'HOSP-C',
        name: 'Metro General Hospital (Hospital C)',
        distanceKm: 4.2,
        driveTimeMinutes: 9,
        reportedIcuCapacity: 6,
        availableIcu: 1, // Exactly 1 available ICU bed
        hasTraumaTeam: true,
        bloodBankOnSite: true,
        lastDataUpdateMinutesAgo: 2,
        freshnessState: 'FRESH'
      }
    ];

    // Compute live available count accounting for active holds
    return candidateHospitals.map(h => {
      // Find hospital resources
      const hospRes = resources.filter(r => r.hospitalId === h.id && r.resourceType === targetCase.requiredBedType);
      const activeHospHolds = holds.filter(hold => 
        hold.hospitalId === h.id && 
        (hold.status === HoldStatus.HELD || hold.status === HoldStatus.CONFIRMED) &&
        new Date(hold.expiresAt).getTime() > now
      );

      // If hospital C has 1 total ICU and 1 active hold, real availability is 0!
      let liveAvailableBeds = h.availableIcu;
      if (h.id === 'HOSP-C') {
        const heldICUs = activeHospHolds.filter(hd => hd.resourceType === 'ICU');
        liveAvailableBeds = Math.max(0, 1 - heldICUs.length);
      }

      // Evaluation criteria
      const hasRequiredBed = liveAvailableBeds > 0;
      const isDataFresh = h.lastDataUpdateMinutesAgo <= 15;
      const isDataStale = h.lastDataUpdateMinutesAgo > 30;

      let suitabilityState = 'SUITABLE';
      let statusBadge = 'badge-success';
      let explanation = '';

      if (h.id === 'HOSP-A') {
        // Nearest but 0 ICU beds available
        suitabilityState = 'UNSUITABLE';
        statusBadge = 'badge-danger';
        explanation = 'Nearest facility (1.8 km), but ICU capacity is fully saturated (0 beds available). Diverting is medically safer than risking arrival to a full ICU.';
      } else if (h.id === 'HOSP-B') {
        // Closer but data is stale (>45 mins ago)
        suitabilityState = 'RECONFIRMATION REQUIRED';
        statusBadge = 'badge-warning';
        explanation = 'ICU reported available, but last verified 48 minutes ago (STALE). Clinical confirmation required from receiving desk before dispatch.';
      } else if (h.id === 'HOSP-C') {
        if (liveAvailableBeds > 0) {
          suitabilityState = 'SUITABLE';
          statusBadge = 'badge-success';
          explanation = 'Verified 1 ICU bed available, trauma team on active duty, on-site blood bank reachable, data verified 2 minutes ago (FRESH). Highly recommended candidate.';
        } else {
          // If already held (e.g. by TC-014)!
          suitabilityState = 'UNSUITABLE';
          statusBadge = 'badge-danger';
          explanation = 'All ICU resources actively reserved by ongoing emergency cases. Double allocation strictly prevented.';
        }
      }

      // Matrix dimensions
      const matrix = {
        emergencyReceiving: h.id === 'HOSP-A' ? 'DIVERSION_RISK' : 'ACTIVE',
        requiredBed: hasRequiredBed ? 'AVAILABLE' : 'UNAVAILABLE',
        availableCount: liveAvailableBeds,
        specialistTeam: h.hasTraumaTeam ? 'ON_DUTY' : 'CALL_OUT_REQUIRED',
        bloodReadiness: h.bloodBankOnSite ? 'ON_SITE_AVAILABLE' : 'EXTERNAL_TRANSFER',
        dataFreshness: isDataFresh ? `${h.lastDataUpdateMinutesAgo}m ago (FRESH)` : `${h.lastDataUpdateMinutesAgo}m ago (STALE)`,
        freshnessCategory: isDataFresh ? 'FRESH' : 'STALE'
      };

      return {
        ...h,
        liveAvailableBeds,
        suitabilityState,
        statusBadge,
        explanation,
        matrix
      };
    });
  }  /**
   * Module 4: Send hospital request from Dispatcher
   */
  async sendHospitalRequest(caseId, hospitalId) {
    const currentUser = appState.get().currentUser;
    if (currentUser && !Auth.can('send_hospital_request', currentUser)) {
      Auth.assertCan('send_hospital_request', currentUser);
    }

    const cases = appState.get().trustcareCases || [];
    const c = cases.find(item => item.id === caseId);
    if (!c) return { success: false, message: 'Case not found' };

    const requestId = `REQ-${Date.now().toString().slice(-6)}`;
    const requestObj = {
      id: requestId,
      caseId,
      hospitalId,
      status: 'REQUEST_SENT',
      requestSentAt: new Date().toISOString(),
      timeoutAt: new Date(Date.now() + this.DEFAULT_REQUEST_TIMEOUT_SECONDS * 1000).toISOString()
    };

    appState.addItem('hospitalRequests', requestObj);
    appState.updateItem('trustcareCases', c.id, {
      selectedHospitalId: hospitalId,
      status: CaseStatus.REQUEST_SENT,
      currentRequestId: requestId
    });

    this.recordCaseEvent(caseId, {
      type: 'REQUEST_SENT',
      description: `Emergency request transmitted to ${hospitalId}. Awaiting receiving desk decision.`,
      role: 'dispatcher',
      actorName: 'Ambulance Dispatcher',
      previousState: c.status,
      newState: CaseStatus.REQUEST_SENT,
      metadata: { hospitalId, requestId }
    });

    // Auto-timeout watchdog
    if (this._activeTimers.has(requestId)) clearTimeout(this._activeTimers.get(requestId));
    const timer = setTimeout(() => {
      this._handleRequestTimeout(caseId, requestId, hospitalId);
    }, this.DEFAULT_REQUEST_TIMEOUT_SECONDS * 1000);
    this._activeTimers.set(requestId, timer);

    eventBus.emit('HOSPITAL_REQUEST_SENT', { caseId, hospitalId, requestId }, { source: 'TrustCareEngine', role: 'dispatcher', entityId: caseId });
    return { success: true, requestId };
  }

  /**
   * Module 4 & 5: Hospital Emergency Desk accepts incoming case
   */
  async acceptCase(caseId, hospitalId, acceptedBy = 'Emergency Desk Staff') {
    const currentUser = appState.get().currentUser;
    if (currentUser && !Auth.can('accept_hospital_request', currentUser)) {
      Auth.assertCan('accept_hospital_request', currentUser);
    }

    const cases = appState.get().trustcareCases || [];
    const c = cases.find(item => item.id === caseId);
    if (!c) return { success: false, message: 'Case not found' };

    // Clear timeout timer
    if (c.currentRequestId && this._activeTimers.has(c.currentRequestId)) {
      clearTimeout(this._activeTimers.get(c.currentRequestId));
      this._activeTimers.delete(c.currentRequestId);
    }

    // 1. Update Request Record
    const requests = appState.get().hospitalRequests || [];
    const req = requests.find(r => r.caseId === caseId && r.hospitalId === hospitalId && r.status === 'REQUEST_SENT');
    if (req) {
      appState.updateItem('hospitalRequests', req.id, {
        status: 'ACCEPTED',
        respondedAt: new Date().toISOString()
      });
    }

    // 2. ATOMIC RESOURCE HOLD: Place operational hold on the required bed!
    let targetResourceId = `${hospitalId}-ICU-01`;
    const holdResult = await resourceHoldEngine.allocateHold({
      caseId,
      hospitalId,
      resourceId: targetResourceId,
      resourceType: c.requiredBedType || 'ICU',
      durationSeconds: 900,
      createdBy: acceptedBy
    });

    if (!holdResult.success) {
      console.error('[TrustCareEngine] Hold allocation failed upon acceptance:', holdResult.message);
      // If resource was already seized by another case, transition to RESOURCE_UNAVAILABLE!
      appState.updateItem('trustcareCases', c.id, {
        status: CaseStatus.RESOURCE_UNAVAILABLE,
        failureReason: holdResult.message
      });
      this.recordCaseEvent(caseId, {
        type: 'RESOURCE_UNAVAILABLE',
        description: `Hospital accepted, but atomic hold failed: ${holdResult.message}`,
        role: 'hospital_desk',
        actorName: acceptedBy,
        newState: CaseStatus.RESOURCE_UNAVAILABLE
      });
      return { success: false, error: holdResult.error, message: holdResult.message };
    }

    // 3. Update Case State
    appState.updateItem('trustcareCases', c.id, {
      status: CaseStatus.HOSPITAL_ACCEPTED,
      selectedHospitalId: hospitalId,
      bedHoldId: holdResult.hold.id,
      emergencyBayStatus: 'READY',
      readinessState: ReadinessLevel.PARTIALLY_READY // Acceptance != complete readiness! Individual readiness items pending
    });

    this.recordCaseEvent(caseId, {
      type: 'HOSPITAL_ACCEPTED',
      description: `${hospitalId} ACCEPTED emergency case. ${targetResourceId} placed on 15-min operational hold.`,
      role: 'hospital_desk',
      actorName: acceptedBy,
      previousState: CaseStatus.REQUEST_SENT,
      newState: CaseStatus.HOSPITAL_ACCEPTED,
      metadata: { hospitalId, holdId: holdResult.hold.id, resourceId: targetResourceId }
    });

    eventBus.emit('HOSPITAL_ACCEPTED', {
      caseId,
      hospitalId,
      holdId: holdResult.hold.id,
      resourceId: targetResourceId
    }, { source: 'TrustCareEngine', role: 'hospital_desk', entityId: caseId });

    return { success: true, hold: holdResult.hold };
  }

  /**
   * Hospital Declines Request
   */
  declineCase(caseId, hospitalId, reason = 'ICU capacity unavailable', declinedBy = 'Emergency Desk') {
    const currentUser = appState.get().currentUser;
    if (currentUser && !Auth.can('decline_hospital_request', currentUser)) {
      Auth.assertCan('decline_hospital_request', currentUser);
    }

    const cases = appState.get().trustcareCases || [];
    const c = cases.find(item => item.id === caseId);
    if (!c) return { success: false, message: 'Case not found' };

    // Update request
    const requests = appState.get().hospitalRequests || [];
    const req = requests.find(r => r.caseId === caseId && r.hospitalId === hospitalId);
    if (req) {
      appState.updateItem('hospitalRequests', req.id, {
        status: 'DECLINED',
        declineReason: reason,
        respondedAt: new Date().toISOString()
      });
    }

    appState.updateItem('trustcareCases', c.id, {
      status: CaseStatus.REQUEST_DECLINED,
      declineReason: reason
    });

    this.recordCaseEvent(caseId, {
      type: 'REQUEST_DECLINED',
      description: `${hospitalId} DECLINED emergency request. Reason: ${reason}. Alternative facility required.`,
      role: 'hospital_desk',
      actorName: declinedBy,
      previousState: c.status,
      newState: CaseStatus.REQUEST_DECLINED,
      metadata: { reason, hospitalId }
    });

    eventBus.emit('HOSPITAL_DECLINED', { caseId, hospitalId, reason }, { source: 'TrustCareEngine', role: 'hospital_desk', entityId: caseId });
    return { success: true };
  }

  /**
   * Hospital Withdraws Acceptance (Failure Recovery Path)
   */
  withdrawAcceptance(caseId, hospitalId, reason = 'Mass casualty surge in emergency room') {
    const currentUser = appState.get().currentUser;
    if (currentUser && !Auth.can('withdraw_hospital_acceptance', currentUser)) {
      Auth.assertCan('withdraw_hospital_acceptance', currentUser);
    }

    const cases = appState.get().trustcareCases || [];
    const c = cases.find(item => item.id === caseId);
    if (!c) return { success: false, message: 'Case not found' };

    // Release any holds
    if (c.bedHoldId) {
      resourceHoldEngine.releaseHold(c.bedHoldId, `Acceptance withdrawn: ${reason}`);
    }

    appState.updateItem('trustcareCases', c.id, {
      status: CaseStatus.ACCEPTANCE_WITHDRAWN,
      readinessState: ReadinessLevel.NOT_READY,
      withdrawalReason: reason
    });

    this.recordCaseEvent(caseId, {
      type: 'ACCEPTANCE_WITHDRAWN',
      description: `URGENT ALERT: ${hospitalId} WITHDREW acceptance due to: ${reason}. Rerouting required!`,
      role: 'hospital_desk',
      actorName: 'Emergency Coordinator',
      previousState: c.status,
      newState: CaseStatus.ACCEPTANCE_WITHDRAWN,
      metadata: { reason, hospitalId }
    });

    eventBus.emit('ACCEPTANCE_WITHDRAWN', { caseId, hospitalId, reason }, { source: 'TrustCareEngine', role: 'hospital_desk', entityId: caseId });
    return { success: true };
  }

  /**
   * Update Pre-Arrival Readiness Checklist Item
   */
  updateReadinessItem(caseId, itemKey, status, updatedBy = 'Hospital Staff') {
    const cases = appState.get().trustcareCases || [];
    const c = cases.find(item => item.id === caseId);
    if (!c) return { success: false };

    const updates = {};
    if (itemKey === 'receivingTeam') updates.receivingTeamStatus = status;
    if (itemKey === 'blood') updates.bloodStatus = status;
    if (itemKey === 'bay') updates.emergencyBayStatus = status;

    // Recalculate overall readiness
    const receivingTeamOk = (updates.receivingTeamStatus || c.receivingTeamStatus) === 'ACKNOWLEDGED';
    const bloodOk = !c.requiresBlood || (updates.bloodStatus || c.bloodStatus) === 'RESERVED' || (updates.bloodStatus || c.bloodStatus) === 'RECEIVED';
    const bayOk = (updates.emergencyBayStatus || c.emergencyBayStatus) === 'READY';

    if (receivingTeamOk && bloodOk && bayOk) {
      updates.readinessState = ReadinessLevel.READY;
    } else {
      updates.readinessState = ReadinessLevel.PARTIALLY_READY;
    }

    appState.updateItem('trustcareCases', c.id, updates);

    this.recordCaseEvent(caseId, {
      type: 'READINESS_UPDATED',
      description: `Pre-arrival checklist [${itemKey}] set to ${status}. Overall readiness: ${updates.readinessState}`,
      role: 'hospital_desk',
      actorName: updatedBy,
      newState: updates.readinessState,
      metadata: { itemKey, status }
    });

    eventBus.emit('READINESS_UPDATED', { caseId, itemKey, status, readinessState: updates.readinessState }, { source: 'TrustCareEngine', role: 'hospital_desk', entityId: caseId });
    return { success: true, readinessState: updates.readinessState };
  }

  /**
   * Ambulance updates transit ETA or flags arrival
   */
  updateTransitStatus(caseId, status, etaMinutes) {
    const currentUser = appState.get().currentUser;
    if (currentUser && !Auth.can('update_ambulance_status', currentUser)) {
      Auth.assertCan('update_ambulance_status', currentUser);
    }

    const cases = appState.get().trustcareCases || [];
    const c = cases.find(item => item.id === caseId);
    if (!c) return { success: false };

    const updates = {};
    if (status) updates.ambulanceStatus = status;
    if (etaMinutes !== undefined) updates.etaMinutes = etaMinutes;

    if (status === 'ARRIVED') {
      updates.status = CaseStatus.ARRIVED;
    } else if (status === 'EN_ROUTE') {
      updates.status = CaseStatus.EN_ROUTE;
    }

    appState.updateItem('trustcareCases', c.id, updates);

    this.recordCaseEvent(caseId, {
      type: status === 'ARRIVED' ? 'PATIENT_ARRIVED' : 'ETA_UPDATED',
      description: status === 'ARRIVED' ? `Ambulance ${c.ambulanceId} arrived at hospital bay. Transport complete.` : `Ambulance en route. ETA updated to ${etaMinutes} minutes.`,
      role: 'dispatcher',
      actorName: 'Paramedic Crew',
      newState: updates.status || c.status,
      metadata: { status, etaMinutes }
    });

    eventBus.emit('AMBULANCE_STATUS_UPDATED', { caseId, status, etaMinutes }, { source: 'TrustCareEngine', role: 'dispatcher', entityId: caseId });
    return { success: true };
  }

  /**
   * Handle Request Timeout
   */
  _handleRequestTimeout(caseId, requestId, hospitalId) {
    const requests = appState.get().hospitalRequests || [];
    const req = requests.find(r => r.id === requestId);
    if (req && req.status === 'REQUEST_SENT') {
      appState.updateItem('hospitalRequests', req.id, { status: 'TIMEOUT' });
      appState.updateItem('trustcareCases', caseId, { status: CaseStatus.REQUEST_TIMEOUT });

      this.recordCaseEvent(caseId, {
        type: 'REQUEST_TIMEOUT',
        description: `Request to ${hospitalId} timed out after ${this.DEFAULT_REQUEST_TIMEOUT_SECONDS}s. Dispatcher prompted to re-route.`,
        role: 'system',
        actorName: 'Watchdog System',
        newState: CaseStatus.REQUEST_TIMEOUT
      });

      eventBus.emit('HOSPITAL_REQUEST_TIMEOUT', { caseId, hospitalId, requestId }, { source: 'TrustCareEngine', role: 'system', entityId: caseId });
    }
  }

  /**
   * Append audit timeline event
   */
  recordCaseEvent(caseId, { type, description, role = 'system', actorName = 'System', previousState = null, newState = null, metadata = {} }) {
    const eventObj = {
      id: `EVT-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      caseId,
      type,
      description,
      role,
      actorName,
      previousState,
      newState,
      metadata,
      timestamp: new Date().toISOString()
    };

    const cases = appState.get().trustcareCases || [];
    const c = cases.find(item => item.id === caseId);
    if (c) {
      const timeline = c.timeline || [];
      timeline.push(eventObj);
      appState.updateItem('trustcareCases', c.id, { timeline: [...timeline] });
    }

    // Persist to Supabase case_events asynchronously
    this._persistCaseEvent(eventObj);
    return eventObj;
  }

  _ensureInitialHospitalsAndResources() {
    const existing = appState.get().hospitalResources || [];
    if (existing.length === 0) {
      const initialResources = [
        { id: 'HOSP-A-ICU-01', hospitalId: 'HOSP-A', resourceType: 'ICU', resourceCode: 'ICU-Bed-01', status: 'OCCUPIED', lastStatusUpdate: new Date(Date.now() - 4 * 60000).toISOString(), freshnessState: 'FRESH' },
        { id: 'HOSP-B-ICU-01', hospitalId: 'HOSP-B', resourceType: 'ICU', resourceCode: 'ICU-Bed-01', status: 'AVAILABLE', lastStatusUpdate: new Date(Date.now() - 48 * 60000).toISOString(), freshnessState: 'STALE' },
        { id: 'HOSP-C-ICU-01', hospitalId: 'HOSP-C', resourceType: 'ICU', resourceCode: 'ICU-01', status: 'AVAILABLE', lastStatusUpdate: new Date(Date.now() - 2 * 60000).toISOString(), freshnessState: 'FRESH' }
      ];
      appState.update({ hospitalResources: initialResources });
    }
  }

  async _persistCase(caseObj) {
    if (!Config.SUPABASE_URL || !Config.SUPABASE_ANON_KEY) return;
    try {
      const url = `${Config.SUPABASE_URL}/rest/v1/trustcare_cases`;
      await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': Config.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${Config.SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify({
          id: caseObj.id,
          case_number: caseObj.caseNumber,
          emergency_category: caseObj.emergencyCategory,
          patient_identifier: caseObj.patientIdentifier,
          paramedic_notes: caseObj.paramedicNotes,
          ambulance_id: caseObj.ambulanceId,
          required_bed_type: caseObj.requiredBedType,
          required_specialist: caseObj.requiredSpecialist,
          requires_blood: caseObj.requiresBlood,
          blood_group_needed: caseObj.bloodGroupNeeded,
          blood_units_needed: caseObj.bloodUnitsNeeded,
          status: caseObj.status,
          ambulance_status: caseObj.ambulanceStatus,
          eta_minutes: caseObj.etaMinutes,
          readiness_state: caseObj.readinessState,
          created_by: caseObj.createdBy,
          created_at: caseObj.createdAt
        })
      });
    } catch (e) {}
  }

  async _persistCaseEvent(evt) {
    if (!Config.SUPABASE_URL || !Config.SUPABASE_ANON_KEY) return;
    try {
      const url = `${Config.SUPABASE_URL}/rest/v1/case_events`;
      await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': Config.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${Config.SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: evt.id,
          case_id: evt.caseId,
          event_type: evt.type,
          event_description: evt.description,
          role: evt.role,
          actor_name: evt.actorName,
          previous_state: evt.previousState,
          new_state: evt.newState,
          metadata: evt.metadata,
          created_at: evt.timestamp
        })
      });
    } catch (e) {}
  }
}

const trustCareEngine = new TrustCareEngine();
export default trustCareEngine;
