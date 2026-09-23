import { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Shield, Users, Settings, BarChart3, LogOut, Plus, Trash2, Award, 
  AlertTriangle, Search, AlertCircle, Save, CheckCircle, Calendar, 
  Folder, FolderOpen, Upload, FileSpreadsheet, ArrowLeft, Eye, Check,
  MapPinned, Key, Copy, ChevronDown, ChevronUp, UserPlus, Edit3, X, XCircle
} from 'lucide-react';
import { 
  getEvaluators, saveEvaluator, updateUser, deleteEvaluator, getAgeGroups, 
  getStudents, getAttendance, saveAttendance, StudentWithBelt, User, AgeGroupConfig, 
  createExam, activateExam, uploadStudentsCSV, getExamStudents, Exam,
  Court, CourtEvaluatorCreate,
  createCourt, getExamCourts, deleteCourt, getUnassignedStudents, updateStudentAge,
  updateCourtAgeRange, updateStudentFull, deleteStudent,
  getBelts, Belt, createManualStudent, deleteExam, getBeltStyle
} from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useEvaluation } from '../contexts/EvaluationContext';
import ResultsSummary from './ResultsSummary';

export default function AdminView() {
  const [evaluators, setEvaluators] = useState<User[]>([]);
  const [, setAgeGroups] = useState<AgeGroupConfig[]>([]);
  const [, setStudents] = useState<StudentWithBelt[]>([]);
  const [belts, setBelts] = useState<Belt[]>([]);
  const [attendance, setAttendance] = useState<Map<string, boolean>>(new Map());
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const { logout } = useAuth();
  
  // Evaluation Context hooks
  const { activeExam, exams, loadExams, refreshEvaluations, calculateAverage } = useEvaluation();
  const [selectedExamId, setSelectedExamId] = useState<string>('');

  // Evaluator / User Form State
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'evaluador' | 'lista'>('evaluador');
  const [newAgeGroup] = useState('pre-infantiles');
  const [selectedUserCourtId, setSelectedUserCourtId] = useState<string>('');

  // Exam Form State
  const [newExamName, setNewExamName] = useState('');
  const [newExamDate, setNewExamDate] = useState(new Date().toISOString().split('T')[0]);

  // CSV & Exam Folders State
  const [selectedFolderExam, setSelectedFolderExam] = useState<Exam | null>(null);
  const [examSubTab, setExamSubTab] = useState<'planilla' | 'canchas' | 'evaluadores' | 'resultados'>('planilla');
  const [folderStudents, setFolderStudents] = useState<StudentWithBelt[]>([]);
  const [loadingFolderStudents, setLoadingFolderStudents] = useState(false);
  const [folderSearchQuery, setFolderSearchQuery] = useState('');
  
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadExamTargetId, setUploadExamTargetId] = useState<string>('');
  const [uploadSummary, setUploadSummary] = useState<{
    imported_count: number;
    updated_count: number;
    skipped_count: number;
    message: string;
    details?: string[];
  } | null>(null);

  // Manual Student Creation State
  const [showAddManualStudent, setShowAddManualStudent] = useState(false);
  const [manualFirstName, setManualFirstName] = useState('');
  const [manualLastName, setManualLastName] = useState('');
  const [manualBeltId, setManualBeltId] = useState('');
  const [manualAge, setManualAge] = useState('');
  const [manualBirthDate, setManualBirthDate] = useState('');
  const [manualRut, setManualRut] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualSede, setManualSede] = useState('');
  const [manualProfesor, setManualProfesor] = useState('');

  // --- COURT STATE ---
  const [courts, setCourts] = useState<Court[]>([]);
  const [unassignedStudents, setUnassignedStudents] = useState<StudentWithBelt[]>([]);
  const [editingCourtRanges, setEditingCourtRanges] = useState<{ [courtId: string]: { min_age: number; max_age: number; name: string; allowed_belts: string[] } }>({});
  const [loadingCourts, setLoadingCourts] = useState(false);
  const [showCreateCourt, setShowCreateCourt] = useState(false);
  const [courtName, setCourtName] = useState('');
  const [courtMinAge, setCourtMinAge] = useState(2);
  const [courtMaxAge, setCourtMaxAge] = useState(8);
  const [courtNumEvaluators, setCourtNumEvaluators] = useState(2);
  const [courtAllowedBelts, setCourtAllowedBelts] = useState<string[]>([]);
  const [courtEvaluators, setCourtEvaluators] = useState<CourtEvaluatorCreate[]>([]);
  const [expandedCourtId, setExpandedCourtId] = useState<string | null>(null);
  const [editingAgeStudentId, setEditingAgeStudentId] = useState<string | null>(null);
  const [editAgeValue, setEditAgeValue] = useState<number>(0);
  const [copiedCredential, setCopiedCredential] = useState<string | null>(null);
  const [createdCourtCredentials, setCreatedCourtCredentials] = useState<Court | null>(null);


  // Full Student Edit State
  const [editingStudent, setEditingStudent] = useState<StudentWithBelt | null>(null);
  const [editStudentForm, setEditStudentForm] = useState<{
    first_name: string;
    last_name: string;
    rut: string;
    belt_id: string;
    age: string | number;
    sede: string;
    profesor: string;
    email: string;
  }>({
    first_name: '',
    last_name: '',
    rut: '',
    belt_id: '',
    age: '',
    sede: '',
    profesor: '',
    email: ''
  });

  const startEditingStudent = (student: StudentWithBelt) => {
    setEditingStudent(student);
    setEditStudentForm({
      first_name: student.first_name || '',
      last_name: student.last_name || '',
      rut: student.rut || '',
      belt_id: student.belt_id || (student.belts?.id || ''),
      age: student.age !== null && student.age !== undefined ? student.age : '',
      sede: student.sede || '',
      profesor: student.profesor || '',
      email: student.email || ''
    });
  };

  const handleSaveStudentEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    setActionLoading(true);
    try {
      await updateStudentFull(editingStudent.id, {
        first_name: editStudentForm.first_name,
        last_name: editStudentForm.last_name,
        rut: editStudentForm.rut,
        belt_id: editStudentForm.belt_id,
        age: editStudentForm.age === '' ? undefined : Number(editStudentForm.age),
        sede: editStudentForm.sede,
        profesor: editStudentForm.profesor,
        email: editStudentForm.email
      });
      showSuccess(`Datos de ${editStudentForm.first_name} ${editStudentForm.last_name} actualizados correctamente.`);
      setEditingStudent(null);
      if (selectedFolderExam) {
        await loadCourtsForExam(selectedFolderExam.id);
        const examStus = await getExamStudents(selectedFolderExam.id);
        setFolderStudents(examStus);
      }
    } catch (err) {
      console.error(err);
      alert('Error al actualizar datos del alumno');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteStudent = async (studentId: string, studentName: string) => {
    if (!confirm(`¿Estás seguro de eliminar a ${studentName}?`)) return;
    setActionLoading(true);
    try {
      await deleteStudent(studentId);
      showSuccess(`Alumno ${studentName} eliminado.`);
      if (selectedFolderExam) {
        await loadCourtsForExam(selectedFolderExam.id);
        const examStus = await getExamStudents(selectedFolderExam.id);
        setFolderStudents(examStus);
      }
    } catch (err) {
      alert('Error al eliminar alumno');
    } finally {
      setActionLoading(false);
    }
  };

  // Initial Load
  useEffect(() => {
    loadAllData();
  }, []);

  // Sync selectedExamId when activeExam loads
  useEffect(() => {
    if (activeExam && !selectedExamId) {
      setSelectedExamId(activeExam.id);
    }
  }, [activeExam, selectedExamId]);

  // Reload evaluations & attendance when selectedExamId changes
  useEffect(() => {
    if (selectedExamId) {
      refreshEvaluations(selectedExamId);
      loadAttendanceForExam(selectedExamId);
    }
  }, [selectedExamId, refreshEvaluations]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [evalsData, ageGroupsData, studentsData, beltsData] = await Promise.all([
        getEvaluators(),
        getAgeGroups(),
        getStudents('last_name'),
        getBelts(),
      ]);

      setEvaluators(evalsData);
      setAgeGroups(ageGroupsData);
      setStudents(studentsData);
      setBelts(beltsData);
      if (beltsData.length > 0 && !manualBeltId) {
        setManualBeltId(beltsData[0].id);
      }
    } catch (err) {
      console.error('Error loading admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAttendanceForExam = async (examId: string) => {
    try {
      const attendanceData = await getAttendance(new Date().toISOString().split('T')[0], examId);
      const attMap = new Map<string, boolean>();
      if (attendanceData) {
        attendanceData.forEach((a) => attMap.set(a.student_id, a.present));
      }
      setAttendance(attMap);
    } catch (err) {
      console.error('Error loading attendance for exam:', err);
    }
  };

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 5000);
  };

  const handleCreateEvaluator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newPassword) return;
    setActionLoading(true);
    try {
      await saveEvaluator({
        password: newPassword,
        name: newName,
        role: newRole,
        age_group: newAgeGroup,
        court_id: selectedUserCourtId || undefined
      });
      const [evs, crts] = await Promise.all([
        getEvaluators().catch(() => []),
        selectedFolderExam ? getExamCourts(selectedFolderExam.id).catch(() => []) : Promise.resolve([])
      ]);
      setEvaluators(evs);
      setCourts(crts);
      setNewName('');
      setNewPassword('');
      setSelectedUserCourtId('');
      showSuccess(newRole === 'lista' ? 'Juez de Piso creado con éxito y asignado a su cancha' : 'Evaluador creado con éxito');
    } catch (err: any) {
      alert(err.message || 'Error al crear usuario');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignCourtToUser = async (userId: string, courtId: string) => {
    setActionLoading(true);
    try {
      await updateUser(userId, { court_id: courtId || null });
      const targetExamId = selectedFolderExam?.id || selectedExamId || activeExam?.id;
      const [evs, crts] = await Promise.all([
        getEvaluators().catch(() => []),
        targetExamId ? getExamCourts(targetExamId).catch(() => []) : Promise.resolve([])
      ]);
      setEvaluators(evs);
      setCourts(crts);
      showSuccess('Cancha asignada al usuario correctamente');
    } catch (err: any) {
      alert(err.message || 'Error al asignar cancha al usuario');
    } finally {
      setActionLoading(false);
    }
  };

  const toggleStudentAttendance = async (studentId: string, present: boolean) => {
    const targetExamId = selectedExamId || activeExam?.id;
    if (!targetExamId) return;
    setAttendance(prev => {
      const newMap = new Map(prev);
      newMap.set(studentId, present);
      return newMap;
    });

    try {
      await saveAttendance(studentId, new Date().toISOString().split('T')[0], present, targetExamId);
      showSuccess(present ? 'Alumno marcado como Presente (aparece en evaluador)' : 'Alumno marcado como Ausente (oculto de evaluador)');
    } catch (err) {
      console.error('Error saving attendance from Admin:', err);
      alert('Error al actualizar asistencia del alumno');
    }
  };

  const handleDeleteEvaluator = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este evaluador?')) return;
    setActionLoading(true);
    try {
      await deleteEvaluator(id);
      setEvaluators(prev => prev.filter(e => e.id !== id));
      showSuccess('Evaluador eliminado con éxito');
    } catch (err) {
      console.error(err);
      alert('Error al eliminar evaluador');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExamName || !newExamDate) return;
    setActionLoading(true);
    try {
      const newEx = await createExam(newExamName, newExamDate);
      await loadExams(); // Reload exams list in context
      setSelectedExamId(newEx.id);

      // If a file was selected during exam creation, upload CSV to this new exam!
      if (uploadFile) {
        const res = await uploadStudentsCSV(uploadFile, newEx.id);
        setUploadSummary(res);
        setUploadFile(null);
        showSuccess(`Examen "${newEx.name}" creado e importados ${res.imported_count} alumnos.`);
      } else {
        showSuccess(`Examen "${newEx.name}" creado con éxito.`);
      }

      setNewExamName('');
      await loadAllData();
      await handleOpenExamFolder(newEx);
    } catch (err: any) {
      alert(err.message || 'Error al crear examen');
    } finally {
      setActionLoading(false);
    }
  };

  const handleActivateExam = async (id: string) => {
    setActionLoading(true);
    try {
      await activateExam(id);
      await loadExams();
      setSelectedExamId(id);
      showSuccess('Examen activado correctamente');
    } catch (err) {
      console.error(err);
      alert('Error al activar examen');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteExam = async (examId: string, examName: string) => {
    if (!confirm(`¿Estás seguro de eliminar el examen "${examName}"? Se borrarán sus canchas y registros asociados.`)) return;
    setActionLoading(true);
    try {
      await deleteExam(examId);
      await loadExams();
      if (selectedFolderExam?.id === examId) {
        setSelectedFolderExam(null);
      }
      await loadAllData();
      showSuccess(`Examen "${examName}" eliminado correctamente.`);
    } catch (err: any) {
      alert(err.message || 'Error al eliminar examen');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUploadCSV = async (e: React.FormEvent, targetExamId?: string) => {
    e.preventDefault();
    if (!uploadFile) {
      alert('Por favor selecciona un archivo CSV primero.');
      return;
    }
    setActionLoading(true);
    setUploadSummary(null);
    try {
      const examIdToUse = targetExamId || uploadExamTargetId || selectedFolderExam?.id || selectedExamId;
      const res = await uploadStudentsCSV(uploadFile, examIdToUse);
      setUploadSummary(res);
      showSuccess(`¡Planilla procesada con éxito! ${res.imported_count} nuevos alumnos, ${res.updated_count} actualizados.`);
      setUploadFile(null);
      await loadAllData();
      if (selectedFolderExam) {
        await handleOpenExamFolder(selectedFolderExam);
      }
    } catch (err: any) {
      alert(err.message || 'Error al procesar archivo CSV');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateManualStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualFirstName || !manualLastName) {
      alert('Nombre y apellido son requeridos.');
      return;
    }
    if (!selectedFolderExam) return;

    setActionLoading(true);
    try {
      const selectedBelt = manualBeltId || (belts.length > 0 ? belts[0].id : '');
      const newStu = await createManualStudent({
        first_name: manualFirstName,
        last_name: manualLastName,
        belt_id: selectedBelt,
        age: manualAge ? parseInt(manualAge) : undefined,
        birth_date: manualBirthDate || undefined,
        rut: manualRut || undefined,
        email: manualEmail || undefined,
        sede: manualSede || undefined,
        profesor: manualProfesor || undefined,
        exam_id: selectedFolderExam.id
      });

      showSuccess(`Alumno "${newStu.first_name} ${newStu.last_name}" agregado correctamente. Se actualizó la planilla de todos y su asignación de cancha.`);
      
      // Reset form
      setManualFirstName('');
      setManualLastName('');
      setManualAge('');
      setManualBirthDate('');
      setManualRut('');
      setManualEmail('');
      setManualSede('');
      setManualProfesor('');
      setShowAddManualStudent(false);

      // Reload folder data, courts & global data
      const examStus = await getExamStudents(selectedFolderExam.id);
      setFolderStudents(examStus);
      await loadCourtsForExam(selectedFolderExam.id);
      await loadAllData();
    } catch (err: any) {
      alert(err.message || 'Error al agregar alumno');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenExamFolder = async (exam: Exam) => {
    setSelectedFolderExam(exam);
    setSelectedExamId(exam.id);
    setExamSubTab('planilla');
    setLoadingFolderStudents(true);
    try {
      const examStus = await getExamStudents(exam.id);
      setFolderStudents(examStus);
    } catch (err) {
      console.error('Error al cargar alumnos de la carpeta:', err);
    } finally {
      setLoadingFolderStudents(false);
    }
    // Also load courts
    loadCourtsForExam(exam.id);
  };

  const loadCourtsForExam = async (examId: string) => {
    setLoadingCourts(true);
    try {
      const [courtsData, unassignedData] = await Promise.all([
        getExamCourts(examId),
        getUnassignedStudents(examId)
      ]);
      setCourts(courtsData);
      setUnassignedStudents(unassignedData);
      const initialRanges: { [id: string]: { min_age: number; max_age: number; name: string; allowed_belts: string[] } } = {};
      courtsData.forEach(c => {
        initialRanges[c.id] = { min_age: c.min_age, max_age: c.max_age, name: c.name, allowed_belts: c.allowed_belts || [] };
      });
      setEditingCourtRanges(initialRanges);
    } catch (err) {
      console.error('Error al cargar canchas:', err);
    } finally {
      setLoadingCourts(false);
    }
  };

  const handleSaveCourtRange = async (courtId: string) => {
    const range = editingCourtRanges[courtId];
    if (!range) return;
    if (range.min_age > range.max_age) {
      alert('La edad mínima no puede ser mayor a la edad máxima.');
      return;
    }
    setActionLoading(true);
    try {
      await updateCourtAgeRange(courtId, range.min_age, range.max_age, range.name, range.allowed_belts);
      showSuccess(`Cancha "${range.name}" actualizada con éxito.`);
      if (selectedFolderExam) {
        await loadCourtsForExam(selectedFolderExam.id);
      }
    } catch (err: any) {
      alert(err.message || 'Error al actualizar rango de la cancha');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveAllCourtRanges = async () => {
    if (courts.length === 0) return;
    setActionLoading(true);
    try {
      for (const court of courts) {
        const range = editingCourtRanges[court.id];
        if (range) {
          await updateCourtAgeRange(court.id, range.min_age, range.max_age, range.name, range.allowed_belts);
        }
      }
      showSuccess('Canchas actualizadas y alumnos reclasificados con éxito.');
      if (selectedFolderExam) {
        await loadCourtsForExam(selectedFolderExam.id);
      }
    } catch (err: any) {
      alert(err.message || 'Error al actualizar canchas');
    } finally {
      setActionLoading(false);
    }
  };

  // Sync evaluator form fields when num_evaluators changes
  useEffect(() => {
    setCourtEvaluators(
      Array.from({ length: courtNumEvaluators }, (_, i) => ({
        email: '',
        password: '',
        name: `Evaluador ${i + 1}`
      }))
    );
  }, [courtNumEvaluators]);

  const handleCreateCourt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFolderExam) return;
    const missingFields = courtEvaluators.some(ev => !ev.name || !ev.password);
    if (missingFields) {
      alert('Completa el nombre y contraseña para todos los evaluadores.');
      return;
    }
    setActionLoading(true);
    try {
      const newCourt = await createCourt(selectedFolderExam.id, {
        name: courtName,
        min_age: courtMinAge,
        max_age: courtMaxAge,
        num_evaluators: courtNumEvaluators,
        allowed_belts: courtAllowedBelts,
        evaluators: courtEvaluators
      });
      setCreatedCourtCredentials(newCourt);
      showSuccess(`Cancha "${newCourt.name}" creada con ${newCourt.evaluators.length} evaluador(es).`);
      setShowCreateCourt(false);
      setCourtName('');
      setCourtMinAge(2);
      setCourtMaxAge(8);
      setCourtNumEvaluators(2);
      setCourtAllowedBelts([]);
      await loadCourtsForExam(selectedFolderExam.id);
    } catch (err: any) {
      alert(err.message || 'Error al crear cancha');
    } finally {
      setActionLoading(false);
    }
  };


  const handleDeleteCourt = async (courtId: string) => {
    if (!confirm('¿Eliminar esta cancha? Se desvinculan los evaluadores.')) return;
    setActionLoading(true);
    try {
      await deleteCourt(courtId);
      if (selectedFolderExam) await loadCourtsForExam(selectedFolderExam.id);
      showSuccess('Cancha eliminada.');
    } catch (err) {
      alert('Error al eliminar cancha');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateStudentAge = async (studentId: string) => {
    setActionLoading(true);
    try {
      await updateStudentAge(studentId, editAgeValue);
      setEditingAgeStudentId(null);
      if (selectedFolderExam) {
        await loadCourtsForExam(selectedFolderExam.id);
        const examStus = await getExamStudents(selectedFolderExam.id);
        setFolderStudents(examStus);
      }
      showSuccess('Edad actualizada.');
    } catch (err) {
      alert('Error al actualizar edad');
    } finally {
      setActionLoading(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCredential(id);
    setTimeout(() => setCopiedCredential(null), 2000);
  };

  const sortStudentsByBelt = useCallback((stus: StudentWithBelt[]) => {
    return [...stus].sort((a, b) => {
      const orderA = a.belts?.order_index ?? 999;
      const orderB = b.belts?.order_index ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      const nameA = `${a.last_name || ''} ${a.first_name || ''}`.toLowerCase();
      const nameB = `${b.last_name || ''} ${b.first_name || ''}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, []);

  const filteredFolderStudents = useMemo(() => {
    let list = folderStudents;
    if (folderSearchQuery) {
      const q = folderSearchQuery.toLowerCase();
      list = folderStudents.filter(s =>
        s.first_name.toLowerCase().includes(q) ||
        s.last_name.toLowerCase().includes(q) ||
        (s.rut && s.rut.toLowerCase().includes(q)) ||
        (s.sede && s.sede.toLowerCase().includes(q)) ||
        (s.profesor && s.profesor.toLowerCase().includes(q)) ||
        (s.belts && s.belts.name.toLowerCase().includes(q))
      );
    }
    return sortStudentsByBelt(list);
  }, [folderStudents, folderSearchQuery, sortStudentsByBelt]);

  const beltCounts = useMemo(() => {
    const map = new Map<string, { name: string; color: string; order_index: number; count: number }>();
    
    belts.forEach(b => {
      map.set(b.id, { name: b.name, color: b.color, order_index: b.order_index, count: 0 });
    });

    folderStudents.forEach(s => {
      if (s.belt_id && map.has(s.belt_id)) {
        map.get(s.belt_id)!.count += 1;
      } else if (s.belts) {
        if (!map.has(s.belts.id)) {
          map.set(s.belts.id, { name: s.belts.name, color: s.belts.color, order_index: s.belts.order_index, count: 0 });
        }
        map.get(s.belts.id)!.count += 1;
      }
    });

    return Array.from(map.values())
      .filter(item => item.count > 0)
      .sort((a, b) => a.order_index - b.order_index);
  }, [belts, folderStudents]);

  const getStudentBadge = (avg: number) => {
    if (avg >= 4.5) return { label: 'Destacado', bg: 'bg-blue-500/20 text-blue-400 border-blue-500/30' };
    if (avg >= 3.5) return { label: 'Logrado', bg: 'bg-green-500/20 text-green-400 border-green-500/30' };
    if (avg >= 2.5) return { label: 'Suficiente', bg: 'bg-amber-500/20 text-amber-400 border-amber-500/30' };
    if (avg >= 1.5) return { label: 'Por mejorar', bg: 'bg-orange-500/20 text-orange-400 border-orange-500/30' };
    return { label: 'Insuficiente', bg: 'bg-red-500/20 text-red-400 border-red-500/30' };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      {/* Top Header */}
      <header className="bg-slate-800 border-b border-slate-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-amber-500 to-orange-500 rounded-xl shadow-lg shadow-amber-500/20">
              <Shield className="w-6 h-6 text-slate-950 font-bold" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-wide">Panel de Administración</h1>
              <p className="text-xs text-slate-400">Gestión de Evaluadores, Exámenes y Planillas CSV</p>
            </div>
          </div>

          <button
            onClick={logout}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700/50 hover:bg-red-500/20 text-slate-300 hover:text-red-400 border border-slate-600 hover:border-red-500/30 rounded-xl text-xs font-semibold transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </header>

      {/* Tabs Subheader */}
      <div className="bg-slate-850 border-b border-slate-750 px-6 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-between overflow-x-auto gap-3">
          {selectedFolderExam ? (
            <div className="flex items-center gap-2 overflow-x-auto">
              <button
                onClick={() => setSelectedFolderExam(null)}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-750 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all border border-slate-650 mr-2 shrink-0"
              >
                <ArrowLeft className="w-4 h-4 text-amber-400" />
                <span>Volver a Exámenes</span>
              </button>

              <button
                onClick={() => setExamSubTab('planilla')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs transition-all whitespace-nowrap ${
                  examSubTab === 'planilla'
                    ? 'bg-amber-500/10 border border-amber-500/40 text-amber-400 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Planilla de Alumnos</span>
              </button>

              <button
                onClick={() => setExamSubTab('canchas')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs transition-all whitespace-nowrap ${
                  examSubTab === 'canchas'
                    ? 'bg-amber-500/10 border border-amber-500/40 text-amber-400 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <MapPinned className="w-4 h-4" />
                <span>Canchas & Rangos de Edad</span>
              </button>

              <button
                onClick={() => setExamSubTab('evaluadores')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs transition-all whitespace-nowrap ${
                  examSubTab === 'evaluadores'
                    ? 'bg-amber-500/10 border border-amber-500/40 text-amber-400 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Evaluadores</span>
              </button>

              <button
                onClick={() => setExamSubTab('resultados')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs transition-all whitespace-nowrap ${
                  examSubTab === 'resultados'
                    ? 'bg-amber-500/10 border border-amber-500/40 text-amber-400 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                <span>Resultados del Examen</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 py-1">
              <div className="flex items-center gap-2 px-4 py-2 text-amber-400 font-bold text-xs bg-amber-500/10 border border-amber-500/30 rounded-xl">
                <Folder className="w-4 h-4" />
                <span>Carpetas de Exámenes</span>
              </div>
              <span className="text-xs text-slate-400 ml-2 hidden sm:inline">
                Selecciona una carpeta para administrar sus planillas, canchas, evaluadores y resultados.
              </span>
            </div>
          )}

          {selectedFolderExam && (
            <div className="hidden lg:flex items-center gap-2 text-xs font-bold text-slate-300 bg-slate-800 px-3.5 py-2 rounded-xl border border-slate-700 shrink-0">
              <FolderOpen className="w-4 h-4 text-amber-400" />
              <span className="truncate max-w-[200px]">{selectedFolderExam.name}</span>
            </div>
          )}
        </div>
      </div>

      {/* Notification Toast */}
      {successMsg && (
        <div className="bg-green-500/20 border border-green-500/30 text-green-400 px-6 py-3 flex items-center justify-center gap-2 max-w-7xl mx-auto mt-4 rounded-xl transition-all shadow-lg">
          <CheckCircle className="w-5 h-5" />
          <span className="text-sm font-semibold">{successMsg}</span>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6">
        {selectedFolderExam ? (
          /* DETALLE DE CARPETA DE EXAMEN SELECCIONADA CON PESTAÑAS INTERNAS */
          <div className="space-y-6">
            {/* Folder Header Card */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl gap-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setSelectedFolderExam(null)}
                  className="p-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-all flex items-center gap-2 text-xs font-bold"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Volver a Carpetas</span>
                </button>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <FolderOpen className="w-6 h-6 text-amber-400" />
                    <h2 className="text-xl font-bold text-white">Carpeta: {selectedFolderExam.name}</h2>
                    {selectedFolderExam.is_active && (
                      <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs px-2.5 py-0.5 rounded-full font-bold uppercase">
                        Examen Activo
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Fecha de Examen: {selectedFolderExam.date}</p>
                </div>
              </div>

              {/* Actions: Actualizar Base (CSV) & Agregar Alumno a Mano & Eliminar */}
              <div className="flex items-center gap-3 flex-wrap">
                <form onSubmit={(e) => handleUploadCSV(e, selectedFolderExam.id)} className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  <input
                    type="file"
                    accept=".csv, .txt"
                    id="folder-csv-input"
                    onChange={e => setUploadFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  <label
                    htmlFor="folder-csv-input"
                    className="cursor-pointer bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-200 px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all"
                    title="Seleccionar un archivo CSV modificado para actualizar este examen"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                    <span className="truncate max-w-[130px]">
                      {uploadFile ? uploadFile.name : 'Seleccionar CSV'}
                    </span>
                  </label>
                  <button
                    type="submit"
                    disabled={!uploadFile || actionLoading}
                    className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-lg disabled:opacity-50 transition-all"
                    title="Actualizar base de datos del examen con el nuevo CSV"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Actualizar Base (CSV)</span>
                  </button>
                </form>

                <button
                  onClick={() => setShowAddManualStudent(prev => !prev)}
                  className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-lg transition-all"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{showAddManualStudent ? 'Cancelar' : 'Agregar Alumno Manual'}</span>
                </button>

                <button
                  onClick={() => handleDeleteExam(selectedFolderExam.id, selectedFolderExam.name)}
                  disabled={actionLoading}
                  className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 hover:border-red-500/50 font-bold px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-all"
                  title="Eliminar esta carpeta de examen"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Eliminar Examen</span>
                </button>
              </div>
            </div>

            {/* Manual Add Student Form */}
            {showAddManualStudent && (
              <form onSubmit={handleCreateManualStudent} className="bg-slate-800 border border-amber-500/40 rounded-2xl p-6 shadow-xl space-y-5 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-amber-400" />
                    Agregar Alumno Manualmente al Examen
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowAddManualStudent(false)}
                    className="text-slate-400 hover:text-white p-1"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <p className="text-xs text-slate-400">
                  Ingresa los datos de la persona. Se asignará automáticamente a su grupo/cancha según su edad y se actualizará la planilla general.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Nombre *</label>
                    <input
                      type="text"
                      required
                      value={manualFirstName}
                      onChange={e => setManualFirstName(e.target.value)}
                      placeholder="Ej. Matías"
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Apellido *</label>
                    <input
                      type="text"
                      required
                      value={manualLastName}
                      onChange={e => setManualLastName(e.target.value)}
                      placeholder="Ej. González"
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Cinturón</label>
                    <select
                      value={manualBeltId}
                      onChange={e => setManualBeltId(e.target.value)}
                      className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm cursor-pointer"
                    >
                      {belts.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Edad (Años)</label>
                    <input
                      type="number"
                      min="0"
                      max="99"
                      value={manualAge}
                      onChange={e => setManualAge(e.target.value)}
                      placeholder="Ej. 10"
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Fecha de Nacimiento (Opcional)</label>
                    <input
                      type="date"
                      value={manualBirthDate}
                      onChange={e => setManualBirthDate(e.target.value)}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">RUT (Opcional)</label>
                    <input
                      type="text"
                      value={manualRut}
                      onChange={e => setManualRut(e.target.value)}
                      placeholder="12.345.678-9"
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Sede (Opcional)</label>
                    <input
                      type="text"
                      value={manualSede}
                      onChange={e => setManualSede(e.target.value)}
                      placeholder="Ej. Sede Central"
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Profesor (Opcional)</label>
                    <input
                      type="text"
                      value={manualProfesor}
                      onChange={e => setManualProfesor(e.target.value)}
                      placeholder="Ej. Prof. Carlos"
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Correo (Opcional)</label>
                    <input
                      type="email"
                      value={manualEmail}
                      onChange={e => setManualEmail(e.target.value)}
                      placeholder="alumno@ejemplo.com"
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddManualStudent(false)}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-xs font-bold transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 rounded-xl text-xs font-bold shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Guardar y Asignar Alumno</span>
                  </button>
                </div>
              </form>
            )}

            {/* Upload summary feedback if any */}
            {uploadSummary && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5 text-emerald-300 space-y-2">
                <h4 className="font-bold flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-emerald-400" />
                  {uploadSummary.message}
                </h4>
                <p className="text-xs text-emerald-200">
                  Total procesados: <strong>{uploadSummary.imported_count + uploadSummary.updated_count}</strong> alumnos (Nuevos: {uploadSummary.imported_count}, Actualizados: {uploadSummary.updated_count}).
                </p>
              </div>
            )}

            {/* ================= PESTAÑA: PLANILLA DE ALUMNOS ================= */}
            {examSubTab === 'planilla' && (
              <div className="space-y-6">
                {/* Belt Grade Breakdown Counter Bar */}
                {beltCounts.length > 0 && (
                  <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5 shadow-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                        <Award className="w-4 h-4 text-amber-400" />
                        Alumnos por Grado / Cinturón
                      </h3>
                      <span className="text-xs text-slate-400 font-semibold">
                        Total: <strong className="text-amber-400 font-bold">{folderStudents.length}</strong> inscritos
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      {beltCounts.map((item) => {
                        const bs = getBeltStyle({ name: item.name, color: item.color });
                        return (
                          <div
                            key={item.name}
                            className="flex items-center gap-2 bg-slate-750 border border-slate-650 px-3 py-1.5 rounded-xl text-xs shadow-sm hover:border-slate-500 transition-all"
                          >
                            <div className={`w-3 h-3 rounded-full ${bs.className}`} style={bs.style} />
                            <span className="font-semibold text-slate-200">{item.name}:</span>
                            <span className="font-extrabold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20 text-xs">
                              {item.count}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Search Bar inside Folder */}
                <div className="bg-slate-800 rounded-2xl border border-slate-700 p-4 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="relative w-full sm:w-80">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={folderSearchQuery}
                      onChange={e => setFolderSearchQuery(e.target.value)}
                      placeholder="Buscar por Nombre, RUT, Sede, Profesor..."
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-xl pl-10 pr-4 py-2 text-white text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div className="text-xs text-slate-400 font-semibold">
                    Alumnos en este examen: <span className="text-amber-400 font-bold">{filteredFolderStudents.length}</span>
                  </div>
                </div>

                {/* Students Table in Folder */}
                <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 shadow-xl overflow-x-auto">
                  {loadingFolderStudents ? (
                    <div className="text-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-4 border-amber-500 border-t-transparent mx-auto mb-2" />
                      <p className="text-xs text-slate-400">Cargando alumnos del examen...</p>
                    </div>
                  ) : filteredFolderStudents.length > 0 ? (
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-700 text-slate-400 font-bold uppercase tracking-wider">
                          <th className="pb-3">Alumno / RUT</th>
                          <th className="pb-3">Cinturón</th>
                          <th className="pb-3">Grupo / Edad</th>
                          <th className="pb-3">Sede</th>
                          <th className="pb-3">Profesor</th>
                          <th className="pb-3">Correo</th>
                          <th className="pb-3 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700/50">
                        {filteredFolderStudents.map(student => (
                          <tr key={student.id} className="hover:bg-slate-700/20 transition-all">
                            <td className="py-3.5 font-bold text-white">
                              <div>{student.first_name} {student.last_name}</div>
                              {student.rut && <span className="text-[10px] text-slate-400 font-normal">RUT: {student.rut}</span>}
                            </td>
                            <td className="py-3.5">
                              {(() => {
                                const bs = getBeltStyle(student.belts);
                                return (
                                  <div className="flex items-center gap-2">
                                    <div className={`w-3 h-3 rounded-full ${bs.className}`} style={bs.style} />
                                    <span className="font-semibold text-slate-200">{student.belts?.name || 'Blanco'}</span>
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="py-3.5">
                              <span className="capitalize font-semibold text-amber-400">{student.age_group || 'Sin grupo'}</span>
                              {student.age !== null && <span className="text-slate-400 font-normal"> ({student.age} años)</span>}
                            </td>
                            <td className="py-3.5 text-slate-300">{student.sede || '-'}</td>
                            <td className="py-3.5 text-slate-300">{student.profesor || '-'}</td>
                            <td className="py-3.5 text-slate-400">{student.email || '-'}</td>
                            <td className="py-3.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => startEditingStudent(student)}
                                  className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-semibold transition-all"
                                  title="Editar cualquier dato del alumno"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                  <span>Editar</span>
                                </button>
                                <button
                                  onClick={() => handleDeleteStudent(student.id, `${student.first_name} ${student.last_name}`)}
                                  className="p-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg transition-all"
                                  title="Eliminar alumno"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="text-center py-12 text-slate-400 bg-slate-700/10 rounded-xl">
                      No hay alumnos inscritos en esta carpeta de examen. Suba un archivo CSV arriba para asociar alumnos.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ================= PESTAÑA: CANCHAS Y RANGOS DE EDAD ================= */}
            {examSubTab === 'canchas' && (
              <div className="space-y-6">
                {/* 1. SECCIÓN CONFIGURACIÓN RANGOS DE EDAD POR CANCHA */}
                <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 shadow-xl space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <Settings className="w-5 h-5 text-amber-400" />
                        Configuración de Rangos de Edad por Cancha
                      </h2>
                      <p className="text-xs text-slate-400 mt-1">
                        Ajusta los límites de edad (mínima y máxima) para cada cancha de este examen. Al guardar, los alumnos serán reclasificados automáticamente en sus canchas correspondientes.
                      </p>
                    </div>
                    {courts.length > 0 && (
                      <button
                        onClick={handleSaveAllCourtRanges}
                        disabled={actionLoading}
                        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-bold rounded-xl text-xs shadow-lg hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 transition-all shrink-0"
                      >
                        <Save className="w-4 h-4" />
                        <span>Guardar Todos los Rangos</span>
                      </button>
                    )}
                  </div>

                  {courts.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                      {courts.map(court => {
                        const range = editingCourtRanges[court.id] || { min_age: court.min_age, max_age: court.max_age, name: court.name };
                        return (
                          <div key={court.id} className="bg-slate-750 border border-slate-700 rounded-xl p-4 space-y-3 shadow-md">
                            <div className="flex items-center justify-between gap-2">
                              <input
                                type="text"
                                value={range.name}
                                onChange={e => setEditingCourtRanges(prev => ({
                                  ...prev,
                                  [court.id]: { ...range, name: e.target.value }
                                }))}
                                className="font-bold text-white text-sm bg-slate-700/60 border border-slate-600 rounded-lg px-2.5 py-1 w-full focus:outline-none focus:ring-2 focus:ring-amber-500"
                                placeholder="Nombre Cancha"
                              />
                              <span className="text-[10px] text-amber-400 font-semibold bg-amber-400/10 px-2.5 py-1 rounded-full border border-amber-400/25 shrink-0">
                                {court.students.length} alumnos
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">Edad Mínima</label>
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={range.min_age}
                                  onChange={e => setEditingCourtRanges(prev => ({
                                    ...prev,
                                    [court.id]: { ...range, min_age: parseInt(e.target.value) || 0 }
                                  }))}
                                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">Edad Máxima</label>
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={range.max_age}
                                  onChange={e => setEditingCourtRanges(prev => ({
                                    ...prev,
                                    [court.id]: { ...range, max_age: parseInt(e.target.value) || 0 }
                                  }))}
                                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">Cinturones Permitidos</label>
                              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-1.5 bg-slate-800/80 border border-slate-700 rounded-lg">
                                {belts.map(b => {
                                  const isSel = (range.allowed_belts || []).includes(b.name);
                                  return (
                                    <button
                                      type="button"
                                      key={b.id}
                                      onClick={() => {
                                        const current = range.allowed_belts || [];
                                        const next = isSel ? current.filter(n => n !== b.name) : [...current, b.name];
                                        setEditingCourtRanges(prev => ({
                                          ...prev,
                                          [court.id]: { ...range, allowed_belts: next }
                                        }));
                                      }}
                                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                                        isSel ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-700/60 text-slate-400 hover:text-white'
                                      }`}
                                    >
                                      {b.name}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>


                            <button
                              onClick={() => handleSaveCourtRange(court.id)}
                              disabled={actionLoading}
                              className="w-full flex items-center justify-center gap-1.5 py-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-bold rounded-lg text-xs border border-amber-500/30 transition-all shadow"
                            >
                              <Save className="w-3.5 h-3.5" />
                              <span>Guardar Rango de {court.name}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="bg-slate-700/20 border border-slate-700 rounded-xl p-5 text-center text-xs text-slate-400 space-y-1">
                      <p className="font-semibold text-slate-300">No hay canchas creadas para este examen aún.</p>
                      <p>Crea una cancha más abajo para definir su rango de edad y evaluadores.</p>
                    </div>
                  )}
                </div>

                {/* 2. SECCIÓN CANCHAS DE EVALUACIÓN */}
                <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 shadow-xl space-y-6">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-violet-500/10 text-violet-400 border border-violet-500/20 rounded-xl">
                        <MapPinned className="w-5 h-5" />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-white">Canchas de Evaluación de este Examen</h2>
                        <p className="text-xs text-slate-400">Define canchas con rango de edad y evaluadores asignados</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowCreateCourt(prev => !prev)}
                      className="flex items-center gap-2 bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-400 hover:to-purple-400 text-white font-bold px-4 py-2.5 rounded-xl text-xs shadow-lg transition-all"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{showCreateCourt ? 'Cancelar' : 'Crear Nueva Cancha'}</span>
                    </button>
                  </div>

                  {/* Create Court Form */}
                  {showCreateCourt && (
                    <form onSubmit={handleCreateCourt} className="bg-slate-700/30 border border-slate-600 rounded-2xl p-6 space-y-5 animate-fadeIn">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <MapPinned className="w-4 h-4 text-violet-400" />
                        Nueva Cancha
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Nombre</label>
                          <input
                            type="text"
                            required
                            value={courtName}
                            onChange={e => setCourtName(e.target.value)}
                            placeholder="Ej. Cancha 1"
                            className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Edad Mínima</label>
                          <input
                            type="number"
                            min={0}
                            max={99}
                            value={courtMinAge}
                            onChange={e => setCourtMinAge(parseInt(e.target.value) || 0)}
                            className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Edad Máxima</label>
                          <input
                            type="number"
                            min={0}
                            max={99}
                            value={courtMaxAge}
                            onChange={e => setCourtMaxAge(parseInt(e.target.value) || 0)}
                            className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Nº Evaluadores</label>
                          <input
                            type="number"
                            min={1}
                            max={10}
                            value={courtNumEvaluators}
                            onChange={e => setCourtNumEvaluators(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm"
                          />
                        </div>
                      </div>

                      {/* Belt selection */}
                      <div className="space-y-2">
                        <label className="block text-xs font-semibold text-slate-400 uppercase">
                          Grupos de Cinturones Permitidos (Opcional - si no seleccionas ninguno, se permiten todos)
                        </label>
                        <div className="flex flex-wrap gap-2 p-3 bg-slate-800/60 border border-slate-700 rounded-xl">
                          <button
                            type="button"
                            onClick={() => setCourtAllowedBelts([])}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                              courtAllowedBelts.length === 0
                                ? 'bg-violet-500 text-white shadow-md'
                                : 'bg-slate-700/60 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                            }`}
                          >
                            Todos los Cinturones
                          </button>
                          {belts.map(b => {
                            const isSelected = courtAllowedBelts.includes(b.name);
                            const bs = getBeltStyle(b);
                            return (
                              <button
                                type="button"
                                key={b.id}
                                onClick={() => {
                                  if (isSelected) {
                                    setCourtAllowedBelts(courtAllowedBelts.filter(n => n !== b.name));
                                  } else {
                                    setCourtAllowedBelts([...courtAllowedBelts, b.name]);
                                  }
                                }}
                                style={bs.style}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 ${
                                  bs.className
                                } ${isSelected ? 'ring-2 ring-violet-400 scale-105 shadow-md' : 'opacity-50 hover:opacity-100'}`}
                              >
                                <span>{b.name}</span>
                                {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Evaluator fields */}

                      <div className="space-y-3">
                        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                          <Key className="w-3.5 h-3.5 text-violet-400" />
                          Credenciales de Evaluadores
                        </h4>
                        {courtEvaluators.map((ev, idx) => (
                          <div key={idx} className="bg-slate-700/40 border border-slate-600/50 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Nombre del Evaluador</label>
                              <input
                                type="text"
                                required
                                value={ev.name}
                                onChange={e => {
                                  const updated = [...courtEvaluators];
                                  updated[idx] = { ...updated[idx], name: e.target.value };
                                  setCourtEvaluators(updated);
                                }}
                                placeholder={`Evaluador ${idx + 1}`}
                                className="w-full bg-slate-800/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Contraseña</label>
                              <input
                                type="text"
                                required
                                value={ev.password}
                                onChange={e => {
                                  const updated = [...courtEvaluators];
                                  updated[idx] = { ...updated[idx], password: e.target.value };
                                  setCourtEvaluators(updated);
                                }}
                                placeholder="contraseña"
                                className="w-full bg-slate-800/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:ring-2 focus:ring-violet-500"
                              />
                            </div>
                          </div>
                        ))}
                      </div>

                      <button
                        type="submit"
                        disabled={actionLoading}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-violet-500 to-purple-500 text-white font-bold rounded-xl shadow-lg hover:from-violet-400 hover:to-purple-400 disabled:opacity-50 transition-all text-sm"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Crear Cancha con Evaluadores</span>
                      </button>
                    </form>
                  )}

                  {/* Credentials modal after creation */}
                  {createdCourtCredentials && (
                    <div className="bg-violet-500/10 border border-violet-500/30 rounded-2xl p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-violet-300 flex items-center gap-2">
                          <Key className="w-4 h-4" />
                          Credenciales generadas para: {createdCourtCredentials.name}
                        </h4>
                        <button onClick={() => setCreatedCourtCredentials(null)} className="text-slate-400 hover:text-white">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid gap-2">
                        {createdCourtCredentials.evaluators.map(ev => (
                          <div key={ev.id} className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 flex items-center justify-between gap-3">
                            <div className="text-xs">
                              <span className="text-white font-bold">{ev.name}</span>
                              <span className="text-slate-400 mx-2">|</span>
                              <span className="text-amber-400 font-mono">Contraseña: {ev.password || '••••'}</span>
                            </div>
                            <button
                              onClick={() => copyToClipboard(`Usuario: ${ev.name} | Contraseña: ${ev.password}`, ev.id)}
                              className="p-1.5 text-slate-400 hover:text-violet-400 hover:bg-violet-500/10 rounded-lg transition-all"
                              title="Copiar credenciales"
                            >
                              {copiedCredential === ev.id ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Courts List */}
                  {loadingCourts ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-4 border-violet-500 border-t-transparent mx-auto mb-2" />
                      <p className="text-xs text-slate-400">Cargando canchas...</p>
                    </div>
                  ) : courts.length > 0 ? (
                    <div className="grid gap-4">
                      {courts.map(court => (
                        <div key={court.id} className="bg-slate-700/20 border border-slate-700 rounded-2xl overflow-hidden transition-all hover:border-violet-500/30">
                          {/* Court Header */}
                          <div
                            onClick={() => setExpandedCourtId(expandedCourtId === court.id ? null : court.id)}
                            className="p-5 flex items-center justify-between cursor-pointer hover:bg-slate-700/30 transition-all"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-violet-500/10 rounded-xl flex items-center justify-center text-violet-400 font-bold">
                                <Users className="w-5 h-5" />
                              </div>
                                <div>
                                  <h3 className="font-bold text-white text-base flex items-center gap-2 flex-wrap">
                                    <span>{court.name}</span>
                                    {court.allowed_belts && court.allowed_belts.length > 0 ? (
                                      <span className="text-[10px] bg-violet-500/20 text-violet-300 font-semibold px-2 py-0.5 rounded-full border border-violet-500/30">
                                        Cinturones: {court.allowed_belts.join(', ')}
                                      </span>
                                    ) : (
                                      <span className="text-[10px] bg-slate-700 text-slate-400 font-semibold px-2 py-0.5 rounded-full">
                                        Todos los cinturones
                                      </span>
                                    )}
                                  </h3>
                                  <p className="text-xs text-slate-400 mt-0.5">
                                    Edad: <strong className="text-amber-400">{court.min_age} - {court.max_age} años</strong> • {court.evaluators.length} evaluador(es) • {court.students.length} alumno(s)
                                  </p>
                                </div>

                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteCourt(court.id); }}
                                className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                                title="Eliminar cancha"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              {expandedCourtId === court.id
                                ? <ChevronUp className="w-5 h-5 text-slate-400" />
                                : <ChevronDown className="w-5 h-5 text-slate-400" />
                              }
                            </div>
                          </div>

                          {/* Expanded Content */}
                          {expandedCourtId === court.id && (
                            <div className="border-t border-slate-700 p-5 space-y-5">
                              {/* Evaluators */}
                              <div>
                                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                                  <Key className="w-3.5 h-3.5 text-violet-400" />
                                  Evaluadores Asignados
                                </h4>
                                <div className="grid gap-2">
                                  {court.evaluators.map(ev => (
                                    <div key={ev.id} className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-3 flex items-center justify-between">
                                      <div className="text-xs">
                                        <span className="text-white font-bold">{ev.name}</span>
                                      </div>
                                      <button
                                        onClick={() => copyToClipboard(`Usuario: ${ev.name}`, ev.id)}
                                        className="p-1.5 text-slate-400 hover:text-violet-400 hover:bg-violet-500/10 rounded-lg transition-all"
                                        title="Copiar usuario"
                                      >
                                        {copiedCredential === ev.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Students in this court */}
                              <div>
                                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                                  <Users className="w-3.5 h-3.5 text-amber-400" />
                                  Alumnos Asignados ({court.students.length})
                                </h4>
                                {court.students.length > 0 ? (
                                  <div className="grid gap-1.5 max-h-64 overflow-y-auto pr-2">
                                    {court.students.map(s => {
                                      const bs = getBeltStyle(s.belts);
                                      return (
                                        <div key={s.id} className="bg-slate-800/40 border border-slate-700/40 rounded-lg px-3 py-2 flex items-center justify-between text-xs">
                                          <div className="flex items-center gap-2">
                                            <div className={`w-2.5 h-2.5 rounded-full ${bs.className}`} style={bs.style} />
                                            <span className="text-white font-semibold">{s.first_name} {s.last_name}</span>
                                            <span className="text-slate-400">({s.age} años)</span>
                                          </div>
                                          <span className="text-slate-500">{s.belts?.name}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <p className="text-xs text-slate-500 italic">No hay alumnos en este rango de edad.</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-400 bg-slate-700/10 rounded-xl text-sm">
                      No hay canchas creadas aún para este examen. Crea una para distribuir los alumnos.
                    </div>
                  )}

                  {/* Unassigned Students */}
                  {unassignedStudents.length > 0 && (
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5 space-y-4">
                      <h4 className="text-sm font-bold text-amber-300 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        Alumnos sin cancha asignada ({unassignedStudents.length})
                      </h4>
                      <p className="text-xs text-slate-400">Estos alumnos no tienen edad registrada o su edad no coincide con ninguna cancha. Puedes editar su edad para asignarlos automáticamente.</p>
                      <div className="grid gap-2 max-h-72 overflow-y-auto pr-2">
                        {unassignedStudents.map(s => {
                          const bs = getBeltStyle(s.belts);
                          return (
                            <div key={s.id} className="bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2 text-xs">
                                <div className={`w-2.5 h-2.5 rounded-full ${bs.className}`} style={bs.style} />
                                <span className="text-white font-semibold">{s.first_name} {s.last_name}</span>
                                <span className="text-slate-400">
                                  {s.age !== null && s.age !== undefined ? `(${s.age} años)` : '(sin edad)'}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                {editingAgeStudentId === s.id ? (
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="number"
                                      min={1}
                                      max={99}
                                      value={editAgeValue}
                                      onChange={e => setEditAgeValue(parseInt(e.target.value) || 0)}
                                      className="w-16 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                                      autoFocus
                                    />
                                    <button
                                      onClick={() => handleUpdateStudentAge(s.id)}
                                      disabled={actionLoading}
                                      className="p-1.5 text-green-400 hover:bg-green-500/10 rounded-lg transition-all"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => setEditingAgeStudentId(null)}
                                      className="p-1.5 text-slate-400 hover:bg-slate-700/50 rounded-lg transition-all"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => { setEditingAgeStudentId(s.id); setEditAgeValue(s.age || 0); }}
                                    className="flex items-center gap-1 text-[10px] font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-2.5 py-1 rounded-lg border border-amber-500/20 transition-all"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                    Editar Edad
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ================= PESTAÑA: EVALUADORES DEL EXAMEN ================= */}
            {examSubTab === 'evaluadores' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Form Registrar Evaluador / Usuario de Pase de Lista */}
                <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 shadow-xl h-fit">
                  <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <Plus className="w-5 h-5 text-amber-500" />
                    Registrar Nuevo Usuario
                  </h2>
                  <form onSubmit={handleCreateEvaluator} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Nombre Completo / Usuario</label>
                      <input
                        type="text"
                        required
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder="Ej. Juan Pérez o Evaluador 1"
                        className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Contraseña</label>
                      <input
                        type="password"
                        required
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Rol del Usuario</label>
                      <select
                        value={newRole}
                        onChange={e => setNewRole(e.target.value as 'evaluador' | 'lista')}
                        className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm font-semibold"
                      >
                        <option value="evaluador">Evaluador de Cancha</option>
                        <option value="lista">Juez de Piso (Pase de Lista)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Cancha Asignada (Examen Activo)</label>
                      <select
                        value={selectedUserCourtId}
                        onChange={e => setSelectedUserCourtId(e.target.value)}
                        className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm font-semibold"
                      >
                        <option value="">-- Sin Cancha Específica (Acceso Global) --</option>
                        {courts.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.min_age} a {c.max_age} años)
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="submit"
                      disabled={actionLoading}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-slate-900 font-bold rounded-xl shadow-lg hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 transition-all text-sm mt-6"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{newRole === 'lista' ? 'Crear Juez de Piso' : 'Crear Evaluador'}</span>
                    </button>
                  </form>
                </div>

                {/* List evaluadores de canchas & globales */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Evaluadores asignados a las canchas del examen */}
                  <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 shadow-xl space-y-4">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <Key className="w-5 h-5 text-violet-400" />
                      Evaluadores y Jueces de Canchas de este Examen
                    </h2>
                    {courts.flatMap(c => c.evaluators).length > 0 ? (
                      <div className="grid gap-3">
                        {courts.flatMap(c => c.evaluators.map(ev => ({ ...ev, courtName: c.name }))).map(ev => (
                          <div key={ev.id} className="bg-slate-750 border border-slate-700 rounded-xl p-4 flex items-center justify-between gap-4">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white text-base">{ev.name}</span>
                                <span className="bg-violet-500/20 text-violet-300 border border-violet-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                  {ev.courtName}
                                </span>
                              </div>
                              <p className="text-xs text-slate-400 mt-1">Email: <strong className="text-slate-200">{ev.email}</strong></p>
                              {ev.password && (
                                <p className="text-xs text-slate-400">Contraseña: <strong className="text-amber-400 font-mono">{ev.password}</strong></p>
                              )}
                            </div>
                            <button
                              onClick={() => copyToClipboard(`Email: ${ev.email}${ev.password ? ` | Pass: ${ev.password}` : ''}`, ev.id)}
                              className="p-2 text-slate-400 hover:text-violet-400 hover:bg-violet-500/10 rounded-lg transition-all"
                              title="Copiar credenciales"
                            >
                              {copiedCredential === ev.id ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-slate-400 bg-slate-700/10 rounded-xl text-xs">
                        Aún no hay evaluadores/jueces creados dentro de las canchas de este examen.
                      </div>
                    )}
                  </div>

                  {/* Todos los usuarios registrados */}
                  <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 shadow-xl space-y-4">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <Users className="w-5 h-5 text-amber-400" />
                      Todos los Usuarios Registrados (Evaluadores y Jueces de Piso)
                    </h2>
                    <div className="grid gap-3">
                      {evaluators.length > 0 ? (
                        evaluators.map(ev => (
                          <div key={ev.id} className="bg-slate-700/20 border border-slate-700 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-bold text-white text-base">{ev.name}</p>
                                {ev.role === 'lista' ? (
                                  <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                                    Juez de Piso
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
                                    Evaluador
                                  </span>
                                )}
                                {ev.court_name ? (
                                  <span className="text-[10px] font-bold text-violet-300 bg-violet-500/20 px-2 py-0.5 rounded-full border border-violet-500/30">
                                    {ev.court_name}
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-semibold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
                                    Sin Cancha
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-400 mt-1">Usuario: <strong className="text-slate-200">{ev.name}</strong></p>
                              {ev.role === 'evaluador' && (
                                <span className="inline-block mt-1.5 text-[10px] font-semibold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md border border-slate-700 capitalize">
                                  Grupo: {ev.age_group || 'Sin filtro por grupo'}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-1.5 bg-slate-800 p-1 rounded-xl border border-slate-700">
                                <label className="text-[10px] text-slate-400 font-semibold uppercase px-1">Cancha:</label>
                                <select
                                  value={ev.court_id || ''}
                                  onChange={e => handleAssignCourtToUser(ev.id, e.target.value)}
                                  disabled={actionLoading}
                                  className="bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-semibold cursor-pointer"
                                >
                                  <option value="">-- Sin Cancha --</option>
                                  {courts.map(c => (
                                    <option key={c.id} value={c.id}>
                                      {c.name}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <button
                                onClick={() => handleDeleteEvaluator(ev.id)}
                                disabled={actionLoading}
                                className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                                title="Eliminar evaluador"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8 text-slate-400 bg-slate-700/10 rounded-xl">
                          No hay evaluadores registrados.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ================= PESTAÑA: RESULTADOS DEL EXAMEN ================= */}
            {examSubTab === 'resultados' && (
              <div className="pt-2">
                <ResultsSummary onClose={() => setExamSubTab('planillas')} />
              </div>
            )}
          </div>
        ) : (
          /* GRILLA DE CARPETAS DE EXAMEN Y FORMULARIO DE CARGA */
          <div className="space-y-8">
            {/* 1. SECCIÓN DE CREACIÓN DE EXAMEN Y CARGA CSV RÁPIDA */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Card: Crear Examen / Nueva Carpeta */}
              <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 shadow-xl space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-xl">
                    <Folder className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">Crear Nueva Carpeta de Examen</h2>
                    <p className="text-xs text-slate-400">Cada examen representa una carpeta de evaluación independiente.</p>
                  </div>
                </div>

                <form onSubmit={handleCreateExam} className="space-y-4 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Nombre del Examen</label>
                    <input
                      type="text"
                      required
                      value={newExamName}
                      onChange={e => setNewExamName(e.target.value)}
                      placeholder="Ej. Examen Junio 2026 - Cuponera"
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Fecha del Examen</label>
                    <input
                      type="date"
                      required
                      value={newExamDate}
                      onChange={e => setNewExamDate(e.target.value)}
                      className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                    />
                  </div>

                  <div className="pt-2">
                    <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Planilla CSV de Alumnos (Opcional)</label>
                    <input
                      type="file"
                      accept=".csv, .txt"
                      onChange={e => setUploadFile(e.target.files?.[0] || null)}
                      className="w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-700 file:text-amber-400 hover:file:bg-slate-600"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-slate-900 font-bold rounded-xl shadow-lg hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 transition-all text-sm mt-4"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Crear Carpeta y Abrir Examen</span>
                  </button>
                </form>
              </div>

              {/* Card: Cargar CSV a Examen Existente */}
              <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 shadow-xl space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">Cargar Planilla CSV a una Carpeta Existente</h2>
                    <p className="text-xs text-slate-400">Sube un archivo CSV con la lista de inscritos para un examen existente.</p>
                  </div>
                </div>

                <form onSubmit={(e) => handleUploadCSV(e)} className="space-y-4 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Seleccionar Carpeta de Examen Target</label>
                    <select
                      value={uploadExamTargetId || selectedExamId}
                      onChange={e => setUploadExamTargetId(e.target.value)}
                      className="w-full bg-slate-700 border border-slate-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm cursor-pointer"
                    >
                      {exams.map(ex => (
                        <option key={ex.id} value={ex.id} className="bg-slate-850">
                          {ex.name} ({ex.date}) {ex.is_active ? '- ACTIVO' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Archivo CSV de la Planilla</label>
                    <input
                      type="file"
                      accept=".csv, .txt"
                      onChange={e => setUploadFile(e.target.files?.[0] || null)}
                      className="w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-700 file:text-emerald-400 hover:file:bg-slate-600"
                    />
                  </div>

                  {uploadSummary && (
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-xs text-emerald-300">
                      {uploadSummary.message}: <strong>{uploadSummary.imported_count}</strong> creados, <strong>{uploadSummary.updated_count}</strong> actualizados.
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!uploadFile || actionLoading}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-bold rounded-xl shadow-lg hover:from-emerald-400 hover:to-teal-400 disabled:opacity-50 transition-all text-sm mt-4"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Procesar e Importar CSV</span>
                  </button>
                </form>
              </div>

            </div>

            {/* 2. SECCIÓN DE CARPETAS DE EXÁMENES REGISTRADAS */}
            <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 shadow-xl space-y-6">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Folder className="w-5 h-5 text-amber-400" />
                  Carpetas de Exámenes Registradas
                </h2>
                <p className="text-xs text-slate-400">Haz clic en "Abrir Carpeta" para gestionar la planilla, canchas, evaluadores y resultados del examen.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {exams.map(ex => (
                  <div
                    key={ex.id}
                    className={`bg-slate-750 border rounded-2xl p-5 flex flex-col justify-between gap-4 transition-all hover:border-slate-500 shadow-lg ${
                      ex.is_active ? 'border-amber-500/50 bg-amber-500/5 ring-1 ring-amber-500/20' : 'border-slate-700'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className={`p-3 rounded-xl ${ex.is_active ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 text-slate-400'}`}>
                            <FolderOpen className="w-6 h-6" />
                          </div>
                          <div>
                            <h3 className="font-bold text-white text-base leading-tight">{ex.name}</h3>
                            <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                              <Calendar className="w-3.5 h-3.5" />
                              {ex.date}
                            </p>
                          </div>
                        </div>
                      </div>

                      {ex.is_active ? (
                        <span className="inline-block bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase">
                          Examen Activo para Evaluaciones
                        </span>
                      ) : (
                        <span className="inline-block bg-slate-700 text-slate-400 border border-slate-600 text-[10px] px-2.5 py-0.5 rounded-full font-semibold">
                          Inactivo
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-slate-700/60">
                      <button
                        onClick={() => handleOpenExamFolder(ex)}
                        className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-md"
                      >
                        <Eye className="w-4 h-4" />
                        <span>Abrir Carpeta</span>
                      </button>

                      {!ex.is_active && (
                        <button
                          onClick={() => handleActivateExam(ex.id)}
                          disabled={actionLoading}
                          className="bg-slate-700 hover:bg-slate-600 text-slate-200 py-2 px-3 rounded-xl text-xs font-bold transition-all border border-slate-650"
                          title="Activar como examen vigente"
                        >
                          Activar
                        </button>
                      )}

                      <button
                        onClick={() => handleDeleteExam(ex.id, ex.name)}
                        disabled={actionLoading}
                        className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-slate-700 hover:border-red-500/30 rounded-xl transition-all"
                        title="Eliminar examen"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* Modal para Editar Datos del Alumno */}
        {editingStudent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
            <form onSubmit={handleSaveStudentEdit} className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-2xl max-w-xl w-full space-y-4">
              <div className="flex items-center justify-between border-b border-slate-700 pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-amber-400" />
                  Editar Alumno: {editingStudent.first_name} {editingStudent.last_name}
                </h3>
                <button type="button" onClick={() => setEditingStudent(null)} className="text-slate-400 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Nombre *</label>
                  <input
                    type="text"
                    required
                    value={editStudentForm.first_name}
                    onChange={e => setEditStudentForm(p => ({ ...p, first_name: e.target.value }))}
                    className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Apellido *</label>
                  <input
                    type="text"
                    required
                    value={editStudentForm.last_name}
                    onChange={e => setEditStudentForm(p => ({ ...p, last_name: e.target.value }))}
                    className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">RUT</label>
                  <input
                    type="text"
                    value={editStudentForm.rut}
                    onChange={e => setEditStudentForm(p => ({ ...p, rut: e.target.value }))}
                    placeholder="12.345.678-9"
                    className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Cinturón *</label>
                  <select
                    value={editStudentForm.belt_id}
                    onChange={e => setEditStudentForm(p => ({ ...p, belt_id: e.target.value }))}
                    className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    {belts.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Edad</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editStudentForm.age}
                    onChange={e => setEditStudentForm(p => ({ ...p, age: e.target.value === '' ? '' : parseInt(e.target.value, 10) }))}
                    className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Sede</label>
                  <input
                    type="text"
                    value={editStudentForm.sede}
                    onChange={e => setEditStudentForm(p => ({ ...p, sede: e.target.value }))}
                    className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Profesor</label>
                  <input
                    type="text"
                    value={editStudentForm.profesor}
                    onChange={e => setEditStudentForm(p => ({ ...p, profesor: e.target.value }))}
                    className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Correo Electrónico</label>
                  <input
                    type="email"
                    value={editStudentForm.email}
                    onChange={e => setEditStudentForm(p => ({ ...p, email: e.target.value }))}
                    className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-700">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-semibold transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold shadow-lg disabled:opacity-50 transition-all"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
