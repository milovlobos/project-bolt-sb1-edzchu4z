import { AuthProvider, useAuth } from './contexts/AuthContext';
import { EvaluationProvider } from './contexts/EvaluationContext';
import Login from './components/Login';
import EvaluatorView from './components/EvaluatorView';
import AttendanceView from './components/AttendanceView';
import AdminView from './components/AdminView';

function AppContent() {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Login />;
  }

  if (user?.role === 'admin') {
    return <AdminView />;
  }

  if (user?.role === 'lista') {
    return <AttendanceView />;
  }

  if (user?.role === 'evaluador') {
    return <EvaluatorView />;
  }

  return <Login />;
}

function App() {
  return (
    <AuthProvider>
      <EvaluationProvider>
        <AppContent />
      </EvaluationProvider>
    </AuthProvider>
  );
}

export default App;
