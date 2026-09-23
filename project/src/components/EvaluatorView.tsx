import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Trophy, ChevronLeft, ChevronRight, BarChart3, LogOut, Swords, Wind, Target, Users as UsersIcon, AlertCircle, LayoutGrid, Mic, MicOff } from 'lucide-react';
import { 
  getBelts, getAttendance, getEvaluatorStudents, getEvaluatorCourt, getExams,
  Belt, StudentWithBelt, Category, CATEGORIES, CATEGORY_LABELS, SUBCATEGORIES, SUBCATEGORY_LABELS,
  getBeltStyle, RATING_OPTIONS
} from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useEvaluation } from '../contexts/EvaluationContext';
import { useWebSocket } from '../lib/useWebSocket';
import ResultsSummary from './ResultsSummary';

const CATEGORY_ICONS: Record<Category, React.ElementType> = {
  brazos: Swords,
  patadas: Wind,
  combate: Target,
  poomsae: UsersIcon,
};

export default function EvaluatorView() {
  const [belts, setBelts] = useState<Belt[]>([]);
  const [students, setStudents] = useState<StudentWithBelt[]>([]);
  const [attendance, setAttendance] = useState<Map<string, boolean>>(new Map());
  const [courtInfo, setCourtInfo] = useState<{ id?: string; name: string; min_age?: number; max_age?: number; allowed_belts?: string[] } | null>(null);

  const [loading, setLoading] = useState(true);
  const [currentBeltIndex, setCurrentBeltIndex] = useState(0);
  const [currentCategoryIndex, setCurrentCategoryIndex] = useState(0);
  const [currentSubcategoryIndex, setCurrentSubcategoryIndex] = useState(0);
  const [studentPage, setStudentPage] = useState(0);
  const [studentsPerPage, setStudentsPerPage] = useState<number>(() => {
    const saved = localStorage.getItem('evaluator_students_per_page');
    return saved ? Math.min(6, Math.max(2, parseInt(saved, 10))) : 3;
  });
  const [showResults, setShowResults] = useState(false);
  const [listeningStudentId, setListeningStudentId] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const { user, logout } = useAuth();
  const { getRating, setRating, setNotes, getNotes, activeExam } = useEvaluation();

  const toggleListening = (studentId: string, currentText: string) => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Para dictar con el botón web se requiere HTTPS o localhost.\n\n💡 TIP: Puedes tocar la caja de "Observaciones" y usar el botón de micrófono del TECLADO de tu celular/tablet para dictar directamente.');
      return;
    }

    if (listeningStudentId === studentId) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
      }
      setListeningStudentId(null);
      return;
    }

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'es-ES';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setListeningStudentId(studentId);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0]?.[0]?.transcript;
        if (transcript) {
          const cleaned = transcript.trim();
          const currentCat = CATEGORIES[currentCategoryIndex];
          const subcats = SUBCATEGORIES[currentCat];
          const currentSub = subcats.length > 0 ? subcats[currentSubcategoryIndex] : null;

          const newNotes = currentText ? `${currentText.trim()} ${cleaned}` : cleaned;
          currentStudents.forEach((st) => {
            setNotes(st.id, currentCat, currentSub, newNotes, user?.id || '');
          });
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setListeningStudentId(null);
      };

      recognition.onend = () => {
        setListeningStudentId(null);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Error starting speech recognition:', err);
      setListeningStudentId(null);
    }
  };

  const handleSetStudentsPerPage = (count: number) => {
    setStudentsPerPage(count);
    localStorage.setItem('evaluator_students_per_page', count.toString());
    setStudentPage(0);
  };

  const loadData = useCallback(async (isBackground = false) => {
    if (!user) return;
    if (!isBackground) setLoading(true);
    try {
      let examToUse = activeExam;
      if (!examToUse) {
        const examsList = await getExams().catch(() => []);
        examToUse = examsList.find((e) => e.is_active) || examsList[0] || null;
      }

      if (!examToUse) {
        if (!isBackground) setLoading(false);
        return;
      }

      const [beltsData, studentsData, attendanceData, courtData] = await Promise.all([
        getBelts().catch(() => []),
        getEvaluatorStudents(examToUse.id, user.id).catch(() => []),
        getAttendance(new Date().toISOString().split('T')[0], examToUse.id).catch(() => []),
        getEvaluatorCourt(examToUse.id, user.id).catch(() => ({ name: 'Cancha' }))
      ]);

      if (beltsData && beltsData.length > 0) setBelts(beltsData);
      if (studentsData) setStudents(studentsData);
      if (courtData) setCourtInfo(courtData);

      if (attendanceData && Array.isArray(attendanceData)) {
        const attMap = new Map<string, boolean>();
        attendanceData.forEach((a) => attMap.set(a.student_id, a.present));
        setAttendance(attMap);
      }
    } catch (error) {
      console.error('Error loading evaluator view data:', error);
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, [user, activeExam]);

  // Real-time WebSocket listener for attendance and evaluation updates
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
    loadData(false);
    const interval = setInterval(() => {
      loadData(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Reset student page on belt/category/subcategory change
  useEffect(() => {
    setStudentPage(0);
  }, [currentBeltIndex, currentCategoryIndex, currentSubcategoryIndex]);

  const currentCategory = CATEGORIES[currentCategoryIndex];
  const currentSubcategories = SUBCATEGORIES[currentCategory];
  const currentSubcategory = currentSubcategories.length > 0 ? currentSubcategories[currentSubcategoryIndex] : null;
  const currentBelt = belts[currentBeltIndex];

  const getStudentsForBelt = useCallback((bId?: string) => {
    if (!bId) return [];
    return students.filter(s => s.belt_id === bId && attendance.get(s.id) !== false);
  }, [students, attendance]);

  const currentStudents = useMemo(() => {
    if (!currentBelt) return [];
    // Ocultar alumnos marcados como Ausentes (attendance === false) de la vista de evaluador
    return students.filter(s => s.belt_id === currentBelt.id && attendance.get(s.id) !== false);
  }, [students, currentBelt, attendance]);

  const totalStudentPages = useMemo(() => {
    return Math.max(1, Math.ceil(currentStudents.length / studentsPerPage));
  }, [currentStudents.length, studentsPerPage]);

  const clampedStudentPage = Math.min(studentPage, totalStudentPages - 1);

  const visibleStudents = useMemo(() => {
    const start = clampedStudentPage * studentsPerPage;
    return currentStudents.slice(start, start + studentsPerPage);
  }, [currentStudents, clampedStudentPage, studentsPerPage]);

  // Si el cinturón actual no tiene alumnos para este evaluador, avanzar al primero que sí tenga
  useEffect(() => {
    if (!loading && belts.length > 0) {
      const currentHasStudents = getStudentsForBelt(belts[currentBeltIndex]?.id).length > 0;
      if (!currentHasStudents) {
        const firstWithStudentsIdx = belts.findIndex(b => getStudentsForBelt(b.id).length > 0);
        if (firstWithStudentsIdx !== -1 && firstWithStudentsIdx !== currentBeltIndex) {
          setCurrentBeltIndex(firstWithStudentsIdx);
          setStudentPage(0);
        }
      }
    }
  }, [loading, belts, currentBeltIndex, getStudentsForBelt]);

  const getNextCoord = useCallback((catIdx: number, subcatIdx: number, beltIdx: number) => {
    for (let b = beltIdx + 1; b < belts.length; b++) {
      if (getStudentsForBelt(belts[b].id).length > 0) {
        return { catIdx, subcatIdx, beltIdx: b };
      }
    }

    const currentCat = CATEGORIES[catIdx];
    const subcats = SUBCATEGORIES[currentCat];
    
    let nextCatIdx = catIdx;
    let nextSubcatIdx = subcatIdx;

    if (subcatIdx < subcats.length - 1) {
      nextSubcatIdx = subcatIdx + 1;
    } else if (catIdx < CATEGORIES.length - 1) {
      nextCatIdx = catIdx + 1;
      nextSubcatIdx = 0;
    } else {
      return null;
    }

    for (let b = 0; b < belts.length; b++) {
      const nextBeltStudents = getStudentsForBelt(belts[b].id);
      if (nextBeltStudents.length > 0) {
        return { catIdx: nextCatIdx, subcatIdx: nextSubcatIdx, beltIdx: b };
      }
    }

    return { catIdx: nextCatIdx, subcatIdx: nextSubcatIdx, beltIdx: 0 };
  }, [belts, getStudentsForBelt]);

  const getPrevCoord = useCallback((catIdx: number, subcatIdx: number, beltIdx: number) => {
    for (let b = beltIdx - 1; b >= 0; b--) {
      if (getStudentsForBelt(belts[b].id).length > 0) {
        return { catIdx, subcatIdx, beltIdx: b };
      }
    }

    let prevCatIdx = catIdx;
    let prevSubcatIdx = subcatIdx;

    if (subcatIdx > 0) {
      prevSubcatIdx = subcatIdx - 1;
    } else if (catIdx > 0) {
      prevCatIdx = catIdx - 1;
      const prevCat = CATEGORIES[prevCatIdx];
      const prevSubcats = SUBCATEGORIES[prevCat];
      prevSubcatIdx = prevSubcats.length > 0 ? prevSubcats.length - 1 : 0;
    } else {
      return null;
    }

    for (let b = belts.length - 1; b >= 0; b--) {
      const prevBeltStudents = getStudentsForBelt(belts[b].id);
      if (prevBeltStudents.length > 0) {
        return { catIdx: prevCatIdx, subcatIdx: prevSubcatIdx, beltIdx: b };
      }
    }

    return { catIdx: prevCatIdx, subcatIdx: prevSubcatIdx, beltIdx: belts.length - 1 };
  }, [belts, getStudentsForBelt]);

  const canGoPrevious = useMemo(() => {
    if (clampedStudentPage > 0) return true;
    return getPrevCoord(currentCategoryIndex, currentSubcategoryIndex, currentBeltIndex) !== null;
  }, [clampedStudentPage, getPrevCoord, currentCategoryIndex, currentSubcategoryIndex, currentBeltIndex]);

  const canGoNext = useMemo(() => {
    if (clampedStudentPage < totalStudentPages - 1) return true;
    return getNextCoord(currentCategoryIndex, currentSubcategoryIndex, currentBeltIndex) !== null;
  }, [clampedStudentPage, totalStudentPages, getNextCoord, currentCategoryIndex, currentSubcategoryIndex, currentBeltIndex]);

  const goPrevious = useCallback(() => {
    if (clampedStudentPage > 0) {
      setStudentPage(p => p - 1);
      return;
    }
    const prev = getPrevCoord(currentCategoryIndex, currentSubcategoryIndex, currentBeltIndex);
    if (prev) {
      setCurrentCategoryIndex(prev.catIdx);
      setCurrentSubcategoryIndex(prev.subcatIdx);
      setCurrentBeltIndex(prev.beltIdx);
      const prevBeltObj = belts[prev.beltIdx];
      const prevBeltStudents = getStudentsForBelt(prevBeltObj?.id);
      const prevTotalPages = Math.max(1, Math.ceil(prevBeltStudents.length / studentsPerPage));
      setStudentPage(prevTotalPages - 1);
    }
  }, [clampedStudentPage, getPrevCoord, currentCategoryIndex, currentSubcategoryIndex, currentBeltIndex, belts, getStudentsForBelt, studentsPerPage]);

  const goNext = useCallback(() => {
    if (clampedStudentPage < totalStudentPages - 1) {
      setStudentPage(p => p + 1);
      return;
    }
    const next = getNextCoord(currentCategoryIndex, currentSubcategoryIndex, currentBeltIndex);
    if (next) {
      setCurrentCategoryIndex(next.catIdx);
      setCurrentSubcategoryIndex(next.subcatIdx);
      setCurrentBeltIndex(next.beltIdx);
      setStudentPage(0);
    }
  }, [clampedStudentPage, totalStudentPages, getNextCoord, currentCategoryIndex, currentSubcategoryIndex, currentBeltIndex]);

  const getGridColsClass = (count: number) => {
    switch (count) {
      case 2: return 'grid-cols-1 md:grid-cols-2 max-w-6xl';
      case 3: return 'grid-cols-1 md:grid-cols-3 max-w-[1650px]';
      case 4: return 'grid-cols-1 sm:grid-cols-2 max-w-5xl'; // 2 x 2 grid
      case 5: return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-[1650px]'; // 3 arriba, 2 abajo
      case 6: return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-[1650px]'; // 3 x 2 grid
      default: return 'grid-cols-1 md:grid-cols-3 max-w-[1650px]';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400 font-medium">
          <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <span>Cargando evaluación...</span>
        </div>
      </div>
    );
  }

  if (showResults) {
    return <ResultsSummary onClose={() => setShowResults(false)} evaluatorId={user?.id} />;
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-3 sticky top-0 z-10 shadow-lg">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Trophy className="w-8 h-8 text-amber-400 shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-white tracking-wide">Evaluación de Alumnos</h1>
                <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                  {activeExam?.name || 'Examen Activo'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Asignación: <span className="font-semibold text-amber-400">
                  {courtInfo?.name || user?.name || 'Cancha'}
                  {courtInfo?.min_age !== undefined && courtInfo?.min_age !== null && (
                    ` (${courtInfo.min_age}–${courtInfo.max_age} años)`
                  )}
                  {courtInfo?.allowed_belts && courtInfo.allowed_belts.length > 0 && (
                    ` [Cinturones: ${courtInfo.allowed_belts.join(', ')}]`
                  )}
                </span> • {currentSubcategory
                  ? `${CATEGORY_LABELS[currentCategory]} - ${SUBCATEGORY_LABELS[currentSubcategory]}`
                  : CATEGORY_LABELS[currentCategory]}
              </p>

            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Selector de alumnos simultáneos */}
            <div className="flex items-center gap-1.5 bg-slate-700/60 p-1 rounded-xl border border-slate-600">
              <span className="text-xs font-semibold text-slate-300 px-1.5 hidden sm:flex items-center gap-1">
                <LayoutGrid className="w-3.5 h-3.5 text-amber-400" />
                <span>Ver:</span>
              </span>
              {[2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  onClick={() => handleSetStudentsPerPage(n)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    studentsPerPage === n
                      ? 'bg-amber-500 text-slate-900 shadow-md scale-[1.03]'
                      : 'text-slate-300 hover:bg-slate-600 hover:text-white'
                  }`}
                  title={`Mostrar ${n} alumnos a la vez`}
                >
                  {n}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowResults(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium text-xs md:text-sm transition-all"
            >
              <BarChart3 className="w-4 h-4 text-amber-400" />
              <span>Resultados</span>
            </button>
            <button
              onClick={logout}
              className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl font-medium text-xs md:text-sm transition-all"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden md:inline">Salir</span>
            </button>
          </div>
        </div>
      </header>

      <div className="bg-slate-800/50 border-b border-slate-700 px-4 py-2">
        <div className="max-w-7xl mx-auto flex items-center gap-2 overflow-x-auto hide-scrollbar">
          {CATEGORIES.map((cat, idx) => {
            const Icon = CATEGORY_ICONS[cat];
            const isActive = idx === currentCategoryIndex;

            return (
              <button
                key={cat}
                onClick={() => {
                  setCurrentCategoryIndex(idx);
                  setCurrentSubcategoryIndex(0);
                }}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap text-xs md:text-sm ${
                  isActive
                    ? 'bg-amber-500 text-slate-900 font-bold'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{CATEGORY_LABELS[cat]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {currentSubcategories.length > 1 && (
        <div className="bg-slate-800/30 border-b border-slate-700 px-4 py-2">
          <div className="max-w-7xl mx-auto flex gap-2">
            {currentSubcategories.map((sub, idx) => (
              <button
                key={sub}
                onClick={() => {
                  setCurrentSubcategoryIndex(idx);
                }}
                className={`px-3.5 py-1 rounded-lg font-medium text-xs md:text-sm transition-all ${
                  idx === currentSubcategoryIndex
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50 font-bold'
                    : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {SUBCATEGORY_LABELS[sub]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-slate-800/20 border-b border-slate-700 px-4 py-2.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {(() => {
              const bs = getBeltStyle(currentBelt);
              return <div className={`w-3 h-9 rounded-full ${bs.className}`} style={bs.style} />;
            })()}
            <div>
              <div className="flex items-center gap-2">
                <p className="font-bold text-white text-sm md:text-base">{currentBelt?.name || 'Cinturón'}</p>
                {totalStudentPages > 1 && (
                  <span className="text-[11px] font-semibold bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-md border border-amber-500/20">
                    Pág {clampedStudentPage + 1} de {totalStudentPages}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                {currentStudents.length} Alumno(s) en este grupo de cinturón
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto">
            {belts.map((belt, idx) => {
              const count = getStudentsForBelt(belt.id).length;
              return (
                <button
                  key={belt.id}
                  onClick={() => {
                    setCurrentBeltIndex(idx);
                  }}
                  className={`w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center transition-all ${
                    idx === currentBeltIndex
                      ? 'bg-amber-500 text-slate-900 font-bold ring-2 ring-amber-400'
                      : count > 0
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600 font-medium'
                      : 'bg-slate-800 text-slate-600 cursor-not-allowed opacity-40'
                  }`}
                  disabled={count === 0 && idx !== currentBeltIndex}
                  title={`${belt.name}: ${count} alumno(s)`}
                >
                  <span className="text-xs">{idx + 1}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <main className="flex-1 overflow-auto p-3 lg:p-4">
        <div className="max-w-7xl mx-auto">
          {students.length === 0 ? (
            <div className="text-center py-16 bg-slate-800/40 border border-slate-700 rounded-2xl p-8 max-w-xl mx-auto my-6">
              <AlertCircle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">Sin alumnos asignados</h3>
              <p className="text-slate-400 text-sm">
                No hay alumnos asignados a tu cancha (<span className="text-amber-400 font-semibold">{courtInfo?.name || 'Sin asignación'}</span>)
                {courtInfo?.min_age !== undefined && courtInfo?.min_age !== null && (
                  ` [${courtInfo.min_age}–${courtInfo.max_age} años]`
                )} para este examen.
              </p>
            </div>
          ) : visibleStudents.length > 0 ? (
            <div className={`grid gap-3.5 ${getGridColsClass(studentsPerPage)}`}>
              {visibleStudents.map((student) => {
                const ratingValue = getRating(student.id, currentCategory, currentSubcategory, user?.id || '');
                const isAbsent = attendance.get(student.id) === false;
                const studentBeltBs = getBeltStyle(student.belts);

                return (
                  <div
                    key={student.id}
                    className={`bg-slate-800 rounded-2xl border transition-all overflow-hidden shadow-xl p-4 flex flex-col justify-between ${
                      isAbsent
                        ? 'border-red-500/40 opacity-70 scale-[0.98]'
                        : 'border-slate-700'
                    }`}
                  >
                    <div>
                      {/* Card Header: Avatar, Name, Belt, Absent Badge */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center text-slate-900 font-bold text-base shrink-0 shadow-md">
                            {student.first_name[0]}{student.last_name[0]}
                          </div>
                          <div className="min-w-0">
                            <h2 className="text-base font-bold text-white leading-snug truncate" title={`${student.first_name} ${student.last_name}`}>
                              {student.first_name} {student.last_name}
                            </h2>
                            <p className="text-slate-400 text-xs truncate">
                              Cinturón {student.belts?.name || 'Desconocido'} • {student.age !== undefined && student.age !== null ? `${student.age}a` : ''}
                            </p>
                          </div>
                        </div>

                        {isAbsent && (
                          <span className="shrink-0 flex items-center gap-1 bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            <AlertCircle className="w-3 h-3" />
                            Ausente
                          </span>
                        )}
                      </div>

                      {/* Belt Color Stripe */}
                      <div
                        className={`w-full h-2 rounded-full ${studentBeltBs.className} shadow-sm mb-3`}
                        style={studentBeltBs.style}
                      />

                      {/* Rating Buttons (5 options) */}
                      <div className="grid grid-cols-5 gap-1 md:gap-1.5 mb-3">
                        {RATING_OPTIONS.map((opt) => {
                          const isSelected = ratingValue === opt.key || 
                            (ratingValue === 'red' && opt.key === 'insuficiente') ||
                            (ratingValue === 'yellow' && opt.key === 'suficiente') ||
                            (ratingValue === 'green' && opt.key === 'logrado');

                          return (
                            <button
                              key={opt.key}
                              onClick={() => !isAbsent && setRating(student.id, currentCategory, currentSubcategory, opt.key, user?.id || '')}
                              disabled={isAbsent}
                              className={`py-2 px-1 rounded-xl transition-all flex flex-col items-center justify-center text-center min-h-[50px] ${
                                isSelected
                                  ? `${opt.bgColor} text-white ring-2 ring-offset-1 ring-offset-slate-800 ${opt.ringColor} shadow-md scale-[1.02]`
                                  : 'bg-slate-700/60 text-slate-300 hover:bg-slate-700'
                              } ${isAbsent ? 'cursor-not-allowed opacity-50' : ''}`}
                              title={`${opt.label} (${opt.points} pts)`}
                            >
                              <span className="text-[11px] xl:text-xs font-bold leading-tight drop-shadow-sm text-center px-0.5 whitespace-normal break-words">
                                {opt.label}
                              </span>
                              <span className="text-[10px] opacity-80 mt-1 font-semibold">{opt.points} pts</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 bg-slate-800/30 border border-slate-700 rounded-2xl">
              <p className="text-slate-400">No hay alumnos asignados a tu cancha en el cinturón {currentBelt?.name || ''}</p>
            </div>
          )}

          {/* Observaciones Generales por Grupo de Cinturón */}
          {currentStudents.length > 0 && (
            <div className="mt-4 bg-slate-800/90 rounded-2xl border border-slate-700 p-4 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <label className="text-xs md:text-sm font-bold text-white">
                    Observaciones Generales – {currentBelt?.name || 'Grupo de Cinturón'}
                  </label>
                  <span className="text-[11px] text-slate-400">
                    ({CATEGORY_LABELS[currentCategory]}{currentSubcategory ? ` - ${SUBCATEGORY_LABELS[currentSubcategory]}` : ''})
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const firstStudent = currentStudents[0];
                    if (firstStudent) {
                      const currentText = getNotes(firstStudent.id, currentCategory, currentSubcategory, user?.id || '') || '';
                      toggleListening(firstStudent.id, currentText);
                    }
                  }}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all ${
                    listeningStudentId && currentStudents.some(s => s.id === listeningStudentId)
                      ? 'bg-red-500 text-white animate-pulse shadow-md shadow-red-500/30'
                      : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}
                  title="Dictar observaciones para este grupo por voz"
                >
                  {listeningStudentId && currentStudents.some(s => s.id === listeningStudentId) ? (
                    <>
                      <MicOff className="w-4 h-4 animate-spin" />
                      <span>Escuchando...</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4 text-amber-400" />
                      <span>Dictar por Voz</span>
                    </>
                  )}
                </button>
              </div>

              <textarea
                value={currentStudents[0] ? (getNotes(currentStudents[0].id, currentCategory, currentSubcategory, user?.id || '') || '') : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  currentStudents.forEach((st) => {
                    setNotes(st.id, currentCategory, currentSubcategory, val, user?.id || '');
                  });
                }}
                placeholder={`Escribe o dicta con el micrófono observaciones generales para el grupo ${currentBelt?.name || ''}...`}
                className="w-full bg-slate-700/60 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-xs md:text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none min-h-[70px]"
                rows={3}
              />
            </div>
          )}
        </div>
      </main>

      <div className="sticky bottom-0 bg-gradient-to-t from-slate-900 via-slate-900 to-transparent p-3 border-t border-slate-800/60">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <button
            onClick={goPrevious}
            disabled={!canGoPrevious}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-5 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm md:text-base rounded-xl transition-all shadow-md"
          >
            <ChevronLeft className="w-5 h-5" />
            <span>Anterior</span>
          </button>

          {/* Student Page Sub-Indicator */}
          {totalStudentPages > 1 && (
            <div className="flex items-center gap-1 hidden sm:flex">
              {Array.from({ length: totalStudentPages }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setStudentPage(i)}
                  className={`w-2.5 h-2.5 rounded-full transition-all ${
                    clampedStudentPage === i ? 'bg-amber-400 scale-125' : 'bg-slate-700 hover:bg-slate-600'
                  }`}
                  title={`Página ${i + 1}`}
                />
              ))}
            </div>
          )}

          <button
            onClick={goNext}
            disabled={!canGoNext}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-900 font-bold text-sm md:text-base rounded-xl shadow-lg shadow-amber-500/20 transition-all"
          >
            <span>Siguiente</span>
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

