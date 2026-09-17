import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { getEvaluations, saveEvaluation, getExams, Evaluation, Exam, Rating, getRatingPointValue } from '../lib/supabase';
import { useWebSocket } from '../lib/useWebSocket';

interface EvaluationState {
  evaluations: Evaluation[];
  exams: Exam[];
  activeExam: Exam | null;
  loadExams: () => Promise<void>;
  setRating: (studentId: string, category: string, subcategory: string | null, rating: Rating, evaluatorId: string) => Promise<void>;
  setNotes: (studentId: string, category: string, subcategory: string | null, notes: string, evaluatorId: string) => Promise<void>;
  getRating: (studentId: string, category: string, subcategory: string | null, evaluatorId: string) => Rating | null;
  getNotes: (studentId: string, category: string, subcategory: string | null, evaluatorId: string) => string;
  getCategoryAverage: (studentId: string, category: string, subcategory: string | null) => number | null;
  calculateAverage: (studentId: string) => number;
  refreshEvaluations: (examId?: string) => Promise<void>;
}

const EvaluationContext = createContext<EvaluationState | null>(null);

export function EvaluationProvider({ children }: { children: ReactNode }) {
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [activeExam, setActiveExam] = useState<Exam | null>(null);

  const loadExams = useCallback(async () => {
    try {
      const data = await getExams();
      if (data) {
        setExams(data);
        const active = data.find((e) => e.is_active) || data[0] || null;
        setActiveExam(active);
      }
    } catch (error) {
      console.error('Error loading exams:', error);
    }
  }, []);

  const loadEvaluations = useCallback(async (examId?: string) => {
    try {
      const targetId = examId || activeExam?.id;
      if (targetId) {
        const data = await getEvaluations(targetId);
        setEvaluations(data || []);
      } else {
        setEvaluations([]);
      }
    } catch (error) {
      console.error('Error loading evaluations:', error);
    }
  }, [activeExam]);

  // Real-time WebSocket listener
  useWebSocket(useCallback((msg) => {
    if (msg.type === 'EVALUATION_SAVED') {
      loadEvaluations(activeExam?.id);
    }
  }, [loadEvaluations, activeExam]));

  // Load exams on mount
  useEffect(() => {
    loadExams();
  }, [loadExams]);

  // Load evaluations when activeExam changes
  useEffect(() => {
    if (activeExam) {
      loadEvaluations(activeExam.id);
    }
  }, [activeExam, loadEvaluations]);

  const setRating = useCallback(async (
    studentId: string, 
    category: string, 
    subcategory: string | null, 
    rating: Rating, 
    evaluatorId: string
  ) => {
    if (!activeExam) {
      console.warn('No active exam to save evaluation');
      return;
    }
    try {
      const existing = evaluations.find(
        (ev) =>
          ev.student_id === studentId &&
          ev.category === category &&
          ev.subcategory === subcategory &&
          ev.evaluator_id === evaluatorId &&
          ev.exam_id === activeExam.id
      );
      const notes = existing?.notes || '';

      const updated = await saveEvaluation(studentId, category, subcategory, rating, notes, evaluatorId, activeExam.id);
      
      setEvaluations((prev) => {
        const filtered = prev.filter(
          (ev) =>
            !(
              ev.student_id === studentId &&
              ev.category === category &&
              ev.subcategory === subcategory &&
              ev.evaluator_id === evaluatorId &&
              ev.exam_id === activeExam.id
            )
        );
        return [...filtered, updated];
      });
    } catch (err) {
      console.error('Error saving evaluation rating:', err);
    }
  }, [evaluations, activeExam]);

  const setNotes = useCallback(async (
    studentId: string, 
    category: string, 
    subcategory: string | null, 
    text: string, 
    evaluatorId: string
  ) => {
    if (!activeExam) {
      console.warn('No active exam to save notes');
      return;
    }
    try {
      const existing = evaluations.find(
        (ev) =>
          ev.student_id === studentId &&
          ev.category === category &&
          ev.subcategory === subcategory &&
          ev.evaluator_id === evaluatorId &&
          ev.exam_id === activeExam.id
      );
      const rating = (existing?.rating || '') as Rating;

      const updated = await saveEvaluation(studentId, category, subcategory, rating, text, evaluatorId, activeExam.id);
      
      setEvaluations((prev) => {
        const filtered = prev.filter(
          (ev) =>
            !(
              ev.student_id === studentId &&
              ev.category === category &&
              ev.subcategory === subcategory &&
              ev.evaluator_id === evaluatorId &&
              ev.exam_id === activeExam.id
            )
        );
        return [...filtered, updated];
      });
    } catch (err) {
      console.error('Error saving evaluation notes:', err);
    }
  }, [evaluations, activeExam]);

  const getRating = useCallback((
    studentId: string, 
    category: string, 
    subcategory: string | null, 
    evaluatorId: string
  ) => {
    const found = evaluations.find(
      (ev) =>
        ev.student_id === studentId &&
        ev.category === category &&
        ev.subcategory === subcategory &&
        ev.evaluator_id === evaluatorId
    );
    return found ? (found.rating || null) : null;
  }, [evaluations]);

  const getNotes = useCallback((
    studentId: string, 
    category: string, 
    subcategory: string | null, 
    evaluatorId: string
  ) => {
    const found = evaluations.find(
      (ev) =>
        ev.student_id === studentId &&
        ev.category === category &&
        ev.subcategory === subcategory &&
        ev.evaluator_id === evaluatorId
    );
    return found && found.notes ? found.notes : '';
  }, [evaluations]);

  const getCategoryAverage = useCallback((
    studentId: string, 
    category: string, 
    subcategory: string | null
  ) => {
    const matches = evaluations.filter(
      (ev) =>
        ev.student_id === studentId &&
        ev.category === category &&
        ev.subcategory === subcategory &&
        ev.rating &&
        getRatingPointValue(ev.rating) > 0
    );
    if (matches.length === 0) return null;
    const sum = matches.reduce((acc, ev) => acc + getRatingPointValue(ev.rating), 0);
    return sum / matches.length;
  }, [evaluations]);

  const calculateAverage = useCallback((studentId: string) => {
    const studentEvs = evaluations.filter((ev) => ev.student_id === studentId && ev.rating && getRatingPointValue(ev.rating) > 0);
    if (studentEvs.length === 0) return 0;
    const sum = studentEvs.reduce((acc, ev) => acc + getRatingPointValue(ev.rating), 0);
    return sum / studentEvs.length;
  }, [evaluations]);


  return (
    <EvaluationContext.Provider value={{
      evaluations,
      exams,
      activeExam,
      loadExams,
      setRating,
      setNotes,
      getRating,
      getNotes,
      getCategoryAverage,
      calculateAverage,
      refreshEvaluations: loadEvaluations,
    }}>
      {children}
    </EvaluationContext.Provider>
  );
}

export function useEvaluation() {
  const context = useContext(EvaluationContext);
  if (!context) {
    throw new Error('useEvaluation must be used within EvaluationProvider');
  }
  return context;
}
