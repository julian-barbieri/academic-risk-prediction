const express = require("express");
const path = require("path");
const cors = require("cors");
const dotenv = require("dotenv");
const session = require("express-session");

dotenv.config();

require("./db/database");
const { seedUsers } = require("./db/seed");
const { passport, configurePassport } = require("./config/passport");

const authRoutes = require("./routes/auth.routes");
const predictRoutes = require("./routes/predict.routes");
const historyRoutes = require("./routes/history.routes");
const mensajesRoutes = require("./routes/mensajes.routes");
const misCursosRoutes = require("./routes/miscursos.routes");
const gestionMateriasRoutes = require("./routes/gestion-materias.routes");
const gestionAlumnosRoutes = require("./routes/gestion-alumnos.routes");
const panelPrediccionesRoutes = require("./routes/panel-predicciones.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const notasRoutes = require("./routes/notas.routes");
const sugerenciasRoutes = require("./routes/sugerencias.routes");
const { authenticate, authorize } = require("./middleware/auth.middleware");
const { pingAiService } = require("./services/warmup.service");

const app = express();
const PORT = process.env.PORT || 3001;
const sessionSecret = process.env.SESSION_SECRET || "dev_session_secret";
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
const uploadsPath = process.env.UPLOADS_PATH || "./uploads";
const resolvedUploadsPath = path.isAbsolute(uploadsPath)
  ? uploadsPath
  : path.resolve(process.cwd(), uploadsPath);

configurePassport();

app.use(
  cors({
    origin: frontendUrl,
    credentials: true,
  }),
);
app.use(express.json());
app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 1000 * 60 * 60,
    },
  }),
);
app.use(passport.initialize());
app.use(passport.session());
app.use("/uploads", express.static(resolvedUploadsPath));

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "backend" });
});

app.get("/api/warmup", (req, res) => {
  pingAiService();
  res.status(202).json({ status: "warming" });
});

app.use("/api/auth", authRoutes);
app.use("/api/predict", predictRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/mensajes", authenticate, mensajesRoutes);
app.use("/api/mis-cursos", authenticate, authorize("alumno"), misCursosRoutes);
app.use("/api/gestion", authenticate, gestionMateriasRoutes);
app.use(
  "/api/gestion-alumnos",
  authenticate,
  authorize("admin", "coordinador", "docente"),
  gestionAlumnosRoutes,
);
app.use(
  "/api/panel-predicciones",
  authenticate,
  authorize("admin", "coordinador", "docente"),
  panelPrediccionesRoutes,
);
app.use(
  "/api/dashboard",
  authenticate,
  authorize("admin", "coordinador"),
  dashboardRoutes,
);
app.use("/api/notas", authenticate, notasRoutes);
app.use("/api/sugerencias", sugerenciasRoutes);

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  seedUsers().catch((error) => {
    console.error("Error during seed:", error);
  });
});
