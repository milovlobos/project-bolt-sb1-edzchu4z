// Replace Supabase client with local REST API functions

export async function loginUser(name: string, password: string): Promise<User> {
  const response = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, password })
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to login');
  }
  return response.json();
}

export async function getEvaluators(): Promise<User[]> {
  const response = await fetch('/api/users');
  if (!response.ok) throw new Error('Failed to fetch evaluators');
  return response.json();
}

export async function saveEvaluator(user: Omit<User, 'id' | 'created_at'> & { court_id?: string }): Promise<User> {
  const response = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user)
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to save evaluator');
  }
  return response.json();
}

export async function updateUser(userId: string, data: Partial<User> & { court_id?: string | null }): Promise<User> {
  const response = await fetch(`/api/users/${userId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to update user');
  }
  return response.json();
}

export async function deleteEvaluator(userId: string): Promise<void> {
  const response = await fetch(`/api/users/${userId}`, {
    method: 'DELETE'
  });
  if (!response.ok) throw new Error('Failed to delete evaluator');
}

export async function getAgeGroups(): Promise<AgeGroupConfig[]> {
  const response = await fetch('/api/age-groups');
  if (!response.ok) throw new Error('Failed to fetch age groups');
  return response.json();
}

export async function saveAgeGroups(configs: AgeGroupConfig[]): Promise<AgeGroupConfig[]> {
  const response = await fetch('/api/age-groups', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(configs)
  });
  if (!response.ok) throw new Error('Failed to save age groups');
  return response.json();
}

// --- EXAM API WRAPPERS ---
export async function getExams(): Promise<Exam[]> {
  const response = await fetch('/api/exams');
  if (!response.ok) throw new Error('Failed to fetch exams');
  return response.json();
}

export async function createExam(name: string, date: string): Promise<Exam> {
  const response = await fetch('/api/exams', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, date })
  });
  if (!response.ok) throw new Error('Failed to create exam');
  return response.json();
}

export async function activateExam(examId: string): Promise<Exam> {
  const response = await fetch(`/api/exams/${examId}/activate`, {
    method: 'PUT'
  });
  if (!response.ok) throw new Error('Failed to activate exam');
  return response.json();
}

export async function deleteExam(examId: string): Promise<void> {
  const response = await fetch(`/api/exams/${encodeURIComponent(examId)}`, {
    method: 'DELETE'
  });
  if (!response.ok) throw new Error('Error al eliminar examen');
}

export async function getBelts(): Promise<Belt[]> {
  const response = await fetch('/api/belts');
  if (!response.ok) throw new Error('Failed to fetch belts');
  return response.json();
}

export type StudentCreate = {
  first_name: string;
  last_name: string;
  belt_id: string;
  rut?: string;
  email?: string;
  birth_date?: string;
  age?: number;
  sede?: string;
  profesor?: string;
  exam_id?: string;
};

export async function createManualStudent(data: StudentCreate): Promise<StudentWithBelt> {
  const response = await fetch('/api/students', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || 'Error al agregar alumno');
  }
  return response.json();
}

export async function getStudents(order: 'first_name' | 'last_name' = 'first_name'): Promise<StudentWithBelt[]> {
  const response = await fetch(`/api/students?order=${order}`);
  if (!response.ok) throw new Error('Failed to fetch students');
  return response.json();
}

export async function getAttendance(date: string, examId?: string): Promise<Attendance[]> {
  const examQuery = examId ? `&exam_id=${encodeURIComponent(examId)}` : '';
  const response = await fetch(`/api/attendance?date=${encodeURIComponent(date)}${examQuery}`);
  if (!response.ok) throw new Error('Failed to fetch attendance');
  return response.json();
}

export async function saveAttendance(studentId: string, date: string, present: boolean, examId: string): Promise<Attendance> {
  const response = await fetch('/api/attendance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ student_id: studentId, date, present, exam_id: examId })
  });
  if (!response.ok) throw new Error('Failed to save attendance');
  return response.json();
}

export async function getEvaluations(examId?: string): Promise<Evaluation[]> {
  const examQuery = examId ? `?exam_id=${encodeURIComponent(examId)}` : '';
  const response = await fetch(`/api/evaluations${examQuery}`);
  if (!response.ok) throw new Error('Failed to fetch evaluations');
  return response.json();
}

export async function saveEvaluation(
  studentId: string, 
  category: string, 
  subcategory: string | null, 
  rating: Rating, 
  notes: string,
  evaluatorId: string,
  examId: string
): Promise<Evaluation> {
  const response = await fetch('/api/evaluations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      student_id: studentId, 
      category, 
      subcategory, 
      rating, 
      notes,
      evaluator_id: evaluatorId,
      exam_id: examId
    })
  });
  if (!response.ok) throw new Error('Failed to save evaluation');
  return response.json();
}

export type UserRole = 'admin' | 'evaluador' | 'lista';

export type User = {
  id: string;
  email?: string;
  role: UserRole;
  name: string;
  age_group: string | null;
  created_at: string;
  password?: string; // Optional for evaluator creation input
  court_id?: string | null;
  court_name?: string | null;
};

export type AgeGroupConfig = {
  id: string;
  name: string;
  min_age: number;
  max_age: number;
};

export type Exam = {
  id: string;
  name: string;
  date: string;
  is_active: boolean;
  created_at: string;
};

export type Belt = {
  id: string;
  name: string;
  order_index: number;
  color: string;
};

export type Student = {
  id: string;
  first_name: string;
  last_name: string;
  rut?: string | null;
  email?: string | null;
  birth_date?: string | null;
  sede?: string | null;
  profesor?: string | null;
  belt_id: string;
  age: number | null;
  age_group: string | null;
  created_at: string;
};

export async function uploadStudentsCSV(file: File, examId?: string): Promise<{
  message: string;
  total_rows: number;
  imported_count: number;
  updated_count: number;
  skipped_count: number;
  details: string[];
}> {
  const formData = new FormData();
  formData.append('file', file);
  if (examId) {
    formData.append('exam_id', examId);
  }
  const response = await fetch('/api/students/import-csv', {
    method: 'POST',
    body: formData
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || 'Error al importar CSV');
  }
  return response.json();
}

export async function getExamStudents(examId: string): Promise<StudentWithBelt[]> {
  const response = await fetch(`/api/exams/${encodeURIComponent(examId)}/students`);
  if (!response.ok) throw new Error('Error al obtener alumnos del examen');
  return response.json();
}


export type Attendance = {
  id: string;
  student_id: string;
  exam_id: string;
  date: string;
  present: boolean;
  created_at: string;
};

export type Rating = 'insuficiente' | 'por_mejorar' | 'suficiente' | 'logrado' | 'destacado' | 'red' | 'yellow' | 'green';

export const RATING_OPTIONS: { key: Rating; label: string; points: number; bgColor: string; ringColor: string; textColor: string }[] = [
  { key: 'insuficiente', label: 'Insuficiente', points: 1, bgColor: 'bg-red-600', ringColor: 'ring-red-400', textColor: 'text-red-400' },
  { key: 'por_mejorar', label: 'Por mejorar', points: 2, bgColor: 'bg-orange-500', ringColor: 'ring-orange-400', textColor: 'text-orange-400' },
  { key: 'suficiente', label: 'Suficiente', points: 3, bgColor: 'bg-yellow-500', ringColor: 'ring-yellow-400', textColor: 'text-yellow-400' },
  { key: 'logrado', label: 'Logrado', points: 4, bgColor: 'bg-green-500', ringColor: 'ring-green-400', textColor: 'text-green-400' },
  { key: 'destacado', label: 'Destacado', points: 5, bgColor: 'bg-blue-600', ringColor: 'ring-blue-400', textColor: 'text-blue-400' },
];

export const getRatingPointValue = (rating?: string | null): number => {
  if (!rating) return 0;
  switch (rating) {
    case 'insuficiente': return 1;
    case 'por_mejorar': return 2;
    case 'suficiente': return 3;
    case 'logrado': return 4;
    case 'destacado': return 5;
    case 'red': return 1;
    case 'yellow': return 3;
    case 'green': return 4;
    default: return 0;
  }
};

export type Evaluation = {
  id: string;
  student_id: string;
  evaluator_id: string;
  exam_id: string;
  category: string;
  subcategory: string | null;
  rating: Rating;
  notes: string | null;
  created_at: string;
};

export type StudentWithBelt = Student & {
  belts: Belt;
};

export type Category = 'brazos' | 'patadas' | 'combate' | 'poomsae';

export const CATEGORIES: Category[] = ['brazos', 'patadas', 'combate', 'poomsae'];

export const CATEGORY_LABELS: Record<Category, string> = {
  brazos: 'Brazos',
  patadas: 'Patadas',
  combate: 'Combate',
  poomsae: 'Poomsae',
};

export const SUBCATEGORIES: Record<Category, string[]> = {
  brazos: ['defensa', 'ataque'],
  patadas: [],
  combate: [],
  poomsae: ['poomsae', 'posiciones'],
};

export const SUBCATEGORY_LABELS: Record<string, string> = {
  defensa: 'Defensa',
  ataque: 'Ataque',
  poomsae: 'Poomsae',
  posiciones: 'Posiciones',
};

export const RATING_VALUES: Record<'red' | 'yellow' | 'green', number> = {
  red: 1,
  yellow: 2,
  green: 3,
};

export const RATING_LABELS: Record<'red' | 'yellow' | 'green', string> = {
  red: 'Por mejorar',
  yellow: 'En proceso',
  green: 'Logrado',
};

export type AgeGroup = 'pre-infantiles' | 'infantiles' | 'juveniles';

export const AGE_GROUPS: AgeGroup[] = ['pre-infantiles', 'infantiles', 'juveniles'];

export const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  'pre-infantiles': 'Pre-Infantiles',
  'infantiles': 'Infantiles',
  'juveniles': 'Juveniles',
};

// --- COURT TYPES ---
export type CourtEvaluatorInfo = {
  id: string;
  evaluator_id: string;
  email: string;
  name: string;
  password?: string | null;
};

export type CourtEvaluatorCreate = {
  email: string;
  password: string;
  name: string;
};

export type CourtCreate = {
  name: string;
  min_age: number;
  max_age: number;
  num_evaluators: number;
  allowed_belts?: string[];
  evaluators: CourtEvaluatorCreate[];
};

export type Court = {
  id: string;
  exam_id: string;
  name: string;
  min_age: number;
  max_age: number;
  num_evaluators: number;
  allowed_belts?: string[];
  created_at: string;
  evaluators: CourtEvaluatorInfo[];
  students: StudentWithBelt[];
};

// --- COURT API FUNCTIONS ---
export async function createCourt(examId: string, data: CourtCreate): Promise<Court> {
  const response = await fetch(`/api/exams/${examId}/courts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || 'Error al crear cancha');
  }
  return response.json();
}

