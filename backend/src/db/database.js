const path = require("path");
const Database = require("better-sqlite3");

const dbPath = process.env.DB_PATH || "./database.sqlite";
const resolvedDbPath = path.isAbsolute(dbPath)
  ? dbPath
  : path.resolve(process.cwd(), dbPath);

const db = new Database(resolvedDbPath);

db.pragma("foreign_keys = ON");

const USERS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT,
    role TEXT NOT NULL CHECK(role IN ('admin', 'docente', 'coordinador', 'alumno')),
    google_id TEXT UNIQUE,
    email TEXT UNIQUE,
    nombre_completo TEXT,
    avatar_url TEXT,
    oauth_provider TEXT CHECK(oauth_provider IN ('google', 'local')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

db.exec(USERS_TABLE_SQL);

function migrateUsersSchemaIfNeeded() {
  const tableInfo = db.prepare("PRAGMA table_info(users)").all();

  if (!tableInfo.length) {
    return;
  }

  const columnNames = new Set(tableInfo.map((column) => column.name));
  const passwordColumn = tableInfo.find((column) => column.name === "password");
  const passwordIsNotNull = passwordColumn?.notnull === 1;

  const requiredOAuthColumns = [
    "google_id",
    "email",
    "nombre_completo",
    "avatar_url",
    "oauth_provider",
  ];

  const missingOAuthColumns = requiredOAuthColumns.filter(
    (columnName) => !columnNames.has(columnName),
  );

  if (!passwordIsNotNull && missingOAuthColumns.length === 0) {
    return;
  }

  const selectExpression = [
    "id",
    "username",
    columnNames.has("password") ? "password" : "NULL AS password",
    "role",
    columnNames.has("google_id") ? "google_id" : "NULL AS google_id",
    columnNames.has("email") ? "email" : "NULL AS email",
    columnNames.has("nombre_completo")
      ? "nombre_completo"
      : "NULL AS nombre_completo",
    columnNames.has("avatar_url") ? "avatar_url" : "NULL AS avatar_url",
    columnNames.has("oauth_provider")
      ? "oauth_provider"
      : "NULL AS oauth_provider",
    columnNames.has("created_at")
      ? "created_at"
      : "CURRENT_TIMESTAMP AS created_at",
  ].join(", ");

  try {
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("BEGIN");
    db.exec(`
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT,
        role TEXT NOT NULL CHECK(role IN ('admin', 'docente', 'coordinador', 'alumno')),
        google_id TEXT UNIQUE,
        email TEXT UNIQUE,
        nombre_completo TEXT,
        avatar_url TEXT,
        oauth_provider TEXT CHECK(oauth_provider IN ('google', 'local')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    db.exec(`
      INSERT INTO users_new (
        id,
        username,
        password,
        role,
        google_id,
        email,
        nombre_completo,
        avatar_url,
        oauth_provider,
        created_at
      )
      SELECT ${selectExpression}
      FROM users;
    `);

    db.exec("DROP TABLE users");
    db.exec("ALTER TABLE users_new RENAME TO users");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

migrateUsersSchemaIfNeeded();

function safeAlterTable(sql) {
  try {
    db.exec(sql);
  } catch (error) {
    if (
      !String(error?.message || "")
        .toLowerCase()
        .includes("duplicate column name")
    ) {
      throw error;
    }
  }
}

safeAlterTable("ALTER TABLE users ADD COLUMN promedio_colegio REAL");
safeAlterTable("ALTER TABLE users ADD COLUMN anio_ingreso INTEGER");
safeAlterTable("ALTER TABLE users ADD COLUMN genero TEXT");
safeAlterTable("ALTER TABLE users ADD COLUMN fecha_nac TEXT");
safeAlterTable(
  "ALTER TABLE users ADD COLUMN ayuda_financiera INTEGER NOT NULL DEFAULT 0",
);
safeAlterTable(
  "ALTER TABLE users ADD COLUMN colegio_tecnico INTEGER NOT NULL DEFAULT 0",
);

db.exec(`
  CREATE TABLE IF NOT EXISTS predictions_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    tipo TEXT NOT NULL CHECK(tipo IN ('alumno', 'materia', 'examen')),
    input_data TEXT NOT NULL,
    result_data TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS materias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    codigo TEXT UNIQUE NOT NULL,
    descripcion TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS inscripciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alumno_id INTEGER NOT NULL REFERENCES users(id),
    materia_id INTEGER NOT NULL REFERENCES materias(id),
    anio INTEGER,
    periodo_id INTEGER REFERENCES periodos_inscripcion(id),
    estado TEXT NOT NULL DEFAULT 'activa' CHECK(estado IN ('activa', 'baja')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

function migrateInscripcionesSchemaIfNeeded() {
  const tableInfo = db.prepare("PRAGMA table_info(inscripciones)").all();

  if (!tableInfo.length) {
    return;
  }

  const columnNames = new Set(tableInfo.map((column) => column.name));
  const hasAnio = columnNames.has("anio");
  const hasPeriodoId = columnNames.has("periodo_id");
  const hasEstado = columnNames.has("estado");

  const indexes = db.prepare("PRAGMA index_list(inscripciones)").all();
  const uniqueAlumnoMateriaIndex = indexes.some((index) => {
    if (!index.unique) {
      return false;
    }
    const cols = db
      .prepare(`PRAGMA index_info(${index.name})`)
      .all()
      .map((c) => c.name);
    return (
      cols.length === 2 &&
      cols.includes("alumno_id") &&
      cols.includes("materia_id")
    );
  });

  if (hasAnio && hasPeriodoId && hasEstado && !uniqueAlumnoMateriaIndex) {
    return;
  }

  const currentYear = new Date().getFullYear();

  try {
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("BEGIN");

    db.exec(`
      CREATE TABLE inscripciones_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        alumno_id INTEGER NOT NULL REFERENCES users(id),
        materia_id INTEGER NOT NULL REFERENCES materias(id),
        anio INTEGER,
        periodo_id INTEGER REFERENCES periodos_inscripcion(id),
        estado TEXT NOT NULL DEFAULT 'activa' CHECK(estado IN ('activa', 'baja')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    db.exec(`
      INSERT INTO inscripciones_new (
        id,
        alumno_id,
        materia_id,
        anio,
        periodo_id,
        estado,
        created_at
      )
      SELECT
        id,
        alumno_id,
        materia_id,
        ${hasAnio ? "COALESCE(anio, " + currentYear + ")" : currentYear},
        ${hasPeriodoId ? "periodo_id" : "NULL"},
        ${hasEstado ? "COALESCE(estado, 'activa')" : "'activa'"},
        COALESCE(created_at, CURRENT_TIMESTAMP)
      FROM inscripciones;
    `);

    db.exec("DROP TABLE inscripciones");
    db.exec("ALTER TABLE inscripciones_new RENAME TO inscripciones");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

migrateInscripcionesSchemaIfNeeded();

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_inscripciones_unique_activa
  ON inscripciones(alumno_id, materia_id, anio)
  WHERE estado = 'activa';
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS contenido (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tutor_id INTEGER NOT NULL REFERENCES users(id),
    materia_id INTEGER NOT NULL REFERENCES materias(id),
    titulo TEXT NOT NULL,
    descripcion TEXT,
    tipo TEXT NOT NULL CHECK(tipo IN ('pdf', 'word', 'video', 'imagen', 'texto')),
    archivo_path TEXT,
    video_url TEXT,
    texto_contenido TEXT,
    alumno_id INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS carpetas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    materia_id INTEGER NOT NULL REFERENCES materias(id),
    nombre TEXT NOT NULL,
    creado_por INTEGER NOT NULL REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(materia_id, nombre)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS carpeta_archivos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    carpeta_id INTEGER NOT NULL REFERENCES carpetas(id) ON DELETE CASCADE,
    contenido_id INTEGER NOT NULL REFERENCES contenido(id) ON DELETE CASCADE,
    nombre_archivo TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(carpeta_id, contenido_id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS visualizaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alumno_id INTEGER NOT NULL REFERENCES users(id),
    contenido_id INTEGER NOT NULL REFERENCES contenido(id),
    visto_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS unidades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    materia_id INTEGER NOT NULL REFERENCES materias(id),
    nombre TEXT NOT NULL,
    orden INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS conversaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asunto TEXT NOT NULL,
    alumno_id INTEGER NOT NULL REFERENCES users(id),
    tutor_id INTEGER NOT NULL REFERENCES users(id),
    materia_id INTEGER NOT NULL REFERENCES materias(id),
    unidad_id INTEGER REFERENCES unidades(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ultimo_mensaje_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

function migrateConversacionesSchemaIfNeeded() {
  const tableInfo = db.prepare("PRAGMA table_info(conversaciones)").all();

  if (!tableInfo.length) {
    return;
  }

  const columnNames = new Set(tableInfo.map((column) => column.name));

  if (!columnNames.has("participante_a_id")) {
    db.exec(
      "ALTER TABLE conversaciones ADD COLUMN participante_a_id INTEGER REFERENCES users(id)",
    );
  }

  if (!columnNames.has("participante_b_id")) {
    db.exec(
      "ALTER TABLE conversaciones ADD COLUMN participante_b_id INTEGER REFERENCES users(id)",
    );
  }

  if (!columnNames.has("tipo_conversacion")) {
    db.exec(
      "ALTER TABLE conversaciones ADD COLUMN tipo_conversacion TEXT DEFAULT 'alumno_tutor'",
    );
  }

  db.exec(`
    UPDATE conversaciones
    SET participante_a_id = alumno_id
    WHERE participante_a_id IS NULL
  `);

  db.exec(`
    UPDATE conversaciones
    SET participante_b_id = tutor_id
    WHERE participante_b_id IS NULL
  `);

  db.exec(`
    UPDATE conversaciones
    SET tipo_conversacion = 'alumno_tutor'
    WHERE tipo_conversacion IS NULL OR TRIM(tipo_conversacion) = ''
  `);
}

migrateConversacionesSchemaIfNeeded();

db.exec(`
  CREATE TABLE IF NOT EXISTS mensajes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversacion_id INTEGER NOT NULL REFERENCES conversaciones(id),
    remitente_id INTEGER NOT NULL REFERENCES users(id),
    cuerpo TEXT NOT NULL,
    leido INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Verificar si cursadas ya existe con el UNIQUE constraint
function checkAndMigrateCursadas() {
  try {
    const tableInfo = db.prepare("PRAGMA table_info(cursadas)").all();

    // Si la tabla no existe, CREATE TABLE IF NOT EXISTS la creará con el constraint
    if (!tableInfo || tableInfo.length === 0) {
      return; // Tabla será creada por CREATE TABLE IF NOT EXISTS arriba
    }

    // Tabla existe. Verificar si ya tiene un UNIQUE constraint
    const constraints = db
      .prepare(
        `SELECT sql FROM sqlite_master WHERE type='table' AND name='cursadas'`,
      )
      .get();

    if (constraints && constraints.sql && constraints.sql.includes("UNIQUE")) {
      return; // Ya tiene el constraint
    }

    // Tabla existe pero sin UNIQUE constraint, necesita migración
    console.log("🔄 Migrando tabla cursadas para agregar UNIQUE constraint...");

    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("BEGIN");

    try {
      // 1. Eliminar duplicados: mantener el registro más antiguo por grupo (alumno, materia, anio)
      db.exec(`
        DELETE FROM cursadas
        WHERE id NOT IN (
          SELECT MIN(id)
          FROM cursadas
          GROUP BY alumno_id, materia_id, anio
        )
      `);

      // 2. Crear tabla nueva con UNIQUE constraint
      db.exec(`
        ALTER TABLE cursadas RENAME TO cursadas_old
      `);

      db.exec(`
        CREATE TABLE cursadas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          alumno_id INTEGER NOT NULL REFERENCES users(id),
          materia_id INTEGER NOT NULL REFERENCES materias(id),
          anio INTEGER NOT NULL,
          asistencia REAL,
          estado TEXT NOT NULL DEFAULT 'cursando' CHECK(estado IN ('cursando', 'aprobada', 'recursada', 'abandonada')),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(alumno_id, materia_id, anio)
        )
      `);

      // 3. Copiar datos de la tabla antigua
      db.exec(`
        INSERT INTO cursadas (id, alumno_id, materia_id, anio, asistencia, estado, created_at)
        SELECT id, alumno_id, materia_id, anio, asistencia, estado, created_at
        FROM cursadas_old
      `);

      // 4. Borrar tabla antigua
      db.exec("DROP TABLE cursadas_old");

      db.exec("COMMIT");
      console.log("✅ Migración de cursadas completada exitosamente");
    } catch (migrationError) {
      db.exec("ROLLBACK");
      throw migrationError;
    }
  } catch (error) {
    console.warn(
      "⚠️ No se pudo completar migración de cursadas (puede estar ya migrada):",
      error.message,
    );
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

// Ejecutar verificación y migración después de crear la tabla
checkAndMigrateCursadas();

db.exec(`
  CREATE TABLE IF NOT EXISTS cursadas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alumno_id INTEGER NOT NULL REFERENCES users(id),
    materia_id INTEGER NOT NULL REFERENCES materias(id),
    anio INTEGER NOT NULL,
    asistencia REAL,
    estado TEXT NOT NULL DEFAULT 'cursando' CHECK(estado IN ('cursando', 'aprobada', 'recursada', 'abandonada')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(alumno_id, materia_id, anio)
  );
`);

// Migración: agregar UNIQUE constraint a cursadas si no existe
function migrateCursadasUniqueConstraint() {
  try {
    const indexExists = db
      .prepare(
        `SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_cursadas_unique'`,
      )
      .get();

    if (!indexExists) {
      db.exec("PRAGMA foreign_keys = OFF");
      db.exec("BEGIN");

      // Eliminar duplicados: mantener el registro más antiguo
      db.exec(`
        DELETE FROM cursadas
        WHERE id NOT IN (
          SELECT MIN(id)
          FROM cursadas
          GROUP BY alumno_id, materia_id, anio
        )
      `);

      db.exec("COMMIT");
      db.exec("PRAGMA foreign_keys = ON");
    }
  } catch (error) {
    if (!String(error?.message || "").includes("UNIQUE constraint failed")) {
      console.log(
        "Migración de cursadas UNIQUE ya aplicada o tabla vacía, continuando...",
      );
    }
  }
}

migrateCursadasUniqueConstraint();

// Verificar y migrar tabla examenes para agregar UNIQUE constraint
function checkAndMigrateExamenes() {
  try {
    const tableInfo = db.prepare("PRAGMA table_info(examenes)").all();

    // Si la tabla no existe, CREATE TABLE IF NOT EXISTS la creará con el constraint
    if (!tableInfo || tableInfo.length === 0) {
      return; // Tabla será creada por CREATE TABLE IF NOT EXISTS arriba
    }

    // Tabla existe. Verificar si ya tiene un UNIQUE constraint
    const constraints = db
      .prepare(
        `SELECT sql FROM sqlite_master WHERE type='table' AND name='examenes'`,
      )
      .get();

    if (constraints && constraints.sql && constraints.sql.includes("UNIQUE")) {
      return; // Ya tiene el constraint
    }

    // Tabla existe pero sin UNIQUE constraint, necesita migración
    console.log(
      "🔄 Migrando tabla examenes para agregar UNIQUE constraint...",
    );

    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("BEGIN");

    try {
      // 1. Eliminar duplicados: mantener el registro más antiguo por grupo (alumno, materia, anio, tipo, instancia)
      db.exec(`
        DELETE FROM examenes
        WHERE id NOT IN (
          SELECT MIN(id)
          FROM examenes
          GROUP BY alumno_id, materia_id, anio, tipo, instancia
        )
      `);

      // 2. Crear tabla nueva con UNIQUE constraint
      db.exec(`
        ALTER TABLE examenes RENAME TO examenes_old
      `);

      db.exec(`
        CREATE TABLE examenes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          alumno_id INTEGER NOT NULL REFERENCES users(id),
          materia_id INTEGER NOT NULL REFERENCES materias(id),
          anio INTEGER NOT NULL,
          tipo TEXT NOT NULL,
          instancia INTEGER NOT NULL,
          rendido INTEGER NOT NULL DEFAULT 1,
          nota REAL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          ausente INTEGER NOT NULL DEFAULT 0,
          veces_recursada INTEGER NOT NULL DEFAULT 0,
          fecha_examen TEXT,
          asistencia REAL,
          UNIQUE(alumno_id, materia_id, anio, tipo, instancia)
        )
      `);

      // 3. Copiar datos de la tabla antigua
      db.exec(`
        INSERT INTO examenes (id, alumno_id, materia_id, anio, tipo, instancia, rendido, nota, created_at, ausente, veces_recursada, fecha_examen, asistencia)
        SELECT id, alumno_id, materia_id, anio, tipo, instancia, rendido, nota, created_at, ausente, veces_recursada, fecha_examen, asistencia
        FROM examenes_old
      `);

      // 4. Borrar tabla antigua
      db.exec("DROP TABLE examenes_old");

      db.exec("COMMIT");
      console.log("✅ Migración de examenes completada exitosamente");
    } catch (migrationError) {
      db.exec("ROLLBACK");
      throw migrationError;
    }
  } catch (error) {
    console.warn(
      "⚠️ No se pudo completar migración de examenes (puede estar ya migrada):",
      error.message,
    );
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

// Ejecutar verificación y migración después de crear la tabla
checkAndMigrateExamenes();

db.exec(`
  CREATE TABLE IF NOT EXISTS examenes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alumno_id INTEGER NOT NULL REFERENCES users(id),
    materia_id INTEGER NOT NULL REFERENCES materias(id),
    anio INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    instancia INTEGER NOT NULL,
    rendido INTEGER NOT NULL DEFAULT 1,
    nota REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ausente INTEGER NOT NULL DEFAULT 0,
    veces_recursada INTEGER NOT NULL DEFAULT 0,
    fecha_examen TEXT,
    asistencia REAL,
    UNIQUE(alumno_id, materia_id, anio, tipo, instancia)
  );
`);

safeAlterTable(
  "ALTER TABLE examenes ADD COLUMN ausente INTEGER NOT NULL DEFAULT 0",
);
safeAlterTable(
  "ALTER TABLE examenes ADD COLUMN veces_recursada INTEGER NOT NULL DEFAULT 0",
);
safeAlterTable("ALTER TABLE examenes ADD COLUMN fecha_examen TEXT");
safeAlterTable("ALTER TABLE examenes ADD COLUMN asistencia REAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS importaciones_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    docente_id INTEGER NOT NULL REFERENCES users(id),
    materia_id INTEGER NOT NULL REFERENCES materias(id),
    anio INTEGER NOT NULL,
    tipo TEXT NOT NULL CHECK(tipo IN ('manual', 'excel')),
    filas_ok INTEGER DEFAULT 0,
    filas_error INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS periodos_inscripcion (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    anio INTEGER NOT NULL,
    descripcion TEXT,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    activo INTEGER NOT NULL DEFAULT 0,
    creado_por INTEGER NOT NULL REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS docente_materia (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    docente_id INTEGER NOT NULL REFERENCES users(id),
    materia_id INTEGER NOT NULL REFERENCES materias(id),
    anio INTEGER NOT NULL,
    activo INTEGER NOT NULL DEFAULT 1,
    asignado_por INTEGER NOT NULL REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(docente_id, materia_id, anio)
  );
`);

// Nuevas columnas para soporte de 48 materias del plan de estudios
safeAlterTable("ALTER TABLE materias ADD COLUMN codigo_plan INTEGER");
safeAlterTable("ALTER TABLE materias ADD COLUMN tipo TEXT DEFAULT 'C'");
safeAlterTable("ALTER TABLE materias ADD COLUMN anio_carrera INTEGER DEFAULT 1");
safeAlterTable("ALTER TABLE materias ADD COLUMN correlativas TEXT DEFAULT '[]'");
safeAlterTable("ALTER TABLE cursadas ADD COLUMN cuatrimestre INTEGER DEFAULT 0");
safeAlterTable("ALTER TABLE examenes ADD COLUMN tipo_materia TEXT DEFAULT 'C'");
safeAlterTable("ALTER TABLE examenes ADD COLUMN cuatrimestre INTEGER DEFAULT 0");

// Eliminar recuperatorios inválidos: un alumno no debería tener recuperatorio
// de una instancia si ya aprobó (nota >= 4) el parcial de esa misma instancia.
(function cleanupRecuperatoriosInvalidos() {
  try {
    const result = db.prepare(`
      DELETE FROM examenes
      WHERE tipo = 'Recuperatorio'
        AND EXISTS (
          SELECT 1 FROM examenes parcial
          WHERE parcial.alumno_id  = examenes.alumno_id
            AND parcial.materia_id = examenes.materia_id
            AND parcial.anio       = examenes.anio
            AND parcial.instancia  = examenes.instancia
            AND parcial.tipo       = 'Parcial'
            AND parcial.rendido    = 1
            AND parcial.nota       >= 4
        )
    `).run();
    if (result.changes > 0) {
      console.log(
        `✅ Limpieza recuperatorios: ${result.changes} registro/s eliminado/s.`,
      );
    }
  } catch (error) {
    console.warn("⚠️ No se pudo limpiar recuperatorios inválidos:", error.message);
  }
})();

// Corrección puntual: alumno seed_0162 cargado con nombre incorrecto en el dataset sintético.
(function fixNombreAlumnoSeed0162() {
  try {
    const result = db
      .prepare(
        `UPDATE users SET nombre_completo = 'Julián Francisco Barbieri'
         WHERE username = 'seed_0162' AND nombre_completo = 'Cristian Miranda'`,
      )
      .run();
    if (result.changes > 0) {
      console.log("✅ Corrección nombre alumno seed_0162 aplicada.");
    }
  } catch (error) {
    console.warn("⚠️ No se pudo corregir nombre de seed_0162:", error.message);
  }
})();

module.exports = db;
