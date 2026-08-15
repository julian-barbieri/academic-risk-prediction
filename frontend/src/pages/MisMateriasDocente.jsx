import { useEffect, useState } from "react";
import { Inbox } from "lucide-react";
import api from "../api/axios";
import EmptyState from "../components/EmptyState";
import ErrorMessage from "../components/ErrorMessage";
import LoadingSpinner from "../components/LoadingSpinner";
import MateriaDocenteCard from "../components/gestion/MateriaDocenteCard";

export default function MisMateriasDocente() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activas, setActivas] = useState([]);
  const [historial, setHistorial] = useState([]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError("");

      try {
        const response = await api.get("/api/gestion/mis-materias");
        setActivas(response.data?.activas || []);
        setHistorial(response.data?.historial || []);
      } catch (fetchError) {
        setError(fetchError.message || "No se pudieron cargar tus materias.");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header con acento brand — consistente con GestionNotas */}
      <section className="rounded-lg border border-surface-border border-t-[3px] border-t-brand-500 bg-white p-6">
        <h2 className="text-xl font-semibold text-slate-900">Mis materias</h2>
        <p className="mt-1.5 text-sm text-slate-500">
          Consultá tus materias activas y el historial de asignaciones anteriores.
        </p>
      </section>

      {error ? (
        <ErrorMessage message={error} onDismiss={() => setError("")} />
      ) : null}

      {loading ? (
        <LoadingSpinner size="md" text="Cargando materias asignadas..." />
      ) : (
        <>
          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-slate-900">
              Materias activas
            </h3>

            {activas.length === 0 ? (
              <EmptyState
                icon={<Inbox />}
                title="Todavía no tenés materias asignadas"
                description='Esperá a que el Administrador/Director te asigne una materia desde el panel de "Gestión de materias".'
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {activas.map((item) => (
                  <MateriaDocenteCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </section>

          {historial.length > 0 ? (
            <section className="space-y-3">
              <h3 className="text-lg font-semibold text-slate-900">
                Historial
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {historial.map((item) => (
                  <MateriaDocenteCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
