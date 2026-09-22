// ============================================================================
// TRUST CARE — Public Emergency Assistance Request Portal (Role 5)
// Citizen / Bystander Public Assistance Initiation
// "Request Received -> Dispatcher Verification -> Authorized Official Case"
// ============================================================================

import appState from '../state.js';
import Router from '../router.js';
import eventBus from '../events.js';
import { generateId } from '../utils.js';

export function renderPublicEmergencyRequest(container) {
  let submittedRequest = null;

  function render() {
    container.innerHTML = `
      <div class="tc-page-container animate-fade-in" style="min-height: 100vh; background: #0F172A; color: white; display: flex; flex-direction: column;">
        <!-- Top Minimal Header -->
        <header style="padding: 1.25rem 2rem; border-bottom: 1px solid #334155; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 38px; height: 38px; border-radius: 8px; background: #DC2626; display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">
              <i class="fas fa-truck-medical"></i>
            </div>
            <div>
              <div style="font-weight: 800; font-size: 1.1rem; letter-spacing: 0.04em;">TRUST CARE EMERGENCY CALL</div>
              <div style="font-size: 0.72rem; color: #94A3B8;">Public Assistance Intake System</div>
            </div>
          </div>
          <div>
            <a href="#/login" class="btn btn-sm btn-outline-secondary" style="color: #CBD5E1; border-color: #475569;">
              <i class="fas fa-arrow-left"></i> Staff Login
            </a>
          </div>
        </header>

        <!-- Main Form or Confirmation -->
        <main style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 2rem 1.5rem;">
          <div style="width: 100%; max-width: 580px;">
            ${submittedRequest ? `
              <!-- SUCCESS / WAITING STATE -->
              <div style="background: #1E293B; border: 2px solid #059669; border-radius: 16px; padding: 2.5rem; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
                <div style="width: 72px; height: 72px; border-radius: 50%; background: rgba(16, 185, 129, 0.15); border: 2px solid #10B981; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem auto; font-size: 2rem; color: #10B981;">
                  <i class="fas fa-check"></i>
                </div>
                <div style="font-size: 0.8rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #10B981; margin-bottom: 6px;">REQUEST RECEIVED</div>
                <h2 style="font-size: 1.8rem; font-weight: 800; margin: 0 0 12px 0;">Assistance Call Dispatched</h2>
                <div style="background: #0F172A; border: 1px solid #334155; border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem;">
                  <div style="font-size: 0.8rem; color: #94A3B8;">PUBLIC CALL REFERENCE:</div>
                  <div style="font-size: 1.5rem; font-weight: 800; color: #38BDF8; letter-spacing: 0.05em;">${submittedRequest.id}</div>
                  <div style="font-size: 0.82rem; color: #F59E0B; margin-top: 4px; font-weight: 600;">
                    <i class="fas fa-clock"></i> WAITING FOR EMERGENCY CONTROL VERIFICATION
                  </div>
                </div>

                <p style="font-size: 0.9rem; color: #CBD5E1; line-height: 1.6; margin-bottom: 1.75rem;">
                  Your location (<strong>${submittedRequest.location}</strong>) has been transmitted to Central Dispatch. An authorized paramedic dispatcher is verifying the operational requirements and routing to an equipped hospital.
                </p>

                <div style="display: flex; gap: 12px; justify-content: center;">
                  <button class="btn btn-primary" onclick="window.HospitalFlow.router.navigate('/dispatcher')" style="background: #0284C7;">
                    <i class="fas fa-desktop"></i> View as Dispatcher
                  </button>
                  <button class="btn btn-outline-secondary" id="btn-new-call" style="border-color: #475569; color: #CBD5E1;">
                    Submit Another Request
                  </button>
                </div>
              </div>
            ` : `
              <!-- PUBLIC INTAKE FORM -->
              <div style="background: #1E293B; border: 1px solid #334155; border-radius: 16px; padding: 2rem; box-shadow: 0 8px 24px rgba(0,0,0,0.4);">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 1.25rem;">
                  <span style="background: #EF4444; color: white; padding: 4px 10px; border-radius: 9999px; font-weight: 800; font-size: 0.75rem; letter-spacing: 0.05em;">EMERGENCY 108 / SOS</span>
                  <span style="font-size: 0.8rem; color: #94A3B8;">Public Caller Assistance</span>
                </div>

                <h2 style="font-size: 1.5rem; font-weight: 800; margin: 0 0 8px 0;">Request Emergency Assistance</h2>
                <p style="font-size: 0.85rem; color: #94A3B8; margin: 0 0 1.5rem 0;">
                  Submit details immediately. Authorized emergency control will verify and create an official hospital coordination case.
                </p>

                <form id="public-emergency-form">
                  <div style="margin-bottom: 1rem;">
                    <label style="display: block; font-size: 0.82rem; font-weight: 600; color: #CBD5E1; margin-bottom: 6px;">
                      Caller / Bystander Name <span style="color:#EF4444;">*</span>
                    </label>
                    <input type="text" id="pe-name" class="form-input" placeholder="e.g. Rahul Sharma" required style="width: 100%; padding: 0.7rem; background: #0F172A; border: 1px solid #475569; color: white; border-radius: 8px;">
                  </div>

                  <div style="margin-bottom: 1rem;">
                    <label style="display: block; font-size: 0.82rem; font-weight: 600; color: #CBD5E1; margin-bottom: 6px;">
                      Contact Phone Number <span style="color:#EF4444;">*</span>
                    </label>
                    <input type="tel" id="pe-phone" class="form-input" placeholder="+91 98765 43210" required style="width: 100%; padding: 0.7rem; background: #0F172A; border: 1px solid #475569; color: white; border-radius: 8px;">
                  </div>

                  <div style="margin-bottom: 1rem;">
                    <label style="display: block; font-size: 0.82rem; font-weight: 600; color: #CBD5E1; margin-bottom: 6px;">
                      Accident / Emergency Location <span style="color:#EF4444;">*</span>
                    </label>
                    <input type="text" id="pe-location" class="form-input" placeholder="e.g. Western Express Highway near Flyover 4B" required style="width: 100%; padding: 0.7rem; background: #0F172A; border: 1px solid #475569; color: white; border-radius: 8px;">
                  </div>

                  <div style="margin-bottom: 1.5rem;">
                    <label style="display: block; font-size: 0.82rem; font-weight: 600; color: #CBD5E1; margin-bottom: 6px;">
                      Emergency Description <span style="color:#EF4444;">*</span>
                    </label>
                    <textarea id="pe-desc" rows="3" class="form-input" placeholder="Describe the visible situation (e.g. Two-wheeler collision, unconscious adult, heavy bleeding)..." required style="width: 100%; padding: 0.7rem; background: #0F172A; border: 1px solid #475569; color: white; border-radius: 8px; resize: vertical;"></textarea>
                  </div>

                  <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 8px; padding: 0.85rem; margin-bottom: 1.5rem; font-size: 0.78rem; color: #FECACA; line-height: 1.5;">
                    <i class="fas fa-circle-info" style="color: #EF4444; margin-right: 6px;"></i>
                    <strong>Medical Safety Notice:</strong> This request is verified by trained human dispatchers before hospital resource reservation. Clinical diagnosis and hospital bed assignment cannot be made autonomously by software.
                  </div>

                  <button type="submit" style="width: 100%; padding: 0.85rem; background: #DC2626; color: white; border: none; border-radius: 8px; font-weight: 800; font-size: 1rem; cursor: pointer; letter-spacing: 0.02em; transition: background 0.2s;">
                    <i class="fas fa-truck-medical" style="margin-right: 8px;"></i> REQUEST EMERGENCY ASSISTANCE
                  </button>
                </form>
              </div>
            `}
          </div>
        </main>
      </div>
    `;

    // Event listener for submission
    const form = container.querySelector('#public-emergency-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const callerName = container.querySelector('#pe-name').value.trim();
        const contact = container.querySelector('#pe-phone').value.trim();
        const location = container.querySelector('#pe-location').value.trim();
        const description = container.querySelector('#pe-desc').value.trim();

        const callId = `ER-${Math.floor(100 + Math.random() * 900)}`;
        const publicRequest = {
          id: callId,
          callerName,
          contact,
          location,
          description,
          status: 'PENDING_VERIFICATION',
          createdAt: new Date().toISOString()
        };

        // Add to state
        const calls = appState.get().publicEmergencyCalls || [];
        appState.update({ publicEmergencyCalls: [publicRequest, ...calls] });

        eventBus.emit('PUBLIC_EMERGENCY_REQUESTED', { request: publicRequest }, { source: 'PublicRequester', role: 'public', entityId: callId });

        submittedRequest = publicRequest;
        render();
      });
    }

    const btnNew = container.querySelector('#btn-new-call');
    if (btnNew) {
      btnNew.addEventListener('click', () => {
        submittedRequest = null;
        render();
      });
    }
  }

  render();
}
