# TRUST CARE
> **Connected Emergency Readiness & Confirmed Handover Platform**
> *"Right Hospital. Confirmed Resources. Ready Before Arrival."*

TRUST CARE is an operational healthcare coordination platform engineered to solve the critical operational journey **BEFORE** an emergency patient reaches the hospital:

$$\text{EMERGENCY CASE} \longrightarrow \text{CASE REQUIREMENTS} \longrightarrow \text{SUITABLE HOSPITAL MATCHING} \longrightarrow \text{HOSPITAL REQUEST} \longrightarrow \text{ACCEPT / DECLINE} \longrightarrow \text{RESOURCE HOLD (ANTI-DOUBLE ALLOCATION)} \longrightarrow \text{PRE-ARRIVAL READINESS} \longrightarrow \text{BLOOD READINESS} \longrightarrow \text{AMBULANCE ARRIVAL} \longrightarrow \text{CONFIRMED HANDOVER} \longrightarrow \text{OPD QUEUE IMPACT}$$

---

## 🌟 Core Modules & Operational Guarantees

### 1. Paramedic Dispatch & Explainable Matching Matrix
- **Authoritative Clinical Requirements**: Set and verified by authorized paramedics (`ICU Bed`, `Trauma Specialist`, `O- Blood Units`).
- **Explainable Hospital Matching**: Evaluates distance/ETA, capability matching, reported capacity, and data freshness.
  - **Hospital A (1.8 km, nearest)**: `UNSUITABLE` (ICU capacity 0/10 available — *Nearest ≠ Right Hospital*).
  - **Hospital B (2.9 km)**: `RECONFIRMATION REQUIRED` (Data stale >30 min ago).
  - **Hospital C (4.2 km)**: `SUITABLE` (1 ICU available, fresh data 2 min ago, trauma team ready).

### 2. Strict Anti-Double-Allocation & Concurrency Guard
- **Database & Server Boundary Protection**: PostgreSQL function `allocate_resource_hold` uses `SELECT ... FOR UPDATE` row locking and active hold constraints.
- **Client Mutex**: In-flight concurrency lock prevents race conditions.
- **Guaranteed Conflict Blocking**: When Case TC-014 holds `HOSP-C-ICU-01`, any concurrent reservation attempt by Case TC-015 is rejected with error `RESOURCE_ALREADY_HELD`.
- **Hold Expiration Watchdog**: Automatic 15-minute operational hold countdown timer with state transition to `EXPIRED` if not admitted or extended.

### 3. Pre-Arrival Readiness Checklist & Team Prep
- **Modular Pre-Arrival Checklist**: Resuscitation Bay 1 readiness, ICU Bed Hold, Trauma Receiving Lead assignment, and Blood Desk confirmation.
- **OPD Queue Impact Bridge**: Diverting a routine OPD doctor to emergency duty updates outpatient waiting times (+30m) with a privacy-protected notice that shields emergency patient details.

### 4. Case-Linked Blood Readiness Workflow
- Enforces: *“Stock Available ≠ Resource Arranged For This Specific Emergency”*.
- Linear 4-stage lifecycle: `REQUESTED` $\rightarrow$ `ACKNOWLEDGED` $\rightarrow$ `AVAILABILITY_CONFIRMED` $\rightarrow$ `RESERVED` $\rightarrow$ `RECEIVED`.

### 5. Arrival & Confirmed Bedside Handover
- Enforces: *“PATIENT ARRIVED ≠ HANDOVER COMPLETED”*.
- Distinguishes transport arrival (`ARRIVED`) from bedside SBAR clinical responsibility sign-off (`HANDOVER_COMPLETED`).
- Bedside sign-off captures receiving doctor signature, paramedic sign-off, and transfer vitals, permanently converting the bed hold to a hospital admission.

### 6. Persistent Immutable Audit Timeline
- Chronological legal and operational record of every transition, timestamp, actor role, and metadata.
- Fully resilient: reloads from persistent storage across browser refreshes and reconnects.

---

## 🛠️ Technology Stack & Architecture

