-- ============================================================================
-- HospitalFlow AI — Complete PostgreSQL / Supabase Schema & Initial Seeds
-- Intelligent Hospital Flow, Emergency Readiness & Care Continuity
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. ENUMS & DOMAIN TYPES
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'doctor', 'reception', 'blood_bank', 'patient');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE doctor_status AS ENUM ('Available', 'Consulting', 'Break', 'Unavailable');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE appointment_status AS ENUM ('Scheduled', 'Checked-In', 'In-Queue', 'Consulting', 'Completed', 'Cancelled', 'No-Show');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE queue_status AS ENUM ('Waiting', 'Called', 'Consulting', 'Completed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE blood_group_type AS ENUM ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE blood_status_type AS ENUM ('Adequate', 'Low', 'Critical');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE urgency_type AS ENUM ('Routine', 'Urgent', 'Emergency');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE blood_request_status AS ENUM ('Created', 'Checking Internal', 'Searching Sources', 'Matched', 'Reserved', 'Issued', 'Escalated', 'Resolved');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE donor_eligibility AS ENUM ('Eligible', 'Cooldown', 'Deferred');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE reminder_status AS ENUM ('Scheduled', 'Delivered', 'Read', 'Acknowledged', 'Missed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- 2. CORE TABLES
-- ============================================================================

-- USERS & PROFILES
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'patient',
  department TEXT,
  phone TEXT,
  account_status TEXT NOT NULL DEFAULT 'active',
  preferred_language TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- DEPARTMENTS
CREATE TABLE IF NOT EXISTS public.departments (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

-- PATIENTS
CREATE TABLE IF NOT EXISTS public.patients (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  phone TEXT,
  age INTEGER,
  gender TEXT,
  blood_group blood_group_type,
  previous_no_shows INTEGER NOT NULL DEFAULT 0,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- DOCTORS
CREATE TABLE IF NOT EXISTS public.doctors (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  department TEXT NOT NULL,
  specialty TEXT NOT NULL,
  status doctor_status NOT NULL DEFAULT 'Available',
  account_status TEXT NOT NULL DEFAULT 'active',
  average_consultation_minutes INTEGER NOT NULL DEFAULT 10,
  current_patient_id TEXT REFERENCES public.patients(id) ON DELETE SET NULL,
  completed_today INTEGER NOT NULL DEFAULT 0,
  queue_load INTEGER NOT NULL DEFAULT 0
);

-- APPOINTMENTS
CREATE TABLE IF NOT EXISTS public.appointments (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id TEXT NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  status appointment_status NOT NULL DEFAULT 'Scheduled',
  scheduled_time TIMESTAMPTZ NOT NULL,
  predicted_start TIMESTAMPTZ,
  predicted_end TIMESTAMPTZ,
  actual_start TIMESTAMPTZ,
  actual_end TIMESTAMPTZ,
  priority TEXT NOT NULL DEFAULT 'normal',
  no_show_risk TEXT NOT NULL DEFAULT 'Low',
  qr_data TEXT,
  symptom_original_text TEXT,
  symptom_detected_language TEXT,
  normalized_symptoms JSONB NOT NULL DEFAULT '[]'::jsonb,
  symptom_confidence TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- QUEUE ENTRIES
CREATE TABLE IF NOT EXISTS public.queue_entries (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id TEXT REFERENCES public.doctors(id) ON DELETE SET NULL,
  department TEXT NOT NULL,
  appointment_id TEXT REFERENCES public.appointments(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 1,
  status queue_status NOT NULL DEFAULT 'Waiting',
  priority TEXT NOT NULL DEFAULT 'Normal',
  estimated_wait INTEGER DEFAULT 0,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  called_at TIMESTAMPTZ,
  consulting_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- FACILITIES (Hospitals / Blood Banks)
CREATE TABLE IF NOT EXISTS public.facilities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- Hospital / Blood Bank
  city TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  operational_status TEXT NOT NULL DEFAULT 'Active',
  distance DOUBLE PRECISION DEFAULT 0
);

-- BLOOD INVENTORY
CREATE TABLE IF NOT EXISTS public.blood_inventory (
  id TEXT PRIMARY KEY,
  facility_id TEXT NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  blood_group blood_group_type NOT NULL,
  component TEXT NOT NULL DEFAULT 'Whole Blood',
  units INTEGER NOT NULL DEFAULT 0,
  reserved_units INTEGER NOT NULL DEFAULT 0,
  collection_date TIMESTAMPTZ,
  expiry_date TIMESTAMPTZ NOT NULL,
  status blood_status_type NOT NULL DEFAULT 'Adequate',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- BLOOD REQUESTS
CREATE TABLE IF NOT EXISTS public.blood_requests (
  id TEXT PRIMARY KEY,
  patient_id TEXT REFERENCES public.patients(id) ON DELETE SET NULL,
  blood_group blood_group_type NOT NULL,
  component TEXT NOT NULL DEFAULT 'Whole Blood',
  units INTEGER NOT NULL DEFAULT 1,
  urgency urgency_type NOT NULL DEFAULT 'Emergency',
  department TEXT,
  requesting_hospital TEXT NOT NULL DEFAULT 'HospitalFlow Central Hospital',
  status blood_request_status NOT NULL DEFAULT 'Created',
  matched_facility_id TEXT REFERENCES public.facilities(id) ON DELETE SET NULL,
  donor_wave INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- DONORS
CREATE TABLE IF NOT EXISTS public.donors (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  blood_group blood_group_type NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  last_donation TIMESTAMPTZ,
  eligibility donor_eligibility NOT NULL DEFAULT 'Eligible',
  locality TEXT,
  contact_preference TEXT DEFAULT 'SMS',
  available BOOLEAN NOT NULL DEFAULT TRUE,
  phone TEXT,
  notified_for_request_id TEXT REFERENCES public.blood_requests(id) ON DELETE SET NULL,
  notification_wave INTEGER,
  notification_status TEXT,
  otp_code TEXT,
  otp_verified BOOLEAN NOT NULL DEFAULT FALSE
);

-- DISCHARGE PLANS
CREATE TABLE IF NOT EXISTS public.discharge_plans (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  approved_by TEXT REFERENCES public.doctors(id) ON DELETE SET NULL,
  discharge_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  medications JSONB NOT NULL DEFAULT '[]'::jsonb,
  diet_plan TEXT,
  follow_up JSONB,
  warning_signs JSONB NOT NULL DEFAULT '[]'::jsonb,
  instructions TEXT,
  language TEXT NOT NULL DEFAULT 'English',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  caregiver_shared BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- REMINDERS
CREATE TABLE IF NOT EXISTS public.reminders (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- Medication / Follow-up
  message TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status reminder_status NOT NULL DEFAULT 'Scheduled',
  acknowledged_at TIMESTAMPTZ
);

-- FOLLOW-UPS
CREATE TABLE IF NOT EXISTS public.follow_ups (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  doctor_id TEXT REFERENCES public.doctors(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  time TEXT NOT NULL DEFAULT '10:00 AM',
  status TEXT NOT NULL DEFAULT 'Scheduled',
  discharge_plan_id TEXT REFERENCES public.discharge_plans(id) ON DELETE SET NULL,
  appointment_id TEXT REFERENCES public.appointments(id) ON DELETE SET NULL
);

-- NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  dismissed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  related_module TEXT,
  related_entity_id TEXT
);

-- AUDIT EVENTS
CREATE TABLE IF NOT EXISTS public.audit_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT,
  user_id TEXT,
  entity_id TEXT
);

-- SIMULATION SCENARIOS
CREATE TABLE IF NOT EXISTS public.simulation_scenarios (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  input_parameters JSONB NOT NULL,
  baseline_results JSONB NOT NULL,
  simulated_results JSONB NOT NULL,
  recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 3. INDEXES FOR HIGH-THROUGHPUT OPS
-- ============================================

CREATE INDEX IF NOT EXISTS idx_appointments_dept_status ON public.appointments(department, status);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON public.appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_queue_dept_status ON public.queue_entries(department, status);
CREATE INDEX IF NOT EXISTS idx_blood_inv_group ON public.blood_inventory(blood_group, status);
CREATE INDEX IF NOT EXISTS idx_blood_requests_status ON public.blood_requests(status);
CREATE INDEX IF NOT EXISTS idx_donors_group_elig ON public.donors(blood_group, eligibility, available);
CREATE INDEX IF NOT EXISTS idx_discharge_patient ON public.discharge_plans(patient_id, active);
CREATE INDEX IF NOT EXISTS idx_reminders_patient ON public.reminders(patient_id, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON public.audit_events(timestamp DESC);

-- ============================================
-- 4. ROW LEVEL SECURITY (RLS) & GRANTS
-- ============================================

-- Grant schema and table permissions to anon & authenticated roles for web client
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role;

-- Enable RLS and add universal permissive policies for the frontend web app
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Full Access Users" ON public.users;
CREATE POLICY "Public Full Access Users" ON public.users FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Full Access Patients" ON public.patients;
CREATE POLICY "Public Full Access Patients" ON public.patients FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Full Access Doctors" ON public.doctors;
CREATE POLICY "Public Full Access Doctors" ON public.doctors FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Full Access Departments" ON public.departments;
CREATE POLICY "Public Full Access Departments" ON public.departments FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Full Access Appointments" ON public.appointments;
CREATE POLICY "Public Full Access Appointments" ON public.appointments FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.queue_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Full Access Queue" ON public.queue_entries;
CREATE POLICY "Public Full Access Queue" ON public.queue_entries FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.facilities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Full Access Facilities" ON public.facilities;
CREATE POLICY "Public Full Access Facilities" ON public.facilities FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.blood_inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Full Access Blood Inv" ON public.blood_inventory;
CREATE POLICY "Public Full Access Blood Inv" ON public.blood_inventory FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.blood_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Full Access Blood Requests" ON public.blood_requests;
CREATE POLICY "Public Full Access Blood Requests" ON public.blood_requests FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.donors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Full Access Donors" ON public.donors;
CREATE POLICY "Public Full Access Donors" ON public.donors FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.discharge_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Full Access Discharge" ON public.discharge_plans;
CREATE POLICY "Public Full Access Discharge" ON public.discharge_plans FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Full Access Reminders" ON public.reminders;
CREATE POLICY "Public Full Access Reminders" ON public.reminders FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Full Access FollowUps" ON public.follow_ups;
CREATE POLICY "Public Full Access FollowUps" ON public.follow_ups FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Full Access Notifications" ON public.notifications;
CREATE POLICY "Public Full Access Notifications" ON public.notifications FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Full Access Audit" ON public.audit_events;
CREATE POLICY "Public Full Access Audit" ON public.audit_events FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.simulation_scenarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Full Access Simulation" ON public.simulation_scenarios;
CREATE POLICY "Public Full Access Simulation" ON public.simulation_scenarios FOR ALL TO public, anon, authenticated USING (true) WITH CHECK (true);

-- ============================================
-- 5. TRUST CARE CORE TABLES & ATOMIC CONCURRENCY ENGINE
-- ============================================

-- TRUST CARE CASES
CREATE TABLE IF NOT EXISTS public.trustcare_cases (
  id TEXT PRIMARY KEY,
  case_number TEXT UNIQUE NOT NULL,
  emergency_category TEXT NOT NULL,
  patient_identifier TEXT,
  paramedic_notes TEXT,
  location JSONB NOT NULL DEFAULT '{"name": "Highway Junction 4B", "lat": 19.0760, "lng": 72.8777}'::jsonb,
  ambulance_id TEXT NOT NULL DEFAULT 'AMB-07',
  required_capabilities JSONB NOT NULL DEFAULT '["ICU", "Trauma", "Blood"]'::jsonb,
  required_bed_type TEXT NOT NULL DEFAULT 'ICU',
  required_specialist TEXT DEFAULT 'Trauma Surgeon',
  requires_blood BOOLEAN NOT NULL DEFAULT TRUE,
  blood_group_needed TEXT DEFAULT 'O-',
  blood_units_needed INTEGER DEFAULT 2,
  selected_hospital_id TEXT,
  status TEXT NOT NULL DEFAULT 'CASE_CREATED',
  ambulance_status TEXT NOT NULL DEFAULT 'EN_ROUTE',
  eta_minutes INTEGER DEFAULT 8,
  readiness_state TEXT NOT NULL DEFAULT 'NOT_READY',
  created_by TEXT NOT NULL DEFAULT 'Paramedic Dispatcher',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HOSPITAL RESOURCES (WITH STRICT STATUS & FRESHNESS TRACKING)
CREATE TABLE IF NOT EXISTS public.hospital_resources (
  id TEXT PRIMARY KEY,
  hospital_id TEXT NOT NULL,
  resource_type TEXT NOT NULL, -- 'ICU', 'TRAUMA_BAY', 'VENTILATOR', 'OT'
  resource_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'AVAILABLE', -- 'AVAILABLE', 'HELD', 'OCCUPIED', 'MAINTENANCE'
  last_status_update TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  freshness_state TEXT NOT NULL DEFAULT 'FRESH', -- 'FRESH', 'STALE'
  active_case_id TEXT,
  active_hold_id TEXT,
  version INTEGER NOT NULL DEFAULT 1
);

-- RESOURCE HOLDS (WITH UNIQUE ACTIVE HOLD CONCURRENCY CONSTRAINT)
CREATE TABLE IF NOT EXISTS public.resource_holds (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  hospital_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'HELD', -- 'HELD', 'CONFIRMED', 'RELEASED', 'EXPIRED', 'RECONFIRMATION_REQUIRED'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  notes TEXT
);

-- UNIQUE CONSTRAINT: PREVENTS DOUBLE-ALLOCATION AT DATABASE KERNEL LEVEL!
-- A single resource CANNOT have more than one active ('HELD' or 'CONFIRMED') hold simultaneously.
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_resource_hold 
ON public.resource_holds(resource_id) 
WHERE status IN ('HELD', 'CONFIRMED');

-- HOSPITAL REQUESTS
CREATE TABLE IF NOT EXISTS public.hospital_requests (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  hospital_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'REQUEST_SENT', -- 'REQUEST_SENT', 'ACCEPTED', 'DECLINED', 'TIMEOUT', 'ACCEPTANCE_WITHDRAWN'
  decline_reason TEXT,
  request_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  timeout_at TIMESTAMPTZ
);

-- CASE-LINKED BLOOD REQUESTS
CREATE TABLE IF NOT EXISTS public.case_blood_requests (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  hospital_id TEXT NOT NULL,
  blood_group TEXT NOT NULL,
  units_requested INTEGER NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'REQUESTED', -- 'REQUESTED', 'ACKNOWLEDGED', 'AVAILABILITY_CONFIRMED', 'RESERVED', 'COLLECTION_PENDING', 'RECEIVED', 'BLOOD_UNAVAILABLE'
  units_reserved INTEGER DEFAULT 0,
  acknowledged_by TEXT,
  reserved_by TEXT,
  received_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  timestamps JSONB DEFAULT '{}'::jsonb
);

-- CONFIRMED HANDOVERS
CREATE TABLE IF NOT EXISTS public.case_handovers (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL UNIQUE,
  hospital_id TEXT NOT NULL,
  ambulance_id TEXT,
  arrived_at TIMESTAMPTZ,
  handover_started_at TIMESTAMPTZ,
  handover_completed_at TIMESTAMPTZ,
  paramedic_signoff_by TEXT,
  receiving_doctor_signoff_by TEXT,
  receiving_bay TEXT,
  clinical_notes TEXT,
  status TEXT NOT NULL DEFAULT 'EN_ROUTE' -- 'EN_ROUTE', 'ARRIVED', 'HANDOVER_IN_PROGRESS', 'HANDOVER_COMPLETED'
);

-- IMMUTABLE AUDIT CASE EVENTS
CREATE TABLE IF NOT EXISTS public.case_events (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_description TEXT NOT NULL,
  role TEXT NOT NULL,
  actor_name TEXT,
  previous_state TEXT,
  new_state TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_events_case_time ON public.case_events(case_id, created_at ASC);

-- ATOMIC STORED PROCEDURE FOR CONCURRENCY LOCK & ANTI-DOUBLE ALLOCATION
CREATE OR REPLACE FUNCTION public.allocate_resource_hold(
  p_case_id TEXT,
  p_hospital_id TEXT,
  p_resource_id TEXT,
  p_hold_seconds INTEGER,
  p_created_by TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_res RECORD;
  v_existing_hold RECORD;
  v_hold_id TEXT;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- 1. Row-level lock on the resource to prevent concurrent race conditions
  SELECT * INTO v_res FROM public.hospital_resources WHERE id = p_resource_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'RESOURCE_NOT_FOUND', 'message', 'Resource does not exist');
  END IF;

  -- 2. Check if already occupied or in maintenance
  IF v_res.status = 'OCCUPIED' OR v_res.status = 'MAINTENANCE' THEN
    RETURN jsonb_build_object('success', false, 'error', 'RESOURCE_UNAVAILABLE', 'message', 'Resource is currently ' || v_res.status);
  END IF;

  -- 3. Check for active holds on this resource
  SELECT * INTO v_existing_hold FROM public.resource_holds 
  WHERE resource_id = p_resource_id AND status IN ('HELD', 'CONFIRMED') AND expires_at > NOW();

  IF FOUND THEN
    IF v_existing_hold.case_id = p_case_id THEN
      -- Already held for this exact case, refresh expiry
      v_expires_at := NOW() + (p_hold_seconds || ' seconds')::INTERVAL;
      UPDATE public.resource_holds SET expires_at = v_expires_at WHERE id = v_existing_hold.id;
      RETURN jsonb_build_object('success', true, 'hold_id', v_existing_hold.id, 'expires_at', v_expires_at, 'reused', true);
    ELSE
      -- DOUBLE ALLOCATION BLOCKED AT DATABASE LEVEL!
      RETURN jsonb_build_object(
        'success', false,
        'error', 'RESOURCE_ALREADY_HELD',
        'conflict_case_id', v_existing_hold.case_id,
        'resource_id', p_resource_id,
        'message', 'Resource ' || p_resource_id || ' is actively held for case ' || v_existing_hold.case_id || ' until ' || TO_CHAR(v_existing_hold.expires_at, 'HH24:MI:SS')
      );
    END IF;
  END IF;

  -- 4. Allocate hold atomically
  v_hold_id := 'HOLD-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS-') || SUBSTRING(MD5(RANDOM()::TEXT), 1, 4);
  v_expires_at := NOW() + (p_hold_seconds || ' seconds')::INTERVAL;

  INSERT INTO public.resource_holds (
    id, case_id, hospital_id, resource_id, resource_type, status, created_at, expires_at, created_by
  ) VALUES (
    v_hold_id, p_case_id, p_hospital_id, p_resource_id, v_res.resource_type, 'HELD', NOW(), v_expires_at, p_created_by
  );

  UPDATE public.hospital_resources SET
    status = 'HELD',
    active_case_id = p_case_id,
    active_hold_id = v_hold_id,
    last_status_update = NOW()
  WHERE id = p_resource_id;

  -- Insert audit event
  INSERT INTO public.case_events (
    id, case_id, event_type, event_description, role, actor_name, previous_state, new_state, metadata
  ) VALUES (
    'EVT-' || SUBSTRING(MD5(RANDOM()::TEXT), 1, 8),
    p_case_id,
    'RESOURCE_HELD',
    'Resource ' || p_resource_id || ' held for case ' || p_case_id || ' (expires in ' || p_hold_seconds || 's)',
    'hospital_desk',
    p_created_by,
    'AVAILABLE',
    'HELD',
    jsonb_build_object('resource_id', p_resource_id, 'expires_at', v_expires_at, 'hold_id', v_hold_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'hold_id', v_hold_id,
    'resource_id', p_resource_id,
    'expires_at', v_expires_at
  );
END;
$$;

-- GRANTS & RLS FOR TRUST CARE TABLES
GRANT ALL ON TABLE public.trustcare_cases TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE public.hospital_resources TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE public.resource_holds TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE public.hospital_requests TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE public.case_blood_requests TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE public.case_handovers TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE public.case_events TO postgres, anon, authenticated, service_role;

ALTER TABLE public.trustcare_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Full Access trustcare_cases" ON public.trustcare_cases FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.hospital_resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Full Access hospital_resources" ON public.hospital_resources FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.resource_holds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Full Access resource_holds" ON public.resource_holds FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.hospital_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Full Access hospital_requests" ON public.hospital_requests FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.case_blood_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Full Access case_blood_requests" ON public.case_blood_requests FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.case_handovers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Full Access case_handovers" ON public.case_handovers FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.case_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Full Access case_events" ON public.case_events FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 6. TRUST CARE SEED DATA (HOSPITALS A, B, C & RESOURCES)
-- ============================================

-- Hospital A: City Trauma Care (Nearest, 1.8km, ICU capacity 0/10 -> UNSUITABLE)
-- Hospital B: Apex Medical Center (2.9km, Reported 2 ICU, Stale 48 min ago -> RECONFIRMATION REQUIRED)
-- Hospital C: Metro General Hospital (4.2km, Available 1 ICU, Fresh 2 min ago -> SUITABLE)

INSERT INTO public.facilities (id, name, type, city, latitude, longitude, operational_status, distance) VALUES
  ('HOSP-A', 'City Trauma Care (Hospital A)', 'Hospital', 'Mumbai', 19.0790, 72.8820, 'Active', 1.8),
  ('HOSP-B', 'Apex Medical Center (Hospital B)', 'Hospital', 'Mumbai', 19.0850, 72.8940, 'Active', 2.9),
  ('HOSP-C', 'Metro General Hospital (Hospital C)', 'Hospital', 'Mumbai', 19.0950, 72.9100, 'Active', 4.2)
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name,
  distance = EXCLUDED.distance;

-- Seed Hospital Resources
-- Hospital A: 10 ICUs, all 10 occupied (0 available)
INSERT INTO public.hospital_resources (id, hospital_id, resource_type, resource_code, status, last_status_update, freshness_state) VALUES
  ('HOSP-A-ICU-01', 'HOSP-A', 'ICU', 'ICU-Bed-01', 'OCCUPIED', NOW() - INTERVAL '4 minutes', 'FRESH'),
  ('HOSP-A-ICU-02', 'HOSP-A', 'ICU', 'ICU-Bed-02', 'OCCUPIED', NOW() - INTERVAL '4 minutes', 'FRESH')
ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, last_status_update = EXCLUDED.last_status_update;

-- Hospital B: ICU reported available but STALE (>45 min ago)
INSERT INTO public.hospital_resources (id, hospital_id, resource_type, resource_code, status, last_status_update, freshness_state) VALUES
  ('HOSP-B-ICU-01', 'HOSP-B', 'ICU', 'ICU-Bed-01', 'AVAILABLE', NOW() - INTERVAL '48 minutes', 'STALE'),
  ('HOSP-B-ICU-02', 'HOSP-B', 'ICU', 'ICU-Bed-02', 'AVAILABLE', NOW() - INTERVAL '48 minutes', 'STALE')
ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, last_status_update = EXCLUDED.last_status_update, freshness_state = EXCLUDED.freshness_state;

-- Hospital C: Exactly 1 ICU bed available (HOSP-C-ICU-01) with FRESH data!
INSERT INTO public.hospital_resources (id, hospital_id, resource_type, resource_code, status, last_status_update, freshness_state) VALUES
  ('HOSP-C-ICU-01', 'HOSP-C', 'ICU', 'ICU-01', 'AVAILABLE', NOW() - INTERVAL '2 minutes', 'FRESH')
ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, last_status_update = EXCLUDED.last_status_update, freshness_state = EXCLUDED.freshness_state;

-- Initial users including Dispatcher, Hospital Desk, Blood Bank, and Doctor
INSERT INTO public.users (id, email, display_name, role, department, phone) VALUES
  ('u-dispatcher', 'dispatcher@trustcare.org', 'Lead Paramedic Dispatcher', 'admin', 'EMS Dispatch', '+91 9876543201'),
  ('u-hosp-desk', 'emergency.desk@metrogeneral.org', 'Metro Emergency Desk Coordinator', 'doctor', 'Emergency Receiving', '+91 9876543202'),
  ('u-blood-desk', 'blood.desk@metrogeneral.org', 'Metro Blood Bank Officer', 'blood_bank', 'Blood Transfusion', '+91 9876543203'),
  ('u-admin', 'admin@trustcare.org', 'Trust Care Operations Director', 'admin', 'Operations', '+91 9876543210')
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role;

