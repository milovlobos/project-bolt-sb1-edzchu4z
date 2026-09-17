/*
# Taekwondo Student Evaluation System Schema

1. New Tables

- `belts`
  - `id` (uuid, primary key)
  - `name` (text, not null) - e.g., "Blanco", "Amarillo"
  - `order_index` (integer, not null) - display order (1-9)
  - `color` (text, not null) - CSS color class for display

- `students`
  - `id` (uuid, primary key)
  - `first_name` (text, not null)
  - `last_name` (text, not null)
  - `belt_id` (uuid, foreign key to belts)
  - `created_at` (timestamp)

- `evaluations`
  - `id` (uuid, primary key)
  - `student_id` (uuid, foreign key to students)
  - `category` (text, not null) - 'brazos', 'patadas', 'poomsae', 'combate'
  - `subcategory` (text) - 'defensa', 'ataque' for brazos; 'poomsae', 'posiciones' for poomsae
  - `rating` (text, not null) - 'red', 'yellow', 'green'
  - `notes` (text, optional)
  - `created_at` (timestamp)

2. Security
- Enable RLS on all tables.
- Single-tenant app (no auth) - allow anon + authenticated CRUD on all tables.

3. Seed Data
- Inserts 9 belt types in correct order.
- Inserts 15 test students distributed across belt levels.
*/

-- Belts table
CREATE TABLE IF NOT EXISTS belts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  order_index integer NOT NULL UNIQUE,
  color text NOT NULL
);

-- Students table
CREATE TABLE IF NOT EXISTS students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  belt_id uuid NOT NULL REFERENCES belts(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- Evaluations table
CREATE TABLE IF NOT EXISTS evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  category text NOT NULL,
  subcategory text,
  rating text NOT NULL CHECK (rating IN ('red', 'yellow', 'green')),
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(student_id, category, subcategory)
);

-- Enable RLS
ALTER TABLE belts ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;

-- Belt policies (anon + authenticated for single-tenant)
DROP POLICY IF EXISTS "anon_select_belts" ON belts;
CREATE POLICY "anon_select_belts" ON belts FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_belts" ON belts;
CREATE POLICY "anon_insert_belts" ON belts FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_belts" ON belts;
CREATE POLICY "anon_update_belts" ON belts FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_belts" ON belts;
CREATE POLICY "anon_delete_belts" ON belts FOR DELETE
  TO anon, authenticated USING (true);

-- Student policies
DROP POLICY IF EXISTS "anon_select_students" ON students;
CREATE POLICY "anon_select_students" ON students FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_students" ON students;
CREATE POLICY "anon_insert_students" ON students FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_students" ON students;
CREATE POLICY "anon_update_students" ON students FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_students" ON students;
CREATE POLICY "anon_delete_students" ON students FOR DELETE
  TO anon, authenticated USING (true);

-- Evaluation policies
DROP POLICY IF EXISTS "anon_select_evaluations" ON evaluations;
CREATE POLICY "anon_select_evaluations" ON evaluations FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_evaluations" ON evaluations;
CREATE POLICY "anon_insert_evaluations" ON evaluations FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_evaluations" ON evaluations;
CREATE POLICY "anon_update_evaluations" ON evaluations FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_evaluations" ON evaluations;
CREATE POLICY "anon_delete_evaluations" ON evaluations FOR DELETE
  TO anon, authenticated USING (true);

-- Seed belts
INSERT INTO belts (name, order_index, color) VALUES
  ('Blanco', 1, 'bg-white border-gray-300'),
  ('Blanco-Amarillo', 2, 'bg-gradient-to-r from-white to-yellow-300 border-yellow-400'),
  ('Amarillo', 3, 'bg-yellow-400 border-yellow-500'),
  ('Amarillo-Verde', 4, 'bg-gradient-to-r from-yellow-400 to-green-500 border-green-600'),
  ('Verde', 5, 'bg-green-500 border-green-600'),
  ('Verde-Azul', 6, 'bg-gradient-to-r from-green-500 to-blue-500 border-blue-600'),
  ('Azul', 7, 'bg-blue-500 border-blue-600'),
  ('Azul-Rojo', 8, 'bg-gradient-to-r from-blue-500 to-red-500 border-red-600'),
  ('Rojo', 9, 'bg-red-500 border-red-600')
ON CONFLICT (order_index) DO NOTHING;

-- Seed 15 students across belts
INSERT INTO students (first_name, last_name, belt_id) VALUES
  ('Carlos', 'Mendoza', (SELECT id FROM belts WHERE order_index = 1)),
  ('María', 'García', (SELECT id FROM belts WHERE order_index = 1)),
  ('Pedro', 'Sánchez', (SELECT id FROM belts WHERE order_index = 2)),
  ('Ana', 'López', (SELECT id FROM belts WHERE order_index = 3)),
  ('Luis', 'Rodríguez', (SELECT id FROM belts WHERE order_index = 3)),
  ('Sofia', 'Martínez', (SELECT id FROM belts WHERE order_index = 4)),
  ('Diego', 'Hernández', (SELECT id FROM belts WHERE order_index = 5)),
  ('Valentina', 'Pérez', (SELECT id FROM belts WHERE order_index = 5)),
  ('Andrés', 'González', (SELECT id FROM belts WHERE order_index = 6)),
  ('Camila', 'Díaz', (SELECT id FROM belts WHERE order_index = 7)),
  ('Miguel', 'Torres', (SELECT id FROM belts WHERE order_index = 7)),
  ('Isabella', 'Ruiz', (SELECT id FROM belts WHERE order_index = 8)),
  ('José', 'Jiménez', (SELECT id FROM belts WHERE order_index = 8)),
  ('Lucía', 'Moreno', (SELECT id FROM belts WHERE order_index = 9)),
  ('Fernando', 'Álvarez', (SELECT id FROM belts WHERE order_index = 9));