- **Frontend**: Pure Vanilla HTML5, CSS3, ES2022 JavaScript Modules (`type="module"`).
- **Design System**: Medical-grade CSS token architecture, HSL color system, Inter typography, glassmorphism accents, and responsive layout.
- **Visualizations**: [Chart.js 4.x](https://www.chartjs.org/) for OPD congestion bar charts, blood stock distribution, and trend curves.
- **Utilities**: [QRCode.js](https://github.com/davidshimjs/qrcodejs) for client-side ticket generation, [Font Awesome 6](https://fontawesome.com/) for iconography.
- **Backend / Database**: [Supabase](https://supabase.com/) PostgreSQL schema with RLS policies, or standalone zero-backend **Demo Mode** using persistent `localStorage`.

```
AnjumanProto/
├── css/
│   ├── variables.css      # Design tokens (colors, typography, spacing, shadows)
│   ├── base.css           # Global resets and HTML element styling
│   ├── layout.css         # App shell, sidebar, header, grids
│   ├── components.css     # Buttons, cards, forms, tables, badges, modals, toasts
│   ├── pages.css          # Page-specific styling for all modules
│   ├── responsive.css     # Tablet, mobile, and print media queries
│   └── animations.css     # Keyframes and micro-interaction transitions
├── js/
│   ├── config.js          # App constants, thresholds, role definitions
│   ├── utils.js           # ID generation, date formatters, sanitization
│   ├── events.js          # Central Pub/Sub event bus & audit registry
│   ├── storage.js         # LocalStorage persistence manager
│   ├── state.js           # Central reactive state manager
│   ├── demo-data.js       # High-fidelity synthetic dataset
│   ├── notifications.js   # Toast notifications & alert center
│   ├── auth.js            # Role-based access control & demo switcher
│   ├── router.js          # Client-side hash SPA router
│   ├── charts.js          # Chart.js visualization wrappers
│   ├── app.js             # Main bootstrap and window.HospitalFlow API
│   ├── engines/
│   │   ├── prediction-engine.js  # Transparent queuing & ETA calculation
│   │   ├── flow-engine.js        # Appointments, check-ins, queue lifecycle
│   │   ├── blood-engine.js       # Escalation pipeline & donor matching
│   │   ├── care-engine.js        # Discharge plans, adherence & multilingual
│   │   └── simulation-engine.js  # What-if scenario stress-tester
│   └── pages/
│       ├── login.js        # Split-screen brand & role authentication
│       ├── dashboard.js    # Command center KPIs & live monitoring
│       ├── flow.js         # Booking, live queue, doctor capacity, simulation
│       ├── emergency.js    # FEFO blood inventory, requests, donor directory
│       └── care.js         # Discharge plans, medication logs, follow-ups
├── supabase/
│   └── schema.sql         # Production PostgreSQL schema, RLS, and seed data
├── index.html             # Main single-page application entrypoint
└── README.md              # Documentation and presentation guide
```

---

## 🚀 Quick Start Guide

HospitalFlow AI is built with zero build steps or heavy bundlers required.

### 1. Launch with Any Local Web Server

#### Option A: Python (Built-in)
```bash
# Python 3.x
python -m http.server 8080
```
Open [http://localhost:8080](http://localhost:8080) in your browser.

#### Option B: Node.js (npx)
```bash
npx serve .
# or
npx live-server
```

#### Option C: VS Code Live Server
Right-click `index.html` $\rightarrow$ **"Open with Live Server"**.

---

## 🎯 5-Minute Hackathon Demo Script

Follow this script to demonstrate the platform:

| Step | Action | What to Highlight |
| :--- | :--- | :--- |
| **1. Role Login** | On the login screen, click **"Administrator"** quick access. | Clean medical UI, instant session bootstrap with 35 patients, 12 doctors, 8 blood groups. |
| **2. Command Center** | Navigate to the **Command Center**. | Real-time KPIs (Active Patients, OPD Wait, Critical Alerts), live queue, FEFO inventory chart, and live event audit stream. |
| **3. Smart Booking & Prediction** | Go to **Flow Intelligence** $\rightarrow$ **Booking**. Select patient `Amit Kumar`, Department `Cardiology`, Doctor `Dr. Rajesh Mehta`. | The explainable ETA predictor calculates estimated wait time before booking based on live doctor workload. Click **Book Appointment** $\rightarrow$ instant QR code generation. |
| **4. Check-In & Queue Management** | Click **Simulate Check-In** on the generated ticket. Switch to the **Live Queue** tab. | Amit is now queued. Demonstrate calling the patient, starting consultation, and completing consultation. Watch stats update automatically. |
| **5. Emergency Insertion** | In the Live Queue tab, click **"Insert Emergency"**. | Emergency case placed at position #1; all subsequent queue ETAs are recalculated with notifications dispatched. |
| **6. Blood Escalation & Matching** | Go to **Emergency Readiness** $\rightarrow$ **Requests**. Create an emergency request for `2 units of O-`. | Stock is critically low. Click **View Sources** to see external facilities ranked by score, distance, and transit time. Click **Reserve** to resolve. |
| **7. Donor Wave & OTP** | Switch to **Donors** tab or trigger donor wave. | View locality-sorted eligible donors. Verify donor availability via simulated 6-digit OTP confirmation. |
| **8. Care Continuity & Adherence** | Go to **Care Continuity** $\rightarrow$ **Discharge Plans**. Select `Amit Kumar`. | View time-slotted medication schedule. Toggle medication checkboxes to update the adherence rate. Switch language to **Hindi** or **Marathi** to showcase localization. |
| **9. What-If Simulator** | Return to **Flow Intelligence** $\rightarrow$ **Simulator**. Set Emergency = 3, Doctors Unavailable = 2. Click **Run Simulation**. | Compare baseline vs stress-tested scenario with actionable operational remedies. |

---

## 🔒 Role-Based Permissions Summary

| Capability | Admin | Doctor | Reception | Blood Bank | Patient |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **View Command Center** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Book Appointments** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Patient Check-In** | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Manage Queue / Consult** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Insert Emergency Patient** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Create Blood Request** | ✅ | ✅ | ❌ | ✅ | ❌ |
| **Reserve / Issue Blood** | ✅ | ❌ | ❌ | ✅ | ❌ |
| **Manage Donors & OTP** | ✅ | ❌ | ❌ | ✅ | ❌ |
| **Create Discharge Plans** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **View Personal Care Plan** | ✅ | ✅ | ❌ | ❌ | ✅ |
| **Run / Apply Simulator** | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 📄 License & Medical Disclaimer

**Operational Coordination Platform**: HospitalFlow AI is designed for hospital logistics, queue coordination, supply chain readiness, and post-discharge schedule compliance. Clinical decisions and blood transfusion authorizations require confirmation by licensed healthcare professionals.