export async function getExamCourts(examId: string): Promise<Court[]> {
  const response = await fetch(`/api/exams/${examId}/courts`);
  if (!response.ok) throw new Error('Error al obtener canchas');
  return response.json();
}

export async function getUnassignedStudents(examId: string): Promise<StudentWithBelt[]> {
  const response = await fetch(`/api/exams/${examId}/unassigned-students`);
  if (!response.ok) throw new Error('Error al obtener alumnos sin asignar');
  return response.json();
}

export async function deleteCourt(courtId: string): Promise<void> {
  const response = await fetch(`/api/courts/${courtId}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Error al eliminar cancha');
}

export async function updateStudentAge(studentId: string, age: number): Promise<StudentWithBelt> {
  const response = await fetch(`/api/students/${studentId}/age`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ age })
  });
  if (!response.ok) throw new Error('Error al actualizar edad');
  return response.json();
}

export async function updateCourtAgeRange(courtId: string, minAge: number, maxAge: number, name?: string, allowedBelts?: string[]): Promise<Court> {
  const response = await fetch(`/api/courts/${courtId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ min_age: minAge, max_age: maxAge, name, allowed_belts: allowedBelts })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || 'Error al actualizar rango de la cancha');
  }
  return response.json();
}

export async function getEvaluatorStudents(examId: string, userId: string): Promise<StudentWithBelt[]> {
  const response = await fetch(`/api/exams/${examId}/evaluator-students/${userId}`);
  if (!response.ok) throw new Error('Error al cargar alumnos del evaluador');
  return response.json();
}

