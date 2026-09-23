import { useState, useMemo, useEffect } from 'react';
import {
  ArrowLeft, SortAsc, SortDesc, Trophy, Award, AlertTriangle, AlertCircle,
  ChevronDown, ChevronRight, Layers, Users, LayoutGrid, ChevronsDownUp, ChevronsUpDown,
} from 'lucide-react';
import {
  getStudents, getAttendance, getExamCourts, getEvaluatorStudents,
  StudentWithBelt, CATEGORIES, SUBCATEGORIES, CATEGORY_LABELS, SUBCATEGORY_LABELS,
  getBeltStyle, getRatingPointValue, Court,
} from '../lib/supabase';
import { useEvaluation } from '../contexts/EvaluationContext';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  onClose: () => void;
  evaluatorId?: string;
}

type GroupMode = 'none' | 'belt' | 'court';

/* ── helpers ──────────────────────────────────────────── */

const getAllEvaluationItems = (): { category: string; subcategory: string | null }[] => {
  const items: { category: string; subcategory: string | null }[] = [];
  CATEGORIES.forEach((cat) => {
    const subcats = SUBCATEGORIES[cat];
    if (subcats.length > 0) {
      subcats.forEach((sub) => items.push({ category: cat, subcategory: sub }));
    } else {
      items.push({ category: cat, subcategory: null });
    }
  });
  return items;
};

const ratingLabel = (value: number | null): string => {
  if (value === null) return '—';
  if (value >= 4.5) return 'Destacado';
  if (value >= 3.5) return 'Logrado';
  if (value >= 2.5) return 'Suficiente';
  if (value >= 1.5) return 'Por mejorar';
  return 'Insuficiente';
};

const ratingColor = (value: number | null): string => {
  if (value === null) return 'text-slate-500';
  if (value >= 4.5) return 'text-blue-400';
  if (value >= 3.5) return 'text-green-400';
  if (value >= 2.5) return 'text-yellow-400';
  if (value >= 1.5) return 'text-orange-400';
  return 'text-red-400';
};

const ratingBg = (value: number | null): string => {
  if (value === null) return 'bg-slate-700/50 border-slate-600';
  if (value >= 4.5) return 'bg-blue-500/10 border-blue-500/30';
  if (value >= 3.5) return 'bg-green-500/10 border-green-500/30';
  if (value >= 2.5) return 'bg-yellow-500/10 border-yellow-500/30';
  if (value >= 1.5) return 'bg-orange-500/10 border-orange-500/30';
  return 'bg-red-500/10 border-red-500/30';
};

const getBadge = (average: number) => {
  if (average >= 4.5) return { color: 'bg-blue-500', textColor: 'text-blue-400', label: 'Destacado', icon: Award };
  if (average >= 3.5) return { color: 'bg-green-500', textColor: 'text-green-400', label: 'Logrado', icon: Award };
  if (average >= 2.5) return { color: 'bg-yellow-500', textColor: 'text-yellow-400', label: 'Suficiente', icon: Award };
  if (average >= 1.5) return { color: 'bg-orange-500', textColor: 'text-orange-400', label: 'Por mejorar', icon: AlertTriangle };
  return { color: 'bg-red-500', textColor: 'text-red-400', label: 'Insuficiente', icon: AlertTriangle };
};

/* ── types ──────────────────────────────────────────── */

interface StudentResult {
  student: StudentWithBelt;
  average: number;
  categories: { category: string; subcategory: string | null; value: number | null; notes: string[] }[];
  totalCategories: number;
  evaluatedCategories: number;
  isAbsent: boolean;
}

interface GroupData {
  key: string;
  label: string;
  beltStyle?: { style: React.CSSProperties; className: string };
  extraInfo?: string;
  students: StudentResult[];
  average: number;
}

/* ── sub‑components ──────────────────────────────────── */

