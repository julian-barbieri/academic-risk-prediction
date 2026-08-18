const express = require("express");
const db = require("../db/database");
const { authorize } = require("../middleware/auth.middleware");
const {
  calcularVariablesAbandono,
} = require("../services/prediction-variables.service");
const axios = require("axios");

const router = express.Router();

router.use(authorize("admin", "coordinador"));

const AI_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

function sinDatos(alumno) {
  return {
    id: alumno.id,
    nombre: alumno.nombre_completo,
    veces_cursada: alumno.veces_cursada,
    asistencia: alumno.ultima_asistencia,
    abandona: null,
    probabilidad: null,
    nivel_riesgo: "sin_datos",
  };
}

async function obtenerPrediccionesAbandono(alumnosActivos) {
  // Calcular variables de todos los alumnos (sincrónico, DB local)
  const alumnosConVars = alumnosActivos.map((alumno) => {
    try {
      const { variables } = calcularVariablesAbandono(alumno.id);
      return { alumno, body: variables };
    } catch {
      return { alumno, body: null };
    }
  });

  const validos = alumnosConVars.filter((a) => a.body !== null);
  const invalidos = alumnosConVars.filter((a) => a.body === null);

  // Un solo POST con todos los alumnos en lugar de N requests
  try {
    // 60s (no 15s): en Render free tier el cold start del ai-service puede
    // tardar "50 segundos o mas" segun el propio dashboard de Render. Con un
    // timeout mas corto, cada intento aborta antes de que el contenedor
    // termine de arrancar y nunca llega a responder.
    const resp = await axios.post(
      `${AI_URL}/predict/alumno`,
      validos.map((a) => a.body),
      { timeout: 60000 },
    );

    const predicciones = [
      ...validos.map(({ alumno }, i) => {
        const resultado = resp.data[i];
        return {
          id: alumno.id,
          nombre: alumno.nombre_completo,
          veces_cursada: alumno.veces_cursada,
          asistencia: alumno.ultima_asistencia,
          abandona: resultado.Abandona,
          probabilidad: resultado.probabilidad,
          nivel_riesgo:
            resultado.probabilidad >= 0.7
              ? "alto"
              : resultado.probabilidad >= 0.4
                ? "medio"
                : "bajo",
        };
      }),
      ...invalidos.map(({ alumno }) => sinDatos(alumno)),
    ];

    return { predicciones, aiDisponible: true };
  } catch (err) {
    console.warn(`Servicio IA no disponible: ${err.message}`);
    return { predicciones: alumnosActivos.map(sinDatos), aiDisponible: false };
  }
}

