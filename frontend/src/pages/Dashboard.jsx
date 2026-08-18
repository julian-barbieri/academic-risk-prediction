import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";
import KpiCard from "../components/dashboard/KpiCard";
import SeccionRendimiento from "../components/dashboard/SeccionRendimiento";
import GraficoHistoricoMateria from "../components/dashboard/GraficoHistoricoMateria";
import {
  Users, BookOpen, RotateCcw, ClipboardList, AlertTriangle,
  TrendingUp, Clock,
  BarChart3, Activity, PieChart, GraduationCap, Loader2,
} from "lucide-react";

// Reintentos en segundo plano mientras el ai-service (Render free tier)
// termina su cold start. Cada intento (incluido el inicial) ya espera hasta
// 60s en el backend (ver dashboard.routes.js), así que acá alcanza con pocos
// reintentos bien espaciados en vez de muchos cortos.
const AI_RETRY_DELAYS_MS = [5000, 45000];

function SkeletonLoader() {
  return (
    <div className="space-y-6">
      {/* Loading message */}
      <div className="flex flex-col items-center justify-center py-10 gap-4">
        {/* Spinner institucional: sin emoji, ícono SVG centrado */}
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-4 border-brand-100" />
          <div className="absolute inset-0 rounded-full border-4 border-brand-500 border-t-transparent animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center text-brand-500">
            <GraduationCap className="w-7 h-7" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-base font-medium text-gray-700">Cargando predicciones...</p>
          <p className="text-sm text-gray-400 mt-1">Esto puede tomar unos segundos</p>
        </div>
      </div>

      {/* KPI Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="animate-pulse bg-gray-200 rounded-lg h-24 w-full"
          />
        ))}
      </div>

      {/* Alertas y Distribución Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="animate-pulse bg-gray-200 rounded-lg h-64 w-full" />
        <div className="animate-pulse bg-gray-200 rounded-lg h-64 w-full" />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tabActiva, setTabActiva] = useState("resumen");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [aiRetryCount, setAiRetryCount] = useState(0);
  const [reintentandoIA, setReintentandoIA] = useState(false);

  // Estados para la tab de rendimiento por examen
  const [anioSeleccionado, setAnioSeleccionado] = useState(
    new Date().getFullYear(),
  );
  const [dataRendimiento, setDataRendimiento] = useState(null);
  const [loadingRend, setLoadingRend] = useState(false);
  const [aniosDisponibles, setAniosDisponibles] = useState([]);
  const [materiaSeleccionada, setMateriaSeleccionada] = useState(null);

  // Estados para la tab de rendimiento por materia
  const [anioCursada, setAnioCursada] = useState(new Date().getFullYear());
  const [materiaSeleccionadaMaterias, setMateriaSeleccionadaMaterias] = useState(null);
  const [aniosCursadaDisponibles, setAniosCursadaDisponibles] = useState([new Date().getFullYear()]);
  const [dataPorMateria, setDataPorMateria] = useState(null);
  const [dataDistribucion, setDataDistribucion] = useState(null);
  const [loadingAnio, setLoadingAnio] = useState(false);

  useEffect(() => {
    const cargarDashboard = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await api.get("/api/dashboard");
        setData(response.data);
      } catch (err) {
        console.error("Error cargando dashboard:", err);
        setError(err.message || "Error al cargar el dashboard");
      } finally {
        setLoading(false);
      }
    };

    cargarDashboard();
  }, []);

  // Si el servicio de IA todavía no respondió (cold start en Render),
  // reintentar en segundo plano sin bloquear el resto del dashboard.
  useEffect(() => {
    if (!data || data.ai_disponible || aiRetryCount >= AI_RETRY_DELAYS_MS.length) {
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const response = await api.get("/api/dashboard");
        setData(response.data);
      } catch (err) {
        console.error("Error reintentando dashboard (IA):", err);
      } finally {
        setAiRetryCount((c) => c + 1);
      }
    }, AI_RETRY_DELAYS_MS[aiRetryCount]);

    return () => clearTimeout(timer);
  }, [data, aiRetryCount]);

  // Reintento manual: se ofrece cuando ya se agotaron los reintentos
  // automáticos y el usuario sigue en la página.
  const reintentarIA = async () => {
    setReintentandoIA(true);
    try {
      const response = await api.get("/api/dashboard");
      setData(response.data);
    } catch (err) {
      console.error("Error reintentando dashboard (IA):", err);
    } finally {
      setAiRetryCount(0);
      setReintentandoIA(false);
    }
  };

  // Cargar datos de rendimiento por materia cuando cambia la tab o el año
  useEffect(() => {
    if (tabActiva !== "materias") return;

    const fetchPorMateria = async () => {
      try {
        setLoadingAnio(true);
        const resp = await api.get(`/api/dashboard/por-materia?anio_cursada=${anioCursada}`);
        setDataPorMateria(resp.data.por_materia);
        setDataDistribucion(resp.data.distribucion);
        setAniosCursadaDisponibles(resp.data.anios_disponibles);
      } catch (err) {
        console.error("Error cargando datos por materia:", err);
        setDataPorMateria([]);
        setDataDistribucion([]);
      } finally {
        setLoadingAnio(false);
      }
    };
    fetchPorMateria();
  }, [tabActiva, anioCursada]);

  // Cargar datos de rendimiento por examen cuando cambia la tab o el año
  useEffect(() => {
    if (tabActiva !== "rendimiento") return;

    const cargarRendimiento = async () => {
      try {
        setLoadingRend(true);
        const response = await api.get(
          `/api/dashboard/rendimiento?anio=${anioSeleccionado}`,
        );
        setDataRendimiento(response.data.por_materia);
        setAniosDisponibles(response.data.anios_disponibles);
      } catch (err) {
        console.error("Error cargando rendimiento:", err);
        setDataRendimiento([]);
      } finally {
        setLoadingRend(false);
      }
    };

    cargarRendimiento();
  }, [tabActiva, anioSeleccionado]);

  if (!user || !["admin", "coordinador"].includes(user.role)) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-600">
          No autorizado. Este dashboard es solo para admin y coordinadores.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 bg-white rounded-lg">
        <SkeletonLoader />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-red-700">
        <p className="font-medium">Error al cargar el dashboard</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  if (!data) {
    return <div className="p-6">Sin datos disponibles</div>;
  }

  // Extraer datos
  const {
    kpis,
    abandono,
    por_materia,
    distribucion_por_materia,
    alertas,
    actividad_reciente,
    ai_disponible,
  } = data;

  const formatearFecha = (isoString) => {
    const date = new Date(isoString);
    const ahora = new Date();
    const diff = Math.floor((ahora - date) / 1000);

    if (diff < 60) return "hace unos segundos";
    if (diff < 3600) return `hace ${Math.floor(diff / 60)} minutos`;
    if (diff < 86400) return `hace ${Math.floor(diff / 3600)} horas`;
    return `hace ${Math.floor(diff / 86400)} días`;
  };

  return (
    <div className="space-y-6">
      <div>
        {!ai_disponible && data && (
          aiRetryCount < AI_RETRY_DELAYS_MS.length ? (
            <div className="mt-3 flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
              <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" aria-hidden="true" />
              Calentando el servicio de predicciones IA... puede tardar hasta
              un minuto la primera vez.
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <span>
                El servicio de predicciones ML no está disponible. Se muestran
                solo datos académicos.
              </span>
              <button
                type="button"
                onClick={reintentarIA}
                disabled={reintentandoIA}
                className="ml-auto flex items-center gap-1 px-3 py-1 rounded-md border border-amber-300 bg-white text-amber-800 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {reintentandoIA && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                Reintentar
              </button>
            </div>
          )
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-8">
          {[
            { key: "resumen", label: "Resumen general" },
            { key: "materias", label: "Rendimiento por materia" },
            { key: "rendimiento", label: "Rendimiento por examen" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setTabActiva(tab.key)}
              className={`py-3 px-1 font-medium text-sm border-b-2 transition-colors ${
                tabActiva === tab.key
                  ? "border-brand-500 text-brand-600"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido de las tabs */}
      {tabActiva === "resumen" && (
        <SeccionResumen
          loading={loading}
          error={error}
          data={data}
          navigate={navigate}
          user={user}
          ai_disponible={data?.ai_disponible}
        />
      )}

      {tabActiva === "materias" && (
        <SeccionRendimientoMaterias
          dataPorMateria={dataPorMateria}
          dataDistribucion={dataDistribucion}
          loading={loadingAnio}
          anioCursada={anioCursada}
          aniosCursadaDisponibles={aniosCursadaDisponibles}
          materiaSeleccionada={materiaSeleccionadaMaterias}
          onAnioCursadaChange={(anio) => { setAnioCursada(anio); setMateriaSeleccionadaMaterias(null); }}
          onMateriaChange={setMateriaSeleccionadaMaterias}
        />
      )}

      {tabActiva === "rendimiento" && (
        <SeccionRendimiento
          data={dataRendimiento}
          loading={loadingRend}
          anio={anioSeleccionado}
          aniosDisponibles={aniosDisponibles}
          onAnioChange={setAnioSeleccionado}
          materiaSeleccionada={materiaSeleccionada}
          onMateriaChange={setMateriaSeleccionada}
        />
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Componente SeccionResumen - Contiene el layout anterior del Dashboard
// ═════════════════════════════════════════════════════════════════════════════

function SeccionResumen({
  loading,
  error,
  data,
  navigate,
  user,
  ai_disponible,
}) {
  const [modalRiesgo, setModalRiesgo] = useState(null); // null | { titulo, alumnos }
  const [modalAsistencia, setModalAsistencia] = useState(false);
  const [modalEstancados, setModalEstancados] = useState(false);

  if (loading) {
    return <SkeletonLoader />;
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-red-700">
        <p className="font-medium">Error al cargar el dashboard</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  if (!data) {
    return <div className="p-6">Sin datos disponibles</div>;
  }

  // Extraer datos
  const {
    kpis,
    abandono,
    por_materia,
    distribucion_por_materia,
    alertas,
    todos_en_riesgo,
    alumnos_bajo_riesgo,
    alumnos_asistencia_baja_lista,
    estrategico,
    actividad_reciente,
  } = data;

  const formatearFecha = (isoString) => {
    const date = new Date(isoString);
    const ahora = new Date();
    const diff = Math.floor((ahora - date) / 1000);

    if (diff < 60) return "hace unos segundos";
    if (diff < 3600) return `hace ${Math.floor(diff / 60)} minutos`;
    if (diff < 86400) return `hace ${Math.floor(diff / 3600)} horas`;
    return `hace ${Math.floor(diff / 86400)} días`;
  };

  const alumnosAlto = (todos_en_riesgo || []).filter(
    (a) => a.nivel_riesgo === "alto",
  );
  const alumnosMedio = (todos_en_riesgo || []).filter(
    (a) => a.nivel_riesgo === "medio",
  );

  const acciones = [
    abandono.en_riesgo_alto > 0 && {
      nivel: "critico",
      texto: (
        <>
          <strong>{abandono.en_riesgo_alto}</strong> alumno/s con riesgo alto de
          abandono requieren intervención inmediata.
        </>
      ),
      accion: {
        label: "Ver alumnos",
        onClick: () =>
          setModalRiesgo({
            titulo: "Alumnos con riesgo alto de abandono",
            alumnos: alumnosAlto,
          }),
      },
    },
    kpis.alumnos_asistencia_baja > 0 && {
      nivel: "advertencia",
      texto: (
        <>
          <strong>{kpis.alumnos_asistencia_baja}</strong> alumno/s con
          asistencia bajo el 75% — no podrán rendir finales si no mejoran.
        </>
      ),
      accion: {
        label: "Ver alumnos",
        onClick: () => setModalAsistencia(true),
      },
    },
    abandono.en_riesgo_medio > 0 && {
      nivel: "advertencia",
      texto: (
        <>
          <strong>{abandono.en_riesgo_medio}</strong> alumno/s en riesgo medio
          de abandono — considerar seguimiento preventivo.
        </>
      ),
      accion: {
        label: "Ver alumnos",
        onClick: () =>
          setModalRiesgo({
            titulo: "Alumnos con riesgo medio de abandono",
            alumnos: alumnosMedio,
          }),
      },
    },
  ].filter(Boolean);

  return (
    <div className="space-y-8">
      {/* Modales */}
      {modalRiesgo && (
        <ModalAlumnosRiesgo
          titulo={modalRiesgo.titulo}
          alumnos={modalRiesgo.alumnos}
          onClose={() => setModalRiesgo(null)}
          navigate={navigate}
        />
      )}
      {modalAsistencia && (
        <ModalAsistenciaBaja
          alumnos={alumnos_asistencia_baja_lista || []}
          onClose={() => setModalAsistencia(false)}
          navigate={navigate}
        />
      )}
      {modalEstancados && (
        <ModalEstancados
          alumnos={estrategico?.alumnos_estancados_lista || []}
          onClose={() => setModalEstancados(false)}
          navigate={navigate}
        />
      )}

      {/* Panel de acciones requeridas */}
      {acciones.length > 0 && (
        <PanelAccionesRequeridas acciones={acciones} />
      )}

      {/* ── VISIÓN GENERAL ── */}
      <div>
        <SectionLabel>Visión general</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <KpiCard
            titulo="Total alumnos"
            valor={kpis.total_alumnos}
            subtitulo="registrados en el sistema"
            color="blue"
            icono={<Users className="w-5 h-5" />}
          />
          <KpiCard
            titulo="Cursando ahora"
            valor={kpis.cursando_ahora}
            subtitulo="en cursada activa este año"
            color="green"
            icono={<BookOpen className="w-5 h-5" />}
          />
          <KpiCard
            titulo="Tasa de recursado"
            valor={`${kpis.tasa_recursado_global}%`}
            subtitulo="promedio histórico"
            color="amber"
            icono={<RotateCcw className="w-5 h-5" />}
            tendencia={
              kpis.tendencias?.tasa_aprobacion_parciales
                ? { ...kpis.tendencias.tasa_aprobacion_parciales, sufijo: "% aprob. parciales", arriba_es_bueno: true }
                : null
            }
          />
          <KpiCard
            titulo="Promedio de notas"
            valor={kpis.promedio_notas_global}
            subtitulo="en exámenes rendidos"
            color="blue"
            icono={<ClipboardList className="w-5 h-5" />}
            tendencia={
              kpis.tendencias?.promedio_notas
                ? { ...kpis.tendencias.promedio_notas, sufijo: " pts", arriba_es_bueno: true }
                : null
            }
          />
          <KpiCard
            titulo="Alumnos estancados"
            valor={estrategico?.alumnos_estancados ?? "—"}
            subtitulo="sin aprobar nada en +1 año"
            color="red"
            icono={<Clock className="w-5 h-5" />}
            onClick={estrategico?.alumnos_estancados > 0 ? () => setModalEstancados(true) : null}
          />
        </div>
      </div>

      {/* ── RIESGO ACADÉMICO ── */}
      <div>
        <SectionLabel>Riesgo académico</SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Alertas de abandono */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <h2 className="text-sm font-semibold text-gray-900">Alumnos en riesgo de abandono</h2>
              <span className="ml-auto inline-flex items-center justify-center min-w-[1.5rem] h-6 px-2 rounded-full bg-red-500 text-white text-xs font-bold">
                {abandono.en_riesgo_alto}
              </span>
            </div>
            <div className="p-6 space-y-1">
              {alertas.length > 0 ? (
                alertas.map((alumno) => {
                  const esAlto = alumno.nivel_riesgo === "alto";
                  const pct = (alumno.probabilidad * 100).toFixed(0);
                  return (
                    <div key={alumno.id} className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
                      <div className="flex items-center gap-3">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${esAlto ? "bg-red-500" : "bg-amber-400"}`} />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{alumno.nombre}</p>
                          <p className="text-xs text-gray-400">Prob. abandono</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-20 bg-gray-100 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${esAlto ? "bg-red-500" : "bg-amber-400"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className={`text-xs font-semibold w-8 text-right ${esAlto ? "text-red-600" : "text-amber-600"}`}>
                          {pct}%
                        </span>
                        <button
                          onClick={() => navigate(`/alumnos/${alumno.id}`)}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Ver →
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-gray-400 py-4 text-center">Sin alumnos en riesgo alto</p>
              )}
            </div>
          </div>

          {/* Distribución de riesgo */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <PieChart className="w-5 h-5 text-blue-500 flex-shrink-0" />
              <h2 className="text-sm font-semibold text-gray-900">Distribución de riesgo</h2>
            </div>
            <div className="p-6 space-y-3">
              {[
                {
                  label: "Riesgo alto",
                  rango: "70%–100%",
                  count: abandono.en_riesgo_alto,
                  bar: "bg-red-500",
                  text: "text-red-700",
                  hover: "hover:bg-red-50",
                  alumnos: alumnosAlto,
                  titulo: "Alumnos con riesgo alto de abandono",
                },
                {
                  label: "Riesgo medio",
                  rango: "40%–69%",
                  count: abandono.en_riesgo_medio,
                  bar: "bg-amber-400",
                  text: "text-amber-700",
                  hover: "hover:bg-amber-50",
                  alumnos: alumnosMedio,
                  titulo: "Alumnos con riesgo medio de abandono",
                },
                {
                  label: "Riesgo bajo",
                  rango: "0%–39%",
                  count: abandono.sin_riesgo,
                  bar: "bg-green-500",
                  text: "text-green-700",
                  hover: "hover:bg-green-50",
                  alumnos: alumnos_bajo_riesgo || [],
                  titulo: "Alumnos sin riesgo de abandono",
                },
              ].map((barra) => {
                const total = abandono.en_riesgo_alto + abandono.en_riesgo_medio + abandono.sin_riesgo;
                const pct = total > 0 ? ((barra.count / total) * 100).toFixed(0) : 0;
                return (
                  <button
                    key={barra.label}
                    onClick={() => setModalRiesgo({ titulo: barra.titulo, alumnos: barra.alumnos })}
                    className={`w-full text-left rounded-lg px-3 py-3 transition-colors ${barra.hover} group`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex flex-col">
                        <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">{barra.label}</span>
                        <span className="text-xs text-gray-400">{barra.rango}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${barra.text}`}>
                          {barra.count} <span className="font-normal text-gray-400">({pct}%)</span>
                        </span>
                        <span className="text-xs text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">Ver →</span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className={`${barra.bar} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </button>
                );
              })}
              <p className="text-xs text-gray-500 pt-2 border-t border-gray-100 px-3">
                <span className="font-semibold text-red-600">{abandono.tasa_riesgo_alto_pct}%</span> del total en riesgo alto — intervención recomendada en <strong>{abandono.en_riesgo_alto}</strong> caso/s.
              </p>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Componente SeccionRendimientoMaterias
// ═════════════════════════════════════════════════════════════════════════════
function SeccionRendimientoMaterias({
  dataPorMateria,
  dataDistribucion,
  loading,
  anioCursada,
  aniosCursadaDisponibles,
  materiaSeleccionada,
  onAnioCursadaChange,
  onMateriaChange,
}) {
  const todasLasMaterias = mergeMateriaData(dataPorMateria, dataDistribucion);

  useEffect(() => {
    if (materiaSeleccionada === null && todasLasMaterias.length > 0 && !loading) {
      onMateriaChange(todasLasMaterias[0].id);
    }
  }, [materiaSeleccionada, todasLasMaterias.length, loading]);

  return (
    <div className="space-y-6">
      {/* Filtros + leyenda */}
      <div className="flex items-center gap-6 flex-wrap">
        {/* Año académico */}
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-600">Año académico:</label>
          <select
            value={anioCursada}
            onChange={(e) => onAnioCursadaChange(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {aniosCursadaDisponibles.map((anio) => (
              <option key={anio} value={anio}>{anio}</option>
            ))}
          </select>
        </div>

        {/* Dropdown de materia */}
        {todasLasMaterias.length > 0 && (
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-600">Materia:</label>
            <select
              value={materiaSeleccionada || ""}
              onChange={(e) => onMateriaChange(parseInt(e.target.value))}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {todasLasMaterias.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.codigo} - {m.nombre}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center gap-3 ml-auto">
          {[
            { dot: "bg-green-500", label: "Baja (<20%)" },
            { dot: "bg-amber-400", label: "Media (20–40%)" },
            { dot: "bg-red-500", label: "Alta (>40%)" },
          ].map((s) => (
            <span key={s.label} className="flex items-center gap-1 text-xs text-gray-500">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-8 flex justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
        </div>
      ) : (() => {
        const materiasUnificadas = todasLasMaterias
          .filter((m) => !materiaSeleccionada || m.id === materiaSeleccionada)
          .sort((a, b) => (b.tasa_pct || 0) - (a.tasa_pct || 0));

        return materiasUnificadas.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">
            {`Sin datos de materias para ${anioCursada}`}
          </p>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="divide-y divide-gray-100">
              {materiasUnificadas.map((materia) => {
                const tasa = materia.tasa_pct || 0;
                const semaforo =
                  tasa >= 40
                    ? { dot: "bg-red-500", bar: "bg-red-500", text: "text-red-600" }
                    : tasa >= 20
                    ? { dot: "bg-amber-400", bar: "bg-amber-400", text: "text-amber-700" }
                    : { dot: "bg-green-500", bar: "bg-green-500", text: "text-green-700" };
                const totalIntentos =
                  (materia.primera_vez || 0) +
                  (materia.segunda_vez || 0) +
                  (materia.tercera_vez_o_mas || 0);

                return (
                  <div key={materia.id} className="px-5 py-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start gap-3">
                      <span className={`mt-2 w-2.5 h-2.5 rounded-full flex-shrink-0 ${semaforo.dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0">
                            <span className="text-xs font-mono text-gray-400">{materia.codigo}</span>
                            <p className="text-sm font-semibold text-gray-900 leading-snug">{materia.nombre}</p>
                          </div>
                          <div className="flex-shrink-0 text-right">
                            <p className={`text-xl font-bold leading-none ${semaforo.text}`}>{tasa}%</p>
                            <p className="text-xs text-gray-400 mt-0.5">de recursado</p>
                          </div>
                        </div>

                        {materia.total_cursadas > 0 ? (
                          <>
                            <div className="w-full bg-gray-100 rounded-full h-2 mb-1">
                              <div
                                className={`${semaforo.bar} h-2 rounded-full`}
                                style={{ width: `${Math.min(tasa, 100)}%` }}
                              />
                            </div>
                            <p className="text-xs text-gray-500 mb-3">
                              {materia.recursadas} de {materia.total_cursadas} cursadas fueron repetidas
                            </p>
                          </>
                        ) : (
                          <p className="text-xs text-gray-400 italic mb-3">Sin datos suficientes</p>
                        )}

                        {totalIntentos > 0 && (
                          <div>
                            <p className="text-xs text-gray-400 mb-2">Distribución por intento:</p>
                            <BarChartIntentos
                              primera={materia.primera_vez || 0}
                              segunda={materia.segunda_vez || 0}
                              tercera={materia.tercera_vez_o_mas || 0}
                            />
                          </div>
                        )}

                        <GraficoHistoricoMateria materiaId={materia.id} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Componente SectionLabel
// ═════════════════════════════════════════════════════════════════════════════
function SectionLabel({ children }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest whitespace-nowrap">
        {children}
      </span>
      <div className="flex-1 border-t border-gray-100" />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Componente PanelAccionesRequeridas — banner prominente
// ═════════════════════════════════════════════════════════════════════════════
const ESTILOS_NIVEL = {
  critico: {
    card: "bg-red-50 border-red-200",
    badge: "bg-red-500 text-white",
    icon: "text-red-500",
    texto: "text-red-900",
    subtexto: "text-red-700",
    boton: "bg-red-500 hover:bg-red-600 text-white",
  },
  advertencia: {
    card: "bg-amber-50 border-amber-200",
    badge: "bg-amber-400 text-white",
    icon: "text-amber-500",
    texto: "text-amber-900",
    subtexto: "text-amber-700",
    boton: "bg-amber-400 hover:bg-amber-500 text-white",
  },
  info: {
    card: "bg-blue-50 border-blue-200",
    badge: "bg-blue-500 text-white",
    icon: "text-blue-500",
    texto: "text-blue-900",
    subtexto: "text-blue-700",
    boton: "bg-blue-500 hover:bg-blue-600 text-white",
  },
};

function PanelAccionesRequeridas({ acciones }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200">
        <AlertTriangle className="w-4 h-4 text-red-500" />
        <span className="text-sm font-semibold text-gray-800">Acciones requeridas</span>
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold">
          {acciones.length}
        </span>
      </div>
      {/* Cards horizontales */}
      <div className="p-4 flex flex-col sm:flex-row gap-3">
        {acciones.map((accion, i) => {
          const e = ESTILOS_NIVEL[accion.nivel] || ESTILOS_NIVEL.info;
          return (
            <div
              key={i}
              className={`flex-1 flex flex-col gap-3 rounded-lg border p-4 ${e.card}`}
            >
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 flex-shrink-0 ${e.icon}`}>
                  {accion.nivel === "critico"
                    ? <AlertTriangle className="w-5 h-5" />
                    : <Clock className="w-5 h-5" />}
                </span>
                <p className={`text-sm leading-snug ${e.texto}`}>{accion.texto}</p>
              </div>
              {accion.accion && (
                <button
                  onClick={accion.accion.onClick}
                  className={`self-start text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${e.boton}`}
                >
                  {accion.accion.label} →
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Componente BarChartIntentos — gráfico de barras verticales por intento
// ═════════════════════════════════════════════════════════════════════════════
function BarChartIntentos({ primera, segunda, tercera }) {
  const total = primera + segunda + tercera || 1;
  const barras = [
    {
      label: "1ra vez",
      count: primera,
      color: "#22c55e",
      bg: "bg-green-500",
      text: "text-green-600",
    },
    {
      label: "2da vez",
      count: segunda,
      color: "#f59e0b",
      bg: "bg-amber-400",
      text: "text-amber-600",
    },
    {
      label: "3ra vez+",
      count: tercera,
      color: "#ef4444",
      bg: "bg-red-500",
      text: "text-red-500",
    },
  ];
  const maxVal = Math.max(...barras.map((b) => b.count), 1);
  const CHART_H = 100;

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 mt-1">
      {/* Barras */}
      <div className="flex items-end gap-3" style={{ height: CHART_H }}>
        {barras.map((b) => {
          const pct = Math.round((b.count / total) * 100);
          const barH = Math.max(Math.round((b.count / maxVal) * CHART_H), b.count > 0 ? 6 : 2);
          return (
            <div key={b.label} className="flex flex-col items-center gap-1 flex-1 group">
              {/* Etiqueta superior */}
              <div className="flex flex-col items-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 mb-0.5">
                <span className={`text-xs font-bold ${b.text}`}>{b.count}</span>
                <span className="text-[10px] text-gray-400">{pct}%</span>
              </div>
              {/* Barra */}
              <div className="w-full flex items-end" style={{ height: CHART_H }}>
                <div
                  className="w-full rounded-t-sm transition-all duration-300"
                  style={{ height: barH, backgroundColor: b.color }}
                  title={`${b.count} alumnos (${pct}%)`}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Leyenda */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100">
        {barras.map((b) => (
          <span key={b.label} className="flex items-center gap-1 text-xs text-gray-500">
            <span className={`w-3 h-3 rounded-sm inline-block flex-shrink-0 ${b.bg}`} />
            {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function mergeMateriaData(porMateria, distribucion) {
  if (!porMateria) return [];
  const distMap = Object.fromEntries((distribucion || []).map((d) => [d.codigo, d]));
  return porMateria.map((m) => ({ ...m, ...(distMap[m.codigo] || {}) }));
}


// ═════════════════════════════════════════════════════════════════════════════
// Componente ModalAlumnosRiesgo
// ═════════════════════════════════════════════════════════════════════════════
function ModalAlumnosRiesgo({ titulo, alumnos, onClose, navigate }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">{titulo}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Lista */}
        <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
          {alumnos.length === 0 ? (
            <p className="p-6 text-sm text-gray-500 text-center">
              Sin alumnos en este nivel de riesgo.
            </p>
          ) : (
            alumnos.map((alumno) => {
              const pct = ((alumno.probabilidad || 0) * 100).toFixed(0);
              const nivel = alumno.nivel_riesgo;
              const colores = nivel === "alto"
                ? { barra: "bg-red-500", texto: "text-red-600" }
                : nivel === "medio"
                  ? { barra: "bg-amber-400", texto: "text-amber-600" }
                  : { barra: "bg-green-500", texto: "text-green-600" };
              return (
                <div
                  key={alumno.id}
                  className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50 transition-colors"
                >
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${colores.barra}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {alumno.nombre}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${colores.barra}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className={`text-xs font-semibold w-8 text-right ${colores.texto}`}>
                        {pct}%
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      onClose();
                      navigate(`/alumnos/${alumno.id}`);
                    }}
                    className="flex-shrink-0 text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Ver perfil →
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="text-sm px-4 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Componente ModalAsistenciaBaja
// ═════════════════════════════════════════════════════════════════════════════
function ModalAsistenciaBaja({ alumnos, onClose, navigate }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">
            Alumnos con asistencia bajo el 75%
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Lista */}
        <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
          {alumnos.length === 0 ? (
            <p className="p-6 text-sm text-gray-500 text-center">
              Sin alumnos con baja asistencia.
            </p>
          ) : (
            alumnos.map((alumno) => (
              <div
                key={alumno.id}
                className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50 transition-colors"
              >
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {alumno.nombre_completo}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full bg-amber-400"
                        style={{ width: `${alumno.asistencia_minima}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold w-10 text-right text-amber-600">
                      {alumno.asistencia_minima}%
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {alumno.materias_afectadas} materia
                    {alumno.materias_afectadas !== 1 ? "s" : ""} afectada
                    {alumno.materias_afectadas !== 1 ? "s" : ""}
                  </p>
                </div>
                <button
                  onClick={() => {
                    onClose();
                    navigate(`/alumnos/${alumno.id}`);
                  }}
                  className="flex-shrink-0 text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  Ver perfil →
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="text-sm px-4 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Componente ModalEstancados
// ═════════════════════════════════════════════════════════════════════════════
function ModalEstancados({ alumnos, onClose, navigate }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">
            Alumnos sin aprobar en +1 año
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
          {alumnos.length === 0 ? (
            <p className="p-6 text-sm text-gray-500 text-center">
              Sin alumnos estancados.
            </p>
          ) : (
            alumnos.map((alumno) => (
              <div
                key={alumno.id}
                className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50 transition-colors"
              >
                <Clock className="w-4 h-4 text-red-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {alumno.nombre_completo}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {alumno.ultimo_anio_aprobacion
                      ? `Última aprobación: ${alumno.ultimo_anio_aprobacion}`
                      : "Sin aprobaciones registradas"}{" "}
                    · {alumno.materias_cursadas} materia{alumno.materias_cursadas !== 1 ? "s" : ""} cursada{alumno.materias_cursadas !== 1 ? "s" : ""}
                  </p>
                </div>
                <button
                  onClick={() => {
                    onClose();
                    navigate(`/alumnos/${alumno.id}`);
                  }}
                  className="flex-shrink-0 text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  Ver perfil →
                </button>
              </div>
            ))
          )}
        </div>

        <div className="px-6 py-3 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="text-sm px-4 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
