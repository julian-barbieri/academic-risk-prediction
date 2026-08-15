const axios = require("axios");
const db = require("../db/database");
const {
  calcularVariablesAbandono,
  calcularVariablesRecursado,
  calcularVariablesExamen,
} = require("./prediction-variables.service");

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
const BATCH_SIZE = 10;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos

// Caché en memoria por alumno+materia
const predictionCache = new Map();

function getCachedPrediction(alumnoId, materiaId) {
  const key = `${alumnoId}_${materiaId}`;
  const entry = predictionCache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    predictionCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedPrediction(alumnoId, materiaId, data) {
  predictionCache.set(`${alumnoId}_${materiaId}`, {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function normalizeAlumnoPayload(payload) {
  return payload.map(({ PromedioNotaGeneral, PromedioAsistencia, AyudaFinanciera,
                        CantExamenesRendidos, CantFinalesRendidos,
                        IndiceBloqueoPromedio, DelayPromedioRespectoPlan }) => ({
    PromedioNotaGeneral:       Number(PromedioNotaGeneral),
    PromedioAsistencia:        Number(PromedioAsistencia),
    AyudaFinanciera:           Number(AyudaFinanciera),
    CantExamenesRendidos:      Number(CantExamenesRendidos),
    CantFinalesRendidos:       Number(CantFinalesRendidos),
    IndiceBloqueoPromedio:     Number(IndiceBloqueoPromedio),
    DelayPromedioRespectoPlan: Number(DelayPromedioRespectoPlan),
  }));
}

function normalizeMateriaPayload(payload) {
  return payload.map(({ PromedioNotaGeneral, PromedioAsistencia, AyudaFinanciera,
                        Materia, PromedioColegio,
                        IndiceBloqueo, DelayRespectoPlan, NotaPromedioPrevias, EsMateriaBottleneck }) => ({
    PromedioNotaGeneral: Number(PromedioNotaGeneral),
    PromedioAsistencia:  Number(PromedioAsistencia),
    AyudaFinanciera:     Number(AyudaFinanciera),
    Materia:             Number(Materia),
    PromedioColegio:     Number(PromedioColegio),
    IndiceBloqueo:       Number(IndiceBloqueo),
    DelayRespectoPlan:   Number(DelayRespectoPlan),
    NotaPromedioPrevias: Number(NotaPromedioPrevias),
    EsMateriaBottleneck: Number(EsMateriaBottleneck),
  }));
}

function normalizeExamenPayload(payload) {
  return payload.map(({ PromedioNotaGeneral, PromedioAsistencia, AyudaFinanciera,
                        NotaPromedioParcialCursada, TasaRecursaGeneral, Materia,
                        NotaPromedioCorrelativas, IndiceBloqueo, CargaSimultanea }) => ({
    PromedioNotaGeneral:        Number(PromedioNotaGeneral),
    PromedioAsistencia:         Number(PromedioAsistencia),
    AyudaFinanciera:            Number(AyudaFinanciera),
    NotaPromedioParcialCursada: Number(NotaPromedioParcialCursada),
    TasaRecursaGeneral:         Number(TasaRecursaGeneral),
    Materia:                    Number(Materia),
    NotaPromedioCorrelativas:   Number(NotaPromedioCorrelativas),
    IndiceBloqueo:              Number(IndiceBloqueo),
    CargaSimultanea:            Number(CargaSimultanea),
  }));
}

function getRiskLevel(probabilidad) {
  const prob = Number(probabilidad || 0);

  if (prob >= 0.7) {
    return { level: "ALTO", color: "red", label: "Riesgo alto de abandono", icon: "🔴" };
  }
  if (prob >= 0.4) {
    return { level: "MEDIO", color: "yellow", label: "Riesgo moderado de abandono", icon: "🟡" };
  }
  return { level: "BAJO", color: "green", label: "Bajo riesgo de abandono", icon: "🟢" };
}

function getRecursadoRiskLevel(probabilidad) {
  const prob = Number(probabilidad || 0);

  if (prob >= 0.7) {
    return { level: "ALTO", color: "red", label: "Riesgo alto de recursado", icon: "🔴" };
  }
  if (prob >= 0.4) {
    return { level: "MEDIO", color: "yellow", label: "Riesgo moderado de recursado", icon: "🟡" };
  }
  return { level: "BAJO", color: "green", label: "Bajo riesgo de recursado", icon: "🟢" };
}

function getNotaLevel(nota) {
  const n = Number(nota || 0);

  if (n < 4) return { level: "REPROBADO", color: "red", label: "Reprobado", icon: "❌", rating: "Bajo" };
  if (n < 6) return { level: "APROBADO", color: "orange", label: "Aprobado", icon: "✅", rating: "Regular" };
  if (n < 8) return { level: "BUENO", color: "amber", label: "Bueno", icon: "⭐", rating: "Bueno" };
  return { level: "EXCELENTE", color: "green", label: "Excelente", icon: "⭐⭐", rating: "Excelente" };
}

function obtenerProximosExamenes(alumnoId, materiaId) {
  const cursada = db
    .prepare(
      `SELECT c.anio, c.estado
       FROM cursadas c
       WHERE c.alumno_id = ? AND c.materia_id = ?
       ORDER BY c.anio DESC
       LIMIT 1`,
    )
    .get(alumnoId, materiaId);

  if (!cursada) return [];

  const anio = cursada.anio;

  const examenesRendidos = db
    .prepare(
      `SELECT tipo, instancia, nota
       FROM examenes
       WHERE alumno_id = ? AND materia_id = ? AND anio = ? AND rendido = 1`,
    )
    .all(alumnoId, materiaId, anio);

  const yaRendido = (tipo, instancia) =>
    examenesRendidos.some((e) => e.tipo === tipo && e.instancia === instancia);

  const aprobado = (tipo, instancia) =>
    examenesRendidos.some(
      (e) => e.tipo === tipo && e.instancia === instancia && Number(e.nota) >= 4,
    );

  if (!yaRendido("Parcial", 1)) return [{ tipo: "Parcial", instancia: 1, anio }];
  if (!aprobado("Parcial", 1)) {
    if (!yaRendido("Recuperatorio", 1)) return [{ tipo: "Recuperatorio", instancia: 1, anio }];
  }
  if (!yaRendido("Parcial", 2)) return [{ tipo: "Parcial", instancia: 2, anio }];
  if (!aprobado("Parcial", 2)) {
    if (!yaRendido("Recuperatorio", 2)) return [{ tipo: "Recuperatorio", instancia: 2, anio }];
  }
  if (!yaRendido("Final", 1)) return [{ tipo: "Final", instancia: 1, anio }];

  return [];
}

// Helpers para procesar cada modelo en paralelo
async function procesarModeloAbandono(batch, results) {
  for (let i = 0; i < batch.length; i += BATCH_SIZE) {
    const chunk = batch.slice(i, i + BATCH_SIZE);
    try {
      const payload = normalizeAlumnoPayload(chunk.map((item) => item.variables));
      const response = await axios.post(`${AI_SERVICE_URL}/predict/alumno`, payload);
      chunk.forEach((item, index) => {
        const pred = response.data[index];
        if (!results[item.alumnoId]) results[item.alumnoId] = {};
        results[item.alumnoId].abandono = {
          abandona: pred?.Abandona || false,
          probabilidad: pred?.probabilidad || 0,
          risk: getRiskLevel(pred?.probabilidad || 0),
        };
      });
    } catch (error) {
      console.error("Error predicción abandono:", error.message);
      chunk.forEach((item) => {
        if (!results[item.alumnoId]) results[item.alumnoId] = {};
        results[item.alumnoId].abandono = { error: "No se pudo calcular" };
      });
    }
  }
}

async function procesarModeloRecursado(batch, results) {
  for (let i = 0; i < batch.length; i += BATCH_SIZE) {
    const chunk = batch.slice(i, i + BATCH_SIZE);
    try {
      const payload = normalizeMateriaPayload(chunk.map((item) => item.variables));
      const response = await axios.post(`${AI_SERVICE_URL}/predict/materia`, payload);
      chunk.forEach((item, index) => {
        const pred = response.data[index];
        if (!results[item.alumnoId]) results[item.alumnoId] = {};
        results[item.alumnoId].recursado = {
          recursa: pred?.Recursa || false,
          probabilidad: pred?.probabilidad || 0,
          risk: getRecursadoRiskLevel(pred?.probabilidad || 0),
        };
      });
    } catch (error) {
      console.error("Error predicción recursado:", error.message);
      chunk.forEach((item) => {
        if (!results[item.alumnoId]) results[item.alumnoId] = {};
        results[item.alumnoId].recursado = { error: "No se pudo calcular" };
      });
    }
  }
}

async function procesarModeloExamen(batch, examenInfoMap, results) {
  for (let i = 0; i < batch.length; i += BATCH_SIZE) {
    const chunk = batch.slice(i, i + BATCH_SIZE);
    try {
      const payload = normalizeExamenPayload(chunk.map((item) => item.variables));
      const response = await axios.post(`${AI_SERVICE_URL}/predict/examen`, payload);
      chunk.forEach((item, index) => {
        const pred = response.data[index];
        if (!results[item.alumnoId]) results[item.alumnoId] = {};
        results[item.alumnoId].nota = {
          nota: pred?.Nota || 0,
          examen_info: examenInfoMap[item.alumnoId],
          nota_level: getNotaLevel(pred?.Nota),
        };
      });
    } catch (error) {
      console.error("Error predicción examen:", error.message);
      chunk.forEach((item) => {
        if (!results[item.alumnoId]) results[item.alumnoId] = {};
        results[item.alumnoId].nota = { error: "No se pudo calcular" };
      });
    }
  }
}

async function precalcularAbandonoParaAlumnos(alumnosIds) {
  if (!alumnosIds || alumnosIds.length === 0) return {};

  const results = {};

  try {
    const variablesPromises = alumnosIds.map(async (alumnoId) => {
      try {
        const { variables } = calcularVariablesAbandono(alumnoId);
        return { alumnoId, variables, error: null };
      } catch (error) {
        return { alumnoId, variables: null, error };
      }
    });

    const variablesResults = await Promise.all(variablesPromises);

    const validVariables = variablesResults
      .filter((r) => r.variables && !r.error)
      .map((r) => ({ alumnoId: r.alumnoId, variables: r.variables }));

    if (validVariables.length === 0) return results;

    await procesarModeloAbandono(validVariables, results);
  } catch (error) {
    console.error("Error en precalcularAbandonoParaAlumnos:", error);
  }

  return results;
}

async function precalcularPrediccionesCompletas(alumnosIds, materiaId) {
  if (!alumnosIds || alumnosIds.length === 0) return {};

  const results = {};
  const alumnosAComputar = [];

  // Servir desde caché los que ya están calculados (B)
  for (const alumnoId of alumnosIds) {
    const cached = getCachedPrediction(alumnoId, materiaId);
    if (cached) {
      results[alumnoId] = cached;
    } else {
      alumnosAComputar.push(alumnoId);
    }
  }

  if (alumnosAComputar.length === 0) return results;

  try {
    // Calcular variables para alumnos no cacheados
    const variablesData = await Promise.all(
      alumnosAComputar.map(async (alumnoId) => {
        try {
          const { variables: variables_abandono } = calcularVariablesAbandono(alumnoId);

          const cursada = db
            .prepare(
              `SELECT c.anio FROM cursadas c
               WHERE c.alumno_id = ? AND c.materia_id = ?
               ORDER BY c.anio DESC LIMIT 1`,
            )
            .get(alumnoId, materiaId);

          let variables_recursado = null;
          if (cursada) {
            try {
              const { variables: vars_rec } = calcularVariablesRecursado(alumnoId, materiaId, cursada.anio);
              variables_recursado = vars_rec;
            } catch (e) {
              console.error(`Error vars recursado ${alumnoId}:`, e.message);
            }
          }

          let variables_examen = null;
          let examen_info = null;
          const proximosExamenes = obtenerProximosExamenes(alumnoId, materiaId);
          if (proximosExamenes.length > 0) {
            const exam = proximosExamenes[0];
            try {
              const { variables: vars_ex } = calcularVariablesExamen(
                alumnoId,
                materiaId,
                exam.tipo,
                exam.instancia,
                exam.anio,
              );
              variables_examen = vars_ex;
              examen_info = exam;
            } catch (e) {
              console.error(`Error vars examen ${alumnoId}:`, e.message);
            }
          }

          return { alumnoId, variables_abandono, variables_recursado, variables_examen, examen_info };
        } catch (error) {
          console.error(`Error calculando variables para ${alumnoId}:`, error.message);
          return { alumnoId, error: error.message };
        }
      }),
    );

    const abandonoBatch = variablesData
      .filter((p) => p.variables_abandono)
      .map((p) => ({ alumnoId: p.alumnoId, variables: p.variables_abandono }));

    const recursadoBatch = variablesData
      .filter((p) => p.variables_recursado)
      .map((p) => ({ alumnoId: p.alumnoId, variables: p.variables_recursado }));

    const examenBatch = variablesData
      .filter((p) => p.variables_examen)
      .map((p) => ({ alumnoId: p.alumnoId, variables: p.variables_examen }));

    const examenInfoMap = Object.fromEntries(
      variablesData.filter((p) => p.examen_info).map((p) => [p.alumnoId, p.examen_info]),
    );

    // Procesar los 3 modelos en paralelo (A)
    await Promise.all([
      procesarModeloAbandono(abandonoBatch, results),
      procesarModeloRecursado(recursadoBatch, results),
      procesarModeloExamen(examenBatch, examenInfoMap, results),
    ]);

    // Guardar en caché solo resultados sin errores (B) — un fallo transitorio
    // del AI service no debe quedar "pegado" por CACHE_TTL_MS para el resto
    // de los alumnos que consulten esta materia mientras tanto.
    for (const alumnoId of alumnosAComputar) {
      const result = results[alumnoId];
      const tieneError =
        result?.abandono?.error || result?.recursado?.error || result?.nota?.error;
      if (result && !tieneError) {
        setCachedPrediction(alumnoId, materiaId, result);
      }
    }
  } catch (error) {
    console.error("Error en precalcularPrediccionesCompletas:", error);
  }

  return results;
}

module.exports = {
  precalcularAbandonoParaAlumnos,
  precalcularPrediccionesCompletas,
  getRiskLevel,
  getRecursadoRiskLevel,
  getNotaLevel,
  normalizeAlumnoPayload,
  normalizeMateriaPayload,
  normalizeExamenPayload,
  obtenerProximosExamenes,
};