export async function getEvaluatorCourt(examId: string, userId: string): Promise<{ id?: string; name: string; min_age?: number; max_age?: number; allowed_belts?: string[] }> {
  const response = await fetch(`/api/exams/${examId}/evaluator-court/${userId}`);
  if (!response.ok) return { name: 'Todas las Canchas' };
  return response.json();
}


export function getBeltStyle(belt?: { name?: string; color?: string } | null): { style: React.CSSProperties; className: string } {
  if (!belt || !belt.name) {
    return { style: { backgroundColor: '#ffffff' }, className: 'border border-gray-400' };
  }

  const name = belt.name.toLowerCase().trim();

  // Multi-color 50/50 sharp split (mitad y mitad)
  if (name.includes('blanco-amarillo') || name.includes('blanco amarillo')) {
    return {
      style: { background: 'linear-gradient(90deg, #ffffff 50%, #facc15 50%)' },
      className: 'border border-yellow-500'
    };
  }
  if (name.includes('amarillo-verde') || name.includes('amarillo verde')) {
    return {
      style: { background: 'linear-gradient(90deg, #facc15 50%, #22c55e 50%)' },
      className: 'border border-green-600'
    };
  }
  if (name.includes('verde-azul') || name.includes('verde azul')) {
    return {
      style: { background: 'linear-gradient(90deg, #22c55e 50%, #3b82f6 50%)' },
      className: 'border border-blue-600'
    };
  }
  if (name.includes('azul-rojo') || name.includes('azul rojo')) {
    return {
      style: { background: 'linear-gradient(90deg, #3b82f6 50%, #ef4444 50%)' },
      className: 'border border-red-600'
    };
  }
  if (name.includes('rojo-negro') || name.includes('rojo negro')) {
    return {
      style: { background: 'linear-gradient(90deg, #ef4444 50%, #0f172a 50%)' },
      className: 'border border-slate-900'
    };
  }

  // Single-color belts
  if (name === 'blanco') {
    return { style: { backgroundColor: '#ffffff' }, className: 'border border-gray-300' };
  }
  if (name === 'amarillo') {
    return { style: { backgroundColor: '#facc15' }, className: 'border border-yellow-500' };
  }
  if (name === 'verde') {
    return { style: { backgroundColor: '#22c55e' }, className: 'border border-green-600' };
  }
  if (name === 'azul') {
    return { style: { backgroundColor: '#3b82f6' }, className: 'border border-blue-600' };
  }
  if (name === 'rojo') {
    return { style: { backgroundColor: '#ef4444' }, className: 'border border-red-600' };
  }
  if (name === 'negro') {
    return { style: { backgroundColor: '#0f172a' }, className: 'border border-slate-700' };
  }

  // Fallback
  return { style: {}, className: `${belt.color || 'bg-white'} border border-gray-400` };
}

export async function updateStudentFull(
  studentId: string,
  data: {
    first_name?: string;
    last_name?: string;
    belt_id?: string;
    rut?: string;
    email?: string;
    birth_date?: string;
    sede?: string;
    profesor?: string;
    age?: number;
  }
): Promise<StudentWithBelt> {
  const response = await fetch(`/api/students/${studentId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to update student');
  }
  return response.json();
}

export async function deleteStudent(studentId: string): Promise<{ message: string }> {
  const response = await fetch(`/api/students/${studentId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to delete student');
  }
  return response.json();
}



