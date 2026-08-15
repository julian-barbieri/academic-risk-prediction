# Warmup de pf-ai al abrir el frontend (Render free tier)

## Problema

Los tres servicios de Render (`pf-frontend`, `pf-backend`, `pf-ai`) están en el plan free.
Los servicios web free de Render se duermen tras ~15 minutos de inactividad y tardan
en volver a levantar (cold start) ante la siguiente request.

`pf-ai` (Docker/FastAPI) solo recibe tráfico cuando el backend llama a una ruta que
necesita predicciones (`/api/predict`, `/api/panel-predicciones`, `/api/dashboard`,
`/api/gestion-alumnos`). No hay nada que lo despierte cuando el usuario simplemente
abre `https://pf-frontend-1cdz.onrender.com/`. Resultado: el frontend y el backend
responden, pero cualquier función que dependa de `pf-ai` falla o tarda mucho la
primera vez que se usa, porque recién ahí arranca el cold start del servicio.

## Objetivo

Al abrir la página del frontend, disparar un ping best-effort hacia `pf-ai` para
que empiece a levantar en paralelo mientras el usuario navega, en vez de esperar a
que use una función de IA. No se busca eliminar el cold start (imposible sin
mantener el servicio siempre despierto), solo adelantarlo.

Fuera de alcance (descartado en brainstorming):
- Keep-alive periódico (cron externo o Render Cron Job) para que `pf-ai` nunca
  se duerma — el usuario prefirió no depender de infraestructura externa adicional.
- Llamada directa desde el frontend a `pf-ai` — se descartó para no exponer
  `AI_SERVICE_URL` al cliente ni tener que agregar CORS en el FastAPI de `pf-ai`.
- Cualquier indicador visual de "despertando IA" en la UI — el ping debe ser
  totalmente silencioso.

## Diseño

Patrón fire-and-forget en dos saltos: **frontend → backend → pf-ai**, sin bloquear
ninguna de las dos respuestas.

```
Usuario abre https://pf-frontend-1cdz.onrender.com/
        │
        ▼
Frontend (App.jsx monta) ──GET /api/warmup──► Backend
                                                   │
                                                   ├─► responde 202 al instante (no espera)
                                                   │
                                                   └─► en paralelo: GET {AI_SERVICE_URL}/health
                                                                (fire-and-forget, sin bloquear)
```

El ping pasa por el backend en lugar de ir directo del frontend a `pf-ai` porque:
- `AI_SERVICE_URL` ya es conocido solo por el backend; no hace falta exponerlo
  al frontend ni tocar `VITE_API_URL`.
- `pf-ai` no tiene CORS configurado hoy (solo lo llama el backend server-to-server);
  agregarlo únicamente para este ping sería una pieza extra a mantener.
- Reutiliza el mismo patrón que ya usa `panel-predicciones.service.js` para
  llamar a `pf-ai`.

### Backend — `backend/src/app.js`

Nueva ruta pública (sin `authenticate`), junto al `/health` existente:

```js
app.get("/api/warmup", (req, res) => {
  const aiServiceUrl = process.env.AI_SERVICE_URL || "http://localhost:8000";
  axios.get(`${aiServiceUrl}/health`, { timeout: 60000 }).catch(() => {});
  res.status(202).json({ status: "warming" });
});
```

- Sin `await`: responde 202 de inmediato; el ping a `pf-ai` sigue en segundo plano.
- `.catch(() => {})` evita un unhandled rejection si `pf-ai` tarda más del timeout
  o falla — no importa, el objetivo es solo "tocarlo" para que arranque.
- Requiere agregar `const axios = require("axios");` en `app.js` (ya es dependencia
  del proyecto, usado en `panel-predicciones.service.js`).
- Sin `authenticate`: debe poder dispararse aunque el usuario esté en `/login`.

### Frontend — `frontend/src/App.jsx`

Efecto que corre una sola vez al montar la app:

```jsx
import { useEffect } from "react";
import api from "./api/axios";

export default function App() {
  useEffect(() => {
    api.get("/api/warmup").catch(() => {});
  }, []);

  return (
    <Routes>
      ...
```

- Sin estado, spinner ni mensaje visible. Si `pf-ai` no llegó a levantar cuando
  el usuario use una función de IA, esa función sigue mostrando su loading/error
  normal como hoy — no cambia el comportamiento de las rutas existentes.
- `useEffect` con `[]` corre una vez por carga de la SPA, sin importar cuál sea
  la ruta inicial (login, dashboard, etc.).

### render.yaml

Sin cambios — `AI_SERVICE_URL` ya está definida como env var de `pf-backend`.

## Manejo de errores

Todo el flujo es best-effort:
- Si `pf-ai` está caído (no solo dormido) o tarda más del timeout, el `.catch`
  silencioso en el backend evita que rompa algo.
- Si la llamada del frontend a `/api/warmup` falla (por ejemplo, el propio backend
  recién está levantando), el `.catch` en el frontend la ignora — no afecta el
  render de la app.
- No se agrega retry ni backoff: es un único intento por carga de página.

## Verificación

- **Local**: correr `pf-ai` en `:8000` y el backend con `AI_SERVICE_URL` apuntando
  ahí; confirmar en los logs del backend (o en la pestaña Network del navegador)
  que al cargar el frontend se dispara `GET /api/warmup` y que el backend hace
  el `GET /health` a `pf-ai`.
- **Render**: revisar los logs de `pf-ai` y confirmar que recibe un `GET /health`
  apenas se abre `pf-frontend`, en lugar de recién cuando alguien usa una
  predicción.
