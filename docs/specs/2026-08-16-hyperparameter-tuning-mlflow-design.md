# Spec: RandomizedSearchCV + MLflow en el entrenamiento de los 3 modelos

**Fecha:** 2026-08-16
**Archivo principal:** `ai-service/src/train_models.py`
**Motivación:** los 3 modelos (`GradientBoostingClassifier` x2, `GradientBoostingRegressor` x1) usan hiperparámetros fijos sin validación cruzada ni búsqueda. Es el primer gap que salta en una revisión de código por un ML engineer, y el modelo de nota de examen es el de peor desempeño (R² 0.512) — el más urgente de mejorar.

---

## Contexto

`train_models.py` tiene dos funciones, `entrenar_clasificador(dataset)` y `entrenar_regresor(dataset)`, invocadas para `alumno`, `materia` y `examen` respectivamente desde `if __name__ == "__main__":`. Ambas entrenan con hiperparámetros hardcodeados (`n_estimators=200, max_depth=4, learning_rate=0.05, subsample=0.8, random_state=42`), evalúan sobre un test set fijo y guardan el modelo con `joblib.dump`.

`ai-service/docs/Train_models.md` describe una estructura vieja (`alumno_training.py`, `materia_training.py`, `train_all_models.py`, uso de `RandomizedSearchCV`) que ya no existe en el código — quedó desactualizada cuando se consolidó todo en un único `train_models.py`. Se reescribe como parte de este cambio.

No se modifica `model_deploy.py` ni la forma en que la API sirve predicciones: el modelo final se sigue guardando con `joblib.dump` en el mismo path (`models-trained/modelo_*.pkl`). MLflow es tracking en paralelo, no reemplaza el mecanismo de deploy — cero riesgo para el servicio en producción.

---

## Enfoque

Se evaluaron 3 opciones:

| Opción | Descripción | Decisión |
|---|---|---|
| A. Todo inline | `RandomizedSearchCV` + logging de MLflow directo en cada función | Descartada — duplica lógica de búsqueda y logging 3 veces |
| **B. Helpers compartidos, mismo archivo** | Dos funciones nuevas (`_run_search`, `_log_run`) reutilizadas por las 3 funciones existentes | **Elegida** — DRY sin reestructurar, mantiene `train_models.py` como único archivo y `python train_models.py` como forma de correrlo |
| C. Repaquetizar en módulo con CLI (`--modelo`) | Vuelve a la estructura por archivo que describía la doc vieja | Descartada — el repo ya se consolidó a propósito en un solo script; reintroducir múltiples archivos es más superficie de la que este cambio necesita |

---

## Cambio 1 — Búsqueda de hiperparámetros compartida

**Nuevo, antes de las funciones de entrenamiento:**

```python
from scipy.stats import randint, uniform, loguniform
from sklearn.model_selection import RandomizedSearchCV, StratifiedKFold, KFold

PARAM_DIST = {
    "n_estimators": randint(100, 400),
    "max_depth": randint(2, 6),
    "learning_rate": loguniform(0.01, 0.2),
    "subsample": uniform(0.6, 0.4),          # rango efectivo [0.6, 1.0]
    "min_samples_leaf": randint(1, 50),
    "max_features": ["sqrt", "log2", None],
}
N_ITER = 25
CV_FOLDS = 5


def _run_search(estimator, X_train, y_train, cv, scoring, fit_params=None):
    search = RandomizedSearchCV(
        estimator,
        param_distributions=PARAM_DIST,
        n_iter=N_ITER,
        cv=cv,
        scoring=scoring,
        n_jobs=-1,
        random_state=42,
        refit=True,
    )
    search.fit(X_train, y_train, **(fit_params or {}))
    return search
```

Mismo espacio de parámetros para clasificadores y regresor — `GradientBoostingClassifier` y `GradientBoostingRegressor` comparten la misma superficie de hiperparámetros relevante, no hace falta duplicar el dict.

### `entrenar_clasificador` (alumno, materia)

- `cv = StratifiedKFold(n_splits=CV_FOLDS, shuffle=True, random_state=42)`
- `scoring = "roc_auc"` — coincide con la métrica ya reportada en el README
- `sample_weight` (balanceo de clases) se sigue calculando sobre todo el train set con `compute_sample_weight("balanced", y_train)`, igual que hoy, y se pasa vía `fit_params={"sample_weight": sample_weights}`

### `entrenar_regresor` (examen)

- `cv = KFold(n_splits=CV_FOLDS, shuffle=True, random_state=42)`
- `scoring = "r2"` — es el modelo que se busca mejorar, se optimiza directamente la métrica débil

En ambos casos, el modelo final guardado con `joblib.dump(...)` pasa a ser `search.best_estimator_` en vez del estimador con hiperparámetros fijos. Mismo path, mismo nombre de archivo — `model_deploy.py` no se toca.

**Nota de tiempo de ejecución:** con `n_iter=25` y `cv=5` sobre el dataset de examen (el más grande, test n=15.740), la búsqueda va a tardar varios minutos. Aceptable porque el script se corre manualmente y offline, nunca en el path de deploy ni en CI.

---