function StudentCard({ result, defaultExpanded }: { result: StudentResult; defaultExpanded: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { student, average, categories, evaluatedCategories, totalCategories, isAbsent } = result;
  const badge = getBadge(average);
  const BadgeIcon = badge.icon;
  const bs = getBeltStyle(student.belts);

  return (
    <div
      className={`bg-slate-800 rounded-xl border overflow-hidden transition-all duration-200 ${
        isAbsent ? 'border-red-500/40 opacity-70' : 'border-slate-700 hover:border-slate-600'
      }`}
    >
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left p-4 lg:p-5 flex flex-col lg:flex-row lg:items-center gap-3 cursor-pointer group"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-3 h-12 rounded-full flex-shrink-0 ${bs.className}`} style={bs.style} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-white text-base truncate">
                {student.first_name} {student.last_name}
              </h3>
              {isAbsent && (
                <span className="flex items-center gap-1 bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-bold px-2 py-0.5 rounded-full">
                  <AlertCircle className="w-3 h-3" />
                  Ausente
                </span>
              )}
            </div>
            <p className="text-sm text-slate-400 mt-0.5">
              {student.belts?.name || 'Sin cinturón'} · {student.age ?? '?'} años
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 lg:gap-6 flex-shrink-0">
          <div className="text-center">
            <p className="text-xs text-slate-500 uppercase tracking-wider">Ítems</p>
            <p className="text-sm font-bold text-white">{evaluatedCategories}/{totalCategories}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-500 uppercase tracking-wider">Promedio</p>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-bold ${isAbsent ? 'text-red-400' : badge.textColor}`}>
                {isAbsent ? '0.00' : average.toFixed(2)}
              </span>
              <div className={`w-7 h-7 rounded-lg ${isAbsent ? 'bg-red-500' : badge.color} flex items-center justify-center`}>
                {isAbsent ? <AlertCircle className="w-3.5 h-3.5 text-white" /> : <BadgeIcon className="w-3.5 h-3.5 text-white" />}
              </div>
            </div>
          </div>
          <div className="text-center min-w-[72px]">
            <p className="text-xs text-slate-500 uppercase tracking-wider">Estado</p>
            {isAbsent ? (
              <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium text-red-400 bg-red-500/20 border border-red-500/30">
                Ausente
              </span>
            ) : (
              <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.textColor} ${badge.color}/20 border ${badge.color}/30`}>
                {badge.label}
              </span>
            )}
          </div>
          <div className="text-slate-500 group-hover:text-slate-300 transition-colors">
            {expanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </div>
        </div>
      </button>

      {/* Expanded detail table */}
      {expanded && (
        <div className="border-t border-slate-700 bg-slate-900/60 overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="border-b border-slate-700/60">
                <th className="text-left px-4 py-2.5 text-xs text-slate-500 uppercase tracking-wider font-medium">Categoría</th>
                <th className="text-left px-4 py-2.5 text-xs text-slate-500 uppercase tracking-wider font-medium">Subcategoría</th>
                <th className="text-center px-4 py-2.5 text-xs text-slate-500 uppercase tracking-wider font-medium">Nota</th>
                <th className="text-center px-4 py-2.5 text-xs text-slate-500 uppercase tracking-wider font-medium">Nivel</th>
                <th className="text-left px-4 py-2.5 text-xs text-slate-500 uppercase tracking-wider font-medium">Notas del evaluador</th>
              </tr>
            </thead>
            <tbody>
              {categories.map(({ category, subcategory, value, notes }, idx) => (
                <tr
                  key={`${category}-${subcategory || 'none'}`}
                  className={`border-b border-slate-800/60 ${idx % 2 === 0 ? 'bg-slate-800/20' : 'bg-slate-900/40'} hover:bg-slate-700/30 transition-colors`}
                >
                  <td className="px-4 py-2.5 text-slate-300 font-medium capitalize">
                    {CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] || category}
                  </td>
                  <td className="px-4 py-2.5 text-slate-400 capitalize">
                    {subcategory ? (SUBCATEGORY_LABELS[subcategory] || subcategory) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-block px-2.5 py-1 rounded-md border text-sm font-bold ${ratingBg(isAbsent ? null : value)} ${ratingColor(isAbsent ? null : value)}`}>
                      {isAbsent ? 'Aus.' : value !== null ? value.toFixed(1) : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`text-xs font-medium ${ratingColor(isAbsent ? null : value)}`}>
                      {isAbsent ? 'Ausente' : ratingLabel(value)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-400 text-xs max-w-[250px]">
                    {notes.length > 0 ? (
                      <div className="space-y-0.5">
                        {notes.map((n, i) => (
                          <p key={i} className="truncate" title={n}>💬 {n}</p>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-600 italic">Sin notas</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function GroupSection({ group, allExpanded }: { group: GroupData; allExpanded: boolean }) {
  const [open, setOpen] = useState(true);
  const avgBadge = getBadge(group.average);

  return (
    <div className="rounded-2xl border border-slate-700/60 overflow-hidden bg-slate-800/30">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 lg:px-5 lg:py-4 cursor-pointer hover:bg-slate-700/30 transition-colors"
      >
        {/* Belt color bar or icon */}
        {group.beltStyle ? (
          <div className={`w-4 h-10 rounded-md flex-shrink-0 ${group.beltStyle.className}`} style={group.beltStyle.style} />
        ) : (
          <div className="w-4 h-10 rounded-md flex-shrink-0 bg-gradient-to-b from-amber-500 to-orange-600" />
        )}

        <div className="flex-1 min-w-0 text-left">
          <h2 className="text-base font-bold text-white truncate">{group.label}</h2>
          {group.extraInfo && <p className="text-xs text-slate-400 mt-0.5">{group.extraInfo}</p>}
        </div>

        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="flex items-center gap-1.5 bg-slate-700/60 px-2.5 py-1 rounded-lg">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-sm font-bold text-white">{group.students.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`text-lg font-bold ${avgBadge.textColor}`}>{group.average.toFixed(2)}</span>
            <div className={`w-6 h-6 rounded-md ${avgBadge.color} flex items-center justify-center`}>
              <Award className="w-3 h-3 text-white" />
            </div>
          </div>
          {open ? <ChevronDown className="w-5 h-5 text-slate-500" /> : <ChevronRight className="w-5 h-5 text-slate-500" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-700/40 p-3 lg:p-4 space-y-3">
          {group.students.map((r) => (
            <StudentCard key={r.student.id} result={r} defaultExpanded={allExpanded} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── main component ──────────────────────────────────── */

export default function ResultsSummary({ onClose, evaluatorId }: Props) {
  const [students, setStudents] = useState<StudentWithBelt[]>([]);
  const [attendance, setAttendance] = useState<Map<string, boolean>>(new Map());
  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [groupMode, setGroupMode] = useState<GroupMode>('none');
  const [allExpanded, setAllExpanded] = useState(false);

  const { user } = useAuth();
  const { evaluations, calculateAverage, getCategoryAverage, activeExam } = useEvaluation();

  // If user is an evaluator, restrict to their ID. Otherwise use evaluatorId prop if provided.
  const activeEvaluatorId = evaluatorId || (user?.role === 'evaluador' ? user?.id : undefined);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [studentsData, attendanceData] = await Promise.all([
          activeEvaluatorId && activeExam
            ? getEvaluatorStudents(activeExam.id, activeEvaluatorId).catch(() => getStudents('last_name'))
            : getStudents('last_name'),
          getAttendance(new Date().toISOString().split('T')[0], activeExam?.id),
        ]);
        if (studentsData) setStudents(studentsData);
        if (attendanceData) {
          const attMap = new Map<string, boolean>();
          attendanceData.forEach((a) => attMap.set(a.student_id, a.present));
          setAttendance(attMap);
        }

        // Load courts for court-grouping
        if (activeExam) {
          try {
            const courtData = await getExamCourts(activeExam.id);
            setCourts(courtData || []);
          } catch {
            setCourts([]);
          }
        }

        setLoading(false);
      } catch (error) {
        console.error('Error loading data:', error);
        setLoading(false);
      }
    };
    if (activeExam) {
      loadData();
    }
  }, [activeExam, activeEvaluatorId]);

  const evaluationItems = useMemo(() => getAllEvaluationItems(), []);

  /* Build per-student results */
  const studentResults: StudentResult[] = useMemo(() => {
    // Filter evaluations to active evaluator if set
    const relevantEvaluations = activeEvaluatorId
      ? evaluations.filter((ev) => ev.evaluator_id === activeEvaluatorId)
      : evaluations;

    const results = students.map((student) => {
      // Average for student
      let average = 0;
      if (activeEvaluatorId) {
        const studentEvs = relevantEvaluations.filter(
          (ev) => ev.student_id === student.id && ev.rating && getRatingPointValue(ev.rating) > 0
        );
        average = studentEvs.length > 0
          ? studentEvs.reduce((acc, ev) => acc + getRatingPointValue(ev.rating), 0) / studentEvs.length
          : 0;
      } else {
        average = calculateAverage(student.id);
      }

      const isAbsent = attendance.get(student.id) === false;

      const categories = evaluationItems.map(({ category, subcategory }) => {
        let avgValue: number | null = null;
        if (activeEvaluatorId) {
          const itemEvs = relevantEvaluations.filter(
            (ev) =>
              ev.student_id === student.id &&
              ev.category === category &&
              ev.subcategory === subcategory &&
              ev.rating &&
              getRatingPointValue(ev.rating) > 0
          );
          avgValue = itemEvs.length > 0
            ? itemEvs.reduce((acc, ev) => acc + getRatingPointValue(ev.rating), 0) / itemEvs.length
            : null;
        } else {
          avgValue = getCategoryAverage(student.id, category, subcategory);
        }

        // Collect notes for this item
        const notesList = relevantEvaluations
          .filter(
            (ev) =>
              ev.student_id === student.id &&
              ev.category === category &&
              ev.subcategory === subcategory &&
              ev.notes &&
              ev.notes.trim().length > 0
          )
          .map((ev) => ev.notes!.trim());

        return { category, subcategory, value: avgValue, notes: notesList };
      });

      return {
        student,
        average,
        categories,
        totalCategories: evaluationItems.length,
        evaluatedCategories: categories.filter((c) => c.value !== null).length,
        isAbsent,
      };
    });

    return results.sort((a, b) =>
      sortOrder === 'desc' ? b.average - a.average : a.average - b.average
    );
  }, [students, evaluationItems, calculateAverage, getCategoryAverage, evaluations, attendance, sortOrder, activeEvaluatorId]);

  /* Grouping logic */
  const groups: GroupData[] | null = useMemo(() => {
    if (groupMode === 'none') return null;

    if (groupMode === 'belt') {
      const beltMap = new Map<string, StudentResult[]>();
      const beltOrder: string[] = [];

      studentResults.forEach((r) => {
        const beltName = r.student.belts?.name || 'Sin cinturón';
        if (!beltMap.has(beltName)) {
          beltMap.set(beltName, []);
          beltOrder.push(beltName);
        }
        beltMap.get(beltName)!.push(r);
      });

      // Sort belt groups by belt order_index
      beltOrder.sort((a, b) => {
        const aIdx = studentResults.find((r) => (r.student.belts?.name || 'Sin cinturón') === a)?.student.belts?.order_index ?? 999;
        const bIdx = studentResults.find((r) => (r.student.belts?.name || 'Sin cinturón') === b)?.student.belts?.order_index ?? 999;
        return aIdx - bIdx;
      });

      return beltOrder.map((beltName) => {
        const items = beltMap.get(beltName)!;
        const presentItems = items.filter((r) => !r.isAbsent && r.average > 0);
        const avg = presentItems.length > 0
          ? presentItems.reduce((s, r) => s + r.average, 0) / presentItems.length
          : 0;

        const sampleBelt = items[0]?.student.belts;
        return {
          key: beltName,
          label: `Cinturón ${beltName}`,
          beltStyle: getBeltStyle(sampleBelt),
          extraInfo: `${items.length} alumno${items.length !== 1 ? 's' : ''}`,
          students: items,
          average: avg,
        };
      });
    }

    // court grouping
    if (groupMode === 'court') {
      const courtGroups: GroupData[] = [];
      const assignedIds = new Set<string>();

      courts.forEach((court) => {
        const courtStudentIds = new Set(court.students.map((s) => s.id));
        const items = studentResults.filter((r) => courtStudentIds.has(r.student.id));
        items.forEach((r) => assignedIds.add(r.student.id));

        const presentItems = items.filter((r) => !r.isAbsent && r.average > 0);
        const avg = presentItems.length > 0
          ? presentItems.reduce((s, r) => s + r.average, 0) / presentItems.length
          : 0;

        const beltsInfo = court.allowed_belts && court.allowed_belts.length > 0
          ? `Cinturones: ${court.allowed_belts.join(', ')}`
          : 'Todos los cinturones';

        courtGroups.push({
          key: court.id,
          label: court.name,
          extraInfo: `${court.min_age}–${court.max_age} años · ${beltsInfo} · ${items.length} alumno${items.length !== 1 ? 's' : ''}`,
          students: items,
          average: avg,
        });
      });

      // Unassigned students
      const unassigned = studentResults.filter((r) => !assignedIds.has(r.student.id));
      if (unassigned.length > 0) {
        const presentItems = unassigned.filter((r) => !r.isAbsent && r.average > 0);
        const avg = presentItems.length > 0
          ? presentItems.reduce((s, r) => s + r.average, 0) / presentItems.length
          : 0;
        courtGroups.push({
          key: '__unassigned',
          label: 'Sin asignar a cancha',
          extraInfo: `${unassigned.length} alumno${unassigned.length !== 1 ? 's' : ''}`,
          students: unassigned,
          average: avg,
        });
      }

      return courtGroups;
    }

    return null;
  }, [groupMode, studentResults, courts]);

  /* ── render ──────────────────────────────────── */

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400">Cargando resultados...</p>
        </div>
      </div>
    );
  }

  const groupButtons: { mode: GroupMode; label: string; icon: React.ReactNode }[] = [
    { mode: 'none', label: 'Todos', icon: <LayoutGrid className="w-4 h-4" /> },
    { mode: 'belt', label: 'Cinturón', icon: <Layers className="w-4 h-4" /> },
    { mode: 'court', label: 'Cancha', icon: <Users className="w-4 h-4" /> },
  ];

  // Compute general stats
  const presentStudents = studentResults.filter((r) => !r.isAbsent && r.average > 0);
  const generalAverage = presentStudents.length > 0
    ? presentStudents.reduce((s, r) => s + r.average, 0) / presentStudents.length
    : 0;

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* ── Header ───────────── */}
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-3 sticky top-0 z-10 shadow-lg">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          {/* Left */}
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-300 hidden sm:inline">Volver</span>
          </button>

          {/* Center title + stats */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center">
              <Trophy className="w-5 h-5 text-slate-900" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">Resumen de Resultados</h1>
              <p className="text-xs text-slate-400">
                {studentResults.length} alumnos · Promedio general <span className={`font-bold ${getBadge(generalAverage).textColor}`}>{generalAverage.toFixed(2)}</span>
              </p>
            </div>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Group mode */}
            <div className="flex bg-slate-700/60 rounded-lg overflow-hidden">
              {groupButtons.map(({ mode, label, icon }) => (
                <button
                  key={mode}
                  onClick={() => setGroupMode(mode)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                    groupMode === mode
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'text-slate-400 hover:text-white hover:bg-slate-600/50'
                  }`}
                >
                  {icon}
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>

            {/* Expand / collapse */}
            <button
              onClick={() => setAllExpanded((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-xs text-slate-300"
              title={allExpanded ? 'Colapsar todos' : 'Expandir todos'}
            >
              {allExpanded ? <ChevronsDownUp className="w-4 h-4 text-amber-400" /> : <ChevronsUpDown className="w-4 h-4 text-amber-400" />}
            </button>

            {/* Sort */}
            <button
              onClick={() => setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'))}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-xs text-slate-300"
            >
              {sortOrder === 'desc' ? <SortDesc className="w-4 h-4 text-amber-400" /> : <SortAsc className="w-4 h-4 text-amber-400" />}
              <span className="hidden sm:inline">Ordenar</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main content ───────────── */}
      <main className="flex-1 overflow-auto p-4 lg:p-6">
        <div className="max-w-6xl mx-auto space-y-4">
          {groups ? (
            /* Grouped view */
            groups.length === 0 ? (
              <div className="text-center py-16 text-slate-500">
                <Layers className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p>No hay grupos para mostrar</p>
              </div>
            ) : (
              groups.map((g) => (
                <GroupSection key={g.key} group={g} allExpanded={allExpanded} />
              ))
            )
          ) : (
            /* Flat view */
            studentResults.length === 0 ? (
              <div className="text-center py-16 text-slate-500">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p>No hay alumnos para mostrar</p>
              </div>
            ) : (
              studentResults.map((r) => (
                <StudentCard key={r.student.id} result={r} defaultExpanded={allExpanded} />
              ))
            )
          )}
        </div>
      </main>
    </div>
  );
}
