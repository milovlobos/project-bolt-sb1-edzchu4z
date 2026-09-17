/*
# Add Age Groups and Attendance System

1. Modified Tables
- `students`: Added `age` column (integer) and `age_group` column (text)
- `evaluations`: No changes needed (rating already stores red/yellow/green which map to 1/2/3)

2. New Tables
- `attendance`: Records daily attendance
  - `id` (uuid, primary key)
  - `student_id` (uuid, foreign key to students)
  - `date` (date, not null)
  - `present` (boolean, not null)
  - `created_at` (timestamp)
  - Unique constraint on student_id + date

3. Data Updates
- Updates existing 15 students with realistic ages and age_group values
- Age groups: 'pre-infantiles' (2-8), 'infantiles' (9-13), 'juveniles' (14+)

4. Security
- RLS enabled, anon + authenticated policies for single-tenant app
*/

-- Add age columns to students
ALTER TABLE students ADD COLUMN IF NOT EXISTS age integer;
ALTER TABLE students ADD COLUMN IF NOT EXISTS age_group text;

-- Create attendance table
CREATE TABLE IF NOT EXISTS attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  present boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(student_id, date)
);

-- Enable RLS on attendance
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- Attendance policies
DROP POLICY IF EXISTS "anon_select_attendance" ON attendance;
CREATE POLICY "anon_select_attendance" ON attendance FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_attendance" ON attendance;
CREATE POLICY "anon_insert_attendance" ON attendance FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_attendance" ON attendance;
CREATE POLICY "anon_update_attendance" ON attendance FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_attendance" ON attendance;
CREATE POLICY "anon_delete_attendance" ON attendance FOR DELETE
  TO anon, authenticated USING (true);

-- Update existing students with ages
UPDATE students SET 
  age = CASE 
    WHEN first_name = 'Carlos' THEN 6
    WHEN first_name = 'María' THEN 7
    WHEN first_name = 'Pedro' THEN 10
    WHEN first_name = 'Ana' THEN 12
    WHEN first_name = 'Luis' THEN 8
    WHEN first_name = 'Sofia' THEN 11
    WHEN first_name = 'Diego' THEN 15
    WHEN first_name = 'Valentina' THEN 14
    WHEN first_name = 'Andrés' THEN 16
    WHEN first_name = 'Camila' THEN 17
    WHEN first_name = 'Miguel' THEN 18
    WHEN first_name = 'Isabella' THEN 15
    WHEN first_name = 'José' THEN 16
    WHEN first_name = 'Lucía' THEN 19
    WHEN first_name = 'Fernando' THEN 20
  END,
  age_group = CASE 
    WHEN age BETWEEN 2 AND 8 THEN 'pre-infantiles'
    WHEN age BETWEEN 9 AND 13 THEN 'infantiles'
    ELSE 'juveniles'
  END;