## Cambio 2 — Tracking con MLflow

**Nuevo helper:**

```python
import mlflow
import mlflow.sklearn

MLRUNS_DIR = os.path.join(SRC_DIR, "..", "mlruns")
mlflow.set_tracking_uri(f"file:{MLRUNS_DIR}")


def _log_run(dataset, search, metrics, report_text=None):
    mlflow.set_experiment(f"modelo_{dataset}")
    with mlflow.start_run():
        mlflow.log_params(search.best_params_)
        mlflow.log_param("cv_folds", CV_FOLDS)
        mlflow.log_param("n_iter", N_ITER)
        mlflow.log_metric("cv_best_score", search.best_score_)
        for name, value in metrics.items():
            mlflow.log_metric(name, value)
        mlflow.sklearn.log_model(search.best_estimator_, "model")
        if report_text:
            mlflow.log_text(report_text, "classification_report.txt")
```

- **Un experimento por modelo** (`modelo_alumno`, `modelo_materia`, `modelo_examen`) — comparar ROC-AUC de un clasificador contra R² del regresor no tiene sentido, así que cada target tiene su propio historial de corridas para comparar reentrenos futuros entre sí.
- **Tracking store local**: `file:./ai-service/mlruns`, backend por defecto de MLflow, sin servidor que levantar.
- Se loguean los mismos números que ya imprime la consola hoy (ROC-AUC/F1/Accuracy para clasificadores, MAE/R² para el regresor), más el `classification_report` completo como artifact de texto en los clasificadores.
- El modelo se loguea como artifact de MLflow (`mlflow.sklearn.log_model`) **además** del `joblib.dump` existente — no reemplaza el mecanismo de deploy actual.

`entrenar_clasificador` y `entrenar_regresor` llaman a `_log_run(...)` al final, después de imprimir las métricas por consola (se mantiene el comportamiento actual de logging a consola, es aditivo).

---

## Cambio 3 — Soporte

- **`ai-service/requirements.txt`**: agregar `mlflow` (sin pin de versión todavía — se fija al instalar en la fase de implementación). **No** se agrega a `requirements-api.txt` — ese archivo arma la imagen Docker de producción que solo sirve predicciones, no entrena.
- **`.gitignore`**: agregar `ai-service/mlruns/`. Es regenerable corriendo `python train_models.py`, evita repetir el problema de bloat que ya existe hoy con los CSV/`.pkl` commiteados directo en `ai-service/data/` y `ai-service/src/models/models-trained/`.
- **`ai-service/docs/Train_models.md`**: reescritura completa. Hoy describe una estructura de archivos (`alumno_training.py`, `train_all_models.py`) que no existe en el código actual. Se documenta el flujo real (`train_models.py`, búsqueda de hiperparámetros, MLflow) y, después de correr el entrenamiento, los mejores hiperparámetros y métricas finales encontrados para cada uno de los 3 modelos.
- **`README.md` raíz**: una línea nueva en "Capa de IA" o "Stack tecnológico" mencionando búsqueda de hiperparámetros con validación cruzada + tracking con MLflow.

---

## Fuera de alcance (explícito)

- No se agregan tests nuevos para `train_models.py`. Hoy no tiene ninguno — ni `feature_engineering` ni `model_deploy` prueban el entrenamiento en sí (`ai-service/tests/` cubre `test_ft_engineering.py` y `test_model_deploy.py`, no training) — es consistente dejarlo así.
- No se modifica `model_deploy.py` ni el mecanismo de carga de modelos en producción.
- No se agrega MLflow Model Registry ni servidor de tracking remoto — solo tracking local en archivo.
- No se actualiza la tabla de métricas del README raíz con números reales todavía — eso se hace a mano después de correr el entrenamiento y ver los resultados reales.

---

## Pasos de ejecución

1. Aplicar cambios 1 y 2 en `ai-service/src/train_models.py`
2. Agregar `mlflow` a `ai-service/requirements.txt` y `ai-service/mlruns/` a `.gitignore`
3. Correr `python train_models.py` (dentro del venv de `ai-service`) y confirmar que los 3 modelos entrenan, guardan `.pkl` y quedan logueados en MLflow (`mlflow ui` para inspeccionar)
4. Reescribir `ai-service/docs/Train_models.md` con los hiperparámetros y métricas finales encontrados
5. Actualizar una línea del README raíz mencionando el nuevo flujo de tuning + MLflow
6. Si las métricas mejoraron de forma significativa respecto a los valores actuales del README (especialmente R² del modelo de examen), actualizar también la tabla "Resultados de los modelos"

---

## Archivos modificados

- `ai-service/src/train_models.py` — helpers de búsqueda + logging, las 3 funciones de entrenamiento pasan a usarlos
- `ai-service/requirements.txt` — agregar `mlflow`
- `.gitignore` — agregar `ai-service/mlruns/`
- `ai-service/docs/Train_models.md` — reescritura completa
- `README.md` — una línea nueva sobre tuning + MLflow (y, condicionalmente, la tabla de métricas)

No se modifica `model_deploy.py`, `requirements-api.txt`, ni ningún archivo de `backend/` o `frontend/`.
