import { useState, useMemo, useEffect } from 'react';
import { ArrowLeft, SortAsc, SortDesc, Trophy, Award, AlertTriangle, AlertCircle } from 'lucide-react';
import { getStudents, getAttendance, StudentWithBelt, CATEGORIES, SUBCATEGORIES, getBeltStyle } from '../lib/supabase';
import { useEvaluation } from '../contexts/EvaluationContext';

interface Props {
  onClose: () => void;
}

const getAllEvaluationItems = (): { category: string; subcategory: string | null }[] => {
  const items: { category: string; subcategory: string | null }[] = [];
  CATEGORIES.forEach((cat) => {
    const subcats = SUBCATEGORIES[cat];
    if (subcats.length > 0) {
      subcats.forEach((sub) => {
        items.push({ category: cat, subcategory: sub });
      });
    } else {
      items.push({ category: cat, subcategory: null });
    }
  });
  return items;
};

export default function ResultsSummary({ onClose }: Props) {
  const [students, setStudents] = useState<StudentWithBelt[]>([]);
  const [attendance, setAttendance] = useState<Map<string, boolean>>(new Map());
  const [loading, setLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const { calculateAverage, getCategoryAverage, activeExam } = useEvaluation();

  useEffect(() => {
    const loadData = async () => {
      try {
        const [studentsData, attendanceData] = await Promise.all([
          getStudents('last_name'),
          getAttendance(new Date().toISOString().split('T')[0], activeExam?.id),
        ]);
        if (studentsData) setStudents(studentsData);
        if (attendanceData) {
          const attMap = new Map<string, boolean>();
          attendanceData.forEach((a) => attMap.set(a.student_id, a.present));
          setAttendance(attMap);
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
  }, [activeExam]);

  const evaluationItems = useMemo(() => getAllEvaluationItems(), []);

  const studentResults = useMemo(() => {
    const results = students.map((student) => {
      const average = calculateAverage(student.id);

      const categories = evaluationItems.map(({ category, subcategory }) => {
        const avgValue = getCategoryAverage(student.id, category, subcategory);
        let ratingKey: string | null = null;
        if (avgValue !== null) {
          if (avgValue >= 4.5) ratingKey = 'destacado';
          else if (avgValue >= 3.5) ratingKey = 'logrado';
          else if (avgValue >= 2.5) ratingKey = 'suficiente';
          else if (avgValue >= 1.5) ratingKey = 'por_mejorar';
          else ratingKey = 'insuficiente';
        }
        return { category, subcategory, rating: ratingKey, value: avgValue };
      });

      return {
        student,
        average,
        categories,
        totalCategories: evaluationItems.length,
        evaluatedCategories: categories.filter((c) => c.value !== null).length,
      };
    });

    return results.sort((a, b) =>
      sortOrder === 'desc' ? b.average - a.average : a.average - b.average
    );
  }, [students, evaluationItems, calculateAverage, getCategoryAverage, sortOrder]);

  const getBadge = (average: number) => {
    if (average >= 4.5) {
      return {
        color: 'bg-blue-500',
        textColor: 'text-blue-400',
        label: 'Destacado',
        icon: Award,
      };
    }
    if (average >= 3.5) {
      return {
        color: 'bg-green-500',
        textColor: 'text-green-400',
        label: 'Logrado',
        icon: Award,
      };
    }
    if (average >= 2.5) {
      return {
        color: 'bg-yellow-500',
        textColor: 'text-yellow-400',
        label: 'Suficiente',
        icon: Award,
      };
    }
    if (average >= 1.5) {
      return {
        color: 'bg-orange-500',
        textColor: 'text-orange-400',
        label: 'Por mejorar',
        icon: AlertTriangle,
      };
    }
    return {
      color: 'bg-red-500',
      textColor: 'text-red-400',
      label: 'Insuficiente',
      icon: AlertTriangle,
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400">Cargando resultados...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-3 sticky top-0 z-10 shadow-lg">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-300">Volver</span>
          </button>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center">
              <Trophy className="w-5 h-5 text-slate-900" />
            </div>
            <h1 className="text-lg font-bold text-white">Resumen de Resultados</h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
              className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            >
              {sortOrder === 'desc' ? <SortDesc className="w-4 h-4 text-amber-400" /> : <SortAsc className="w-4 h-4 text-amber-400" />}
              <span className="text-sm text-slate-300 hidden sm:inline">Ordenar</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4 lg:p-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid gap-4">
            {studentResults.map(({ student, average, categories, evaluatedCategories, totalCategories }) => {
              const badge = getBadge(average);
              const BadgeIcon = badge.icon;
              const isAbsent = attendance.get(student.id) === false;

              return (
                <div
                  key={student.id}
                  className={`bg-slate-800 rounded-xl border overflow-hidden transition-all ${
                    isAbsent
                      ? 'border-red-500/40 opacity-70 scale-[0.99]'
                      : 'border-slate-700'
                  }`}
                >
                  <div className="p-4 lg:p-6 flex flex-col lg:flex-row lg:items-center gap-4">
                    <div className="flex items-center gap-4 flex-1">
                      {(() => {
                        const bs = getBeltStyle(student.belts);
                        return <div className={`w-3 h-12 rounded-full ${bs.className}`} style={bs.style} />;
                      })()}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-white text-lg truncate">
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
                          Cinturón {student.belts.name} - {student.age} años ({student.age_group || 'Sin grupo'})
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 lg:gap-6">
                      <div className="text-center">
                        <p className="text-xs text-slate-500 uppercase tracking-wider">Categorías</p>
                        <p className="text-lg font-bold text-white">
                          {evaluatedCategories}/{totalCategories}
                        </p>
                      </div>

                      <div className="text-center">
                        <p className="text-xs text-slate-500 uppercase tracking-wider">Promedio</p>
                        <div className="flex items-center gap-2">
                          <span className={`text-3xl font-bold ${isAbsent ? 'text-red-400' : badge.textColor}`}>
                            {isAbsent ? '0.00' : average.toFixed(2)}
                          </span>
                          <div className={`w-8 h-8 rounded-lg ${isAbsent ? 'bg-red-500' : badge.color} flex items-center justify-center`}>
                            {isAbsent ? <AlertCircle className="w-4 h-4 text-white" /> : <BadgeIcon className="w-4 h-4 text-white" />}
                          </div>
                        </div>
                      </div>

                      <div className="text-center min-w-[80px]">
                        <p className="text-xs text-slate-500 uppercase tracking-wider">Estado</p>
                        {isAbsent ? (
                          <span className="inline-block px-3 py-1 rounded-full text-sm font-medium text-red-400 bg-red-500/20 border border-red-500/30">
                            Ausente
                          </span>
                        ) : (
                          <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${badge.textColor} ${badge.color}/20 border ${badge.color}/30`}>
                            {badge.label}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-900/50 border-t border-slate-700 p-4 overflow-x-auto">
                    <div className="flex gap-2 min-w-max">
                      {categories.map(({ category, subcategory, rating, value }) => (
                        <div
                          key={`${category}-${subcategory || 'none'}`}
                          className={`flex flex-col items-center justify-center px-3 py-2 rounded-lg ${
                            isAbsent
                              ? 'bg-slate-800/40 border border-slate-700 opacity-60'
                              : rating
                              ? rating === 'red'
                                ? 'bg-red-500/10 border border-red-500/30'
                                : rating === 'yellow'
                                ? 'bg-yellow-500/10 border border-yellow-500/30'
                                : 'bg-green-500/10 border border-green-500/30'
                              : 'bg-slate-700/50 border border-slate-600'
                          }`}
                        >
                          <span className="text-xs text-slate-400 capitalize">
                            {CATEGORIES.find((c) => c === category)}
                            {subcategory && `/${subcategory}`}
                          </span>
                          <span className={`font-bold ${
                            isAbsent
                              ? 'text-slate-600'
                              : rating === 'red'
                              ? 'text-red-400'
                              : rating === 'yellow'
                              ? 'text-yellow-400'
                              : rating === 'green'
                              ? 'text-green-400'
                              : 'text-slate-500'
                          }`}>
                            {isAbsent ? 'Aus.' : value !== null ? value.toFixed(1) : '-'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