router.get("/", async (req, res) => {
  try {
    // ──────── PASO 1: Métricas base desde SQLite ────────
    const totalAlumnos = db
      .prepare("SELECT COUNT(*) AS cnt FROM users WHERE role='alumno'")
      .get().cnt;

    const cursandoAhora = db
      .prepare(
        `SELECT COUNT(DISTINCT alumno_id) AS cnt FROM cursadas WHERE estado='cursando'`,
      )
      .get().cnt;

    const cursadasTotales = db
      .prepare("SELECT COUNT(*) AS cnt FROM cursadas")
      .get().cnt;
    const cursadasRecursadas = db
      .prepare("SELECT COUNT(*) AS cnt FROM cursadas WHERE estado='recursada'")
      .get().cnt;
    const tasaRecursadoGlobal =
      cursadasTotales > 0
        ? ((cursadasRecursadas / cursadasTotales) * 100).toFixed(1)
        : 0;

    const promedioNotasGlobal =
      db
        .prepare(
          `SELECT ROUND(AVG(nota), 2) AS prom FROM examenes WHERE rendido=1 AND nota IS NOT NULL`,
        )
        .get().prom || 0;

    const asistenciaBaja = db
      .prepare(
        `SELECT COUNT(DISTINCT c.alumno_id) AS cnt FROM cursadas c WHERE c.estado='cursando' AND c.asistencia < 0.75`,
      )
      .get().cnt;

    const alumnosAsistenciaBaja = db
      .prepare(
        `SELECT u.id, u.nombre_completo, u.email,
                ROUND(MIN(c.asistencia) * 100, 1) AS asistencia_minima,
                COUNT(c.id) AS materias_afectadas
         FROM cursadas c
         JOIN users u ON u.id = c.alumno_id
         WHERE c.estado='cursando' AND c.asistencia < 0.75
         GROUP BY u.id
         ORDER BY asistencia_minima ASC`,
      )
      .all();

    // Alumnos cursando AM2 que NO tienen final AM1 aprobado → finales bloqueados
    const am1Id = db
      .prepare("SELECT id FROM materias WHERE codigo='AM1'")
      .get()?.id;
    const am2Id = db
      .prepare("SELECT id FROM materias WHERE codigo='AM2'")
      .get()?.id;

    const finalesAM2Bloqueados =
      am1Id && am2Id
        ? db
            .prepare(
              `
        SELECT COUNT(DISTINCT c.alumno_id) AS cnt
        FROM cursadas c
        WHERE c.materia_id = ? AND c.estado = 'cursando'
          AND NOT EXISTS (
            SELECT 1 FROM examenes e
            WHERE e.alumno_id = c.alumno_id
              AND e.materia_id = ?
              AND e.tipo = 'Final'
              AND e.nota >= 4
              AND e.rendido = 1
          )
        `,
            )
            .get(am2Id, am1Id)?.cnt || 0
        : 0;

    // Tendencias año actual vs año anterior (usando examenes con campo anio)
    const anioActual = new Date().getFullYear();
    const anioAnterior = anioActual - 1;

    function promedioNotasPorAnio(anio) {
      return (
        db
          .prepare(
            `SELECT ROUND(AVG(nota), 2) AS prom FROM examenes
             WHERE rendido=1 AND nota IS NOT NULL AND anio = ?`,
          )
          .get(anio).prom || null
      );
    }

    function tasaAprobacionParcialesPorAnio(anio) {
      const row = db
        .prepare(
          `SELECT COUNT(*) AS total,
            SUM(CASE WHEN nota >= 4 AND rendido=1 THEN 1 ELSE 0 END) AS aprobados
           FROM examenes WHERE anio = ? AND tipo='Parcial' AND rendido=1`,
        )
        .get(anio);
      return row.total > 0
        ? parseFloat(((row.aprobados / row.total) * 100).toFixed(1))
        : null;
    }

    const promActual = promedioNotasPorAnio(anioActual);
    const promAnterior = promedioNotasPorAnio(anioAnterior);
    const deltaPromedio =
      promActual !== null && promAnterior !== null
        ? parseFloat((promActual - promAnterior).toFixed(2))
        : null;

    const aprobActual = tasaAprobacionParcialesPorAnio(anioActual);
    const aprobAnterior = tasaAprobacionParcialesPorAnio(anioAnterior);
    const deltaAprobacion =
      aprobActual !== null && aprobAnterior !== null
        ? parseFloat((aprobActual - aprobAnterior).toFixed(1))
        : null;

    // Tasa de recursado por materia (incluye anio_carrera para filtro frontend)
    const tasaRecursadoPorMateria = db
      .prepare(
        `
        SELECT m.id, m.codigo, m.nombre, COALESCE(m.anio_carrera, 1) AS anio_carrera,
          COUNT(c.id) AS total_cursadas,
          SUM(CASE WHEN c.estado='recursada' THEN 1 ELSE 0 END) AS recursadas,
          ROUND(SUM(CASE WHEN c.estado='recursada' THEN 1.0 ELSE 0 END) / COUNT(c.id) * 100, 1) AS tasa_pct
        FROM materias m
        LEFT JOIN cursadas c ON c.materia_id = m.id
        GROUP BY m.id
        ORDER BY tasa_pct DESC, m.anio_carrera, m.codigo
      `,
      )
      .all();

    // Distribución de veces cursada por materia (incluye anio_carrera para filtro frontend)
    const distribucionPorMateria =
      db
        .prepare(
          `
        SELECT m.id, m.codigo, m.nombre, COALESCE(m.anio_carrera, 1) AS anio_carrera,
          COUNT(CASE WHEN veces = 1 THEN 1 END) AS primera_vez,
          COUNT(CASE WHEN veces = 2 THEN 1 END) AS segunda_vez,
          COUNT(CASE WHEN veces >= 3 THEN 1 END) AS tercera_vez_o_mas
        FROM (
          SELECT c.materia_id, c.alumno_id, COUNT(*) AS veces
          FROM cursadas c
          GROUP BY c.materia_id, c.alumno_id
        ) sub
        JOIN materias m ON sub.materia_id = m.id
        GROUP BY sub.materia_id
        ORDER BY m.anio_carrera, m.codigo
      `,
        )
        .all() || [];

    // Últimas predicciones guardadas en log
    const ultimasPredicciones = db
      .prepare(
        `
        SELECT pl.tipo, pl.created_at,
          u.nombre_completo AS alumno_nombre,
          pl.result_data
        FROM predictions_log pl
        JOIN users u ON pl.user_id = u.id
        ORDER BY pl.created_at DESC LIMIT 5
      `,
      )
      .all()
      .map((p) => ({
        ...p,
        result_data: (() => {
          try {
            return JSON.parse(p.result_data);
          } catch {
            return {};
          }
        })(),
      }));

    // ──────── PASO 2: Predicciones ML masivas de abandono ────────
    const alumnosActivos = db
      .prepare(
        `
        SELECT
          u.id,
          u.nombre_completo,
          COUNT(c.id) AS veces_cursada,
          MAX(c.asistencia) AS ultima_asistencia
        FROM users u
        LEFT JOIN cursadas c ON c.alumno_id = u.id
        WHERE u.role = 'alumno'
        GROUP BY u.id
      `,
      )
      .all();

    let prediccionesAbandono = [];
    let aiDisponible = true;

    if (alumnosActivos.length > 0) {
      const resultado = await obtenerPrediccionesAbandono(alumnosActivos);
      prediccionesAbandono = resultado.predicciones;
      aiDisponible = resultado.aiDisponible;
    }

    // Métricas derivadas de predicciones
    const enRiesgoAlto = prediccionesAbandono.filter(
      (p) => p.nivel_riesgo === "alto",
    ).length;
    const enRiesgoMedio = prediccionesAbandono.filter(
      (p) => p.nivel_riesgo === "medio",
    ).length;
    const sinRiesgo = prediccionesAbandono.filter(
      (p) => p.nivel_riesgo === "bajo",
    ).length;

    const tasaRiesgoAlto =
      alumnosActivos.length > 0
        ? ((enRiesgoAlto / alumnosActivos.length) * 100).toFixed(1)
        : 0;

    // Top 5 alumnos con mayor riesgo (para la sección de detalle en dashboard)
    const prediccionesOrdenadas = prediccionesAbandono
      .filter((p) => p.probabilidad !== null)
      .sort((a, b) => b.probabilidad - a.probabilidad);

    const alertasAbandono = prediccionesOrdenadas.slice(0, 5);

    // Todos los alumnos en riesgo alto o medio (para modal de acciones)
    const todosEnRiesgo = prediccionesOrdenadas.filter(
      (p) => p.nivel_riesgo === "alto" || p.nivel_riesgo === "medio",
    );

    const alumnosBajoRiesgo = prediccionesAbandono
      .filter((p) => p.nivel_riesgo === "bajo" && p.probabilidad !== null)
      .sort((a, b) => b.probabilidad - a.probabilidad);

    // ──────── PASO 2b: Métricas estratégicas ────────

    const totalMateriasCarrera =
      db.prepare("SELECT COUNT(*) AS cnt FROM materias").get().cnt || 44;

    const avancePlanPct =
      db
        .prepare(
          `SELECT ROUND(AVG(aprobadas * 100.0 / ${totalMateriasCarrera}), 1) AS pct
           FROM (
             SELECT u.id, COUNT(DISTINCT e.materia_id) AS aprobadas
             FROM users u
             LEFT JOIN examenes e ON e.alumno_id = u.id AND e.nota >= 4 AND e.rendido = 1
             WHERE u.role = 'alumno'
             GROUP BY u.id
           )`,
        )
        .get()?.pct || 0;

    const alumnosEstancados = db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM users u
         WHERE u.role = 'alumno'
         AND EXISTS (SELECT 1 FROM cursadas c WHERE c.alumno_id = u.id)
         AND NOT EXISTS (
           SELECT 1 FROM examenes e
           WHERE e.alumno_id = u.id AND e.nota >= 4 AND e.rendido = 1 AND e.anio >= ?
         )`,
      )
      .get(anioActual - 1).cnt;

    const alumnosEstancadosLista = db
      .prepare(
        `SELECT u.id, u.nombre_completo, u.email,
                MAX(e.anio) AS ultimo_anio_aprobacion,
                COUNT(DISTINCT c.materia_id) AS materias_cursadas
         FROM users u
         JOIN cursadas c ON c.alumno_id = u.id
         LEFT JOIN examenes e ON e.alumno_id = u.id AND e.nota >= 4 AND e.rendido = 1
         WHERE u.role = 'alumno'
         AND NOT EXISTS (
           SELECT 1 FROM examenes e2
           WHERE e2.alumno_id = u.id AND e2.nota >= 4 AND e2.rendido = 1 AND e2.anio >= ?
         )
         GROUP BY u.id
         ORDER BY ultimo_anio_aprobacion ASC NULLS FIRST`,
      )
      .all(anioActual - 1);

    const primeraInstanciaRow = db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN e.nota >= 4 THEN 1 ELSE 0 END) AS aprobados
         FROM (
           SELECT MIN(rowid) AS rid FROM examenes
           WHERE tipo = 'Parcial' AND rendido = 1
           GROUP BY alumno_id, materia_id
         ) primeros
         JOIN examenes e ON e.rowid = primeros.rid`,
      )
      .get();
    const tasaPrimeraInstancia =
      primeraInstanciaRow.total > 0
        ? parseFloat(
            (
              (primeraInstanciaRow.aprobados / primeraInstanciaRow.total) *
              100
            ).toFixed(1),
          )
        : 0;

    const materiasCuelloBotella = db
      .prepare(
        `SELECT m.codigo, m.nombre, m.anio_carrera,
                COUNT(*) AS total_finales,
                SUM(CASE WHEN e.nota < 4 THEN 1 ELSE 0 END) AS aplazados,
                ROUND(SUM(CASE WHEN e.nota < 4 THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) AS tasa_aplazo_pct
         FROM examenes e
         JOIN materias m ON m.id = e.materia_id
         WHERE e.tipo = 'Final' AND e.rendido = 1 AND e.nota IS NOT NULL
         GROUP BY e.materia_id
         HAVING COUNT(*) >= 3
         ORDER BY tasa_aplazo_pct DESC
         LIMIT 5`,
      )
      .all();

    const promedioPorAnioCarrera = db
      .prepare(
        `SELECT m.anio_carrera, ROUND(AVG(e.nota), 2) AS promedio, COUNT(*) AS total_examenes
         FROM examenes e
         JOIN materias m ON m.id = e.materia_id
         WHERE e.rendido = 1 AND e.nota IS NOT NULL
         GROUP BY m.anio_carrera
         ORDER BY m.anio_carrera`,
      )
      .all();

    const inicioMes = new Date(anioActual, new Date().getMonth(), 1).toISOString();
    const prediccionesEsteMes = db
      .prepare(`SELECT COUNT(*) AS cnt FROM predictions_log WHERE created_at >= ?`)
      .get(inicioMes).cnt;

    const retencionPorCohorte = db
      .prepare(
        `SELECT cohorte, COUNT(*) AS total,
                SUM(CASE WHEN activo = 1 THEN 1 ELSE 0 END) AS activos,
                ROUND(SUM(CASE WHEN activo = 1 THEN 1.0 ELSE 0 END) / COUNT(*) * 100, 1) AS retencion_pct
         FROM (
           SELECT u.id,
             MIN(c.anio) AS cohorte,
             MAX(CASE WHEN c.estado IN ('cursando', 'aprobada') THEN 1 ELSE 0 END) AS activo
           FROM users u
           JOIN cursadas c ON c.alumno_id = u.id
           WHERE u.role = 'alumno'
           GROUP BY u.id
         )
         GROUP BY cohorte
         ORDER BY cohorte DESC
         LIMIT 5`,
      )
      .all();

    // ──────── PASO 3: Armar respuesta ────────
    res.json({
      kpis: {
        total_alumnos: totalAlumnos,
        cursando_ahora: cursandoAhora,
        tasa_recursado_global: parseFloat(tasaRecursadoGlobal),
        promedio_notas_global: parseFloat(promedioNotasGlobal),
        tendencias: {
          promedio_notas:
            deltaPromedio !== null
              ? { delta: deltaPromedio, anio_ref: anioAnterior }
              : null,
          tasa_aprobacion_parciales:
            deltaAprobacion !== null
              ? { delta: deltaAprobacion, anio_ref: anioAnterior }
              : null,
        },
        alumnos_asistencia_baja: asistenciaBaja,
        finales_am2_bloqueados: finalesAM2Bloqueados,
      },
      abandono: {
        en_riesgo_alto: enRiesgoAlto,
        en_riesgo_medio: enRiesgoMedio,
        sin_riesgo: sinRiesgo,
        tasa_riesgo_alto_pct: parseFloat(tasaRiesgoAlto),
      },
      por_materia: tasaRecursadoPorMateria,
      distribucion_por_materia: distribucionPorMateria,
      alertas: alertasAbandono,
      todos_en_riesgo: todosEnRiesgo,
      alumnos_bajo_riesgo: alumnosBajoRiesgo,
      alumnos_asistencia_baja_lista: alumnosAsistenciaBaja,
      estrategico: {
        avance_plan_pct: avancePlanPct,
        alumnos_estancados: alumnosEstancados,
        alumnos_estancados_lista: alumnosEstancadosLista,
        tasa_primera_instancia: tasaPrimeraInstancia,
        predicciones_este_mes: prediccionesEsteMes,
        materias_cuello_botella: materiasCuelloBotella,
        promedio_por_anio_carrera: promedioPorAnioCarrera,
        retencion_por_cohorte: retencionPorCohorte,
      },
      actividad_reciente: ultimasPredicciones,
      ai_disponible: aiDisponible,
      calculado_en: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error en /api/dashboard:", error);
    res.status(500).json({
      error: "Error al cargar el dashboard",
      details: error.message,
    });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// ENDPOINT - Tasa de recursado y distribución por materia filtrado por año de cursada
// ═════════════════════════════════════════════════════════════════════════════
router.get("/por-materia", (req, res) => {
  try {
    const anio = parseInt(req.query.anio_cursada);
    if (!anio || isNaN(anio)) {
      return res.status(422).json({ error: "El parámetro anio_cursada es requerido." });
    }

    const aniosDisponibles = db
      .prepare("SELECT DISTINCT anio FROM cursadas ORDER BY anio DESC")
      .all()
      .map((r) => r.anio);

    const porMateria = db
      .prepare(
        `SELECT m.id, m.codigo, m.nombre, COALESCE(m.anio_carrera, 1) AS anio_carrera,
           COUNT(c.id) AS total_cursadas,
           SUM(CASE WHEN c.estado='recursada' THEN 1 ELSE 0 END) AS recursadas,
           ROUND(SUM(CASE WHEN c.estado='recursada' THEN 1.0 ELSE 0 END) / COUNT(c.id) * 100, 1) AS tasa_pct
         FROM materias m
         JOIN cursadas c ON c.materia_id = m.id
         WHERE c.anio = ?
         GROUP BY m.id
         ORDER BY tasa_pct DESC, m.anio_carrera, m.codigo`,
      )
      .all(anio);

    const distribucion = db
      .prepare(
        `SELECT m.id, m.codigo, m.nombre, COALESCE(m.anio_carrera, 1) AS anio_carrera,
           COUNT(CASE WHEN total_veces = 1 THEN 1 END) AS primera_vez,
           COUNT(CASE WHEN total_veces = 2 THEN 1 END) AS segunda_vez,
           COUNT(CASE WHEN total_veces >= 3 THEN 1 END) AS tercera_vez_o_mas
         FROM (
           SELECT c.materia_id, c.alumno_id,
             (SELECT COUNT(*) FROM cursadas c2
              WHERE c2.materia_id = c.materia_id AND c2.alumno_id = c.alumno_id) AS total_veces
           FROM cursadas c
           WHERE c.anio = ?
           GROUP BY c.materia_id, c.alumno_id
         ) sub
         JOIN materias m ON sub.materia_id = m.id
         GROUP BY sub.materia_id
         ORDER BY m.anio_carrera, m.codigo`,
      )
      .all(anio);

    res.json({
      anio,
      anios_disponibles: aniosDisponibles,
      por_materia: porMateria,
      distribucion,
    });
  } catch (error) {
    console.error("Error en /api/dashboard/por-materia:", error);
    res.status(500).json({ error: "Error al cargar datos por materia", details: error.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// ENDPOINT CDU015 - Rendimiento por examen
// ═════════════════════════════════════════════════════════════════════════════
router.get("/rendimiento", (req, res) => {
  try {
    const anio = parseInt(req.query.anio);
    if (!anio || isNaN(anio)) {
      return res.status(422).json({ error: "El parámetro anio es requerido." });
    }

    // ── Años disponibles (solo años con exámenes efectivamente rendidos) ──
    const aniosDisponibles = db
      .prepare("SELECT DISTINCT anio FROM examenes WHERE rendido = 1 ORDER BY anio DESC")
      .all()
      .map((r) => r.anio);

    // ── Estadísticas por materia → tipo → instancia ───────────────────────
    const stats = db
      .prepare(
        `
      SELECT
        m.id                                    AS materia_id,
        CAST(COALESCE(m.codigo_plan, m.codigo) AS TEXT) AS materia_codigo,
        m.nombre                                AS materia_nombre,
        e.tipo,
        e.instancia,
        COUNT(*)                                                      AS total_intentos,
        SUM(CASE WHEN e.rendido = 1 THEN 1 ELSE 0 END)               AS total_rendidos,
        SUM(CASE WHEN e.ausente  = 1 THEN 1 ELSE 0 END)              AS total_ausentes,
        SUM(CASE WHEN e.rendido = 1 AND e.nota >= 4 THEN 1 ELSE 0 END) AS total_aprobados,
        SUM(CASE WHEN e.rendido = 1 AND e.nota <  4 THEN 1 ELSE 0 END) AS total_desaprobados,
        ROUND(AVG(CASE WHEN e.rendido = 1 AND e.nota IS NOT NULL THEN e.nota END), 2) AS promedio_nota
      FROM examenes e
      JOIN materias m ON e.materia_id = m.id
      JOIN users    u ON e.alumno_id  = u.id
      WHERE e.anio = ? AND u.role = 'alumno'
      GROUP BY m.id, e.tipo, e.instancia
      ORDER BY m.codigo ASC,
        CASE e.tipo
          WHEN 'Parcial'       THEN 1
          WHEN 'Recuperatorio' THEN 2
          WHEN 'Final'         THEN 3
        END,
        e.instancia ASC
    `,
      )
      .all(anio);

    // ── Calcular porcentajes y armar estructura por materia ───────────────
    const porMateria = {};

    for (const row of stats) {
      if (!porMateria[row.materia_id]) {
        porMateria[row.materia_id] = {
          materia_id: row.materia_id,
          materia_codigo: row.materia_codigo,
          materia_nombre: row.materia_nombre,
          examenes: [],
        };
      }

      const totalBase = row.total_intentos; // base para calcular % (incluye ausentes)
      const totalRendidos = row.total_rendidos;

      porMateria[row.materia_id].examenes.push({
        // Identificador legible del examen
        label: `${row.tipo} ${row.instancia}`,
        tipo: row.tipo,
        instancia: row.instancia,
        // Cantidades absolutas
        total_intentos: row.total_intentos,
        total_rendidos: totalRendidos,
        total_ausentes: row.total_ausentes,
        total_aprobados: row.total_aprobados,
        total_desaprobados: row.total_desaprobados,
        promedio_nota: row.promedio_nota ?? 0,
        // Porcentajes sobre total de intentos
        pct_aprobados:
          totalBase > 0
            ? parseFloat(((row.total_aprobados / totalBase) * 100).toFixed(1))
            : 0,
        pct_desaprobados:
          totalBase > 0
            ? parseFloat(
                ((row.total_desaprobados / totalBase) * 100).toFixed(1),
              )
            : 0,
        pct_ausentes:
          totalBase > 0
            ? parseFloat(((row.total_ausentes / totalBase) * 100).toFixed(1))
            : 0,
      });
    }

    res.json({
      anio,
      anios_disponibles: aniosDisponibles,
      por_materia: Object.values(porMateria),
    });
  } catch (error) {
    console.error("Error en /api/dashboard/rendimiento:", error);
    res.status(500).json({
      error: "Error al cargar el rendimiento",
      details: error.message,
    });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// ENDPOINT - Datos históricos por año para una materia
// ═════════════════════════════════════════════════════════════════════════════
router.get("/historico", (req, res) => {
  try {
    const materiaId = parseInt(req.query.materia_id);
    if (!materiaId || isNaN(materiaId)) {
      return res.status(422).json({ error: "El parámetro materia_id es requerido." });
    }

    const materia = db
      .prepare("SELECT id, codigo, nombre FROM materias WHERE id = ?")
      .get(materiaId);
    if (!materia) {
      return res.status(404).json({ error: "Materia no encontrada." });
    }

    const porAnioCursadas = db
      .prepare(
        `SELECT
           c.anio,
           COUNT(c.id) AS total_cursadas,
           SUM(CASE WHEN c.estado = 'recursada' THEN 1 ELSE 0 END) AS recursadas,
           ROUND(SUM(CASE WHEN c.estado = 'recursada' THEN 1.0 ELSE 0 END) / COUNT(c.id) * 100, 1) AS tasa_pct,
           COUNT(CASE WHEN sub.total_veces = 1 THEN 1 END) AS primera_vez,
           COUNT(CASE WHEN sub.total_veces = 2 THEN 1 END) AS segunda_vez,
           COUNT(CASE WHEN sub.total_veces >= 3 THEN 1 END) AS tercera_vez_o_mas
         FROM cursadas c
         JOIN (
           SELECT alumno_id, COUNT(*) AS total_veces
           FROM cursadas
           WHERE materia_id = ?
           GROUP BY alumno_id
         ) sub ON sub.alumno_id = c.alumno_id
         WHERE c.materia_id = ?
         GROUP BY c.anio
         ORDER BY c.anio`,
      )
      .all(materiaId, materiaId);

    const porAnioExamenes = db
      .prepare(
        `SELECT
           e.anio,
           e.tipo,
           e.instancia,
           COUNT(*) AS total_intentos,
           SUM(CASE WHEN e.rendido = 1 THEN 1 ELSE 0 END) AS total_rendidos,
           SUM(CASE WHEN e.ausente = 1 THEN 1 ELSE 0 END) AS total_ausentes,
           SUM(CASE WHEN e.rendido = 1 AND e.nota >= 4 THEN 1 ELSE 0 END) AS total_aprobados,
           ROUND(AVG(CASE WHEN e.rendido = 1 AND e.nota IS NOT NULL THEN e.nota END), 2) AS promedio_nota,
           ROUND(SUM(CASE WHEN e.rendido = 1 AND e.nota >= 4 THEN 1.0 ELSE 0 END) / NULLIF(COUNT(*), 0) * 100, 1) AS pct_aprobados,
           ROUND(SUM(CASE WHEN e.ausente = 1 THEN 1.0 ELSE 0 END) / NULLIF(COUNT(*), 0) * 100, 1) AS pct_ausentes
         FROM examenes e
         JOIN users u ON e.alumno_id = u.id
         WHERE e.materia_id = ? AND u.role = 'alumno'
         GROUP BY e.anio, e.tipo, e.instancia
         ORDER BY e.anio,
           CASE e.tipo WHEN 'Parcial' THEN 1 WHEN 'Recuperatorio' THEN 2 WHEN 'Final' THEN 3 END,
           e.instancia`,
      )
      .all(materiaId);

    res.json({
      materia,
      por_anio_cursadas: porAnioCursadas,
      por_anio_examenes: porAnioExamenes,
    });
  } catch (error) {
    console.error("Error en /api/dashboard/historico:", error);
    res.status(500).json({ error: "Error al cargar datos históricos", details: error.message });
  }
});

module.exports = router;
