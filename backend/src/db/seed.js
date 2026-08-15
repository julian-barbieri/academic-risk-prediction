const bcrypt = require("bcryptjs");
const db = require("./database");
const fs = require("fs");
const path = require("path");

// Plan de estudios completo — Ingeniería en Informática
// Formato: [codigo_plan, nombre, tipo ('A'=anual, 'C'=cuatrimestral), anio_carrera, correlativas[]]
const PLAN_CURRICULUM = [
  [140, "Introducción a la Administración de Empresas", "C", 1, []],
  [141, "Sistemas Numéricos", "C", 1, []],
  [142, "Análisis Matemático I", "A", 1, []],
  [143, "Metodología de la Investigación", "C", 1, []],
  [144, "Introducción a la Programación", "C", 1, []],
  [145, "Arquitectura de Computadoras", "C", 1, [141]],
  [146, "Álgebra I", "C", 1, []],
  [147, "Paradigmas de Programación", "C", 1, [144]],
  [148, "Programación I", "C", 1, [144]],
  [149, "Sistemas de Representación", "C", 2, []],
  [150, "Física I", "C", 2, []],
  [151, "Cálculo Numérico", "C", 2, [142]],
  [152, "Estructura de Datos y Algoritmos", "A", 2, [144]],
  [153, "Sistemas de Información I", "A", 2, []],
  [154, "Álgebra II", "C", 2, [146]],
  [155, "Filosofía", "C", 2, []],
  [156, "Programación II", "C", 2, [147, 148]],
  [157, "Teoría de Lenguajes", "C", 2, [147, 148]],
  [158, "Análisis Matemático II", "C", 2, [142]],
  [159, "Química General", "C", 3, []],
  [160, "Física II", "C", 3, [150]],
  [161, "Sistemas Operativos", "A", 3, [152]],
  [162, "Sistemas de Información II", "A", 3, [153]],
  [163, "Sistemas de Bases de Datos", "A", 3, [152]],
  [164, "Probabilidad y Estadística", "A", 3, [154]],
  [165, "Programación Avanzada", "A", 3, [156]],
  [166, "Teleinformática", "C", 3, [145]],
  [167, "Física III", "C", 3, [160]],
  [168, "Inglés I", "C", 3, []],
  [169, "Inglés II", "C", 3, []],
  [170, "Tecnología Informática", "C", 4, [161]],
  [171, "Ingeniería del Software", "C", 4, [162]],
  [172, "Seminario de Integración Profesional", "A", 4, [156, 162]],
  [173, "Investigación Operativa", "C", 4, [164]],
  [174, "Arquitectura de Redes", "C", 4, [166]],
  [175, "Dirección de Proyectos Informáticos", "C", 4, [162]],
  [176, "Auditoría de Sistemas", "C", 4, [162]],
  [177, "Teología", "C", 4, []],
  [178, "Modelos y Simulación", "C", 4, [164]],
  [179, "Derecho Informático", "C", 5, []],
  [180, "Ética Profesional", "C", 5, []],
  [181, "Tecnologías Emergentes", "A", 5, [170]],
  [182, "Sistemas Inteligentes", "A", 5, [165]],
  [183, "Proyecto Final de Ingeniería en Informática", "A", 5, [172, 175]],
  [184, "Gestión Ambiental", "C", 5, []],
  [185, "Aseguramiento de la Calidad del Software", "C", 5, [171]],
  [186, "Seguridad Informática", "C", 5, [176]],
  [187, "Elementos de Economía", "C", 5, []],
];

