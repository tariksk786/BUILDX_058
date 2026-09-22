// ============================================================================
// TRUST CARE — Resource Hold & Concurrency Engine
// Strict Anti-Double-Allocation, Atomic Locks & Expiry Lifecycle
// ============================================================================

import Config from '../config.js';
import appState from '../state.js';
import eventBus from '../events.js';

export const HoldStatus = {
  AVAILABLE: 'AVAILABLE',
  HELD: 'HELD',
  CONFIRMED: 'CONFIRMED',
  RELEASED: 'RELEASED',
  EXPIRED: 'EXPIRED',
  RECONFIRMATION_REQUIRED: 'RECONFIRMATION_REQUIRED'
};

class ResourceHoldEngine {
  constructor() {
    this._expiryCheckTimer = null;
    this._inFlightLocks = new Set();
    this.DEFAULT_HOLD_DURATION_SECONDS = 900; // 15 minutes default operational hold
  }

  init() {
    if (this._expiryCheckTimer) clearInterval(this._expiryCheckTimer);
    this._expiryCheckTimer = setInterval(() => {
      this._evaluateActiveHoldExpirations();
    }, 5000);
  }

  /**
   * Atomically allocate or reserve a resource for an emergency case.
   * STRICT ANTI-DOUBLE-ALLOCATION GUARANTEE:
   * If Resource R is already HELD or CONFIRMED for Case X, Case Y will be REJECTED.
   *
   * @param {Object} params
   * @param {string} params.caseId - Emergency Case ID (e.g. TC-014)
   * @param {string} params.hospitalId - Hospital Facility ID (e.g. HOSP-C)
   * @param {string} params.resourceId - Resource ID (e.g. HOSP-C-ICU-01)
   * @param {string} params.resourceType - Type (e.g. 'ICU', 'Trauma Bay')
   * @param {number} [params.durationSeconds] - Hold duration in seconds
   * @param {string} [params.createdBy] - Staff member or Role allocating hold
   * @returns {Promise<{success: boolean, hold?: Object, error?: string, message?: string, conflictCaseId?: string}>}
   */
  async allocateHold({ caseId, hospitalId, resourceId, resourceType = 'ICU', durationSeconds = 900, createdBy = 'Emergency Desk' }) {
    if (!caseId || !hospitalId || !resourceId) {
      return { success: false, error: 'INVALID_PARAMETERS', message: 'Case ID, Hospital ID, and Resource ID are required.' };
    }

    // 1. In-flight concurrency lock to prevent local microtask race conditions
    if (this._inFlightLocks.has(resourceId)) {
      return {
        success: false,
        error: 'RESOURCE_LOCKED_IN_FLIGHT',
        message: `Resource ${resourceId} allocation is currently processing in another transaction.`
      };
    }
    this._inFlightLocks.add(resourceId);

    try {
      // 2. Check Supabase RPC if connected
      const sbClient = this._getSupabase();
      if (sbClient) {
        try {
          const { data, error } = await sbClient.rpc('allocate_resource_hold', {
            p_case_id: caseId,
            p_hospital_id: hospitalId,
            p_resource_id: resourceId,
            p_hold_seconds: durationSeconds,
            p_created_by: createdBy
          });

          if (!error && data) {
            if (data.success) {
              const holdObj = {
                id: data.hold_id || `HOLD-${Date.now()}`,
                caseId,
                hospitalId,
                resourceId,
                resourceType,
                status: HoldStatus.HELD,
                createdAt: new Date().toISOString(),
                expiresAt: data.expires_at || new Date(Date.now() + durationSeconds * 1000).toISOString(),
                createdBy
              };
              this._recordLocalHold(holdObj);
              return { success: true, hold: holdObj };
            } else {
              return {
                success: false,
                error: data.error || 'ALLOCATION_REJECTED',
                conflictCaseId: data.conflict_case_id,
                message: data.message || `Resource ${resourceId} is already held by case ${data.conflict_case_id}`
              };
            }
          }
        } catch (rpcErr) {
          console.warn('[ResourceHoldEngine] Supabase RPC fallback note:', rpcErr.message);
        }
      }

      // 3. Authoritative Local State Engine (Deterministic Concurrency Check)
      const currentHolds = appState.get().resourceHolds || [];
      const now = new Date().getTime();

      // Find if any active hold exists on this resource
      const existingHold = currentHolds.find(h => 
        h.resourceId === resourceId &&
        (h.status === HoldStatus.HELD || h.status === HoldStatus.CONFIRMED) &&
        new Date(h.expiresAt).getTime() > now
      );

      if (existingHold) {
        if (existingHold.caseId === caseId) {
          const extendedExpiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString();
          existingHold.expiresAt = extendedExpiresAt;
          appState.updateItem('resourceHolds', existingHold.id, { expiresAt: extendedExpiresAt });
          return { success: true, hold: existingHold, refreshed: true };
        } else {
          // CRITICAL CONCURRENCY BLOCK: RESOURCE ALREADY RESERVED FOR ANOTHER CASE!
          const conflictMsg = `Resource ${resourceId} is actively held for case ${existingHold.caseId} until ${new Date(existingHold.expiresAt).toLocaleTimeString()}. Double-allocation prevented.`;
          console.warn(`%c [ANTI-DOUBLE-ALLOCATION] BLOCKED Case ${caseId} from seizing resource ${resourceId} `, 'background: #EF4444; color: white; padding: 2px 8px; font-weight: bold;');
          
          eventBus.emit('RESOURCE_HOLD_REJECTED', {
            caseId,
            resourceId,
            conflictCaseId: existingHold.caseId,
            message: conflictMsg
          }, { source: 'ResourceHoldEngine', role: 'system', entityId: caseId });

          return {
            success: false,
            error: 'RESOURCE_ALREADY_HELD',
            conflictCaseId: existingHold.caseId,
            message: conflictMsg
          };
        }
      }

      // Verify the resource exists and is available
      const hospitalResources = appState.get().hospitalResources || [];
      const targetResource = hospitalResources.find(r => r.id === resourceId);
      if (targetResource && (targetResource.status === 'OCCUPIED' || targetResource.status === 'MAINTENANCE')) {
        return {
          success: false,
          error: 'RESOURCE_UNAVAILABLE',
          message: `Resource ${resourceId} is currently ${targetResource.status} and cannot be reserved.`
        };
      }

      // Create new atomic hold
      const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString();
      const holdId = `HOLD-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      const newHold = {
        id: holdId,
        caseId,
        hospitalId,
        resourceId,
        resourceType,
        status: HoldStatus.HELD,
        createdAt: new Date().toISOString(),
        expiresAt,
        createdBy,
        notes: `Operational hold for emergency ${caseId}`
      };

      this._recordLocalHold(newHold);

      // Persist to Supabase REST asynchronously
      this._persistHoldToSupabase(newHold);

      // Emit domain event
      eventBus.emit('RESOURCE_HELD', {
        hold: newHold,
        caseId,
        resourceId,
        expiresAt
      }, { source: 'ResourceHoldEngine', role: 'hospital_desk', entityId: caseId });

      return { success: true, hold: newHold };
    } finally {
      this._inFlightLocks.delete(resourceId);
    }
  }

  /**
   * Explicitly confirm a held resource
   */
  confirmHold(holdId, confirmedBy = 'Authorized Staff') {
    const holds = appState.get().resourceHolds || [];
    const hold = holds.find(h => h.id === holdId);
    if (!hold) return { success: false, message: 'Hold record not found.' };

    const confirmedAt = new Date().toISOString();
    appState.updateItem('resourceHolds', hold.id, {
      status: HoldStatus.CONFIRMED,
      confirmedAt,
      confirmedBy
    });

    eventBus.emit('RESOURCE_HOLD_CONFIRMED', {
      holdId,
      caseId: hold.caseId,
      resourceId: hold.resourceId,
      confirmedAt
    }, { source: 'ResourceHoldEngine', role: 'hospital_desk', entityId: hold.caseId });

    return { success: true, hold };
  }

  /**
   * Release an active hold (e.g. if ambulance diverted or request cancelled)
   */
  releaseHold(holdId, reason = 'Case cancelled or completed') {
    const holds = appState.get().resourceHolds || [];
    const hold = holds.find(h => h.id === holdId);
    if (!hold) return { success: false, message: 'Hold not found' };

    const releasedAt = new Date().toISOString();
    appState.updateItem('resourceHolds', hold.id, {
      status: HoldStatus.RELEASED,
      releasedAt,
      releaseReason: reason
    });

    const hospitalResources = appState.get().hospitalResources || [];
    const res = hospitalResources.find(r => r.id === hold.resourceId);
    if (res) {
      appState.updateItem('hospitalResources', res.id, {
        status: 'AVAILABLE',
        activeCaseId: null,
        activeHoldId: null,
        lastStatusUpdate: releasedAt
      });
    }

    eventBus.emit('RESOURCE_HOLD_RELEASED', {
      holdId,
      caseId: hold.caseId,
      resourceId: hold.resourceId,
      reason
    }, { source: 'ResourceHoldEngine', role: 'hospital_desk', entityId: hold.caseId });

    return { success: true };
  }

  /**
   * Extend hold time when ambulance ETA is extended
   */
  extendHold(holdId, additionalMinutes = 10) {
    const holds = appState.get().resourceHolds || [];
    const hold = holds.find(h => h.id === holdId);
    if (!hold) return { success: false, message: 'Hold not found' };

    const currentExpiry = new Date(hold.expiresAt).getTime();
    const newExpiry = new Date(currentExpiry + additionalMinutes * 60 * 1000).toISOString();

    appState.updateItem('resourceHolds', hold.id, {
      expiresAt: newExpiry,
      status: HoldStatus.HELD
    });

    eventBus.emit('RESOURCE_HOLD_EXTENDED', {
      holdId,
      caseId: hold.caseId,
      resourceId: hold.resourceId,
      newExpiry
    }, { source: 'ResourceHoldEngine', role: 'hospital_desk', entityId: hold.caseId });

    return { success: true, newExpiry };
  }

  /**
   * Check holds for expiration or upcoming expiry warnings
   */
  _evaluateActiveHoldExpirations() {
    const holds = appState.get().resourceHolds || [];
    const now = new Date().getTime();

    holds.forEach(hold => {
      if (hold.status === HoldStatus.HELD || hold.status === HoldStatus.CONFIRMED) {
        const expiryTime = new Date(hold.expiresAt).getTime();
        const diffMinutes = (expiryTime - now) / 60000;

        if (diffMinutes <= 0) {
          appState.updateItem('resourceHolds', hold.id, { status: HoldStatus.EXPIRED });
          
          const res = (appState.get().hospitalResources || []).find(r => r.id === hold.resourceId);
          if (res) {
            appState.updateItem('hospitalResources', res.id, {
              status: 'AVAILABLE',
              activeCaseId: null,
              activeHoldId: null,
              lastStatusUpdate: new Date().toISOString()
            });
          }

          eventBus.emit('RESOURCE_HOLD_EXPIRED', {
            holdId: hold.id,
            caseId: hold.caseId,
            resourceId: hold.resourceId
          }, { source: 'ResourceHoldEngine', role: 'system', entityId: hold.caseId });
        } else if (diffMinutes <= 3 && hold.status !== HoldStatus.RECONFIRMATION_REQUIRED) {
          appState.updateItem('resourceHolds', hold.id, { status: HoldStatus.RECONFIRMATION_REQUIRED });
          
          eventBus.emit('RESOURCE_HOLD_EXPIRING_SOON', {
            holdId: hold.id,
            caseId: hold.caseId,
            resourceId: hold.resourceId,
            minutesRemaining: Math.max(1, Math.round(diffMinutes))
          }, { source: 'ResourceHoldEngine', role: 'system', entityId: hold.caseId });
        }
      }
    });
  }

  _recordLocalHold(holdObj) {
    const existing = (appState.get().resourceHolds || []).find(h => h.id === holdObj.id);
    if (!existing) {
      appState.addItem('resourceHolds', holdObj);
    } else {
      appState.updateItem('resourceHolds', holdObj.id, holdObj);
    }

    const hospitalResources = appState.get().hospitalResources || [];
    const res = hospitalResources.find(r => r.id === holdObj.resourceId);
    if (res) {
      appState.updateItem('hospitalResources', res.id, {
        status: 'HELD',
        activeCaseId: holdObj.caseId,
        activeHoldId: holdObj.id,
        lastStatusUpdate: new Date().toISOString()
      });
    }
  }

  async _persistHoldToSupabase(hold) {
    if (!Config.SUPABASE_URL || !Config.SUPABASE_ANON_KEY) return;
    try {
      const url = `${Config.SUPABASE_URL}/rest/v1/resource_holds`;
      await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': Config.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${Config.SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify({
          id: hold.id,
          case_id: hold.caseId,
          hospital_id: hold.hospitalId,
          resource_id: hold.resourceId,
          resource_type: hold.resourceType,
          status: hold.status,
          created_at: hold.createdAt,
          expires_at: hold.expiresAt,
          created_by: hold.createdBy,
          notes: hold.notes
        })
      });
    } catch (e) {
      // Non-blocking catch
    }
  }

  _getSupabase() {
    if (window.supabase && Config.SUPABASE_URL && Config.SUPABASE_ANON_KEY) {
      try {
        return window.supabase.createClient(Config.SUPABASE_URL, Config.SUPABASE_ANON_KEY);
      } catch (e) {
        return null;
      }
    }
    return null;
  }
}

const resourceHoldEngine = new ResourceHoldEngine();
export default resourceHoldEngine;
