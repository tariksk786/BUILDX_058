// ============================================================================
// TRUST CARE — Case-Linked Blood Bank Desk Portal
// "Stock Available != Resource Arranged For This Specific Emergency"
// ============================================================================

import appState from '../state.js';
import eventBus from '../events.js';
import bloodReadinessEngine, { BloodReadinessState } from '../engines/blood-readiness-engine.js';
import { renderTrustCareNavbar } from '../components/trustcare-nav.js';

export function renderBloodBankPortal(container) {
  let unsubscribeState = null;

  function render() {
    const cases = appState.get().trustcareCases || [];
    const activeCase = cases.find(c => c.id === 'TC-014') || cases[0];
    const bloodRequests = appState.get().caseBloodRequests || [];
    const targetRequest = bloodRequests.find(r => r.caseId === activeCase?.id) || bloodRequests[0];
    const inventory = appState.get().bloodInventory || [];

    const reqStatus = targetRequest ? targetRequest.status : (activeCase?.bloodStatus || 'REQUESTED');

    container.innerHTML = `
      ${renderTrustCareNavbar('/blood-bank')}

      <div class="tc-page-container">
        <!-- Page Header -->
        <div class="tc-page-header">
          <div>
            <h1 class="tc-page-title">
              <i class="fas fa-droplet text-danger"></i>
              Case-Linked Emergency Blood Readiness Console
            </h1>
            <p class="tc-page-subtitle">
              Module 9: Explicit Emergency Blood Coordination — "Stock Available ≠ Resource Arranged"
            </p>
          </div>
          <div>
            <span class="badge ${reqStatus === 'RESERVED' || reqStatus === 'RECEIVED' ? 'badge-success' : 'badge-warning'}" style="font-size:0.85rem; padding:0.4rem 0.75rem;">
              Case ${activeCase?.id || 'TC-014'}: ${reqStatus}
            </span>
          </div>
        </div>

        <!-- Case Blood Requirement Card -->
        <div style="background:#FFFFFF; border:1px solid #E2E8F0; border-left:5px solid #EF4444; border-radius:12px; padding:1.25rem 1.5rem; margin-bottom:1.5rem; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
            <div>
              <div style="font-size:0.8rem; font-weight:700; color:#EF4444; text-transform:uppercase;">
                Active Emergency Blood Requisition
              </div>
              <h2 style="font-size:1.35rem; font-weight:800; color:#0F172A; margin:3px 0 0 0;">
                ${activeCase?.bloodUnitsNeeded || 2} Units of Blood Group <span style="color:#DC2626; text-decoration:underline;">${activeCase?.bloodGroupNeeded || 'O-'}</span>
              </h2>
              <div style="font-size:0.85rem; color:#475569; margin-top:4px;">
                For Case <strong>${activeCase?.id || 'TC-014'}</strong> (${activeCase?.emergencyCategory || 'Polytrauma'}) |
                Target: <strong>Metro General — Resuscitation Bay 1</strong>
              </div>
            </div>

            <div style="text-align:right;">
              <div style="font-size:0.75rem; color:#64748B; font-weight:700; text-transform:uppercase;">Readiness Stage</div>
              <div style="font-size:1.15rem; font-weight:800; color:${reqStatus === 'RESERVED' ? '#15803D' : '#D97706'};">
                ${reqStatus}
              </div>
            </div>
          </div>
        </div>

        <!-- 4-Step Interactive Action Rail -->
        <div style="background:#FFFFFF; border:1px solid #CBD5E1; border-radius:12px; padding:1.5rem; margin-bottom:2rem; box-shadow:0 2px 8px rgba(0,0,0,0.05);">
          <h3 style="font-size:1.1rem; font-weight:800; color:#0F172A; margin:0 0 1.25rem 0;">
            Preparation & Handover Sequence
          </h3>

          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:1rem;">
            <!-- Step 1: Acknowledge -->
            <div style="border:1px solid #E2E8F0; border-radius:8px; padding:1rem; background:${reqStatus !== 'REQUESTED' ? '#F0FDF4' : '#FFFFFF'};">
              <div style="font-size:0.75rem; font-weight:700; color:#64748B; text-transform:uppercase;">Step 1</div>
              <div style="font-weight:700; font-size:0.95rem; color:#0F172A; margin:2px 0 0.5rem 0;">
                Acknowledge Requisition
              </div>
              <p style="font-size:0.78rem; color:#64748B; margin-bottom:1rem;">
                Confirm blood bank desk has received emergency requisition for Case ${activeCase?.id}.
              </p>
              ${reqStatus === 'REQUESTED' ? `
                <button class="btn btn-sm btn-primary btn-block" style="width:100%;" onclick="window.TrustCare.acknowledgeBlood('${targetRequest?.id || `CBR-${activeCase?.id}-ON`}')">
                  <i class="fas fa-check"></i> Acknowledge
                </button>
              ` : `
                <span class="badge badge-success" style="width:100%; text-align:center; display:block; padding:0.4rem;">
                  <i class="fas fa-check-circle"></i> Acknowledged
                </span>
              `}
            </div>

            <!-- Step 2: Confirm Physical Availability -->
            <div style="border:1px solid #E2E8F0; border-radius:8px; padding:1rem; background:${reqStatus === 'AVAILABILITY_CONFIRMED' || reqStatus === 'RESERVED' || reqStatus === 'RECEIVED' ? '#F0FDF4' : '#FFFFFF'};">
              <div style="font-size:0.75rem; font-weight:700; color:#64748B; text-transform:uppercase;">Step 2</div>
              <div style="font-weight:700; font-size:0.95rem; color:#0F172A; margin:2px 0 0.5rem 0;">
                Confirm Physical Shelf Stock
              </div>
              <p style="font-size:0.78rem; color:#64748B; margin-bottom:1rem;">
                Physical technician verifies ${activeCase?.bloodUnitsNeeded || 2} units of ${activeCase?.bloodGroupNeeded || 'O-'} on shelf.
              </p>
              ${reqStatus === 'ACKNOWLEDGED' ? `
                <button class="btn btn-sm btn-primary btn-block" style="width:100%;" onclick="window.TrustCare.confirmBloodAvailability('${targetRequest?.id || `CBR-${activeCase?.id}-ON`}')">
                  <i class="fas fa-vial-circle-check"></i> Confirm Stock
                </button>
              ` : reqStatus === 'AVAILABILITY_CONFIRMED' || reqStatus === 'RESERVED' || reqStatus === 'RECEIVED' ? `
                <span class="badge badge-success" style="width:100%; text-align:center; display:block; padding:0.4rem;">
                  <i class="fas fa-check-circle"></i> Verified on Shelf
                </span>
              ` : `
                <span class="badge badge-secondary" style="width:100%; text-align:center; display:block; padding:0.4rem;">Pending Step 1</span>
              `}
            </div>

            <!-- Step 3: Reserve & Tag for Case -->
            <div style="border:1px solid #E2E8F0; border-radius:8px; padding:1rem; background:${reqStatus === 'RESERVED' || reqStatus === 'RECEIVED' ? '#F0FDF4' : '#FFFFFF'};">
              <div style="font-size:0.75rem; font-weight:700; color:#64748B; text-transform:uppercase;">Step 3</div>
              <div style="font-weight:700; font-size:0.95rem; color:#0F172A; margin:2px 0 0.5rem 0;">
                Reserve & Tag for Case
              </div>
              <p style="font-size:0.78rem; color:#64748B; margin-bottom:1rem;">
                Units tagged with Case ${activeCase?.id} barcode and locked from general hospital use.
              </p>
              ${reqStatus === 'AVAILABILITY_CONFIRMED' ? `
                <button class="btn btn-sm btn-success btn-block" style="width:100%; font-weight:700;" onclick="window.TrustCare.reserveBloodUnits('${targetRequest?.id || `CBR-${activeCase?.id}-ON`}')">
                  <i class="fas fa-box-archive"></i> Reserve & Tag Units
                </button>
              ` : reqStatus === 'RESERVED' || reqStatus === 'RECEIVED' ? `
                <span class="badge badge-success" style="width:100%; text-align:center; display:block; padding:0.4rem;">
                  <i class="fas fa-check-double"></i> Reserved for ${activeCase?.id}
                </span>
              ` : `
                <span class="badge badge-secondary" style="width:100%; text-align:center; display:block; padding:0.4rem;">Pending Step 2</span>
              `}
            </div>

            <!-- Step 4: Bay Dispatch / Delivery -->
            <div style="border:1px solid #E2E8F0; border-radius:8px; padding:1rem; background:${reqStatus === 'RECEIVED' ? '#F0FDF4' : '#FFFFFF'};">
              <div style="font-size:0.75rem; font-weight:700; color:#64748B; text-transform:uppercase;">Step 4</div>
              <div style="font-weight:700; font-size:0.95rem; color:#0F172A; margin:2px 0 0.5rem 0;">
                Dispatch to Resuscitation Bay
              </div>
              <p style="font-size:0.78rem; color:#64748B; margin-bottom:1rem;">
                Courier transport to Resuscitation Bay 1 cooler before ambulance arrives.
              </p>
              ${reqStatus === 'RESERVED' ? `
                <button class="btn btn-sm btn-primary btn-block" style="width:100%;" onclick="window.TrustCare.dispatchBloodToBay('${targetRequest?.id || `CBR-${activeCase?.id}-ON`}')">
                  <i class="fas fa-truck-ramp-box"></i> Deliver to Bay
                </button>
              ` : reqStatus === 'RECEIVED' ? `
                <span class="badge badge-success" style="width:100%; text-align:center; display:block; padding:0.4rem;">
                  <i class="fas fa-check-circle"></i> Bay Cooler Ready
                </span>
              ` : `
                <span class="badge badge-secondary" style="width:100%; text-align:center; display:block; padding:0.4rem;">Pending Step 3</span>
              `}
            </div>
          </div>

          <!-- Failure State Trigger: Report Unavailable -->
          <div style="margin-top:1.5rem; padding-top:1rem; border-top:1px solid #E2E8F0; display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:0.8rem; color:#64748B;">
              In case of zero cross-matched stock, notify dispatch to arrange regional transfer:
            </span>
            <button class="btn btn-outline-danger btn-xs" onclick="window.TrustCare.reportBloodUnavailable('${targetRequest?.id || `CBR-${activeCase?.id}-ON`}')">
              <i class="fas fa-triangle-exclamation"></i> Flag Blood Stock Unavailable
            </button>
          </div>
        </div>

        <!-- Metro General Blood Bank Inventory Table -->
        <div style="background:#FFFFFF; border:1px solid #E2E8F0; border-radius:12px; padding:1.25rem; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
          <h3 style="font-size:1.1rem; font-weight:800; color:#0F172A; margin:0 0 1rem 0;">
            Metro General Physical Inventory Status
          </h3>

          <table class="table" style="width:100%; font-size:0.85rem;">
            <thead>
              <tr style="border-bottom:2px solid #E2E8F0;">
                <th>Blood Group</th>
                <th>Component</th>
                <th>Total Units</th>
                <th>Available</th>
                <th>Reserved for Emergencies</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${inventory.map(inv => `
                <tr style="${inv.bloodGroup === 'O-' ? 'background:#FEF2F2; font-weight:700;' : ''}">
                  <td>
                    <span class="badge ${inv.bloodGroup === 'O-' ? 'badge-danger' : 'badge-primary'}">
                      ${inv.bloodGroup}
                    </span>
                  </td>
                  <td>${inv.component}</td>
                  <td>${inv.units}</td>
                  <td style="color:${inv.available > 0 ? '#15803D' : '#DC2626'}; font-weight:800;">
                    ${inv.available}
                  </td>
                  <td style="color:#2563EB;">${inv.reservedUnits || 0}</td>
                  <td>
                    <span class="badge ${inv.status === 'Adequate' ? 'badge-success' : inv.status === 'Low' ? 'badge-warning' : 'badge-danger'}">
                      ${inv.status}
                    </span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
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