// AM1 = plan 142 (Análisis Matemático I), AM2 = plan 158 (Análisis Matemático II)
// Ambos mantienen sus códigos de texto para compatibilidad con datos demo existentes.
function seedRestoCurriculumPlan() {
  const insertOrIgnore = db.prepare(`
    INSERT OR IGNORE INTO materias (nombre, codigo, codigo_plan, tipo, anio_carrera, correlativas)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const updatePlanData = db.prepare(`
    UPDATE materias SET codigo_plan=?, tipo=?, anio_carrera=?, correlativas=? WHERE codigo=?
  `);

  for (const [planId, nombre, tipo, anio, corrs] of PLAN_CURRICULUM) {
    const correlativasJson = JSON.stringify(corrs);

    // AM1 y AM2 ya tienen código de texto — solo actualizar metadatos del plan
    if (planId === 142) {
      updatePlanData.run(142, tipo, anio, correlativasJson, "AM1");
      continue;
    }
    if (planId === 158) {
      updatePlanData.run(158, tipo, anio, correlativasJson, "AM2");
      continue;
    }

    insertOrIgnore.run(nombre, String(planId), planId, tipo, anio, correlativasJson);
  }
}

function seedMateriasInscripcionesYContenido() {
  const currentYear = new Date().getFullYear();

  const totalMaterias = db
    .prepare("SELECT COUNT(*) AS count FROM materias")
    .get();

  if (totalMaterias.count === 0) {
    const insertMateria = db.prepare(
      "INSERT INTO materias (nombre, codigo, codigo_plan, tipo, anio_carrera, correlativas, descripcion) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );

    insertMateria.run(
      "Análisis Matemático I",
      "AM1",
      142,
      "A",
      1,
      "[]",
      "Fundamentos de límites, derivadas e integrales",
    );
    insertMateria.run(
      "Análisis Matemático II",
      "AM2",
      158,
      "C",
      2,
      "[142]",
      "Funciones de varias variables e integrales múltiples",
    );
  }

  // Siempre asegurar que los 46 materias restantes del plan existan
  seedRestoCurriculumPlan();

  const alumno =
    db.prepare("SELECT id FROM users WHERE username = ?").get("alumno1") ||
    db.prepare("SELECT id FROM users WHERE username = ?").get("alumno") ||
    db.prepare("SELECT id FROM users WHERE role = 'alumno' ORDER BY id LIMIT 1").get();

  const tutor =
    db.prepare("SELECT id FROM users WHERE username = ?").get("docente") ||
    db.prepare("SELECT id FROM users WHERE username = ?").get("docente1");

  if (!alumno || !tutor) {
    console.warn(
      "No se pudo seedear contenido CDU002: faltan usuarios alumno/docente en users.",
    );
    return;
  }

  const am1 = db.prepare("SELECT id FROM materias WHERE codigo = ?").get("AM1");
  const am2 = db.prepare("SELECT id FROM materias WHERE codigo = ?").get("AM2");

  if (!am1 || !am2) {
    return;
  }

  const insertInscripcion = db.prepare(
    "INSERT OR IGNORE INTO inscripciones (alumno_id, materia_id, anio, periodo_id, estado) VALUES (?, ?, ?, ?, ?)",
  );
  insertInscripcion.run(alumno.id, am1.id, currentYear, null, "activa");

  const totalContenido = db
    .prepare("SELECT COUNT(*) AS count FROM contenido")
    .get();

  if (totalContenido.count > 0) {
    return;
  }

  const insertContenido = db.prepare(`
    INSERT INTO contenido (
      tutor_id,
      materia_id,
      titulo,
      descripcion,
      tipo,
      archivo_path,
      video_url,
      texto_contenido,
      alumno_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertContenido.run(
    tutor.id,
    am1.id,
    "Guía de ejercicios - Límites",
    "Material de práctica para afianzar conceptos de límites.",
    "pdf",
    "/sample/guia-limites.pdf",
    null,
    null,
    null,
  );

  insertContenido.run(
    tutor.id,
    am1.id,
    "Introducción a derivadas",
    "Video introductorio sobre derivadas y su interpretación.",
    "video",
    null,
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    null,
    null,
  );

  insertContenido.run(
    tutor.id,
    am2.id,
    "Tabla de integrales",
    "Imagen de referencia para integrales frecuentes.",
    "imagen",
    "/sample/tabla-integrales.png",
    null,
    null,
    null,
  );

  insertContenido.run(
    tutor.id,
    am1.id,
    "Resumen del parcial 1",
    "Observaciones personalizadas para reforzar antes del recuperatorio.",
    "texto",
    null,
    null,
    "Repasá límites laterales, continuidad y derivación implícita. Priorizá ejercicios de aplicaciones.",
    alumno.id,
  );

  insertContenido.run(
    tutor.id,
    am2.id,
    "Plantilla de resolución de ejercicios",
    "Documento guía para estructurar las resoluciones.",
    "word",
    "/sample/plantilla-resolucion.docx",
    null,
    null,
    null,
  );
}

function seedGestionMateriasCDU005() {
  const currentYear = new Date().getFullYear();

  const coordinator =
    db.prepare("SELECT id FROM users WHERE username = ?").get("coordinador") ||
    db.prepare("SELECT id FROM users WHERE role = 'coordinador' LIMIT 1").get();

  const docente =
    db.prepare("SELECT id FROM users WHERE username = ?").get("docente1") ||
    db.prepare("SELECT id FROM users WHERE username = ?").get("docente");

  const alumno =
    db.prepare("SELECT id FROM users WHERE username = ?").get("alumno1") ||
    db.prepare("SELECT id FROM users WHERE username = ?").get("alumno") ||
    db.prepare("SELECT id FROM users WHERE role = 'alumno' ORDER BY id LIMIT 1").get();

  const am1 = db.prepare("SELECT id FROM materias WHERE codigo = ?").get("AM1");
  const am2 = db.prepare("SELECT id FROM materias WHERE codigo = ?").get("AM2");

  if (!coordinator || !docente || !alumno || !am1 || !am2) {
    return;
  }

  const totalPeriodos = db
    .prepare("SELECT COUNT(*) AS count FROM periodos_inscripcion")
    .get();

  if (totalPeriodos.count === 0) {
    db.prepare(
      `
      INSERT INTO periodos_inscripcion (
        anio,
        descripcion,
        fecha_inicio,
        fecha_fin,
        activo,
        creado_por
      ) VALUES (?, ?, ?, ?, 1, ?)
    `,
    ).run(
      currentYear,
      `Cuatrimestre 1 - ${currentYear}`,
      `${currentYear}-03-01`,
      `${currentYear}-03-31`,
      coordinator.id,
    );
  }

  const totalAsignaciones = db
    .prepare("SELECT COUNT(*) AS count FROM docente_materia")
    .get();

  if (totalAsignaciones.count === 0) {
    const insertAsignacion = db.prepare(
      `
      INSERT INTO docente_materia (
        docente_id,
        materia_id,
        anio,
        activo,
        asignado_por
      ) VALUES (?, ?, ?, ?, ?)
    `,
    );

    insertAsignacion.run(docente.id, am1.id, currentYear, 1, coordinator.id);
    insertAsignacion.run(docente.id, am2.id, currentYear, 1, coordinator.id);
    insertAsignacion.run(
      docente.id,
      am1.id,
      currentYear - 1,
      0,
      coordinator.id,
    );
  }

  const periodoActivo = db
    .prepare(
      "SELECT id FROM periodos_inscripcion WHERE activo = 1 ORDER BY id DESC LIMIT 1",
    )
    .get();

  if (!periodoActivo) {
    return;
  }

  const yaInscriptoAm1 = db
    .prepare(
      "SELECT id FROM inscripciones WHERE alumno_id = ? AND materia_id = ? AND anio = ? AND estado = 'activa' LIMIT 1",
    )
    .get(alumno.id, am1.id, currentYear);

  if (!yaInscriptoAm1) {
    db.prepare(
      `
      INSERT INTO inscripciones (
        alumno_id,
        materia_id,
        anio,
        periodo_id,
        estado
      ) VALUES (?, ?, ?, ?, 'activa')
    `,
    ).run(alumno.id, am1.id, currentYear, periodoActivo.id);
  }
}

function seedMensajeriaCDU003() {
  const am1 = db.prepare("SELECT id FROM materias WHERE codigo = ?").get("AM1");
  const am2 = db.prepare("SELECT id FROM materias WHERE codigo = ?").get("AM2");

  if (!am1 || !am2) {
    return;
  }

  const totalUnidades = db
    .prepare("SELECT COUNT(*) AS count FROM unidades")
    .get();

  if (totalUnidades.count === 0) {
    const insertUnidad = db.prepare(
      "INSERT INTO unidades (materia_id, nombre, orden) VALUES (?, ?, ?)",
    );

    insertUnidad.run(am1.id, "Unidad 1 - Límites y continuidad", 1);
    insertUnidad.run(am1.id, "Unidad 2 - Derivadas", 2);
    insertUnidad.run(am1.id, "Unidad 3 - Integrales", 3);

    insertUnidad.run(am2.id, "Unidad 1 - Funciones de varias variables", 1);
    insertUnidad.run(am2.id, "Unidad 2 - Integrales dobles", 2);
  }

  const totalConversaciones = db
    .prepare("SELECT COUNT(*) AS count FROM conversaciones")
    .get();

  if (totalConversaciones.count > 0) {
    return;
  }

  const alumno =
    db.prepare("SELECT id FROM users WHERE username = ?").get("alumno1") ||
    db.prepare("SELECT id FROM users WHERE username = ?").get("alumno") ||
    db.prepare("SELECT id FROM users WHERE role = 'alumno' ORDER BY id LIMIT 1").get();

  const tutor =
    db.prepare("SELECT id FROM users WHERE username = ?").get("docente1") ||
    db.prepare("SELECT id FROM users WHERE username = ?").get("docente");

  const unidadAm1 = db
    .prepare(
      "SELECT id FROM unidades WHERE materia_id = ? AND orden = 1 ORDER BY id ASC LIMIT 1",
    )
    .get(am1.id);

  if (!alumno || !tutor || !unidadAm1) {
    return;
  }

  const createSampleConversation = db.transaction(() => {
    const conversacionResult = db
      .prepare(
        `
        INSERT INTO conversaciones (
          asunto,
          alumno_id,
          tutor_id,
          materia_id,
          unidad_id,
          ultimo_mensaje_at
        ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `,
      )
      .run(
        "¿Cómo se resuelven los límites indeterminados?",
        alumno.id,
        tutor.id,
        am1.id,
        unidadAm1.id,
      );

    const conversacionId = Number(conversacionResult.lastInsertRowid);

    const insertMensaje = db.prepare(
      `
      INSERT INTO mensajes (conversacion_id, remitente_id, cuerpo, leido)
      VALUES (?, ?, ?, ?)
    `,
    );

    insertMensaje.run(
      conversacionId,
      alumno.id,
      "Hola, no entiendo cómo resolver el límite 0/0. ¿Podés explicarme?",
      0,
    );

    insertMensaje.run(
      conversacionId,
      tutor.id,
      "Hola! Para los límites indeterminados podés usar la regla de L Hôpital...",
      1,
    );

    insertMensaje.run(
      conversacionId,
      alumno.id,
      "Muchas gracias, me quedó claro.",
      0,
    );
  });

  createSampleConversation();
}

function seedMensajeriaCDU007() {
  const am1 = db.prepare("SELECT id FROM materias WHERE codigo = ?").get("AM1");

  if (!am1) {
    return;
  }

  const totalConversacionesDc = db
    .prepare(
      "SELECT COUNT(*) AS count FROM conversaciones WHERE tipo_conversacion = 'docente_coordinador'",
    )
    .get();

  if (totalConversacionesDc.count > 0) {
    return;
  }

  const docente =
    db.prepare("SELECT id FROM users WHERE username = ?").get("docente1") ||
    db.prepare("SELECT id FROM users WHERE username = ?").get("docente");

  const coordinador =
    db.prepare("SELECT id FROM users WHERE username = ?").get("coordinador") ||
    db.prepare("SELECT id FROM users WHERE role = 'coordinador' LIMIT 1").get();

  if (!docente || !coordinador) {
    return;
  }

  const unidadAm1 = db
    .prepare(
      "SELECT id FROM unidades WHERE materia_id = ? ORDER BY orden ASC LIMIT 1",
    )
    .get(am1.id);

  const createSampleConversation = db.transaction(() => {
    const conversacionResult = db
      .prepare(
        `
        INSERT INTO conversaciones (
          asunto,
          alumno_id,
          tutor_id,
          materia_id,
          unidad_id,
          participante_a_id,
          participante_b_id,
          tipo_conversacion,
          ultimo_mensaje_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'docente_coordinador', CURRENT_TIMESTAMP)
      `,
      )
      .run(
        "Coordinación de contenidos para Unidad 1",
        docente.id,
        coordinador.id,
        am1.id,
        unidadAm1?.id || null,
        docente.id,
        coordinador.id,
      );

    const conversacionId = Number(conversacionResult.lastInsertRowid);

    const insertMensaje = db.prepare(
      `
      INSERT INTO mensajes (conversacion_id, remitente_id, cuerpo, leido)
      VALUES (?, ?, ?, ?)
    `,
    );

    insertMensaje.run(
      conversacionId,
      docente.id,
      "Hola, ¿te parece bien publicar la guía de límites esta semana?",
      0,
    );

    insertMensaje.run(
      conversacionId,
      coordinador.id,
      "Sí, adelante. Sumá también una actividad práctica para reforzar.",
      0,
    );
  });

  createSampleConversation();
}

function seedMisCursosCDU004() {
  const totalCursadas = db
    .prepare("SELECT COUNT(*) AS count FROM cursadas")
    .get();
  const totalExamenes = db
    .prepare("SELECT COUNT(*) AS count FROM examenes")
    .get();

  if (totalCursadas.count > 0 || totalExamenes.count > 0) {
    return;
  }

  const alumno =
    db.prepare("SELECT id FROM users WHERE username = ?").get("alumno1") ||
    db.prepare("SELECT id FROM users WHERE username = ?").get("alumno") ||
    db.prepare("SELECT id FROM users WHERE role = 'alumno' ORDER BY id LIMIT 1").get();

  const am1 = db.prepare("SELECT id FROM materias WHERE codigo = ?").get("AM1");
  const am2 = db.prepare("SELECT id FROM materias WHERE codigo = ?").get("AM2");

  if (!alumno || !am1 || !am2) {
    return;
  }

  const insertCursada = db.prepare(
    "INSERT INTO cursadas (alumno_id, materia_id, anio, asistencia, estado) VALUES (?, ?, ?, ?, ?)",
  );

  insertCursada.run(alumno.id, am1.id, 2023, 0.9, "aprobada");
  insertCursada.run(alumno.id, am2.id, 2024, 0.8, "cursando");

  const insertExamen = db.prepare(
    "INSERT INTO examenes (alumno_id, materia_id, anio, tipo, instancia, rendido, nota) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );

  insertExamen.run(alumno.id, am1.id, 2025, "Parcial", 1, 1, 7.5);
  insertExamen.run(alumno.id, am1.id, 2025, "Parcial", 2, 1, 6.0);
  insertExamen.run(alumno.id, am1.id, 2025, "Final", 1, 1, 4.5);

  insertExamen.run(alumno.id, am2.id, 2026, "Parcial", 1, 0, null);
  insertExamen.run(alumno.id, am2.id, 2026, "Parcial", 2, 0, null);
  insertExamen.run(alumno.id, am2.id, 2026, "Final", 1, 0, null);
}

function seedGestionContenidoCDU008() {
  const totalCarpetas = db
    .prepare("SELECT COUNT(*) AS count FROM carpetas")
    .get()?.count;

  if (Number(totalCarpetas) > 0) {
    return;
  }

  const coordinador =
    db.prepare("SELECT id FROM users WHERE username = ?").get("coordinador") ||
    db.prepare("SELECT id FROM users WHERE role = 'coordinador' LIMIT 1").get();

  const am1 = db.prepare("SELECT id FROM materias WHERE codigo = ?").get("AM1");

  if (!coordinador || !am1) {
    return;
  }

  const createSeed = db.transaction(() => {
    const insertCarpeta = db.prepare(
      "INSERT INTO carpetas (materia_id, nombre, creado_por) VALUES (?, ?, ?)",
    );

    const parcial1 = insertCarpeta.run(am1.id, "Parcial 1", coordinador.id);
    insertCarpeta.run(am1.id, "Parcial 2", coordinador.id);
    insertCarpeta.run(am1.id, "Material de apoyo", coordinador.id);

    const contenidoResult = db
      .prepare(
        `
        INSERT INTO contenido (
          tutor_id,
          materia_id,
          titulo,
          descripcion,
          tipo,
          archivo_path,
          video_url,
          texto_contenido,
          alumno_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        coordinador.id,
        am1.id,
        "Guía parcial 1",
        "Guía de práctica para el primer parcial.",
        "pdf",
        "/parcial1_guia.pdf",
        null,
        null,
        null,
      );

    db.prepare(
      `
      INSERT INTO carpeta_archivos (carpeta_id, contenido_id, nombre_archivo)
      VALUES (?, ?, ?)
    `,
    ).run(
      Number(parcial1.lastInsertRowid),
      Number(contenidoResult.lastInsertRowid),
      "Guía parcial 1.pdf",
    );
  });

  createSeed();
}

function seedPrediccionesAutomaticasCDU009() {
  const am1 = db.prepare("SELECT id FROM materias WHERE codigo = ?").get("AM1");
  const am2 = db.prepare("SELECT id FROM materias WHERE codigo = ?").get("AM2");

  const alumno1 =
    db.prepare("SELECT id FROM users WHERE username = ?").get("alumno1") ||
    db.prepare("SELECT id FROM users WHERE username = ?").get("alumno") ||
    db.prepare("SELECT id FROM users WHERE role = 'alumno' ORDER BY id LIMIT 1").get();

  if (!am1 || !am2 || !alumno1) {
    return;
  }

  const currentYear = new Date().getFullYear();

  db.prepare(
    `
      UPDATE users
      SET
        promedio_colegio = COALESCE(promedio_colegio, ?),
        anio_ingreso = COALESCE(anio_ingreso, ?),
        genero = COALESCE(genero, ?),
        fecha_nac = COALESCE(fecha_nac, ?),
        ayuda_financiera = COALESCE(ayuda_financiera, ?),
        colegio_tecnico = COALESCE(colegio_tecnico, ?),
        nombre_completo = COALESCE(nombre_completo, ?),
        email = COALESCE(email, ?)
      WHERE id = ?
    `,
  ).run(
    6.9,
    2022,
    "Masculino",
    "24-01-2000",
    1,
    0,
    "García, Ana",
    "alumno@usal.edu.ar",
    alumno1.id,
  );

  const alumnosExtra = [
    {
      username: "alumno",
      promedio: 7.4,
      anio_ingreso: 2021,
      genero: "Femenino",
      fecha_nac: "15-03-2001",
      ayuda_financiera: 0,
      colegio_tecnico: 1,
      nombre: "García, Ana",
      email: "alumno@usal.edu.ar",
    },
  ];

  const updateByUsername = db.prepare(
    `
      UPDATE users
      SET
        promedio_colegio = COALESCE(promedio_colegio, ?),
        anio_ingreso = COALESCE(anio_ingreso, ?),
        genero = COALESCE(genero, ?),
        fecha_nac = COALESCE(fecha_nac, ?),
        ayuda_financiera = COALESCE(ayuda_financiera, ?),
        colegio_tecnico = COALESCE(colegio_tecnico, ?),
        nombre_completo = COALESCE(nombre_completo, ?),
        email = COALESCE(email, ?)
      WHERE username = ?
    `,
  );

  for (const extra of alumnosExtra) {
    updateByUsername.run(
      extra.promedio,
      extra.anio_ingreso,
      extra.genero,
      extra.fecha_nac,
      extra.ayuda_financiera,
      extra.colegio_tecnico,
      extra.nombre,
      extra.email,
      extra.username,
    );
  }

  const seedTransaccional = db.transaction(() => {
    db.prepare("DELETE FROM examenes WHERE alumno_id = ?").run(alumno1.id);
    db.prepare("DELETE FROM cursadas WHERE alumno_id = ?").run(alumno1.id);

    const upsertInscripcion = db.prepare(
      `
      INSERT OR IGNORE INTO inscripciones (alumno_id, materia_id, anio, periodo_id, estado)
      VALUES (?, ?, ?, NULL, 'activa')
    `,
    );

    upsertInscripcion.run(alumno1.id, am1.id, currentYear);
    upsertInscripcion.run(alumno1.id, am2.id, currentYear);

    const insertCursada = db.prepare(
      "INSERT INTO cursadas (alumno_id, materia_id, anio, asistencia, estado) VALUES (?, ?, ?, ?, ?)",
    );

    insertCursada.run(alumno1.id, am1.id, 2022, 0.9, "aprobada");
    insertCursada.run(alumno1.id, am1.id, 2021, 0.65, "recursada");
    insertCursada.run(alumno1.id, am2.id, 2023, 0.8, "aprobada");

    const insertExamen = db.prepare(
      `
      INSERT INTO examenes (
        alumno_id,
        materia_id,
        anio,
        tipo,
        instancia,
        rendido,
        nota,
        ausente,
        veces_recursada,
        fecha_examen,
        asistencia
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    );

    insertExamen.run(
      alumno1.id,
      am1.id,
      2022,
      "Parcial",
      1,
      1,
      8.6,
      0,
      0,
      "14-06-2022",
      0.85,
    );
    insertExamen.run(
      alumno1.id,
      am1.id,
      2022,
      "Parcial",
      2,
      1,
      7.89,
      0,
      0,
      "04-11-2022",
      0.87,
    );
    insertExamen.run(
      alumno1.id,
      am1.id,
      2022,
      "Final",
      1,
      1,
      6.59,
      0,
      0,
      "12-12-2022",
      0.9,
    );

    insertExamen.run(
      alumno1.id,
      am2.id,
      2023,
      "Parcial",
      1,
      1,
      5.5,
      0,
      1,
      "15-06-2023",
      0.78,
    );
    insertExamen.run(
      alumno1.id,
      am2.id,
      2023,
      "Parcial",
      2,
      1,
      6.2,
      0,
      1,
      "10-11-2023",
      0.8,
    );
    insertExamen.run(
      alumno1.id,
      am2.id,
      2023,
      "Final",
      1,
      1,
      5.8,
      0,
      1,
      "14-12-2023",
      0.8,
    );
  });

  seedTransaccional();
}

function seedDemoAlumnosCDU010() {
  // ─────────────────────────────────────────────────────────────
  // SEED DEMO V2 — 12 alumnos AM1 2026
  // ─────────────────────────────────────────────────────────────
  try {
    const usernamesAEliminar = [
      "pedro.quintero",
      "alu0476",
      "alu0303",
      "alu0097",
      "alu0030",
      "alu0047",
      "alu0276",
      "alu0014",
      "alu0074",
      "alu0135",
      "alu0391",
    ];

    for (const username of usernamesAEliminar) {
      const user = db
        .prepare("SELECT id FROM users WHERE username = ?")
        .get(username);

      if (!user) {
        continue;
      }

      db.prepare("DELETE FROM examenes WHERE alumno_id = ?").run(user.id);
      db.prepare("DELETE FROM cursadas WHERE alumno_id = ?").run(user.id);
      db.prepare("DELETE FROM inscripciones WHERE alumno_id = ?").run(user.id);
      db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
    }

    const insertUser = db.prepare(`
      INSERT OR IGNORE INTO users
        (username, password, role, nombre_completo, email,
         oauth_provider, google_id,
         genero, fecha_nac, ayuda_financiera, colegio_tecnico, promedio_colegio, anio_ingreso)
      VALUES (?, NULL, 'alumno', ?, ?, 'google', ?, ?, ?, ?, ?, ?, ?)
    `);

    const nuevosAlumnos = [
      [
        "mateo.fernandez",
        "Mateo Fernández",
        "mateo.fernandez@usal.edu.ar",
        "demo_mateo.fernandez",
        "Masculino",
        "05-11-2007",
        0,
        1,
        8.1,
        2026,
      ],
      [
        "sofia.rodriguez",
        "Sofía Rodríguez",
        "sofia.rodriguez@usal.edu.ar",
        "demo_sofia.rodriguez",
        "Femenino",
        "18-04-2006",
        0,
        0,
        6.9,
        2026,
      ],
      [
        "joaquin.perez",
        "Joaquín Pérez",
        "joaquin.perez@usal.edu.ar",
        "demo_joaquin.perez",
        "Masculino",
        "12-01-2006",
        0,
        0,
        7.3,
        2025,
      ],
      [
        "camila.torres",
        "Camila Torres",
        "camila.torres@usal.edu.ar",
        "demo_camila.torres",
        "Femenino",
        "03-06-2005",
        0,
        0,
        6.8,
        2025,
      ],
      [
        "sebastian.diaz",
        "Sebastián Díaz",
        "sebastian.diaz@usal.edu.ar",
        "demo_sebastian.diaz",
        "Masculino",
        "28-09-2005",
        0,
        0,
        7.5,
        2025,
      ],
      [
        "agustina.romero",
        "Agustina Romero",
        "agustina.romero@usal.edu.ar",
        "demo_agustina.romero",
        "Femenino",
        "14-02-2004",
        1,
        0,
        7,
        2025,
      ],
      [
        "ignacio.sanchez",
        "Ignacio Sánchez",
        "ignacio.sanchez@usal.edu.ar",
        "demo_ignacio.sanchez",
        "Masculino",
        "07-05-2004",
        0,
        0,
        6.2,
        2024,
      ],
      [
        "martina.villareal",
        "Martina Villareal",
        "martina.villareal@usal.edu.ar",
        "demo_martina.villareal",
        "Femenino",
        "19-10-2004",
        0,
        0,
        6.7,
        2024,
      ],
      [
        "tomas.acosta",
        "Tomás Acosta",
        "tomas.acosta@usal.edu.ar",
        "demo_tomas.acosta",
        "Masculino",
        "25-03-2003",
        0,
        0,
        6.4,
        2024,
      ],
      [
        "pedro.quintero",
        "Pedro Quintero",
        "pedro.quintero@usal.edu.ar",
        "demo_pedro.quintero",
        "Masculino",
        "12-07-2005",
        0,
        0,
        4.5,
        2024,
      ],
    ];

    for (const alumno of nuevosAlumnos) {
      insertUser.run(...alumno);
    }

    const nuevosUsernames = nuevosAlumnos.map((alumno) => alumno[0]);
    const usernamePlaceholders = nuevosUsernames.map(() => "?").join(",");
    const nuevosUserIds = db
      .prepare(
        `SELECT id FROM users WHERE username IN (${usernamePlaceholders})`,
      )
      .all(...nuevosUsernames)
      .map((row) => row.id);

    if (nuevosUserIds.length > 0) {
      const idPlaceholders = nuevosUserIds.map(() => "?").join(",");
      db.prepare(
        `DELETE FROM examenes WHERE alumno_id IN (${idPlaceholders})`,
      ).run(...nuevosUserIds);
      db.prepare(
        `DELETE FROM cursadas WHERE alumno_id IN (${idPlaceholders})`,
      ).run(...nuevosUserIds);
      db.prepare(
        `DELETE FROM inscripciones WHERE alumno_id IN (${idPlaceholders})`,
      ).run(...nuevosUserIds);
    }

    function getId(username) {
      return db.prepare("SELECT id FROM users WHERE username = ?").get(username)
        ?.id;
    }
    function getMateriaId(codigo) {
      return db.prepare("SELECT id FROM materias WHERE codigo = ?").get(codigo)
        ?.id;
    }

    const insertCursada = db.prepare(`
      INSERT OR IGNORE INTO cursadas (alumno_id, materia_id, anio, asistencia, estado)
      VALUES (?, ?, ?, ?, ?)
    `);
    function seedC(username, data) {
      const alumnoId = getId(username);
      if (!alumnoId) {
        return;
      }
      for (const cursada of data) {
        insertCursada.run(
          alumnoId,
          getMateriaId(cursada.m),
          cursada.anio,
          cursada.asist,
          cursada.estado,
        );
      }
    }

    const insertExamen = db.prepare(`
      INSERT OR IGNORE INTO examenes
        (alumno_id, materia_id, anio, tipo, instancia,
         rendido, nota, ausente, veces_recursada, asistencia, fecha_examen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    function seedE(username, data) {
      const alumnoId = getId(username);
      if (!alumnoId) {
        return;
      }
      for (const examen of data) {
        insertExamen.run(
          alumnoId,
          getMateriaId(examen.m),
          examen.anio,
          examen.tipo,
          examen.inst,
          examen.rend,
          examen.nota ?? null,
          examen.aus ?? 0,
          examen.vrec ?? 0,
          examen.asist,
          examen.fecha,
        );
      }
    }

    seedC("lucas.martinez", [
      { m: "AM1", anio: 2026, asist: 0.88, estado: "cursando" },
    ]);

    seedC("valentina.gomez", [
      { m: "AM1", anio: 2026, asist: 0.72, estado: "cursando" },
    ]);

    seedC("mateo.fernandez", [
      { m: "AM1", anio: 2026, asist: 0.91, estado: "cursando" },
    ]);
    seedE("mateo.fernandez", [
      {
        m: "AM1",
        anio: 2026,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 7.8,
        asist: 0.88,
        vrec: 0,
        fecha: "15-06-2026",
      },
    ]);

    seedC("sofia.rodriguez", [
      { m: "AM1", anio: 2026, asist: 0.84, estado: "cursando" },
    ]);
    seedE("sofia.rodriguez", [
      {
        m: "AM1",
        anio: 2026,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 2.4,
        asist: 0.81,
        vrec: 0,
        fecha: "15-06-2026",
      },
      {
        m: "AM1",
        anio: 2026,
        tipo: "Recuperatorio",
        inst: 1,
        rend: 1,
        nota: 5.2,
        asist: 0.78,
        vrec: 0,
        fecha: "23-06-2026",
      },
    ]);

    seedC("nicolas.lopez", [
      { m: "AM1", anio: 2026, asist: 0.79, estado: "cursando" },
    ]);
    seedE("nicolas.lopez", [
      {
        m: "AM1",
        anio: 2026,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 1.8,
        asist: 0.75,
        vrec: 0,
        fecha: "15-06-2026",
      },
      {
        m: "AM1",
        anio: 2026,
        tipo: "Recuperatorio",
        inst: 1,
        rend: 1,
        nota: 2.1,
        asist: 0.72,
        vrec: 0,
        fecha: "23-06-2026",
      },
    ]);

    seedC("joaquin.perez", [
      { m: "AM1", anio: 2025, asist: 0.62, estado: "recursada" },
      { m: "AM1", anio: 2026, asist: 0.85, estado: "cursando" },
    ]);
    seedE("joaquin.perez", [
      {
        m: "AM1",
        anio: 2025,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 5.6,
        asist: 0.68,
        vrec: 0,
        fecha: "16-06-2025",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Parcial",
        inst: 2,
        rend: 1,
        nota: 4.8,
        asist: 0.65,
        vrec: 0,
        fecha: "07-11-2025",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Final",
        inst: 1,
        rend: 0,
        aus: 1,
        asist: 0.62,
        vrec: 0,
        fecha: "12-12-2025",
      },
    ]);

    seedC("camila.torres", [
      { m: "AM1", anio: 2025, asist: 0.88, estado: "recursada" },
      { m: "AM1", anio: 2026, asist: 0.9, estado: "cursando" },
    ]);
    seedE("camila.torres", [
      {
        m: "AM1",
        anio: 2025,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 2.7,
        asist: 0.85,
        vrec: 0,
        fecha: "13-06-2025",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Recuperatorio",
        inst: 1,
        rend: 1,
        nota: 3.1,
        asist: 0.82,
        vrec: 0,
        fecha: "24-06-2025",
      },
      {
        m: "AM1",
        anio: 2026,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 5.4,
        asist: 0.87,
        vrec: 1,
        fecha: "15-06-2026",
      },
    ]);

    seedC("sebastian.diaz", [
      { m: "AM1", anio: 2025, asist: 0.93, estado: "recursada" },
      { m: "AM1", anio: 2026, asist: 0.95, estado: "cursando" },
    ]);
    seedE("sebastian.diaz", [
      {
        m: "AM1",
        anio: 2025,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 5.2,
        asist: 0.9,
        vrec: 0,
        fecha: "13-06-2025",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Parcial",
        inst: 2,
        rend: 1,
        nota: 6.1,
        asist: 0.96,
        vrec: 0,
        fecha: "07-11-2025",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Final",
        inst: 1,
        rend: 1,
        nota: 3.4,
        asist: 0.93,
        vrec: 0,
        fecha: "12-12-2025",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Final",
        inst: 2,
        rend: 1,
        nota: 2.8,
        asist: 0.93,
        vrec: 0,
        fecha: "06-02-2026",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Final",
        inst: 3,
        rend: 1,
        nota: 1.9,
        asist: 0.93,
        vrec: 0,
        fecha: "10-07-2026",
      },
      {
        m: "AM1",
        anio: 2026,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 7.1,
        asist: 0.93,
        vrec: 1,
        fecha: "15-06-2026",
      },
    ]);

    seedC("agustina.romero", [
      { m: "AM1", anio: 2025, asist: 0.87, estado: "recursada" },
      { m: "AM1", anio: 2026, asist: 0.83, estado: "cursando" },
    ]);
    seedE("agustina.romero", [
      {
        m: "AM1",
        anio: 2025,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 4.3,
        asist: 0.82,
        vrec: 0,
        fecha: "13-06-2025",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Parcial",
        inst: 2,
        rend: 1,
        nota: 2.5,
        asist: 0.9,
        vrec: 0,
        fecha: "07-11-2025",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Recuperatorio",
        inst: 2,
        rend: 1,
        nota: 3.2,
        asist: 0.87,
        vrec: 0,
        fecha: "21-11-2025",
      },
    ]);

    seedC("ignacio.sanchez", [
      { m: "AM1", anio: 2024, asist: 0.78, estado: "recursada" },
      { m: "AM1", anio: 2025, asist: 0.82, estado: "recursada" },
      { m: "AM1", anio: 2026, asist: 0.76, estado: "cursando" },
    ]);
    seedE("ignacio.sanchez", [
      {
        m: "AM1",
        anio: 2024,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 1.9,
        asist: 0.75,
        vrec: 0,
        fecha: "14-06-2024",
      },
      {
        m: "AM1",
        anio: 2024,
        tipo: "Recuperatorio",
        inst: 1,
        rend: 1,
        nota: 3.2,
        asist: 0.73,
        vrec: 0,
        fecha: "25-06-2024",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 4.1,
        asist: 0.79,
        vrec: 1,
        fecha: "13-06-2025",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Parcial",
        inst: 2,
        rend: 1,
        nota: 2.2,
        asist: 0.85,
        vrec: 1,
        fecha: "07-11-2025",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Recuperatorio",
        inst: 2,
        rend: 1,
        nota: 3.7,
        asist: 0.82,
        vrec: 1,
        fecha: "21-11-2025",
      },
      {
        m: "AM1",
        anio: 2026,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 1.5,
        asist: 0.73,
        vrec: 2,
        fecha: "15-06-2026",
      },
      {
        m: "AM1",
        anio: 2026,
        tipo: "Recuperatorio",
        inst: 1,
        rend: 1,
        nota: 2.3,
        asist: 0.71,
        vrec: 2,
        fecha: "23-06-2026",
      },
    ]);

    seedC("martina.villareal", [
      { m: "AM1", anio: 2024, asist: 0.58, estado: "recursada" },
      { m: "AM1", anio: 2025, asist: 0.81, estado: "recursada" },
      { m: "AM1", anio: 2026, asist: 0.88, estado: "cursando" },
    ]);
    seedE("martina.villareal", [
      {
        m: "AM1",
        anio: 2024,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 3.8,
        asist: 0.55,
        vrec: 0,
        fecha: "14-06-2024",
      },
      {
        m: "AM1",
        anio: 2024,
        tipo: "Recuperatorio",
        inst: 1,
        rend: 1,
        nota: 4.2,
        asist: 0.53,
        vrec: 0,
        fecha: "25-06-2024",
      },
      {
        m: "AM1",
        anio: 2024,
        tipo: "Parcial",
        inst: 2,
        rend: 1,
        nota: 4.5,
        asist: 0.61,
        vrec: 0,
        fecha: "08-11-2024",
      },
      {
        m: "AM1",
        anio: 2024,
        tipo: "Final",
        inst: 1,
        rend: 0,
        aus: 1,
        asist: 0.58,
        vrec: 0,
        fecha: "13-12-2024",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 5.1,
        asist: 0.78,
        vrec: 1,
        fecha: "13-06-2025",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Parcial",
        inst: 2,
        rend: 1,
        nota: 3.4,
        asist: 0.82,
        vrec: 1,
        fecha: "07-11-2025",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Recuperatorio",
        inst: 2,
        rend: 1,
        nota: 3.8,
        asist: 0.81,
        vrec: 1,
        fecha: "21-11-2025",
      },
      {
        m: "AM1",
        anio: 2026,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 4.3,
        asist: 0.85,
        vrec: 2,
        fecha: "15-06-2026",
      },
    ]);

    seedC("tomas.acosta", [
      { m: "AM1", anio: 2024, asist: 0.86, estado: "recursada" },
      { m: "AM1", anio: 2025, asist: 0.91, estado: "recursada" },
      { m: "AM1", anio: 2026, asist: 0.82, estado: "cursando" },
    ]);
    seedE("tomas.acosta", [
      {
        m: "AM1",
        anio: 2024,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 5.7,
        asist: 0.83,
        vrec: 0,
        fecha: "14-06-2024",
      },
      {
        m: "AM1",
        anio: 2024,
        tipo: "Parcial",
        inst: 2,
        rend: 1,
        nota: 4.9,
        asist: 0.88,
        vrec: 0,
        fecha: "08-11-2024",
      },
      {
        m: "AM1",
        anio: 2024,
        tipo: "Final",
        inst: 1,
        rend: 1,
        nota: 2.9,
        asist: 0.86,
        vrec: 0,
        fecha: "13-12-2024",
      },
      {
        m: "AM1",
        anio: 2024,
        tipo: "Final",
        inst: 2,
        rend: 1,
        nota: 3.1,
        asist: 0.86,
        vrec: 0,
        fecha: "07-02-2025",
      },
      {
        m: "AM1",
        anio: 2024,
        tipo: "Final",
        inst: 3,
        rend: 1,
        nota: 2.5,
        asist: 0.86,
        vrec: 0,
        fecha: "11-07-2025",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 6.2,
        asist: 0.89,
        vrec: 1,
        fecha: "13-06-2025",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Parcial",
        inst: 2,
        rend: 1,
        nota: 5.8,
        asist: 0.93,
        vrec: 1,
        fecha: "07-11-2025",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Final",
        inst: 1,
        rend: 1,
        nota: 3.5,
        asist: 0.91,
        vrec: 1,
        fecha: "12-12-2025",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Final",
        inst: 2,
        rend: 1,
        nota: 3.2,
        asist: 0.91,
        vrec: 1,
        fecha: "06-02-2026",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Final",
        inst: 3,
        rend: 1,
        nota: 2.8,
        asist: 0.91,
        vrec: 1,
        fecha: "10-07-2026",
      },
    ]);

    // Pedro Quintero — perfil bajo_rendimiento: notas 1-3, asistencia baja, tres recursadas en AM1
    seedC("pedro.quintero", [
      { m: "AM1", anio: 2024, asist: 0.58, estado: "recursada" },
      { m: "AM1", anio: 2025, asist: 0.62, estado: "recursada" },
      { m: "AM1", anio: 2026, asist: 0.55, estado: "cursando" },
      { m: "144", anio: 2024, asist: 0.61, estado: "recursada" },
    ]);
    seedE("pedro.quintero", [
      { m: "AM1",  anio: 2024, tipo: "Parcial",       inst: 1, rend: 1, nota: 2.1, asist: 0.55, vrec: 0, fecha: "15-06-2024" },
      { m: "AM1",  anio: 2024, tipo: "Recuperatorio", inst: 1, rend: 1, nota: 1.8, asist: 0.52, vrec: 0, fecha: "25-06-2024" },
      { m: "AM1",  anio: 2025, tipo: "Parcial",       inst: 1, rend: 1, nota: 2.5, asist: 0.60, vrec: 1, fecha: "14-06-2025" },
      { m: "AM1",  anio: 2025, tipo: "Recuperatorio", inst: 1, rend: 1, nota: 1.9, asist: 0.58, vrec: 1, fecha: "24-06-2025" },
      { m: "AM1",  anio: 2026, tipo: "Parcial",       inst: 1, rend: 1, nota: 2.3, asist: 0.53, vrec: 2, fecha: "15-06-2026" },
      { m: "144",  anio: 2024, tipo: "Parcial",       inst: 1, rend: 1, nota: 1.5, asist: 0.58, vrec: 0, fecha: "17-06-2024" },
      { m: "144",  anio: 2024, tipo: "Recuperatorio", inst: 1, rend: 1, nota: 2.2, asist: 0.55, vrec: 0, fecha: "27-06-2024" },
    ]);

    const insertInscripcion = db.prepare(`
      INSERT OR IGNORE INTO inscripciones (alumno_id, materia_id, anio, estado)
      VALUES (?, ?, ?, 'activa')
    `);
    const todos2026 = [
      "lucas.martinez",
      "valentina.gomez",
      "mateo.fernandez",
      "sofia.rodriguez",
      "nicolas.lopez",
      "joaquin.perez",
      "camila.torres",
      "sebastian.diaz",
      "agustina.romero",
      "ignacio.sanchez",
      "martina.villareal",
      "tomas.acosta",
      "pedro.quintero",
    ];

    for (const username of todos2026) {
      const alumnoId = getId(username);
      if (alumnoId) {
        insertInscripcion.run(alumnoId, getMateriaId("AM1"), 2026);
      }
    }

    console.log("✅ Seed demo v2: 12 alumnos AM1 2026 insertados.");
  } catch (error) {
    console.error("❌ Error en seed demo v2 CDU011:", error.message);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// SEED CDU014 — 13 alumnos AM2 2026 + actualización panel + dashboard
// ═════════════════════════════════════════════════════════════════════════════
function seedDemoAlumnosAM2CDU014() {
  try {
    const insertUser = db.prepare(`
      INSERT OR IGNORE INTO users
        (username, password, role, nombre_completo, email,
         oauth_provider, google_id,
         genero, fecha_nac, ayuda_financiera, colegio_tecnico, promedio_colegio, anio_ingreso)
      VALUES (?, NULL, 'alumno', ?, ?, 'google', ?, ?, ?, ?, ?, ?, ?)
    `);

    // ──────────────────────────────────────────────────────────────────────
    // 13 alumnos AM2 2026 — Perfiles variados
    // ──────────────────────────────────────────────────────────────────────
    const alumnosAM2 = [
      // PERFIL A: 1ra vez AM2, sin exámenes (recién empezaron)
      [
        "ana.benitez",
        "Ana Benítez",
        "ana.benitez@usal.edu.ar",
        "demo_ana.benitez",
        "Femenino",
        "08-02-2006",
        0,
        0,
        7.6,
        2025,
      ],
      [
        "rodrigo.molina",
        "Rodrigo Molina",
        "rodrigo.molina@usal.edu.ar",
        "demo_rodrigo.molina",
        "Masculino",
        "21-09-2005",
        0,
        1,
        8.2,
        2025,
      ],
      [
        "luciana.herrera",
        "Luciana Herrera",
        "luciana.herrera@usal.edu.ar",
        "demo_luciana.herrera",
        "Femenino",
        "14-05-2006",
        0,
        0,
        7.1,
        2025,
      ],

      // PERFIL B: 1ra vez AM2, Parcial 1 ya rendido (junio 2026)
      [
        "diego.castro",
        "Diego Castro",
        "diego.castro@usal.edu.ar",
        "demo_diego.castro",
        "Masculino",
        "03-11-2005",
        0,
        0,
        7.4,
        2025,
      ],
      [
        "florencia.ramos",
        "Florencia Ramos",
        "florencia.ramos@usal.edu.ar",
        "demo_florencia.ramos",
        "Femenino",
        "17-07-2005",
        0,
        0,
        6.8,
        2025,
      ],
      [
        "ezequiel.vargas",
        "Ezequiel Vargas",
        "ezequiel.vargas@usal.edu.ar",
        "demo_ezequiel.vargas",
        "Masculino",
        "29-03-2005",
        0,
        0,
        7.9,
        2025,
      ],
      [
        "camila.mendez",
        "Camila Méndez",
        "camila.mendez@usal.edu.ar",
        "demo_camila.mendez",
        "Femenino",
        "12-12-2004",
        1,
        0,
        6.5,
        2025,
      ],

      // PERFIL C: 2da vez AM2 (recursaron 2025)
      [
        "martin.ibarra",
        "Martín Ibarra",
        "martin.ibarra@usal.edu.ar",
        "demo_martin.ibarra",
        "Masculino",
        "05-06-2004",
        0,
        0,
        6.9,
        2024,
      ],
      [
        "natalia.quispe",
        "Natalia Quispe",
        "natalia.quispe@usal.edu.ar",
        "demo_natalia.quispe",
        "Femenino",
        "22-08-2004",
        0,
        0,
        7.2,
        2024,
      ],
      [
        "pablo.luna",
        "Pablo Luna",
        "pablo.luna@usal.edu.ar",
        "demo_pablo.luna",
        "Masculino",
        "14-11-2003",
        0,
        0,
        6.5,
        2023,
      ],

      // PERFIL D: Final AM1 pendiente (cursan AM2 pero no aprobaron final AM1)
      [
        "valeria.mora",
        "Valeria Mora",
        "valeria.mora@usal.edu.ar",
        "demo_valeria.mora",
        "Femenino",
        "01-03-2005",
        0,
        0,
        7.3,
        2024,
      ],
      [
        "gabriel.silva",
        "Gabriel Silva",
        "gabriel.silva@usal.edu.ar",
        "demo_gabriel.silva",
        "Masculino",
        "16-07-2005",
        0,
        0,
        7.55,
        2025,
      ],
      [
        "antonella.reyes",
        "Antonella Reyes",
        "antonella.reyes@usal.edu.ar",
        "demo_antonella.reyes",
        "Femenino",
        "28-06-2005",
        0,
        0,
        7.8,
        2025,
      ],
    ];

    for (const alumno of alumnosAM2) {
      insertUser.run(...alumno);
    }

    function getId(username) {
      return db.prepare("SELECT id FROM users WHERE username = ?").get(username)
        ?.id;
    }
    function getMateriaId(codigo) {
      return db.prepare("SELECT id FROM materias WHERE codigo = ?").get(codigo)
        ?.id;
    }

    const insertCursada = db.prepare(`
      INSERT OR IGNORE INTO cursadas (alumno_id, materia_id, anio, asistencia, estado)
      VALUES (?, ?, ?, ?, ?)
    `);
    function seedC(username, data) {
      const alumnoId = getId(username);
      if (!alumnoId) return;
      for (const cursada of data) {
        insertCursada.run(
          alumnoId,
          getMateriaId(cursada.m),
          cursada.anio,
          cursada.asist,
          cursada.estado,
        );
      }
    }

    const insertExamen = db.prepare(`
      INSERT OR IGNORE INTO examenes
        (alumno_id, materia_id, anio, tipo, instancia,
         rendido, nota, ausente, veces_recursada, asistencia, fecha_examen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    function seedE(username, data) {
      const alumnoId = getId(username);
      if (!alumnoId) return;
      for (const examen of data) {
        insertExamen.run(
          alumnoId,
          getMateriaId(examen.m),
          examen.anio,
          examen.tipo,
          examen.inst,
          examen.rend,
          examen.nota ?? null,
          examen.aus ?? 0,
          examen.vrec ?? 0,
          examen.asist,
          examen.fecha,
        );
      }
    }

    const insertInscripcion = db.prepare(`
      INSERT OR IGNORE INTO inscripciones (alumno_id, materia_id, anio, estado)
      VALUES (?, ?, ?, 'activa')
    `);

    // ══════════════════════════════════════════════════════════════════════
    // PERFIL A — 1ra vez AM2 2026, sin exámenes todavía
    // (aprobaron AM1 el año anterior, empezaron AM2 en marzo 2026)
    // ══════════════════════════════════════════════════════════════════════

    // Ana Benítez — buena estudiante, aprobó AM1 2025 con buen promedio
    seedC("ana.benitez", [
      { m: "AM1", anio: 2025, asist: 0.92, estado: "aprobada" },
      { m: "AM2", anio: 2026, asist: 0.89, estado: "cursando" },
    ]);
    seedE("ana.benitez", [
      {
        m: "AM1",
        anio: 2025,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 7.4,
        asist: 0.91,
        vrec: 0,
        fecha: "16-06-2025",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Parcial",
        inst: 2,
        rend: 1,
        nota: 7.5,
        asist: 0.93,
        vrec: 0,
        fecha: "07-11-2025",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Final",
        inst: 1,
        rend: 1,
        nota: 8.4,
        asist: 0.92,
        vrec: 0,
        fecha: "12-12-2025",
      },
    ]);

    // Rodrigo Molina — perfil técnico (ColegioTecnico=1), alto rendimiento en AM1
    seedC("rodrigo.molina", [
      { m: "AM1", anio: 2025, asist: 0.95, estado: "aprobada" },
      { m: "AM2", anio: 2026, asist: 0.93, estado: "cursando" },
    ]);
    seedE("rodrigo.molina", [
      {
        m: "AM1",
        anio: 2025,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 8.9,
        asist: 0.93,
        vrec: 0,
        fecha: "16-06-2025",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Parcial",
        inst: 2,
        rend: 1,
        nota: 8.5,
        asist: 0.97,
        vrec: 0,
        fecha: "07-11-2025",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Final",
        inst: 1,
        rend: 1,
        nota: 9.1,
        asist: 0.95,
        vrec: 0,
        fecha: "12-12-2025",
      },
    ]);

    // Luciana Herrera — asistencia levemente baja (0.73), en riesgo de no rendir finales AM2
    seedC("luciana.herrera", [
      { m: "AM1", anio: 2025, asist: 0.81, estado: "aprobada" },
      { m: "AM2", anio: 2026, asist: 0.73, estado: "cursando" },
    ]);
    seedE("luciana.herrera", [
      {
        m: "AM1",
        anio: 2025,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 5.4,
        asist: 0.78,
        vrec: 0,
        fecha: "16-06-2025",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Parcial",
        inst: 2,
        rend: 1,
        nota: 6.2,
        asist: 0.84,
        vrec: 0,
        fecha: "07-11-2025",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Final",
        inst: 1,
        rend: 1,
        nota: 5.8,
        asist: 0.81,
        vrec: 0,
        fecha: "12-12-2025",
      },
    ]);

    // ══════════════════════════════════════════════════════════════════════
    // PERFIL B — 1ra vez AM2, Parcial 1 ya rendido (junio 2026)
    // ══════════════════════════════════════════════════════════════════════

    // Diego Castro — aprobó Parcial 1 de AM2 con buena nota
    seedC("diego.castro", [
      { m: "AM1", anio: 2025, asist: 0.87, estado: "aprobada" },
      { m: "AM2", anio: 2026, asist: 0.88, estado: "cursando" },
    ]);
    seedE("diego.castro", [
      {
        m: "AM1",
        anio: 2025,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 6.1,
        asist: 0.84,
        vrec: 0,
        fecha: "16-06-2025",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Parcial",
        inst: 2,
        rend: 1,
        nota: 6.4,
        asist: 0.9,
        vrec: 0,
        fecha: "07-11-2025",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Final",
        inst: 1,
        rend: 1,
        nota: 6.7,
        asist: 0.87,
        vrec: 0,
        fecha: "12-12-2025",
      },
      {
        m: "AM2",
        anio: 2026,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 6.7,
        asist: 0.86,
        vrec: 0,
        fecha: "17-06-2026",
      },
    ]);

    // Florencia Ramos — desaprobó Parcial 1 de AM2, fue al Recuperatorio 1 y aprobó
    seedC("florencia.ramos", [
      { m: "AM1", anio: 2025, asist: 0.83, estado: "aprobada" },
      { m: "AM2", anio: 2026, asist: 0.85, estado: "cursando" },
    ]);
    seedE("florencia.ramos", [
      {
        m: "AM1",
        anio: 2025,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 5.3,
        asist: 0.8,
        vrec: 0,
        fecha: "16-06-2025",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Parcial",
        inst: 2,
        rend: 1,
        nota: 5.8,
        asist: 0.86,
        vrec: 0,
        fecha: "07-11-2025",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Final",
        inst: 1,
        rend: 1,
        nota: 5.4,
        asist: 0.83,
        vrec: 0,
        fecha: "12-12-2025",
      },
      {
        m: "AM2",
        anio: 2026,
        tipo: "Parcial",
        inst: 1,
        rend: 0,
        nota: null,
        asist: 0.82,
        vrec: 0,
        fecha: "17-06-2026",
      },
      {
        m: "AM2",
        anio: 2026,
        tipo: "Recuperatorio",
        inst: 1,
        rend: 1,
        nota: 5.1,
        asist: 0.8,
        vrec: 0,
        fecha: "24-06-2026",
      },
    ]);

    // Ezequiel Vargas — aprobó Parcial 1 de AM2 con nota alta
    seedC("ezequiel.vargas", [
      { m: "AM1", anio: 2025, asist: 0.94, estado: "aprobada" },
      { m: "AM2", anio: 2026, asist: 0.91, estado: "cursando" },
    ]);
    seedE("ezequiel.vargas", [
      {
        m: "AM1",
        anio: 2025,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 8.3,
        asist: 0.92,
        vrec: 0,
        fecha: "16-06-2025",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Parcial",
        inst: 2,
        rend: 1,
        nota: 8.1,
        asist: 0.96,
        vrec: 0,
        fecha: "07-11-2025",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Final",
        inst: 1,
        rend: 1,
        nota: 8.5,
        asist: 0.94,
        vrec: 0,
        fecha: "12-12-2025",
      },
      {
        m: "AM2",
        anio: 2026,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 8.1,
        asist: 0.89,
        vrec: 0,
        fecha: "17-06-2026",
      },
    ]);

    // Camila Méndez — ayuda financiera (1), desaprobó P1 AM2 y Rec1 AM2 → año perdido
    seedC("camila.mendez", [
      { m: "AM1", anio: 2025, asist: 0.8, estado: "aprobada" },
      { m: "AM2", anio: 2026, asist: 0.78, estado: "cursando" },
    ]);
    seedE("camila.mendez", [
      {
        m: "AM1",
        anio: 2025,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 4.5,
        asist: 0.77,
        vrec: 0,
        fecha: "16-06-2025",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Recuperatorio",
        inst: 1,
        rend: 1,
        nota: 5.2,
        asist: 0.79,
        vrec: 0,
        fecha: "24-06-2025",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Parcial",
        inst: 2,
        rend: 1,
        nota: 5.1,
        asist: 0.81,
        vrec: 0,
        fecha: "07-11-2025",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Final",
        inst: 1,
        rend: 1,
        nota: 4.8,
        asist: 0.8,
        vrec: 0,
        fecha: "12-12-2025",
      },
      {
        m: "AM2",
        anio: 2026,
        tipo: "Parcial",
        inst: 1,
        rend: 0,
        nota: null,
        asist: 0.75,
        vrec: 0,
        fecha: "17-06-2026",
      },
      {
        m: "AM2",
        anio: 2026,
        tipo: "Recuperatorio",
        inst: 1,
        rend: 1,
        nota: 2.4,
        asist: 0.73,
        vrec: 0,
        fecha: "24-06-2026",
      },
    ]);

    // ══════════════════════════════════════════════════════════════════════
    // PERFIL C — 2da vez cursando AM2 (recursaron en 2025)
    // ══════════════════════════════════════════════════════════════════════

    // Martín Ibarra — recursó AM2 2025 por baja asistencia (no pudo rendir finales)
    // En 2026: mejoró asistencia, ya tiene P1 rendido
    seedC("martin.ibarra", [
      { m: "AM1", anio: 2024, asist: 0.88, estado: "aprobada" },
      { m: "AM2", anio: 2025, asist: 0.72, estado: "recursada" },
      { m: "AM2", anio: 2026, asist: 0.86, estado: "cursando" },
    ]);
    seedE("martin.ibarra", [
      {
        m: "AM1",
        anio: 2024,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 6.8,
        asist: 0.86,
        vrec: 0,
        fecha: "15-06-2024",
      },
      {
        m: "AM1",
        anio: 2024,
        tipo: "Parcial",
        inst: 2,
        rend: 1,
        nota: 6.5,
        asist: 0.9,
        vrec: 0,
        fecha: "08-11-2024",
      },
      {
        m: "AM1",
        anio: 2024,
        tipo: "Final",
        inst: 1,
        rend: 1,
        nota: 6.9,
        asist: 0.88,
        vrec: 0,
        fecha: "11-12-2024",
      },
      {
        m: "AM2",
        anio: 2025,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 4.2,
        asist: 0.68,
        vrec: 0,
        fecha: "18-06-2025",
      },
      {
        m: "AM2",
        anio: 2025,
        tipo: "Parcial",
        inst: 2,
        rend: 0,
        aus: 1,
        asist: 0.65,
        vrec: 0,
        fecha: "12-11-2025",
      },
      {
        m: "AM2",
        anio: 2026,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 5.8,
        asist: 0.84,
        vrec: 1,
        fecha: "17-06-2026",
      },
    ]);

    // Natalia Quispe — recursó AM2 2025 por desaprobar P2 y Rec2
    // En 2026: sin exámenes todavía
    seedC("natalia.quispe", [
      { m: "AM1", anio: 2024, asist: 0.91, estado: "aprobada" },
      { m: "AM2", anio: 2025, asist: 0.79, estado: "recursada" },
      { m: "AM2", anio: 2026, asist: 0.84, estado: "cursando" },
    ]);
    seedE("natalia.quispe", [
      {
        m: "AM1",
        anio: 2024,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 7.6,
        asist: 0.89,
        vrec: 0,
        fecha: "15-06-2024",
      },
      {
        m: "AM1",
        anio: 2024,
        tipo: "Parcial",
        inst: 2,
        rend: 1,
        nota: 7.4,
        asist: 0.93,
        vrec: 0,
        fecha: "08-11-2024",
      },
      {
        m: "AM1",
        anio: 2024,
        tipo: "Final",
        inst: 1,
        rend: 1,
        nota: 7.8,
        asist: 0.91,
        vrec: 0,
        fecha: "11-12-2024",
      },
      {
        m: "AM2",
        anio: 2025,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 6.1,
        asist: 0.76,
        vrec: 0,
        fecha: "18-06-2025",
      },
      {
        m: "AM2",
        anio: 2025,
        tipo: "Parcial",
        inst: 2,
        rend: 0,
        nota: null,
        asist: 0.73,
        vrec: 0,
        fecha: "12-11-2025",
      },
    ]);

    // Pablo Luna — recursó AM2 2025 por agotar los 3 finales
    // En 2026: aprobó P1 con buena nota (determinado a aprobar)
    seedC("pablo.luna", [
      { m: "AM1", anio: 2023, asist: 0.84, estado: "aprobada" },
      { m: "AM2", anio: 2025, asist: 0.75, estado: "recursada" },
      { m: "AM2", anio: 2026, asist: 0.88, estado: "cursando" },
    ]);
    seedE("pablo.luna", [
      {
        m: "AM1",
        anio: 2023,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 6.5,
        asist: 0.82,
        vrec: 0,
        fecha: "14-06-2023",
      },
      {
        m: "AM1",
        anio: 2023,
        tipo: "Parcial",
        inst: 2,
        rend: 1,
        nota: 6.7,
        asist: 0.86,
        vrec: 0,
        fecha: "07-11-2023",
      },
      {
        m: "AM1",
        anio: 2023,
        tipo: "Final",
        inst: 1,
        rend: 1,
        nota: 6.8,
        asist: 0.84,
        vrec: 0,
        fecha: "13-12-2023",
      },
      {
        m: "AM2",
        anio: 2025,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 5.3,
        asist: 0.71,
        vrec: 0,
        fecha: "18-06-2025",
      },
      {
        m: "AM2",
        anio: 2025,
        tipo: "Parcial",
        inst: 2,
        rend: 1,
        nota: 4.8,
        asist: 0.73,
        vrec: 0,
        fecha: "12-11-2025",
      },
      {
        m: "AM2",
        anio: 2025,
        tipo: "Final",
        inst: 1,
        rend: 0,
        aus: 1,
        asist: 0.75,
        vrec: 0,
        fecha: "17-12-2025",
      },
      {
        m: "AM2",
        anio: 2025,
        tipo: "Final",
        inst: 2,
        rend: 0,
        aus: 1,
        asist: 0.75,
        vrec: 0,
        fecha: "12-02-2026",
      },
      {
        m: "AM2",
        anio: 2025,
        tipo: "Final",
        inst: 3,
        rend: 0,
        aus: 1,
        asist: 0.75,
        vrec: 0,
        fecha: "16-07-2026",
      },
      {
        m: "AM2",
        anio: 2026,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 6.3,
        asist: 0.86,
        vrec: 1,
        fecha: "17-06-2026",
      },
    ]);

    // ══════════════════════════════════════════════════════════════════════
    // PERFIL D — Final AM1 pendiente (cursan AM2 pero no aprobaron final AM1)
    // ══════════════════════════════════════════════════════════════════════

    // Valeria Mora — aprobó parciales AM1, tiene 2 finales AM1 fallidos
    // Está cursando AM2 2026 y rindiendo parciales; los finales de AM2 están bloqueados
    seedC("valeria.mora", [
      { m: "AM1", anio: 2024, asist: 0.85, estado: "aprobada" },
      { m: "AM2", anio: 2026, asist: 0.87, estado: "cursando" },
    ]);
    seedE("valeria.mora", [
      {
        m: "AM1",
        anio: 2024,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 6.3,
        asist: 0.83,
        vrec: 0,
        fecha: "15-06-2024",
      },
      {
        m: "AM1",
        anio: 2024,
        tipo: "Parcial",
        inst: 2,
        rend: 1,
        nota: 6.1,
        asist: 0.87,
        vrec: 0,
        fecha: "08-11-2024",
      },
      {
        m: "AM1",
        anio: 2024,
        tipo: "Final",
        inst: 1,
        rend: 1,
        nota: 3.8,
        asist: 0.85,
        vrec: 0,
        fecha: "11-12-2024",
      },
      {
        m: "AM1",
        anio: 2024,
        tipo: "Final",
        inst: 2,
        rend: 1,
        nota: 3.6,
        asist: 0.85,
        vrec: 0,
        fecha: "06-02-2025",
      },
    ]);

    // Gabriel Silva — aprobó parciales AM1 2025, tiene Final AM1 inst 1 desaprobado
    // Está cursando AM2 2026 sin exámenes todavía; tiene el Final AM1 inst 2 pendiente
    seedC("gabriel.silva", [
      { m: "AM1", anio: 2025, asist: 0.89, estado: "aprobada" },
      { m: "AM2", anio: 2026, asist: 0.82, estado: "cursando" },
    ]);
    seedE("gabriel.silva", [
      {
        m: "AM1",
        anio: 2025,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 7.2,
        asist: 0.87,
        vrec: 0,
        fecha: "16-06-2025",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Parcial",
        inst: 2,
        rend: 1,
        nota: 6.9,
        asist: 0.91,
        vrec: 0,
        fecha: "07-11-2025",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Final",
        inst: 1,
        rend: 1,
        nota: 3.4,
        asist: 0.89,
        vrec: 0,
        fecha: "12-12-2025",
      },
    ]);

    // Antonella Reyes — aprobó parciales AM1 y tiene Final AM1 aprobado → SÍ puede rendir finales AM2
    // Desaprobó P1 de AM2 pero aprobó Recuperatorio 1 de AM2
    seedC("antonella.reyes", [
      { m: "AM1", anio: 2025, asist: 0.91, estado: "aprobada" },
      { m: "AM2", anio: 2026, asist: 0.9, estado: "cursando" },
    ]);
    seedE("antonella.reyes", [
      {
        m: "AM1",
        anio: 2025,
        tipo: "Parcial",
        inst: 1,
        rend: 1,
        nota: 7.6,
        asist: 0.89,
        vrec: 0,
        fecha: "16-06-2025",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Parcial",
        inst: 2,
        rend: 1,
        nota: 7.8,
        asist: 0.93,
        vrec: 0,
        fecha: "07-11-2025",
      },
      {
        m: "AM1",
        anio: 2025,
        tipo: "Final",
        inst: 1,
        rend: 1,
        nota: 7.9,
        asist: 0.91,
        vrec: 0,
        fecha: "12-12-2025",
      },
      {
        m: "AM2",
        anio: 2026,
        tipo: "Parcial",
        inst: 1,
        rend: 0,
        nota: null,
        asist: 0.88,
        vrec: 0,
        fecha: "17-06-2026",
      },
      {
        m: "AM2",
        anio: 2026,
        tipo: "Recuperatorio",
        inst: 1,
        rend: 1,
        nota: 5.3,
        asist: 0.89,
        vrec: 0,
        fecha: "24-06-2026",
      },
    ]);

    // ── Inscripciones activas AM2 2026 ────────────────────────────────────
    const todosAM2 = [
      "ana.benitez",
      "rodrigo.molina",
      "luciana.herrera",
      "diego.castro",
      "florencia.ramos",
      "ezequiel.vargas",
      "camila.mendez",
      "martin.ibarra",
      "natalia.quispe",
      "pablo.luna",
      "valeria.mora",
      "gabriel.silva",
      "antonella.reyes",
    ];

    for (const u of todosAM2) {
      const aid = getId(u);
      if (aid) insertInscripcion.run(aid, getMateriaId("AM2"), 2026);
    }

    console.log("✅ Seed AM2 2026: 13 alumnos insertados correctamente.");
  } catch (error) {
    console.error("❌ Error en seed AM2 CDU014:", error.message);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Helpers para seed de 500 alumnos desde CSVs de entrenamiento
// ═════════════════════════════════════════════════════════════════════════════

function parsearCSV(filepath) {
  const lines = fs.readFileSync(filepath, "utf8").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const vals = line.split(",");
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = vals[i] !== undefined ? vals[i].trim() : "";
    });
    return obj;
  });
}

function normalizarEmail(str) {
  return str
    .toLowerCase()
    .replace(/[áàä]/g, "a").replace(/[éèë]/g, "e")
    .replace(/[íìï]/g, "i").replace(/[óòö]/g, "o")
    .replace(/[úùüű]/g, "u").replace(/ñ/g, "n")
    .replace(/[^a-z0-9]/g, "");
}

const NOMBRES_MASCULINOS = [
  "Mateo", "Santiago", "Lucas", "Nicolás", "Joaquín", "Gabriel", "Diego",
  "Martín", "Pablo", "Facundo", "Agustín", "Rodrigo", "Sebastián", "Ignacio",
  "Federico", "Ramiro", "Hernán", "Leandro", "Ezequiel", "Damián", "Gonzalo",
  "Bruno", "Adrián", "Mauricio", "Claudio", "Marcos", "Carlos", "Eduardo",
  "Fernando", "Alejandro", "Manuel", "Darío", "Iván", "Julio", "Andrés",
  "Gustavo", "Cristian", "Maximiliano", "Emilio", "Javier", "Ariel", "Germán",
  "Lionel", "Rubén", "Sergio", "Raúl", "Néstor", "Víctor", "César", "Hugo",
];

const NOMBRES_FEMENINOS = [
  "Valentina", "Sofía", "Martina", "Camila", "Florencia", "Luciana",
  "Natalia", "Valeria", "Antonella", "Lucía", "Carolina", "Celeste",
  "Vanesa", "Romina", "Noelia", "Gabriela", "Daniela", "Agustina",
  "Micaela", "Paola", "Laura", "Paula", "Claudia", "Débora", "Verónica",
  "Belén", "Pilar", "Lorena", "Soledad", "Viviana",
];

const APELLIDOS_ARG = [
  "García", "Fernández", "González", "Rodríguez", "López", "Martínez",
  "Pérez", "Gómez", "Sánchez", "Romero", "Torres", "Díaz", "Herrera",
  "Ramos", "Molina", "Silva", "Vargas", "Ibáñez", "Medina", "Acosta",
  "Benítez", "Vera", "Rojas", "Cardozo", "Villalba", "Flores", "Farías",
  "Juárez", "Sosa", "Leiva", "Miranda", "Rivero", "Paz", "Blanco",
  "Ponce", "Bravo", "Prieto", "Palacios", "Cruz", "Lara", "Ayala",
  "Giménez", "Correa", "Arias", "Ojeda", "Meza", "Mercado", "Lagos",
  "Orellana", "Peña", "Quiñones", "Tapia", "Segura", "Méndez", "Sandoval",
  "Montenegro", "Galindo", "Valenzuela", "Salas", "Ibarra", "Quijano",
  "Campos", "Palma", "Vega", "Castro", "Luna", "Fuentes", "Figueroa",
  "Domínguez", "Gutiérrez", "Navarro", "Peralta", "Carrillo", "Espinosa",
  "Delgado", "Montes", "Serrano", "Paredes", "Barrios", "Cáceres",
  "Orozco", "Suárez", "Núñez", "Reyes",
];

// ═════════════════════════════════════════════════════════════════════════════
// SEED PRINCIPAL — 500 alumnos desde datos reales de entrenamiento del modelo
// ═════════════════════════════════════════════════════════════════════════════
function seedAlumnos500CSVs() {
  try {
    const yaSeeded = db
      .prepare("SELECT id FROM users WHERE username = 'alu0001' AND role = 'alumno'")
      .get();
    if (yaSeeded) {
      console.log("✅ Seed CSV: alumnos de entrenamiento ya cargados, saltando.");
      return;
    }

    const dataDir = path.join(__dirname, "..", "..", "..", "ai-service", "data");
    if (!fs.existsSync(path.join(dataDir, "nivel_alumno.csv"))) {
      console.warn("⚠️  CSVs de entrenamiento no encontrados, saltando seedAlumnos500CSVs.");
      return;
    }

    console.log("🔄 Seed CSV: cargando 500 alumnos del dataset de entrenamiento...");

    // ── Eliminar alumnos previos ────────────────────────────────────────────
    const alumnosPrevios = db
      .prepare("SELECT id FROM users WHERE role = 'alumno'")
      .all()
      .map((u) => u.id);

    if (alumnosPrevios.length > 0) {
      const ph = alumnosPrevios.map(() => "?").join(",");
      // Respetar FK constraints: eliminar en orden correcto (hijos antes que padres)
      db.prepare(`DELETE FROM mensajes WHERE conversacion_id IN (SELECT id FROM conversaciones WHERE alumno_id IN (${ph}))`).run(...alumnosPrevios);
      db.prepare(`DELETE FROM conversaciones WHERE alumno_id IN (${ph})`).run(...alumnosPrevios);
      db.prepare(`DELETE FROM visualizaciones WHERE alumno_id IN (${ph})`).run(...alumnosPrevios);
      db.prepare(`DELETE FROM contenido WHERE alumno_id IN (${ph})`).run(...alumnosPrevios);
      db.prepare(`DELETE FROM examenes WHERE alumno_id IN (${ph})`).run(...alumnosPrevios);
      db.prepare(`DELETE FROM cursadas WHERE alumno_id IN (${ph})`).run(...alumnosPrevios);
      db.prepare(`DELETE FROM inscripciones WHERE alumno_id IN (${ph})`).run(...alumnosPrevios);
      db.prepare(`DELETE FROM predictions_log WHERE user_id IN (${ph})`).run(...alumnosPrevios);
      db.prepare(`DELETE FROM users WHERE id IN (${ph})`).run(...alumnosPrevios);
      console.log(`  🗑️  ${alumnosPrevios.length} alumnos previos eliminados.`);
    }

    // ── Leer CSVs ──────────────────────────────────────────────────────────
    const alumnosCSV = parsearCSV(path.join(dataDir, "nivel_alumno.csv"));
    const materiasCSV = parsearCSV(path.join(dataDir, "nivel_materia.csv"));
    const examenesCSV = parsearCSV(path.join(dataDir, "nivel_examen.csv"));
    console.log(
      `  📂 CSVs: ${alumnosCSV.length} alumnos, ${materiasCSV.length} cursadas, ${examenesCSV.length} exámenes.`
    );

    // ── Mapa codigo_plan → materia_id ──────────────────────────────────────
    const mapaMaterias = {};
    db.prepare("SELECT id, codigo_plan FROM materias WHERE codigo_plan IS NOT NULL")
      .all()
      .forEach((m) => { mapaMaterias[m.codigo_plan] = m.id; });

    // ── Agrupar registros por alumno ───────────────────────────────────────
    const cursadasPorAlumno = {};
    for (const r of materiasCSV) {
      if (!cursadasPorAlumno[r.IdAlumno]) cursadasPorAlumno[r.IdAlumno] = [];
      cursadasPorAlumno[r.IdAlumno].push(r);
    }
    const examenesPorAlumno = {};
    for (const r of examenesCSV) {
      if (!examenesPorAlumno[r.IdAlumno]) examenesPorAlumno[r.IdAlumno] = [];
      examenesPorAlumno[r.IdAlumno].push(r);
    }

    // ── Correlativas del plan para lógica 2026 ─────────────────────────────
    const correlativasPlan = {};
    for (const [planId, , , , corrs] of PLAN_CURRICULUM) {
      correlativasPlan[planId] = corrs || [];
    }
    const todosIdsPlan = PLAN_CURRICULUM.map(([id]) => id);

    // ── Sentencias preparadas ──────────────────────────────────────────────
    const stmtInsertUser = db.prepare(`
      INSERT OR IGNORE INTO users
        (username, password, role, nombre_completo, email,
         oauth_provider, google_id,
         genero, fecha_nac, ayuda_financiera, colegio_tecnico, promedio_colegio, anio_ingreso)
      VALUES (?, NULL, 'alumno', ?, ?, 'google', ?, ?, ?, ?, ?, ?, ?)
    `);
    const stmtGetUser = db.prepare("SELECT id FROM users WHERE username = ?");
    const stmtInsertCursada = db.prepare(`
      INSERT OR IGNORE INTO cursadas (alumno_id, materia_id, anio, asistencia, estado)
      VALUES (?, ?, ?, ?, ?)
    `);
    const stmtInsertExamen = db.prepare(`
      INSERT OR IGNORE INTO examenes
        (alumno_id, materia_id, anio, tipo, instancia,
         rendido, nota, ausente, veces_recursada, asistencia, fecha_examen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const stmtInsertInscripcion = db.prepare(`
      INSERT OR IGNORE INTO inscripciones (alumno_id, materia_id, anio, estado)
      VALUES (?, ?, 2026, 'activa')
    `);

    const totales = { usuarios: 0, cursadas: 0, examenes: 0, cursando2026: 0 };

    // ── PASO 1: Insertar usuarios (solo alumnos activos, Abandona = 0) ────
    const insertarUsuarios = db.transaction(() => {
      let idx = 0;
      for (const alumno of alumnosCSV) {
        idx++;
        if (String(alumno.Abandona) === "1") continue;
        const username = alumno.IdAlumno.toLowerCase();
        const genero = alumno.Genero;
        const nombrePool = genero === "Masculino" ? NOMBRES_MASCULINOS : NOMBRES_FEMENINOS;
        const nombre = nombrePool[(idx - 1) % nombrePool.length];
        const apellido = APELLIDOS_ARG[(idx - 1) % APELLIDOS_ARG.length];
        const nombreCompleto = `${nombre} ${apellido}`;
        const email = `${normalizarEmail(nombre)}.${normalizarEmail(apellido)}${idx}@usal.edu.ar`;

        stmtInsertUser.run(
          username,
          nombreCompleto,
          email,
          `csv_${username}`,
          genero,
          alumno.FechaNac || null,
          parseInt(alumno.AyudaFinanciera) || 0,
          parseInt(alumno.ColegioTecnico) || 0,
          parseFloat(alumno.PromedioColegio) || 7.0,
          parseInt(alumno.AnioIngreso) || 2020
        );
        totales.usuarios++;
      }
    });
    insertarUsuarios();
    console.log(`  👤 ${totales.usuarios} usuarios creados.`);

    // ── Mapa IdAlumno → userId ─────────────────────────────────────────────
    const mapaUsuarios = {};
    for (const alumno of alumnosCSV) {
      const row = stmtGetUser.get(alumno.IdAlumno.toLowerCase());
      if (row) mapaUsuarios[alumno.IdAlumno] = row.id;
    }

    // ── PASO 2: Insertar cursadas + exámenes históricos + cursando 2026 ────
    const insertarDatos = db.transaction(() => {
      for (const alumno of alumnosCSV) {
        if (String(alumno.Abandona) === "1") continue;
        const userId = mapaUsuarios[alumno.IdAlumno];
        if (!userId) continue;

        const aprobadas = new Set();

        for (const c of cursadasPorAlumno[alumno.IdAlumno] || []) {
          const codigoPlan = parseInt(c.Materia);
          const matId = mapaMaterias[codigoPlan];
          if (!matId) continue;
          const estado = parseInt(c.Recursa) === 1 ? "recursada" : "aprobada";
          stmtInsertCursada.run(
            userId, matId, parseInt(c.AnioCursada),
            parseFloat(c.Asistencia) || 0.8, estado
          );
          totales.cursadas++;
          if (estado === "aprobada") aprobadas.add(codigoPlan);
        }

        for (const e of examenesPorAlumno[alumno.IdAlumno] || []) {
          const codigoPlan = parseInt(e.Materia);
          const matId = mapaMaterias[codigoPlan];
          if (!matId) continue;
          const nota = e.Nota !== "" ? parseFloat(e.Nota) : null;
          stmtInsertExamen.run(
            userId, matId, parseInt(e.Anio),
            e.TipoExamen, parseInt(e.Instancia) || 1,
            parseInt(e.ExamenRendido) || 0,
            nota,
            parseInt(e.AusenteExamen) || 0,
            parseInt(e.VecesRecursada) || 0,
            parseFloat(e.Asistencia) || 0.8,
            e.FechaExamen || null
          );
          totales.examenes++;
        }

        // Cursadas 2026 solo para alumnos activos con materias pendientes
        if (String(alumno.Abandona) === "0") {
          const disponibles = todosIdsPlan.filter((planId) => {
            if (aprobadas.has(planId)) return false;
            return (correlativasPlan[planId] || []).every((c) => aprobadas.has(c));
          });

          if (disponibles.length === 0) continue;

          const aluIdx = parseInt(alumno.IdAlumno.slice(3));
          for (const planId of disponibles.slice(0, 10)) {
            const matId = mapaMaterias[planId];
            if (!matId) continue;

            // Asistencia con distribución normal(0.84, 0.12) determinista por alumno+materia
            const seed = aluIdx * 100 + planId;
            const u1 = Math.abs(Math.sin(seed * 127.1) * 43758.5453) % 1;
            const u2 = Math.abs(Math.sin(seed * 311.7) * 43758.5453) % 1;
            const z = Math.sqrt(-2.0 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
            const asistencia = Math.min(1.0, Math.max(0.30, Math.round((0.84 + z * 0.12) * 100) / 100));

            stmtInsertCursada.run(userId, matId, 2026, asistencia, "cursando");
            stmtInsertInscripcion.run(userId, matId);
            totales.cursando2026++;
          }
        }
      }
    });
    insertarDatos();

    console.log("✅ Seed CSV completado:");
    console.log(`   👤 ${totales.usuarios} alumnos`);
    console.log(`   📚 ${totales.cursadas} cursadas históricas`);
    console.log(`   📝 ${totales.examenes} exámenes históricos`);
    console.log(`   🔄 ${totales.cursando2026} cursadas cursando 2026`);
  } catch (err) {
    console.error("❌ Error en seedAlumnos500CSVs:", err.message);
  }
}

async function seedAlumnosGenerales() {
  try {
    const NOMBRES = [
      "Valentina", "Lucía", "Martina", "Sofía", "Camila", "Agustina", "Florencia", "Julieta",
      "Micaela", "Natalia", "Paula", "Carolina", "Daniela", "Gabriela", "Romina", "Antonella",
      "Constanza", "Emilia", "Pilar", "Victoria",
      "Santiago", "Mateo", "Nicolás", "Facundo", "Tomás", "Ignacio", "Federico", "Gonzalo",
      "Sebastián", "Rodrigo", "Maximiliano", "Ezequiel", "Leandro", "Bruno", "Joaquín",
      "Franco", "Agustín", "Diego", "Marcos", "Hernán",
    ];
    const APELLIDOS = [
      "García", "Rodríguez", "González", "Fernández", "López", "Martínez", "Pérez", "Sánchez",
      "Romero", "Torres", "Díaz", "Flores", "Morales", "Jiménez", "Ruiz", "Vargas", "Castro",
      "Herrera", "Medina", "Silva", "Reyes", "Gómez", "Suárez", "Rojas", "Vega", "Mendoza",
      "Núñez", "Alvarez", "Muñoz", "Cabrera", "Ortega", "Delgado", "Ríos", "Molina", "Sosa",
      "Acosta", "Benítez", "Ponce", "Villalba", "Figueroa",
    ];

    const MATERIAS_POR_ANIO = {
      1: [140, 141, 142, 143, 144, 145, 146, 147, 148],
      2: [149, 150, 151, 152, 153, 154, 155, 156, 157, 158],
      3: [159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169],
      4: [170, 171, 172, 173, 174, 175, 176, 177, 178],
      5: [179, 180, 181, 182, 183, 184, 185, 186, 187],
    };

    const CORRELATIVAS = {};
    for (const [planId, , , , corrs] of PLAN_CURRICULUM) {
      CORRELATIVAS[planId] = corrs || [];
    }

    const MATERIA_IDS = {};
    for (const [planId] of PLAN_CURRICULUM) {
      const row = db.prepare("SELECT id FROM materias WHERE codigo_plan = ?").get(planId);
      MATERIA_IDS[planId] = row ? row.id : null;
    }

    const hashedPassword = await bcrypt.hash("alumno123", 10);

    const stmtInsertUser = db.prepare(`
      INSERT OR IGNORE INTO users
        (username, password, role, nombre_completo, email, oauth_provider,
         genero, fecha_nac, ayuda_financiera, colegio_tecnico, promedio_colegio, anio_ingreso)
      VALUES (?, ?, 'alumno', ?, ?, 'local', ?, ?, ?, ?, ?, ?)
    `);
    const stmtGetUser = db.prepare("SELECT id FROM users WHERE username = ?");
    const stmtInsertInscripcion = db.prepare(`
      INSERT OR IGNORE INTO inscripciones (alumno_id, materia_id, anio, periodo_id, estado)
      VALUES (?, ?, 2026, NULL, 'activa')
    `);
    const stmtInsertCursada = db.prepare(`
      INSERT OR IGNORE INTO cursadas (alumno_id, materia_id, anio, asistencia, estado)
      VALUES (?, ?, ?, ?, ?)
    `);
    const stmtInsertExamen = db.prepare(`
      INSERT OR IGNORE INTO examenes (alumno_id, materia_id, anio, tipo, instancia, rendido, nota)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `);
    const stmtMarkRecursada = db.prepare(
      "UPDATE cursadas SET estado = 'recursada' WHERE alumno_id = ? AND materia_id = ? AND anio = ?"
    );

    function rng(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    function pickRandom(arr) {
      return arr[Math.floor(Math.random() * arr.length)];
    }
    function generateGrade() {
      const r = Math.random();
      if (r < 0.08) return rng(1, 3);
      if (r < 0.15) return 4;
      if (r < 0.65) return rng(5, 7);
      if (r < 0.88) return 8;
      return rng(9, 10);
    }
    function canTake(planId, passedSet) {
      return (CORRELATIVAS[planId] || []).every((c) => passedSet.has(c));
    }
    function shuffle(arr) {
      return [...arr].sort(() => Math.random() - 0.5);
    }

    let totalCreated = 0;

    for (let cohortYear = 1; cohortYear <= 5; cohortYear++) {
      const startIdx = (cohortYear - 1) * 100;
      const anioIngreso = 2026 - (cohortYear - 1);

      const processCohort = db.transaction(() => {
        for (let i = 0; i < 100; i++) {
          const idx = startIdx + i + 1;
          const username = `alumno${String(idx).padStart(3, "0")}`;
          const nombre = pickRandom(NOMBRES);
          const apellido = pickRandom(APELLIDOS);
          const nombre_completo = `${apellido}, ${nombre}`;
          const email = `${username}@usal.edu.ar`;
          const genero = Math.random() < 0.45 ? "Femenino" : "Masculino";
          const birthYear = 2008 - cohortYear - rng(0, 2);
          const birthMonth = String(rng(1, 12)).padStart(2, "0");
          const birthDay = String(rng(1, 28)).padStart(2, "0");
          const fecha_nac = `${birthDay}-${birthMonth}-${birthYear}`;
          const ayuda_financiera = Math.random() < 0.2 ? 1 : 0;
          const colegio_tecnico = Math.random() < 0.3 ? 1 : 0;
          const promedio_colegio = rng(60, 100) / 10;

          stmtInsertUser.run(
            username, hashedPassword, nombre_completo, email,
            genero, fecha_nac, ayuda_financiera, colegio_tecnico, promedio_colegio, anioIngreso
          );

          const userRow = stmtGetUser.get(username);
          if (!userRow) continue;
          const alumnoId = userRow.id;

          const passedSubjects = new Set();

          for (let prevYear = 1; prevYear < cohortYear; prevYear++) {
            const dbYear = 2026 - (cohortYear - prevYear);
            for (const planId of MATERIAS_POR_ANIO[prevYear]) {
              const matId = MATERIA_IDS[planId];
              if (!matId) continue;
              if (prevYear === cohortYear - 1 && Math.random() < 0.10) {
                stmtInsertCursada.run(alumnoId, matId, dbYear - 1, rng(30, 55) / 100, "recursada");
              }
              stmtInsertCursada.run(alumnoId, matId, dbYear, rng(60, 95) / 100, "aprobada");
              passedSubjects.add(planId);
            }
          }

          const yearSubjects = MATERIAS_POR_ANIO[cohortYear];
          const available =
            cohortYear === 1
              ? yearSubjects.filter((p) => MATERIA_IDS[p])
              : yearSubjects.filter((p) => canTake(p, passedSubjects) && MATERIA_IDS[p]);

          if (available.length < 1) continue;

          const count = rng(4, Math.min(7, available.length));
          const chosen = shuffle(available).slice(0, count);

          if (cohortYear > 1 && Math.random() < 0.15) {
            const prevYearSubjects = MATERIAS_POR_ANIO[cohortYear - 1];
            const safeRecursados = prevYearSubjects.filter((p) => {
              if (!MATERIA_IDS[p]) return false;
              return !chosen.some((cp) => (CORRELATIVAS[cp] || []).includes(p));
            });
            if (safeRecursados.length > 0) {
              const rPlanId = pickRandom(safeRecursados);
              const rMatId = MATERIA_IDS[rPlanId];
              stmtMarkRecursada.run(alumnoId, rMatId, 2025);
              if (!chosen.includes(rPlanId)) chosen.push(rPlanId);
            }
          }

          const isAbandoned = Math.random() < 0.08;

          for (const planId of chosen) {
            const matId = MATERIA_IDS[planId];
            if (!matId) continue;

            stmtInsertInscripcion.run(alumnoId, matId);
            if (isAbandoned) continue;

            stmtInsertCursada.run(alumnoId, matId, 2026, rng(55, 100) / 100, "cursando");
            const nota = generateGrade();
            stmtInsertExamen.run(alumnoId, matId, 2026, "Parcial", 1, nota);

            if (nota < 4) {
              const notaRecu = generateGrade();
              stmtInsertExamen.run(alumnoId, matId, 2026, "Recuperatorio", 1, notaRecu);
            }
          }

          totalCreated++;
        }
      });

      processCohort();
    }

    console.log(`✅ Seed alumnos generales: ${totalCreated} alumnos insertados (100 por año).`);
  } catch (error) {
    console.error("❌ Error en seed alumnos generales:", error.message);
  }
}

function fixCursadasSinExamenes() {
  try {
    const cursadasSinExamenes = db
      .prepare(
        `
        SELECT c.alumno_id, c.materia_id, c.anio, c.estado
        FROM cursadas c
        WHERE c.estado IN ('aprobada', 'recursada')
          AND NOT EXISTS (
            SELECT 1 FROM examenes e
            WHERE e.alumno_id = c.alumno_id
              AND e.materia_id = c.materia_id
              AND e.anio = c.anio
          )
      `,
      )
      .all();

    if (cursadasSinExamenes.length === 0) {
      console.log("✅ Todas las cursadas ya tienen exámenes. Nada que reparar.");
      return;
    }

    const stmtInsert = db.prepare(
      `INSERT OR IGNORE INTO examenes
         (alumno_id, materia_id, anio, tipo, instancia, rendido, nota)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
    );

    function rndFloat(min, max) {
      return Math.round((Math.random() * (max - min) + min) * 10) / 10;
    }

    function gradeParcial() {
      const r = Math.random();
      if (r < 0.08) return rndFloat(1, 3.9);
      if (r < 0.18) return rndFloat(4, 5);
      if (r < 0.65) return rndFloat(5, 7.5);
      if (r < 0.88) return rndFloat(7.5, 9);
      return rndFloat(9, 10);
    }

    function gradeFinalNormal() {
      const r = Math.random();
      if (r < 0.18) return rndFloat(1, 3.9);
      if (r < 0.32) return rndFloat(4, 5);
      if (r < 0.72) return rndFloat(5, 7.5);
      if (r < 0.90) return rndFloat(7.5, 9);
      return rndFloat(9, 10);
    }

    function gradeFinalMustPass() {
      const r = Math.random();
      if (r < 0.12) return rndFloat(4, 4.9);
      if (r < 0.55) return rndFloat(5, 7);
      if (r < 0.85) return rndFloat(7, 9);
      return rndFloat(9, 10);
    }

    function gradeRecuAprobada() {
      // Recuperatorio cuando la cursada fue aprobada: debe tener chances de pasar
      const r = Math.random();
      if (r < 0.12) return rndFloat(1, 3.9);
      if (r < 0.30) return rndFloat(4, 5);
      if (r < 0.70) return rndFloat(5, 7.5);
      if (r < 0.90) return rndFloat(7.5, 9);
      return rndFloat(9, 10);
    }

    const processFix = db.transaction(() => {
      let count = 0;
      for (const { alumno_id, materia_id, anio, estado } of cursadasSinExamenes) {
        // ── Parcial 1 ────────────────────────────────────────────────────
        const p1 = gradeParcial();
        stmtInsert.run(alumno_id, materia_id, anio, "Parcial", 1, p1);
        if (p1 < 4) {
          const r1 =
            estado === "aprobada" ? gradeRecuAprobada() : gradeParcial();
          stmtInsert.run(alumno_id, materia_id, anio, "Recuperatorio", 1, r1);
        }

        // ── Parcial 2 (presente en ~55 % de las materias) ───────────────
        if (Math.random() < 0.55) {
          const p2 = gradeParcial();
          stmtInsert.run(alumno_id, materia_id, anio, "Parcial", 2, p2);
          if (p2 < 4) {
            const r2 =
              estado === "aprobada" ? gradeRecuAprobada() : gradeParcial();
            stmtInsert.run(
              alumno_id,
              materia_id,
              anio,
              "Recuperatorio",
              2,
              r2,
            );
          }
        }

        // ── Finales ──────────────────────────────────────────────────────
        if (estado === "aprobada") {
          const f1 = gradeFinalNormal();
          stmtInsert.run(alumno_id, materia_id, anio, "Final", 1, f1);
          if (f1 < 4) {
            const f2 = gradeFinalNormal();
            stmtInsert.run(alumno_id, materia_id, anio, "Final", 2, f2);
            if (f2 < 4) {
              // Tercera instancia: el alumno aprobó, así que debe pasar
              const f3 = gradeFinalMustPass();
              stmtInsert.run(alumno_id, materia_id, anio, "Final", 3, f3);
            }
          }
        } else {
          // recursada: 0-2 finales, todos desaprobados
          if (Math.random() < 0.60) {
            const f1 = rndFloat(1, 3.9);
            stmtInsert.run(alumno_id, materia_id, anio, "Final", 1, f1);
            if (Math.random() < 0.35) {
              const f2 = rndFloat(1, 3.9);
              stmtInsert.run(alumno_id, materia_id, anio, "Final", 2, f2);
            }
          }
        }

        count++;
      }
      return count;
    });

    const fixed = processFix();
    console.log(
      `✅ Exámenes generados para ${fixed} cursadas que no tenían registros.`,
    );
  } catch (error) {
    console.error("❌ Error generando exámenes para cursadas:", error.message);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// SEED exámenes parciales 2026 — genera resultados para alumnos alu0XXX
// cursando en 2026, para que el panel de predicciones muestre variedad.
// ═════════════════════════════════════════════════════════════════════════════
function seedExamenes2026() {
  try {
    const yaSeeded = db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM examenes e
         JOIN users u ON e.alumno_id = u.id
         WHERE u.username LIKE 'alu0%' AND e.anio = 2026 AND e.rendido = 1`,
      )
      .get();

    if (yaSeeded && yaSeeded.cnt > 0) {
      console.log(
        `✅ Seed exámenes 2026: ya existen ${yaSeeded.cnt} registros, saltando.`,
      );
      return;
    }

    // Alumnos alu0XXX con cursadas 2026
    const alumnos = db
      .prepare(
        `SELECT c.alumno_id, c.materia_id, c.asistencia, u.username, m.codigo_plan
         FROM cursadas c
         JOIN users u ON c.alumno_id = u.id
         JOIN materias m ON c.materia_id = m.id
         WHERE u.username LIKE 'alu0%' AND c.anio = 2026 AND c.estado = 'cursando'
         ORDER BY c.alumno_id, c.materia_id`,
      )
      .all();

    if (alumnos.length === 0) {
      console.warn("⚠️  No hay alumnos alu0XXX cursando en 2026, saltando.");
      return;
    }

    const stmtInsert = db.prepare(
      `INSERT OR IGNORE INTO examenes
         (alumno_id, materia_id, anio, tipo, instancia, rendido, nota, ausente, veces_recursada, asistencia, fecha_examen)
       VALUES (?, ?, 2026, ?, ?, 1, ?, 0, ?, ?, ?)`,
    );

    const stmtVecesRec = db.prepare(
      `SELECT COUNT(*) AS cnt FROM cursadas c
       WHERE c.alumno_id = ? AND c.materia_id = ? AND c.anio < 2026 AND c.estado = 'recursada'`,
    );

    // Función determinista de hash para generar valores reproducibles
    function dHash(seed) {
      return Math.abs(Math.sin(seed * 127.1 + 0.3) * 43758.5453) % 1;
    }

    // Distribución normal Box-Muller determinista
    function normalDet(seed, mu, sigma) {
      const u1 = Math.max(dHash(seed * 173.1), 1e-10);
      const u2 = dHash(seed * 257.3);
      const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return Math.min(10, Math.max(1.5, Math.round((mu + z * sigma) * 10) / 10));
    }

    const procesarExamenes = db.transaction(() => {
      let totalInserted = 0;

      for (const alu of alumnos) {
        const idx = parseInt(alu.username.slice(3), 10); // "alu0042" → 42
        const seed1 = idx * 137 + alu.codigo_plan * 31;

        // 60 % de los alumnos ya rindió Parcial 1
        if (dHash(seed1 * 91.3) >= 0.60) continue;

        const vecesRec = stmtVecesRec.get(alu.alumno_id, alu.materia_id).cnt || 0;
        const asist = parseFloat(alu.asistencia) || 0.8;

        // Nota P1: normal(5.5, 1.8)
        const notaP1 = normalDet(seed1, 5.5, 1.8);
        stmtInsert.run(
          alu.alumno_id, alu.materia_id,
          "Parcial", 1, notaP1, vecesRec, asist, "17-06-2026",
        );
        totalInserted++;

        const seed2 = seed1 * 7 + 13;

        if (notaP1 < 4) {
          // 70 % rinde Recuperatorio 1
          if (dHash(seed2 * 61.7) < 0.70) {
            const notaRec1 = normalDet(seed2, 4.5, 1.5);
            stmtInsert.run(
              alu.alumno_id, alu.materia_id,
              "Recuperatorio", 1, notaRec1, vecesRec, asist, "24-06-2026",
            );
            totalInserted++;
          }
        } else {
          // 65 % rinde Parcial 2 (correlacionado con P1)
          if (dHash(seed2 * 71.3) < 0.65) {
            const notaP2 = normalDet(seed2, notaP1, 1.2);
            stmtInsert.run(
              alu.alumno_id, alu.materia_id,
              "Parcial", 2, notaP2, vecesRec, asist, "07-11-2026",
            );
            totalInserted++;

            // Si desaprobó P2, 60 % rinde Recuperatorio 2
            if (notaP2 < 4 && dHash(seed2 * 53.1) < 0.60) {
              const notaRec2 = normalDet(seed2 * 3, 4.5, 1.5);
              stmtInsert.run(
                alu.alumno_id, alu.materia_id,
                "Recuperatorio", 2, notaRec2, vecesRec, asist, "14-11-2026",
              );
              totalInserted++;
            }
          }
        }
      }

      return totalInserted;
    });

    const total = procesarExamenes();
    console.log(
      `✅ Seed exámenes 2026: ${total} registros insertados para ${alumnos.length} cursadas activas.`,
    );
  } catch (err) {
    console.error("❌ Error en seedExamenes2026:", err.message);
  }
}

function seedMasivo500AlumnosCDU() {
  try {
    const existing = db
      .prepare("SELECT COUNT(*) as count FROM users WHERE username LIKE 'seed_%'")
      .get();
    if (existing.count > 0) {
      console.log("Seed masivo: ya existen alumnos seed_*, saltando.");
      return;
    }

    const jsonPath = path.join(__dirname, "seed-masivo-data.json");
    if (!fs.existsSync(jsonPath)) {
      console.warn(
        "⚠️  seed-masivo-data.json no encontrado. Correr ai-service/data/seed-data-generator.py primero.",
      );
      return;
    }
    const { alumnos } = JSON.parse(fs.readFileSync(jsonPath, "utf-8").replace(/^﻿/, ""));

    const DEMO_USERNAMES = [
      "lucas.martinez", "valentina.gomez", "mateo.fernandez", "sofia.rodriguez",
      "nicolas.lopez", "joaquin.perez", "camila.torres", "sebastian.diaz",
      "agustina.romero", "ignacio.sanchez", "martina.villareal", "tomas.acosta",
      "pedro.quintero", "ana.benitez", "rodrigo.molina", "luciana.herrera",
      "diego.castro", "florencia.ramos", "ezequiel.vargas", "camila.mendez",
      "martin.ibarra", "natalia.quispe", "pablo.luna", "valeria.mora",
      "gabriel.silva", "antonella.reyes",
    ];

    const ph = DEMO_USERNAMES.map(() => "?").join(",");
    const demoIds = db
      .prepare(`SELECT id FROM users WHERE username IN (${ph})`)
      .all(...DEMO_USERNAMES)
      .map((r) => r.id);

    if (demoIds.length > 0) {
      const idPh = demoIds.map(() => "?").join(",");
      // Delete mensajes referencing conversations where the demo user is involved
      const convIds = db
        .prepare(`SELECT id FROM conversaciones WHERE alumno_id IN (${idPh}) OR tutor_id IN (${idPh}) OR participante_a_id IN (${idPh}) OR participante_b_id IN (${idPh})`)
        .all(...demoIds, ...demoIds, ...demoIds, ...demoIds)
        .map((r) => r.id);
      if (convIds.length > 0) {
        const convPh = convIds.map(() => "?").join(",");
        db.prepare(`DELETE FROM mensajes WHERE conversacion_id IN (${convPh})`).run(...convIds);
        db.prepare(`DELETE FROM conversaciones WHERE id IN (${convPh})`).run(...convIds);
      }
      db.prepare(`DELETE FROM visualizaciones WHERE alumno_id IN (${idPh})`).run(...demoIds);
      db.prepare(`DELETE FROM predictions_log WHERE user_id IN (${idPh})`).run(...demoIds);
      db.prepare(`DELETE FROM examenes WHERE alumno_id IN (${idPh})`).run(...demoIds);
      db.prepare(`DELETE FROM cursadas WHERE alumno_id IN (${idPh})`).run(...demoIds);
      db.prepare(`DELETE FROM inscripciones WHERE alumno_id IN (${idPh})`).run(...demoIds);
      db.prepare(`DELETE FROM users WHERE id IN (${idPh})`).run(...demoIds);
    }

    const stmtInsertUser = db.prepare(`
      INSERT OR IGNORE INTO users
        (username, password, role, nombre_completo, email,
         oauth_provider, google_id, genero, fecha_nac,
         ayuda_financiera, colegio_tecnico, promedio_colegio, anio_ingreso)
      VALUES (?, NULL, 'alumno', ?, ?, 'google', ?, ?, ?, ?, ?, ?, ?)
    `);
    const stmtGetUser    = db.prepare("SELECT id FROM users WHERE username = ?");
    const stmtGetMateria = db.prepare("SELECT id FROM materias WHERE codigo_plan = ?");
    const stmtInsertCursada = db.prepare(`
      INSERT OR IGNORE INTO cursadas (alumno_id, materia_id, anio, asistencia, estado)
      VALUES (?, ?, ?, ?, ?)
    `);
    const stmtInsertExamen = db.prepare(`
      INSERT OR IGNORE INTO examenes
        (alumno_id, materia_id, anio, tipo, instancia,
         rendido, nota, ausente, veces_recursada, asistencia, fecha_examen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const stmtInsertInscr = db.prepare(`
      INSERT OR IGNORE INTO inscripciones (alumno_id, materia_id, anio, estado)
      VALUES (?, ?, ?, 'activa')
    `);

    const seedAll = db.transaction(() => {
      for (const alumno of alumnos) {
        stmtInsertUser.run(
          alumno.username,
          alumno.nombre_completo,
          alumno.email,
          alumno.google_id,
          alumno.genero,
          alumno.fecha_nac,
          alumno.ayuda_financiera,
          alumno.colegio_tecnico,
          alumno.promedio_colegio,
          alumno.anio_ingreso,
        );

        const row = stmtGetUser.get(alumno.username);
        if (!row) continue;
        const aId = row.id;

        for (const c of alumno.cursadas) {
          const m = stmtGetMateria.get(c.materia_codigo_plan);
          if (!m) continue;
          stmtInsertCursada.run(aId, m.id, c.anio, c.asistencia, c.estado);
        }

        for (const e of alumno.examenes) {
          const m = stmtGetMateria.get(e.materia_codigo_plan);
          if (!m) continue;
          stmtInsertExamen.run(
            aId, m.id, e.anio, e.tipo, e.instancia,
            e.rendido, e.nota ?? null, e.ausente,
            e.veces_recursada, e.asistencia, e.fecha_examen,
          );
        }

        for (const c of alumno.cursadas.filter(
          (c) => c.anio === 2026 && c.estado === "cursando",
        )) {
          const m = stmtGetMateria.get(c.materia_codigo_plan);
          if (!m) continue;
          stmtInsertInscr.run(aId, m.id, 2026);
        }
      }
    });

    seedAll();
    console.log(`Seed masivo: ${alumnos.length} alumnos insertados.`);
  } catch (error) {
    console.error("Error en seed masivo:", error.message);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Garantiza al menos 20 alumnos cursando en 2026 por materia.
// Solo agrega lo que falta; no toca materias que ya superan el mínimo.
// ═════════════════════════════════════════════════════════════════════════════
function ensureMinAlumnosPorMateria() {
  const TARGET = 23;

  try {
    // Build plan info: planId → { anioCarrera, corrs }
    const planInfo = {};
    for (const [planId, , , anioCarrera, corrs] of PLAN_CURRICULUM) {
      planInfo[planId] = { anioCarrera, corrs: corrs || [] };
    }

    // Full transitive closure of prerequisites for a materia
    function getClosure(planId, seen = new Set()) {
      if (seen.has(planId)) return seen;
      seen.add(planId);
      for (const c of (planInfo[planId]?.corrs || [])) getClosure(c, seen);
      return seen;
    }

    // Map codigo_plan → db materia id
    const mapaMat = {};
    db.prepare("SELECT id, codigo_plan FROM materias WHERE codigo_plan IS NOT NULL")
      .all().forEach(m => { mapaMat[m.codigo_plan] = m.id; });

    const materias = db.prepare(`
      SELECT m.id, m.codigo_plan, m.nombre, m.anio_carrera,
             COUNT(DISTINCT c.alumno_id) AS cursando_count
      FROM materias m
      LEFT JOIN cursadas c ON c.materia_id = m.id AND c.anio = 2026 AND c.estado = 'cursando'
      GROUP BY m.id
    `).all();

    // Deterministic hash → [0, 1)
    function dHash(seed) {
      return Math.abs(Math.sin(seed * 127.1 + 0.3) * 43758.5453) % 1;
    }
    function rndNote(seed, min, max) {
      return Math.round((min + dHash(seed) * (max - min)) * 10) / 10;
    }

    const stmtInsUser = db.prepare(`
      INSERT OR IGNORE INTO users
        (username, password, role, nombre_completo, email,
         oauth_provider, google_id, genero, fecha_nac,
         ayuda_financiera, colegio_tecnico, promedio_colegio, anio_ingreso)
      VALUES (?, NULL, 'alumno', ?, ?, 'google', ?, ?, ?, 0, 0, 7.0, ?)
    `);
    const stmtGetUser    = db.prepare("SELECT id FROM users WHERE username = ?");
    const stmtInsCursada = db.prepare(`
      INSERT OR IGNORE INTO cursadas (alumno_id, materia_id, anio, asistencia, estado)
      VALUES (?, ?, ?, ?, ?)
    `);
    const stmtInsExamen  = db.prepare(`
      INSERT OR IGNORE INTO examenes
        (alumno_id, materia_id, anio, tipo, instancia,
         rendido, nota, ausente, veces_recursada, asistencia, fecha_examen)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `);
    const stmtInsInscr   = db.prepare(`
      INSERT OR IGNORE INTO inscripciones (alumno_id, materia_id, anio, estado)
      VALUES (?, ?, 2026, 'activa')
    `);

    let fillBase = db.prepare(
      "SELECT COUNT(*) as cnt FROM users WHERE username LIKE 'fill_%'"
    ).get().cnt;
    let totalAdded = 0;

    for (const mat of materias) {
      if (!mat.codigo_plan) continue;
      const needed = Math.max(0, TARGET - mat.cursando_count);
      if (needed === 0) continue;

      const prereqs = getClosure(mat.codigo_plan);
      prereqs.delete(mat.codigo_plan);

      const anioCarreraTarget = mat.anio_carrera || 1;
      // Año de ingreso: si cursa una materia de año N en 2026, ingresó en 2026-(N-1)
      const anioIngreso = 2026 - (anioCarreraTarget - 1);

      const doInsert = db.transaction(() => {
        for (let i = 0; i < needed; i++) {
          fillBase++;
          const fIdx = fillBase;
          const username = `fill_${String(fIdx).padStart(5, '0')}`;
          const genero = fIdx % 2 === 0 ? 'Femenino' : 'Masculino';
          const pool = genero === 'Masculino' ? NOMBRES_MASCULINOS : NOMBRES_FEMENINOS;
          const nombre   = pool[fIdx % pool.length];
          const apellido = APELLIDOS_ARG[fIdx % APELLIDOS_ARG.length];
          const email    = `fill${fIdx}@usal.edu.ar`;
          const birthYear = anioIngreso - 18 - (fIdx % 3);

          stmtInsUser.run(
            username, `${nombre} ${apellido}`, email,
            `fill_${username}`, genero, `01-01-${birthYear}`, anioIngreso
          );

          const row = stmtGetUser.get(username);
          if (!row) continue;
          const aId = row.id;

          // ── Materias previas (prerequisites): aprobadas con historia completa ──
          for (const prereqPlanId of prereqs) {
            const mId  = mapaMat[prereqPlanId];
            if (!mId) continue;
            const info = planInfo[prereqPlanId];
            // Año en que cursó este prerequisito, según su año de carrera
            const anioPrereq = anioIngreso + ((info?.anioCarrera || 1) - 1);

            const s = fIdx * 1000 + prereqPlanId;
            const asist = Math.round((0.75 + dHash(s * 3) * 0.20) * 100) / 100;

            stmtInsCursada.run(aId, mId, anioPrereq, asist, 'aprobada');

            // Parcial 1
            const notaP1 = rndNote(s * 7, 3.5, 8.5);
            stmtInsExamen.run(aId, mId, anioPrereq, 'Parcial', 1, 1, notaP1, 0, asist, `15-06-${anioPrereq}`);
            if (notaP1 < 4) {
              // Recuperatorio necesario para poder aprobar la cursada
              const notaR1 = rndNote(s * 11, 5.0, 8.0);
              stmtInsExamen.run(aId, mId, anioPrereq, 'Recuperatorio', 1, 1, notaR1, 0, asist, `25-06-${anioPrereq}`);
            }

            // Parcial 2 (presente en el 70% de los casos)
            if (dHash(s * 13) < 0.70) {
              const notaP2 = rndNote(s * 17, 4.0, 9.0);
              stmtInsExamen.run(aId, mId, anioPrereq, 'Parcial', 2, 1, notaP2, 0, asist, `10-11-${anioPrereq}`);
              if (notaP2 < 4) {
                const notaR2 = rndNote(s * 19, 5.0, 7.5);
                stmtInsExamen.run(aId, mId, anioPrereq, 'Recuperatorio', 2, 1, notaR2, 0, asist, `20-11-${anioPrereq}`);
              }
            }

            // Final: al menos uno aprobado (la cursada es aprobada)
            const notaF1 = rndNote(s * 23, 2.5, 8.0);
            stmtInsExamen.run(aId, mId, anioPrereq, 'Final', 1, 1, notaF1, 0, asist, `12-12-${anioPrereq}`);
            if (notaF1 < 4) {
              // Falló primera instancia → aprobó en la segunda
              const notaF2 = rndNote(s * 29, 4.5, 8.0);
              stmtInsExamen.run(aId, mId, anioPrereq, 'Final', 2, 1, notaF2, 0, asist, `10-02-${anioPrereq + 1}`);
            }
          }

          // ── Materia target: perfil estancado ─────────────────────────────
          // 2025: recursada — llegó pero no pudo aprobar los finales
          const sT = fIdx * 500 + (mat.codigo_plan || 0);
          const vecesRec = 1;
          const asist2025 = Math.round((0.60 + dHash(sT * 5) * 0.25) * 100) / 100;

          stmtInsCursada.run(aId, mat.id, 2025, asist2025, 'recursada');

          const notaP1_25 = rndNote(sT * 7, 2.0, 6.5);
          stmtInsExamen.run(aId, mat.id, 2025, 'Parcial', 1, 1, notaP1_25, vecesRec, asist2025, `14-06-2025`);
          if (notaP1_25 < 4) {
            const notaR1_25 = rndNote(sT * 11, 1.5, 5.5);
            stmtInsExamen.run(aId, mat.id, 2025, 'Recuperatorio', 1, 1, notaR1_25, vecesRec, asist2025, `24-06-2025`);
          }
          if (dHash(sT * 13) < 0.65) {
            const notaP2_25 = rndNote(sT * 17, 2.0, 6.0);
            stmtInsExamen.run(aId, mat.id, 2025, 'Parcial', 2, 1, notaP2_25, vecesRec, asist2025, `12-11-2025`);
            if (notaP2_25 < 4) {
              const notaR2_25 = rndNote(sT * 19, 1.5, 5.0);
              stmtInsExamen.run(aId, mat.id, 2025, 'Recuperatorio', 2, 1, notaR2_25, vecesRec, asist2025, `21-11-2025`);
            }
          }
          // Intentó finales en dic-2025 / feb-2026 pero no pasó → "estancado"
          if (dHash(sT * 23) < 0.75) {
            const notaF1_25 = rndNote(sT * 29, 1.0, 3.5);
            stmtInsExamen.run(aId, mat.id, 2025, 'Final', 1, 1, notaF1_25, vecesRec, asist2025, `12-12-2025`);
            if (dHash(sT * 31) < 0.50) {
              const notaF2_25 = rndNote(sT * 37, 1.0, 3.5);
              stmtInsExamen.run(aId, mat.id, 2025, 'Final', 2, 1, notaF2_25, vecesRec, asist2025, `06-02-2026`);
            }
          }

          // 2026: cursando nuevamente (segunda o más recursada)
          const asist2026 = Math.round((0.65 + dHash(sT * 41) * 0.20) * 100) / 100;
          stmtInsCursada.run(aId, mat.id, 2026, asist2026, 'cursando');
          stmtInsInscr.run(aId, mat.id);
          totalAdded++;
        }
      });

      doInsert();
      console.log(`  🎓 ${mat.nombre}: +${needed} alumnos (${mat.cursando_count} → ${mat.cursando_count + needed})`);
    }

    console.log(`✅ ensureMinAlumnosPorMateria: ${totalAdded} alumnos fill añadidos.`);
  } catch (err) {
    console.error("❌ Error en ensureMinAlumnosPorMateria:", err.message);
  }
}

async function seedUsers() {
  const users = [
    {
      username: "director",
      password: "director123",
      role: "admin",
      nombre_completo: "Director Sistema",
    },
    {
      username: "docente",
      password: "docente123",
      role: "docente",
      nombre_completo: "Docente",
    },
    {
      username: "coordinador",
      password: "coord123",
      role: "coordinador",
      nombre_completo: "Coordinador Académico",
    },
  ];

  const insertUser = db.prepare(
    "INSERT INTO users (username, password, role, nombre_completo) VALUES (?, ?, ?, ?)",
  );
  const findUserByUsername = db.prepare(
    "SELECT id FROM users WHERE username = ?",
  );
  const updateUserRole = db.prepare(
    "UPDATE users SET role = ?, nombre_completo = ? WHERE id = ?",
  );
  let createdUsers = 0;
  let updatedRoles = 0;

  for (const user of users) {
    const existingUser = findUserByUsername.get(user.username);

    if (existingUser) {
      updateUserRole.run(user.role, user.nombre_completo, existingUser.id);
      updatedRoles += 1;
      continue;
    }

    const hashedPassword = await bcrypt.hash(user.password, 10);
    insertUser.run(
      user.username,
      hashedPassword,
      user.role,
      user.nombre_completo,
    );
    createdUsers += 1;
  }

  console.log(
    `Seed usuarios completado. Nuevos: ${createdUsers}. Roles actualizados: ${updatedRoles}.`,
  );

  seedMateriasInscripcionesYContenido(); // crea AM1, AM2 y demás materias
  seedRestoCurriculumPlan();
  fixCursadasSinExamenes();             // genera exámenes para cursadas sin registros
  seedMateriasInscripcionesYContenido(); // segunda pasada: ahora encuentra alumnos y seedea contenido CDU002
  seedMensajeriaCDU003();
  seedMensajeriaCDU007();
  seedMisCursosCDU004();
  seedGestionMateriasCDU005();
  seedGestionContenidoCDU008();
  seedPrediccionesAutomaticasCDU009();
  //seedDemoAlumnosCDU010();
  //seedDemoAlumnosAM2CDU014();
  seedMasivo500AlumnosCDU(); // deshabilitado — alumnos seed eliminados manualmente
  //ensureMinAlumnosPorMateria();
}

function eliminarDocenteObsoleto(username) {
  const user = db
    .prepare("SELECT id FROM users WHERE username = ? AND role = 'docente'")
    .get(username);

  if (!user) {
    return;
  }

  const eliminar = db.transaction((docenteId) => {
    const conversacionIds = db
      .prepare(
        `SELECT id FROM conversaciones
         WHERE tutor_id = ? OR participante_a_id = ? OR participante_b_id = ?`,
      )
      .all(docenteId, docenteId, docenteId)
      .map((row) => row.id);

    if (conversacionIds.length > 0) {
      const ph = conversacionIds.map(() => "?").join(",");
      db.prepare(`DELETE FROM mensajes WHERE conversacion_id IN (${ph})`).run(
        ...conversacionIds,
      );
    }
    db.prepare("DELETE FROM mensajes WHERE remitente_id = ?").run(docenteId);
    db.prepare(
      `DELETE FROM conversaciones
       WHERE tutor_id = ? OR participante_a_id = ? OR participante_b_id = ?`,
    ).run(docenteId, docenteId, docenteId);

    const contenidoIds = db
      .prepare("SELECT id FROM contenido WHERE tutor_id = ?")
      .all(docenteId)
      .map((row) => row.id);

    if (contenidoIds.length > 0) {
      const ph = contenidoIds.map(() => "?").join(",");
      db.prepare(
        `DELETE FROM visualizaciones WHERE contenido_id IN (${ph})`,
      ).run(...contenidoIds);
    }
    db.prepare("DELETE FROM contenido WHERE tutor_id = ?").run(docenteId);
    db.prepare("DELETE FROM carpetas WHERE creado_por = ?").run(docenteId);

    db.prepare(
      "DELETE FROM docente_materia WHERE docente_id = ? OR asignado_por = ?",
    ).run(docenteId, docenteId);
    db.prepare("DELETE FROM importaciones_log WHERE docente_id = ?").run(
      docenteId,
    );
    db.prepare("DELETE FROM predictions_log WHERE user_id = ?").run(
      docenteId,
    );

    db.prepare("DELETE FROM users WHERE id = ?").run(docenteId);
  });

  eliminar(user.id);
  console.log(`Docente obsoleto eliminado: ${username} (id ${user.id}).`);
}

if (require.main === module) {
  seedUsers().catch((error) => {
    console.error("Error al ejecutar seed:", error);
    process.exit(1);
  });
}

module.exports = { seedUsers, eliminarDocenteObsoleto };
