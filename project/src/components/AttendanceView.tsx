import { useState, useEffect, useCallback } from 'react';
import {
  Search,
  CheckCircle,
  XCircle,
  LogOut,
  Trophy,
  ClipboardList,
  Eye,
  UserCheck
} from 'lucide-react';
import {
  getAttendance,
  saveAttendance,
  getBelts,
  getExamCourts,
  getUnassignedStudents,
  getStudents,
  getEvaluatorCourt,
  StudentWithBelt,
  Belt,
  Court,
  getBeltStyle
} from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useEvaluation } from '../contexts/EvaluationContext';
import { useWebSocket } from '../lib/useWebSocket';

export default function AttendanceView() {
  const [courts, setCourts] = useState<Court[]>([]);
  const [unassignedStudents, setUnassignedStudents] = useState<StudentWithBelt[]>([]);
  const [allStudents, setAllStudents] = useState<StudentWithBelt[]>([]);
  const [belts, setBelts] = useState<Belt[]>([]);
  const [selectedCourtId, setSelectedCourtId] = useState<string | 'all' | 'unassigned' | null>(null);
  const [assignedCourt, setAssignedCourt] = useState<{ id?: string; name: string; min_age?: number; max_age?: number } | null>(null);
  const [judgeTab, setJudgeTab] = useState<'pasar_lista' | 'ver_lista'>('pasar_lista');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [attendance, setAttendance] = useState<Map<string, boolean>>(new Map());
  const { user, logout } = useAuth();
  const { activeExam } = useEvaluation();

  const loadData = useCallback(async (isBackground = false) => {
    if (!activeExam) return;
    if (!isBackground) setLoading(true);
    try {
      const [courtsData, userCourtData, unassignedData, allStudentsData, attendanceData, beltsData] = await Promise.all([
        getExamCourts(activeExam.id).catch(() => []),
        user ? getEvaluatorCourt(activeExam.id, user.id).catch(() => null) : null,
        getUnassignedStudents(activeExam.id).catch(() => []),
        getStudents('first_name').catch(() => []),
        getAttendance(new Date().toISOString().split('T')[0], activeExam.id).catch(() => []),
        getBelts().catch(() => []),
      ]);

      setCourts(courtsData || []);
      setUnassignedStudents(unassignedData || []);
      setAllStudents(allStudentsData || []);
      if (beltsData) setBelts(beltsData.sort((a, b) => a.order_index - b.order_index));

      if (userCourtData && userCourtData.id) {
        setAssignedCourt(userCourtData);
        setSelectedCourtId(userCourtData.id);
      } else if (courtsData && courtsData.length > 0 && selectedCourtId === null) {
        setSelectedCourtId(courtsData[0].id);
      }

      if (attendanceData && Array.isArray(attendanceData)) {
        const attMap = new Map<string, boolean>();
        attendanceData.forEach((a) => attMap.set(a.student_id, a.present));
        setAttendance(attMap);
      }
    } catch (error) {
      console.error('Error loading attendance court data:', error);
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, [activeExam, user, selectedCourtId]);

  // Real-time WebSocket listener for attendance updates
  useWebSocket(useCallback((msg) => {
    if (msg.type === 'ATTENDANCE_UPDATED') {
      if (msg.student_id && msg.present !== undefined) {
        setAttendance(prev => {
          const newMap = new Map(prev);
          newMap.set(msg.student_id, msg.present);
          return newMap;
        });
      } else {
        loadData(true);
      }
    }
  }, [loadData]));

  // Background polling fallback every 5 seconds
  useEffect(() => {
    if (activeExam) {
      loadData(false);
      const interval = setInterval(() => {
        loadData(true);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [activeExam, loadData]);

  const toggleAttendance = async (studentId: string, present: boolean) => {
    if (!activeExam) return;
    setAttendance(prev => {
      const newMap = new Map(prev);
      newMap.set(studentId, present);
      return newMap;
    });

    try {
      await saveAttendance(studentId, new Date().toISOString().split('T')[0], present, activeExam.id);
    } catch (error) {
      console.error('Error saving attendance:', error);
    }
  };

  const getCourtStudents = (courtId: string | 'all' | 'unassigned' | null): StudentWithBelt[] => {
    if (courtId === 'all') return allStudents;
    if (courtId === 'unassigned') return unassignedStudents;
    const foundCourt = courts.find(c => c.id === courtId);
    return foundCourt ? foundCourt.students : [];
  };

  const getCourtStats = (courtStudents: StudentWithBelt[]) => {
    const presentCount = courtStudents.filter(s => attendance.get(s.id) === true).length;
    const totalCount = courtStudents.length;
    const progressPercent = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;
    return { present: presentCount, total: totalCount, progressPercent };
  };

  if (loading || !activeExam) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400 font-medium">Cargando vista de Juez de Piso...</div>
      </div>
    );
  }

  // Active court students
  const activeCourtStudents = getCourtStudents(selectedCourtId);
  const activeCourtObj = courts.find(c => c.id === selectedCourtId);
  const { present: activePresent, total: activeTotal } = getCourtStats(activeCourtStudents);

  // Filter for tab 'ver_lista': ONLY PRESENT STUDENTS (attendance !== false)
  const displayStudents = judgeTab === 'ver_lista'
    ? activeCourtStudents.filter(s => attendance.get(s.id) !== false)
    : activeCourtStudents;

  const getCourtTitle = () => {
    if (selectedCourtId === 'all') return 'Todas las Canchas';
    if (selectedCourtId === 'unassigned') return 'Alumnos sin Cancha';
    return activeCourtObj ? activeCourtObj.name : (assignedCourt?.name || 'Cancha Asignada');
  };

  const getCourtSubtitle = () => {
    if (selectedCourtId === 'all') return `Todos los alumnos (${allStudents.length})`;
    if (selectedCourtId === 'unassigned') return `Sin rango de edad asignado`;
    return activeCourtObj ? `Rango: ${activeCourtObj.min_age} a ${activeCourtObj.max_age} años` : '';
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Header Bar */}
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-3 sticky top-0 z-20 shadow-xl">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-center text-amber-400">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-white tracking-wide">Juez de Piso</h1>
                <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase">
                  {getCourtTitle()}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {activeExam?.name} • {getCourtSubtitle()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Court selector dropdown if multiple courts exist and user is not restricted to single court */}
            {courts.length > 1 && !assignedCourt?.id && (
              <select
                value={selectedCourtId || ''}
                onChange={(e) => setSelectedCourtId(e.target.value)}
                className="bg-slate-700 border border-slate-600 rounded-xl px-3 py-1.5 text-xs font-semibold text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {courts.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.min_age}-{c.max_age} años)</option>
                ))}
                {unassignedStudents.length > 0 && <option value="unassigned">Sin Cancha Asignada</option>}
                <option value="all">Todas las Canchas</option>
              </select>
            )}

            <button
              onClick={logout}
              className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl font-medium text-xs transition-all"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full p-4 md:p-6 space-y-6">
        {/* Navigation / Mode Pill Tabs */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-1.5 flex items-center justify-between gap-2 shadow-lg">
          <div className="grid grid-cols-2 gap-2 flex-1">
            <button
              onClick={() => setJudgeTab('pasar_lista')}
              className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold transition-all ${
                judgeTab === 'pasar_lista'
                  ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <ClipboardList className="w-4 h-4" />
              <span>Pasar Lista</span>
              <span className="text-xs bg-slate-900/30 px-2 py-0.5 rounded-md ml-1">
                {activeTotal}
              </span>
            </button>

            <button
              onClick={() => setJudgeTab('ver_lista')}
              className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold transition-all ${
                judgeTab === 'ver_lista'
                  ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Eye className="w-4 h-4" />
              <span>Ver Lista (Evaluador)</span>
              <span className="text-xs bg-slate-900/30 px-2 py-0.5 rounded-md ml-1">
                {activePresent} presentes
              </span>
            </button>
          </div>
        </div>

        {/* Tab Description Banner */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-4 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              {judgeTab === 'pasar_lista' ? (
                <>
                  <ClipboardList className="w-4 h-4 text-amber-400" />
                  Pase de Asistencia - {getCourtTitle()}
                </>
              ) : (
                <>
                  <UserCheck className="w-4 h-4 text-emerald-400" />
                  Lista Oficial del Evaluador - Solo Alumnos Presentes
                </>
              )}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              {judgeTab === 'pasar_lista'
                ? 'Marca a los alumnos como Presente o Ausente. Los ausentes se ocultarán automáticamente en la vista del evaluador.'
                : 'Muestra únicamente los alumnos confirmados como Presentes. Esta es exactamente la misma lista que ve el evaluador.'}
            </p>
          </div>

          <div className="bg-slate-700/60 border border-slate-600 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-200 shrink-0">
            {activePresent} / {activeTotal} Presentes
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar alumno por nombre..."
            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-11 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
          />
        </div>

        {/* Student Grouped by Belts */}
        <div className="space-y-6">
          {belts.map((belt) => {
            const beltStudents = displayStudents.filter(s =>
              (s.belt_id === belt.id || s.belts?.id === belt.id) &&
              (searchQuery === '' || `${s.first_name} ${s.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()))
            );

            if (beltStudents.length === 0) return null;

            return (
              <div key={belt.id} className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-md">
                {/* Belt Header */}
                <div className="bg-slate-750 px-4 py-3 border-b border-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {(() => {
                      const bs = getBeltStyle(belt);
                      return <div className={`w-3 h-8 rounded-full ${bs.className}`} style={bs.style} />;
                    })()}
                    <h3 className="font-bold text-white text-sm">{belt.name}</h3>
                  </div>
                  <span className="text-xs font-semibold bg-slate-700 text-slate-300 px-2.5 py-0.5 rounded-full">
                    {beltStudents.length} alumno(s)
                  </span>
                </div>

                {/* Student List */}
                <div className="divide-y divide-slate-700">
                  {beltStudents.map((student) => {
                    const isPresent = attendance.get(student.id) === true;
                    const hasChecked = attendance.has(student.id);

                    return (
                      <div key={student.id} className="flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors">
                        <div>
                          <p className="font-semibold text-white text-sm">
                            {student.first_name} {student.last_name}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {student.age !== undefined && student.age !== null ? `${student.age} años` : 'Edad no registrada'}
                          </p>
                        </div>

                        {judgeTab === 'pasar_lista' ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => toggleAttendance(student.id, true)}
                              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                                isPresent
                                  ? 'bg-green-500 text-slate-950 shadow-md shadow-green-500/20'
                                  : 'bg-slate-700 text-slate-400 hover:bg-green-500/10 hover:text-green-400'
                              }`}
                            >
                              <CheckCircle className="w-4 h-4" />
                              <span>Presente</span>
                            </button>
                            <button
                              onClick={() => toggleAttendance(student.id, false)}
                              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                                hasChecked && !isPresent
                                  ? 'bg-red-500 text-white shadow-md shadow-red-500/20'
                                  : 'bg-slate-700 text-slate-400 hover:bg-red-500/10 hover:text-red-400'
                              }`}
                            >
                              <XCircle className="w-4 h-4" />
                              <span>Ausente</span>
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-3 py-1.5 rounded-xl text-xs font-bold">
                            <CheckCircle className="w-4 h-4" />
                            <span>Presente en Cancha</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Empty state message */}
          {displayStudents.filter(s => searchQuery === '' || `${s.first_name} ${s.last_name}`.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
            <div className="text-center py-12 bg-slate-800/30 border border-slate-800 rounded-xl">
              <p className="text-slate-400 font-medium">
                {judgeTab === 'ver_lista'
                  ? 'No hay alumnos presentes en esta cancha actualmente.'
                  : 'No se encontraron alumnos para este filtro.'}
              </p>
              {judgeTab === 'ver_lista' && (
                <button
                  onClick={() => setJudgeTab('pasar_lista')}
                  className="mt-3 text-xs font-bold text-amber-400 hover:underline"
                >
                  Ir a Pasar Lista para marcar presentes
                </button>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
