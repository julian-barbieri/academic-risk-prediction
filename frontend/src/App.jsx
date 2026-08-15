import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import PageLayout from "./components/PageLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./context/AuthContext";
import api from "./api/axios";
import AuthCallback from "./pages/AuthCallback";
import Dashboard from "./pages/Dashboard";
import PanelPredicciones from "./pages/PanelPredicciones";
import GestionMaterias from "./pages/GestionMaterias";
import GestionNotas from "./pages/GestionNotas";
import Inscripcion from "./pages/Inscripcion";
import Login from "./pages/Login";
import MateriaDetalle from "./pages/MateriaDetalle";
import Mensajes from "./pages/Mensajes";
import MisMateriasDocente from "./pages/MisMateriasDocente";
import MisNotas from "./pages/MisNotas";
import MisCursos from "./pages/MisCursos";
import NotFound from "./pages/NotFound";
import Predicciones from "./pages/Predicciones";
import AlumnoPerfil from "./pages/AlumnoPerfil";

function DashboardRoute() {
  const { user } = useAuth();
  if (user?.role === "docente") return <Navigate to="/panel-predicciones" replace />;
  return (
    <PageLayout
      title="Dashboard"
      subtitle="Resumen general del sistema y últimas predicciones registradas."
    >
      <Dashboard />
    </PageLayout>
  );
}

export default function App() {
  useEffect(() => {
    api.get("/api/warmup").catch(() => {});
  }, []);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardRoute />
          </ProtectedRoute>
        }
      />

      <Route
        path="/predicciones"
        element={
          <ProtectedRoute allowedRoles={["admin", "docente", "coordinador"]}>
            <PageLayout
              title="Predicciones"
              subtitle="Ejecutá predicciones de abandono, recursado y nota de examen."
            >
              <Predicciones />
            </PageLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/mensajes"
        element={
          <ProtectedRoute allowedRoles={["alumno", "coordinador"]}>
            <PageLayout
              title="Mensajes"
              subtitle="Comunicación entre alumnos, docentes y coordinadores"
            >
              <Mensajes />
            </PageLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/gestion-materias"
        element={
          <ProtectedRoute allowedRoles={["admin", "coordinador"]}>
            <PageLayout
              title="Gestión de materias"
              subtitle="Administrá asignaciones docentes y períodos de inscripción"
            >
              <GestionMaterias />
            </PageLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/panel-predicciones"
        element={
          <ProtectedRoute allowedRoles={["admin", "coordinador", "docente"]}>
            <PageLayout
              title="Panel de Predicciones"
              subtitle="Monitorea riesgo de abandono y accede a predicciones detalladas"
            >
              <PanelPredicciones />
            </PageLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/mis-materias"
        element={
          <ProtectedRoute allowedRoles={["docente"]}>
            <PageLayout
              title="Mis materias"
              subtitle="Materias activas e historial de asignaciones"
            >
              <MisMateriasDocente />
            </PageLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/gestion-notas"
        element={
          <ProtectedRoute allowedRoles={["docente"]}>
            <PageLayout
              title="Notas"
              subtitle="Carga y gestión de calificaciones por materia"
            >
              <GestionNotas />
            </PageLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/mis-cursos"
        element={
          <ProtectedRoute allowedRoles={["alumno"]}>
            <PageLayout
              title="Mis cursos"
              subtitle="Seguimiento de cursadas, finales pendientes y materias aprobadas"
            >
              <MisCursos />
            </PageLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/mis-notas"
        element={
          <ProtectedRoute allowedRoles={["alumno"]}>
            <PageLayout
              title="Mis notas"
              subtitle="Detalle de calificaciones en tus exámenes"
            >
              <MisNotas />
            </PageLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/inscripcion"
        element={
          <ProtectedRoute allowedRoles={["alumno"]}>
            <PageLayout
              title="Inscripción"
              subtitle="Inscribite o date de baja en materias según período vigente"
            >
              <Inscripcion />
            </PageLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/mis-cursos/:materiaId"
        element={
          <ProtectedRoute allowedRoles={["alumno"]}>
            <PageLayout>
              <MateriaDetalle />
            </PageLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/alumnos/:alumnoId"
        element={
          <ProtectedRoute allowedRoles={["admin", "coordinador", "docente"]}>
            <PageLayout
              title="Perfil del Alumno"
              subtitle="Información completa del estudiante y su desempeño académico"
            >
              <AlumnoPerfil />
            </PageLayout>
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
