# RandomizedSearchCV + MLflow en train_models.py — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar los hiperparámetros fijos de los 3 modelos (`GradientBoostingClassifier` x2, `GradientBoostingRegressor` x1) en `ai-service/src/train_models.py` por una búsqueda con `RandomizedSearchCV` + validación cruzada de 5 folds, y trackear cada corrida (hiperparámetros, métricas, modelo) con MLflow localmente.

**Architecture:** Dos helpers nuevos en el mismo archivo (`_run_search` para la búsqueda, `_log_run` para el tracking), reutilizados por las 3 funciones de entrenamiento existentes. No se toca `model_deploy.py` ni el mecanismo de carga de modelos en producción — el `.pkl` final se sigue guardando con `joblib.dump` en el mismo path.

**Tech Stack:** scikit-learn (`RandomizedSearchCV`, `StratifiedKFold`, `KFold`), scipy.stats (`randint`, `uniform`, `loguniform`), MLflow (tracking local, file store).

**Spec:** `docs/specs/2026-08-16-hyperparameter-tuning-mlflow-design.md`

## Global Constraints

- `mlflow` va en `ai-service/requirements.txt`, **no** en `ai-service/requirements-api.txt` (ese archivo arma la imagen Docker de producción, que solo sirve predicciones).
- `model_deploy.py` no se modifica — el modelo final se sigue guardando con `joblib.dump` en `models-trained/modelo_*.pkl`, mismo path de siempre.
- `ai-service/mlruns/` va a `.gitignore` — no se commitea, es regenerable corriendo `python src/train_models.py`.
- No se agregan tests nuevos (pytest) para `train_models.py` — no los tiene hoy, es consistente dejarlo así.
- No se agrega MLflow Model Registry ni servidor de tracking remoto — solo tracking local en archivo (`file:./ai-service/mlruns`).
- Búsqueda: `RandomizedSearchCV(n_iter=25, cv=5, n_jobs=-1, random_state=42)` para los 3 modelos. Clasificadores con `StratifiedKFold` + `scoring="roc_auc"`; regresor con `KFold` + `scoring="r2"`.

---

## Archivos modificados

| Archivo | Qué cambia |
|---|---|
| `ai-service/requirements.txt` | Agregar `mlflow==<versión instalada>` |
| `.gitignore` | Agregar `ai-service/mlruns/` |
| `ai-service/src/train_models.py` | Imports nuevos, `PARAM_DIST`/`N_ITER`/`CV_FOLDS`, helpers `_run_search`/`_log_run`, las 3 funciones de entrenamiento migradas |
| `ai-service/src/models/models-trained/modelo_*.pkl` | Regenerados con los hiperparámetros ganadores de la búsqueda (ya están trackeados en git) |
| `ai-service/docs/Train_models.md` | Reescritura completa — hoy describe una estructura de archivos que no existe |
| `README.md` | Una línea nueva sobre tuning + MLflow, y condicionalmente la tabla de métricas si mejoraron |

---

## Task 1: Instalar MLflow y configurar dependencias

**Files:**
- Modify: `ai-service/requirements.txt`
- Modify: `.gitignore`

- [ ] **Step 1: Activar el venv de ai-service e instalar mlflow**

```bash
cd ai-service
./.venv/Scripts/Activate.ps1   # Windows; en Mac/Linux: source .venv/bin/activate
pip install mlflow
```

- [ ] **Step 2: Confirmar la versión instalada**

```bash
python -c "import mlflow; print(mlflow.__version__)"
```

Expected: imprime una versión, por ejemplo `2.19.0` (el número exacto depende de lo que resuelva pip). Anotalo para el paso siguiente.

- [ ] **Step 3: Agregar mlflow a `ai-service/requirements.txt`**

Modificar `ai-service/requirements.txt`:

Reemplazar:
```
shap==0.49.1
streamlit==1.54.0
pytest==9.0.3
```
Por (usando la versión exacta del Step 2):
```
shap==0.49.1
streamlit==1.54.0
pytest==9.0.3
mlflow==<versión del Step 2>
```

**No** agregar mlflow a `ai-service/requirements-api.txt` — ese archivo arma la imagen Docker de producción, que solo sirve predicciones y no entrena.

- [ ] **Step 4: Gitignorar `ai-service/mlruns/`**

Modificar `.gitignore`:

Reemplazar:
```
# Outputs de análisis y SHAP
ai-service/outputs/shap/*.csv
ai-service/outputs/
```
Por:
```
# Outputs de análisis y SHAP
ai-service/outputs/shap/*.csv
ai-service/outputs/

# MLflow tracking (regenerable con python src/train_models.py)
ai-service/mlruns/
```

- [ ] **Step 5: Commit**

```bash
git add ai-service/requirements.txt .gitignore
git commit -m "chore(ai-service): agregar mlflow como dependencia de entrenamiento"
```

---

## Task 2: Espacio de búsqueda de hiperparámetros (`_run_search`)

**Files:**
- Modify: `ai-service/src/train_models.py`

**Interfaces:**
- Produces: `PARAM_DIST` (dict), `N_ITER` (int, 25), `CV_FOLDS` (int, 5), `_run_search(estimator, X_train, y_train, cv, scoring, fit_params=None) -> RandomizedSearchCV` (ya fiteado, con `.best_estimator_`, `.best_params_`, `.best_score_`)

- [ ] **Step 1: Agregar los imports de scipy y sklearn.model_selection**

Reemplazar:
```python
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor
from sklearn.utils.class_weight import compute_sample_weight
from sklearn.metrics import (
    classification_report, roc_auc_score,
    mean_absolute_error, r2_score,
)
```
Por:
```python
import joblib
import numpy as np
import pandas as pd
from scipy.stats import randint, uniform, loguniform
from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor
from sklearn.model_selection import RandomizedSearchCV, StratifiedKFold, KFold
from sklearn.utils.class_weight import compute_sample_weight
from sklearn.metrics import (
    classification_report, roc_auc_score,
    mean_absolute_error, r2_score,
)
```

- [ ] **Step 2: Agregar `PARAM_DIST`, `N_ITER`, `CV_FOLDS` y `_run_search`**

Reemplazar:
```python
os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(TEST_DIR,   exist_ok=True)


def entrenar_clasificador(dataset: str):
```
Por:
```python
os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(TEST_DIR,   exist_ok=True)

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
    """Corre RandomizedSearchCV sobre PARAM_DIST y devuelve el search fiteado."""
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


def entrenar_clasificador(dataset: str):
```

- [ ] **Step 3: Verificar que el módulo importa correctamente**

```bash
cd ai-service
python -c "
import sys; sys.path.insert(0, 'src')
import train_models as tm
print(sorted(tm.PARAM_DIST.keys()))
print(tm.N_ITER, tm.CV_FOLDS)
print(callable(tm._run_search))
"
```

Expected:
```
['learning_rate', 'max_depth', 'max_features', 'min_samples_leaf', 'n_estimators', 'subsample']
25 5
True
```

Este import no ejecuta ningún entrenamiento (`train_models.py` guarda todo el trabajo pesado bajo `if __name__ == "__main__":`), así que corre en segundos.

- [ ] **Step 4: Commit**

```bash
git add ai-service/src/train_models.py
git commit -m "feat(ai-service): agregar espacio de busqueda de hiperparametros (RandomizedSearchCV)"
```

---

## Task 3: Tracking con MLflow (`_log_run`)

**Files:**
- Modify: `ai-service/src/train_models.py`

**Interfaces:**
- Consumes: `CV_FOLDS`, `N_ITER` (de Task 2)
- Produces: `MLRUNS_DIR` (str, path), `_log_run(dataset: str, search: RandomizedSearchCV, metrics: dict, report_text: str = None) -> None`

- [ ] **Step 1: Agregar los imports de mlflow**

Reemplazar:
```python
import joblib
import numpy as np
import pandas as pd
from scipy.stats import randint, uniform, loguniform
```
Por:
```python
import joblib
import mlflow
import mlflow.sklearn
import numpy as np
import pandas as pd
from scipy.stats import randint, uniform, loguniform
```

- [ ] **Step 2: Agregar `MLRUNS_DIR` y `mlflow.set_tracking_uri`**

Reemplazar:
```python
MODELS_DIR      = os.path.join(SRC_DIR, "models", "models-trained")
TEST_DIR        = os.path.join(SRC_DIR, "models", "dataset-test")

os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(TEST_DIR,   exist_ok=True)

PARAM_DIST = {
```
Por:
```python
MODELS_DIR      = os.path.join(SRC_DIR, "models", "models-trained")
TEST_DIR        = os.path.join(SRC_DIR, "models", "dataset-test")
MLRUNS_DIR      = os.path.join(SRC_DIR, "..", "mlruns")

os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(TEST_DIR,   exist_ok=True)

mlflow.set_tracking_uri(f"file:{MLRUNS_DIR}")

PARAM_DIST = {
```

- [ ] **Step 3: Agregar `_log_run` después de `_run_search`**

Reemplazar:
```python
    search.fit(X_train, y_train, **(fit_params or {}))
    return search


def entrenar_clasificador(dataset: str):
```
Por:
```python
    search.fit(X_train, y_train, **(fit_params or {}))
    return search


def _log_run(dataset, search, metrics, report_text=None):
    """Loguea una corrida de busqueda de hiperparametros en MLflow."""
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


def entrenar_clasificador(dataset: str):
```

- [ ] **Step 4: Verificar con datos sintéticos (sin depender de los CSV reales)**

```bash
cd ai-service
python -c "
import sys; sys.path.insert(0, 'src')
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import RandomizedSearchCV, StratifiedKFold

import train_models as tm

X = np.random.rand(60, 4)
y = (X[:, 0] > 0.5).astype(int)
search = RandomizedSearchCV(
    LogisticRegression(max_iter=200),
    param_distributions={'C': [0.1, 1.0, 10.0]},
    n_iter=2, cv=StratifiedKFold(n_splits=2), scoring='roc_auc', random_state=42,
).fit(X, y)
tm._log_run('smoketest', search, {'test_metric': 0.5})
print('OK: run logueada')
"
```

Expected: imprime `OK: run logueada` sin errores.

```bash
ls ai-service/mlruns
```

Expected: aparece al menos un directorio nuevo (el experimento `modelo_smoketest`, con un id numérico como nombre) — señal de que MLflow escribió el tracking store local. Esta corrida de prueba queda en `mlruns/`, que está gitignorado — no hace falta limpiarla.

- [ ] **Step 5: Commit**

```bash
git add ai-service/src/train_models.py
git commit -m "feat(ai-service): agregar tracking de corridas con MLflow"
```

---

## Task 4: Migrar `entrenar_clasificador` (alumno, materia) a búsqueda + tracking

**Files:**
- Modify: `ai-service/src/train_models.py`

**Interfaces:**
- Consumes: `_run_search`, `_log_run`, `CV_FOLDS` (de Tasks 2-3)

- [ ] **Step 1: Agregar `accuracy_score` y `f1_score` a los imports de métricas**

Reemplazar:
```python
from sklearn.metrics import (
    classification_report, roc_auc_score,
    mean_absolute_error, r2_score,
)
```
Por:
```python
from sklearn.metrics import (
    classification_report, roc_auc_score, accuracy_score, f1_score,
    mean_absolute_error, r2_score,
)
```

- [ ] **Step 2: Reemplazar el cuerpo de `entrenar_clasificador`**

Reemplazar:
```python
def entrenar_clasificador(dataset: str):
    print(f"\n{'='*55}")
    print(f"  Entrenando clasificador: {dataset.upper()}")
    print(f"{'='*55}")

    X_train, X_test, y_train, y_test = ft_engineering_procesado(dataset)

    # Compensar desbalance de clases con sample_weight
    sample_weights = compute_sample_weight("balanced", y_train)

    clf = GradientBoostingClassifier(
        n_estimators=200,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        random_state=42,
    )
    clf.fit(X_train, y_train, sample_weight=sample_weights)

    y_pred = clf.predict(X_test)
    y_prob = clf.predict_proba(X_test)[:, 1]

    print(f"\n  Metricas en test:")
    print(classification_report(y_test, y_pred, zero_division=0))
    try:
        print(f"  ROC-AUC: {roc_auc_score(y_test, y_prob):.4f}")
    except Exception:
        pass

    model_path = os.path.join(MODELS_DIR, f"modelo_{dataset}.pkl")
    joblib.dump(clf, model_path)
    print(f"  Modelo guardado: {model_path}")

    pd.DataFrame(X_test).to_csv(os.path.join(TEST_DIR, f"X_test_{dataset}.csv"), index=False)
    pd.Series(y_test, name=y_test.name).to_csv(os.path.join(TEST_DIR, f"y_test_{dataset}.csv"), index=False)
    print(f"  Test set guardado en {TEST_DIR}")
```
Por:
```python
def entrenar_clasificador(dataset: str):
    print(f"\n{'='*55}")
    print(f"  Entrenando clasificador: {dataset.upper()}")
    print(f"{'='*55}")

    X_train, X_test, y_train, y_test = ft_engineering_procesado(dataset)

    # Compensar desbalance de clases con sample_weight
    sample_weights = compute_sample_weight("balanced", y_train)

    cv = StratifiedKFold(n_splits=CV_FOLDS, shuffle=True, random_state=42)
    search = _run_search(
        GradientBoostingClassifier(random_state=42),
        X_train, y_train,
        cv=cv,
        scoring="roc_auc",
        fit_params={"sample_weight": sample_weights},
    )
    clf = search.best_estimator_

    y_pred = clf.predict(X_test)
    y_prob = clf.predict_proba(X_test)[:, 1]

    print(f"\n  Mejores hiperparametros: {search.best_params_}")
    print(f"  CV ROC-AUC (best): {search.best_score_:.4f}")
    report = classification_report(y_test, y_pred, zero_division=0)
    print(f"\n  Metricas en test:")
    print(report)
    test_auc = None
    try:
        test_auc = roc_auc_score(y_test, y_prob)
        print(f"  ROC-AUC: {test_auc:.4f}")
    except Exception:
        pass

    model_path = os.path.join(MODELS_DIR, f"modelo_{dataset}.pkl")
    joblib.dump(clf, model_path)
    print(f"  Modelo guardado: {model_path}")

    pd.DataFrame(X_test).to_csv(os.path.join(TEST_DIR, f"X_test_{dataset}.csv"), index=False)
    pd.Series(y_test, name=y_test.name).to_csv(os.path.join(TEST_DIR, f"y_test_{dataset}.csv"), index=False)
    print(f"  Test set guardado en {TEST_DIR}")

    metrics = {
        "test_accuracy": accuracy_score(y_test, y_pred),
        "test_f1": f1_score(y_test, y_pred, zero_division=0),
    }
    if test_auc is not None:
        metrics["test_roc_auc"] = test_auc
    _log_run(dataset, search, metrics, report_text=report)
```

- [ ] **Step 3: Verificar corriendo el entrenamiento real de `alumno` (dataset chico, corre en segundos/minutos)**

```bash
cd ai-service
python -c "
import sys; sys.path.insert(0, 'src')
from train_models import entrenar_clasificador
entrenar_clasificador('alumno')
"
```

Expected: imprime `Mejores hiperparametros: {...}`, `CV ROC-AUC (best): 0.xxxx`, el `classification_report`, `ROC-AUC: 0.xxxx`, `Modelo guardado: .../modelo_alumno.pkl` y `Test set guardado en ...`. Sin errores ni tracebacks.

- [ ] **Step 4: Verificar que la corrida quedó logueada en MLflow**

```bash
python -c "
import mlflow
mlflow.set_tracking_uri('file:./mlruns')
exp = mlflow.get_experiment_by_name('modelo_alumno')
runs = mlflow.search_runs(experiment_ids=[exp.experiment_id])
print(len(runs), 'corridas')
print(runs[['metrics.test_roc_auc', 'metrics.test_accuracy', 'metrics.test_f1']].to_string())
"
```

Expected: al menos 1 corrida, con las 3 columnas de métricas con valores numéricos (no `NaN`).

- [ ] **Step 5: Commit**

```bash
git add ai-service/src/train_models.py ai-service/src/models/models-trained/modelo_alumno.pkl ai-service/src/models/dataset-test/
git commit -m "feat(ai-service): migrar entrenar_clasificador a RandomizedSearchCV + MLflow"
```

---

## Task 5: Migrar `entrenar_regresor` (examen) a búsqueda + tracking

**Files:**
- Modify: `ai-service/src/train_models.py`

**Interfaces:**
- Consumes: `_run_search`, `_log_run`, `CV_FOLDS` (de Tasks 2-3)

- [ ] **Step 1: Reemplazar el cuerpo de `entrenar_regresor`**

Reemplazar:
```python
def entrenar_regresor(dataset: str):
    print(f"\n{'='*55}")
    print(f"  Entrenando regresor: {dataset.upper()}")
    print(f"{'='*55}")

    X_train, X_test, y_train, y_test = ft_engineering_procesado(dataset)

    reg = GradientBoostingRegressor(
        n_estimators=200,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        random_state=42,
    )
    reg.fit(X_train, y_train)

    y_pred = reg.predict(X_test)

    print(f"\n  Metricas en test:")
    print(f"  MAE  : {mean_absolute_error(y_test, y_pred):.4f}")
    print(f"  R2   : {r2_score(y_test, y_pred):.4f}")

    model_path = os.path.join(MODELS_DIR, f"modelo_{dataset}.pkl")
    joblib.dump(reg, model_path)
    print(f"  Modelo guardado: {model_path}")

    pd.DataFrame(X_test).to_csv(os.path.join(TEST_DIR, f"X_test_{dataset}.csv"), index=False)
    pd.Series(y_test, name=y_test.name).to_csv(os.path.join(TEST_DIR, f"y_test_{dataset}.csv"), index=False)
    print(f"  Test set guardado en {TEST_DIR}")
```
Por:
```python
def entrenar_regresor(dataset: str):
    print(f"\n{'='*55}")
    print(f"  Entrenando regresor: {dataset.upper()}")
    print(f"{'='*55}")

    X_train, X_test, y_train, y_test = ft_engineering_procesado(dataset)

    cv = KFold(n_splits=CV_FOLDS, shuffle=True, random_state=42)
    search = _run_search(
        GradientBoostingRegressor(random_state=42),
        X_train, y_train,
        cv=cv,
        scoring="r2",
    )
    reg = search.best_estimator_

    y_pred = reg.predict(X_test)
    test_mae = mean_absolute_error(y_test, y_pred)
    test_r2 = r2_score(y_test, y_pred)

    print(f"\n  Mejores hiperparametros: {search.best_params_}")
    print(f"  CV R2 (best): {search.best_score_:.4f}")
    print(f"\n  Metricas en test:")
    print(f"  MAE  : {test_mae:.4f}")
    print(f"  R2   : {test_r2:.4f}")

    model_path = os.path.join(MODELS_DIR, f"modelo_{dataset}.pkl")
    joblib.dump(reg, model_path)
    print(f"  Modelo guardado: {model_path}")

    pd.DataFrame(X_test).to_csv(os.path.join(TEST_DIR, f"X_test_{dataset}.csv"), index=False)
    pd.Series(y_test, name=y_test.name).to_csv(os.path.join(TEST_DIR, f"y_test_{dataset}.csv"), index=False)
    print(f"  Test set guardado en {TEST_DIR}")

    _log_run(dataset, search, {"test_mae": test_mae, "test_r2": test_r2})
```

- [ ] **Step 2: Verificar con un presupuesto reducido (el dataset de examen es grande — `n_iter=25, cv=5` reales tardan varios minutos, se corren completos recién en Task 6)**

```bash
cd ai-service
python -c "
import sys; sys.path.insert(0, 'src')
import train_models as tm
tm.N_ITER = 3
tm.CV_FOLDS = 2
tm.entrenar_regresor('examen')
"
```

Expected: termina en uno o dos minutos, imprime `Mejores hiperparametros: {...}`, `CV R2 (best): ...`, `MAE`, `R2`, `Modelo guardado: .../modelo_examen.pkl`, sin errores. `modelo_examen.pkl` queda temporalmente con un modelo de baja calidad (presupuesto de búsqueda reducido) — se sobreescribe con el entrenamiento real en Task 6, no hace falta revertir nada acá.

- [ ] **Step 3: Verificar que la corrida quedó logueada en MLflow**

```bash
python -c "
import mlflow
mlflow.set_tracking_uri('file:./mlruns')
exp = mlflow.get_experiment_by_name('modelo_examen')
runs = mlflow.search_runs(experiment_ids=[exp.experiment_id])
print(len(runs), 'corridas')
print(runs[['metrics.test_mae', 'metrics.test_r2']].to_string())
"
```

Expected: al menos 1 corrida, con `test_mae` y `test_r2` numéricos.

- [ ] **Step 4: Commit**

```bash
git add ai-service/src/train_models.py
git commit -m "feat(ai-service): migrar entrenar_regresor a RandomizedSearchCV + MLflow"
```

No se commitea `modelo_examen.pkl` en este paso — quedó entrenado con el presupuesto reducido del smoke test del Step 2. Task 6 lo re-entrena con el presupuesto real y ahí sí se commitea.

---

## Task 6: Correr el pipeline completo y revisar resultados en MLflow

**Files:**
- Regenerated: `ai-service/src/models/models-trained/modelo_alumno.pkl`, `modelo_materia.pkl`, `modelo_examen.pkl`
- Regenerated: `ai-service/src/models/dataset-test/*.csv`

- [ ] **Step 1: Correr el script completo con el presupuesto real**

```bash
cd ai-service
python src/train_models.py
```

Expected: corre `entrenar_clasificador("alumno")`, `entrenar_clasificador("materia")` y `entrenar_regresor("examen")` en secuencia, cada uno imprimiendo mejores hiperparámetros, CV score y métricas en test, y termina con `Todos los modelos entrenados y guardados correctamente.`

**Nota de tiempo:** con `n_iter=25` y `cv=5` reales, el dataset de `examen` (el más grande) puede tardar entre 10 y 30 minutos dependiendo del hardware. Es un paso manual y offline — no bloquea nada más mientras corre.

- [ ] **Step 2: Verificar que los 3 `.pkl` se actualizaron**

```bash
ls -la src/models/models-trained/
```

Expected: fecha de modificación reciente (de ahora) en `modelo_alumno.pkl`, `modelo_materia.pkl` y `modelo_examen.pkl`.

- [ ] **Step 3: Revisar las corridas en MLflow UI y anotar los resultados finales**

```bash
mlflow ui --backend-store-uri file:./mlruns
```

Abrir `http://localhost:5000`. Deberían aparecer los experimentos `modelo_alumno`, `modelo_materia` y `modelo_examen` (más `modelo_smoketest` de Task 3, que se puede ignorar o borrar desde la UI). Para cada uno de los 3 experimentos reales, entrar a la corrida más reciente y anotar:

- Los `Parameters` (hiperparámetros ganadores)
- `cv_best_score`
- Las métricas de test (`test_roc_auc`, `test_accuracy`, `test_f1` para alumno/materia; `test_mae`, `test_r2` para examen)

Guardar esta información — se usa en los Tasks 7 y 8. Detener el servidor con `Ctrl+C` cuando termines.

- [ ] **Step 4: Commit de los modelos y test sets regenerados**

```bash
cd ..   # volver a la raíz del proyecto
git add ai-service/src/models/models-trained/ ai-service/src/models/dataset-test/
git commit -m "chore(ai-service): reentrenar modelos con hiperparametros de RandomizedSearchCV"
```

---

## Task 7: Reescribir `ai-service/docs/Train_models.md`

**Files:**
- Modify: `ai-service/docs/Train_models.md` (reescritura completa — la versión actual describe `alumno_training.py`, `train_all_models.py` y otros archivos que no existen)

**Interfaces:**
- Consumes: los valores anotados en Task 6, Step 3

- [ ] **Step 1: Reemplazar todo el contenido del archivo**

Reemplazar todo `ai-service/docs/Train_models.md` por:

```markdown
# Entrenamiento de modelos

Script único de entrenamiento: `ai-service/src/train_models.py`.

## Modelos

| Modelo | Tipo | Target | Dataset |
|---|---|---|---|
| `modelo_alumno.pkl` | Clasificación binaria (`GradientBoostingClassifier`) | Abandona | alumno |
| `modelo_materia.pkl` | Clasificación binaria (`GradientBoostingClassifier`) | Recursa | materia |
| `modelo_examen.pkl` | Regresión (`GradientBoostingRegressor`) | Nota (0-10) | examen |

## Cómo entrenar

Desde `ai-service/`, con el venv activado:

```bash
python src/train_models.py
```

Entrena los 3 modelos en secuencia. Guarda:
- Los artefactos en `src/models/models-trained/modelo_*.pkl`
- Los test sets usados para evaluación en `src/models/dataset-test/`

## Búsqueda de hiperparámetros

Cada modelo se entrena con `RandomizedSearchCV` (scikit-learn), 5-fold cross-validation, 25 combinaciones aleatorias por modelo:

- Clasificadores (`alumno`, `materia`): `StratifiedKFold(5)`, `scoring="roc_auc"`, balanceo de clases con `sample_weight` vía `compute_sample_weight("balanced", ...)`
- Regresor (`examen`): `KFold(5)`, `scoring="r2"`

Espacio de búsqueda (compartido entre clasificadores y regresor — ambos son `GradientBoosting*` y comparten la misma superficie de hiperparámetros relevante):

```python
PARAM_DIST = {
    "n_estimators": randint(100, 400),
    "max_depth": randint(2, 6),
    "learning_rate": loguniform(0.01, 0.2),
    "subsample": uniform(0.6, 0.4),
    "min_samples_leaf": randint(1, 50),
    "max_features": ["sqrt", "log2", None],
}
```

## Tracking con MLflow

Cada corrida se loguea localmente en `ai-service/mlruns/` (no versionado en git — regenerable corriendo el script). Un experimento por modelo: `modelo_alumno`, `modelo_materia`, `modelo_examen`.

Para inspeccionar las corridas:

```bash
cd ai-service
mlflow ui --backend-store-uri file:./mlruns
```

## Resultados (última corrida)

<!-- Completar con los valores anotados en Task 6, Step 3 del plan de implementación -->

| Modelo | Mejores hiperparámetros | CV score (best, 5-fold) | Métricas en test |
|---|---|---|---|
| alumno | *(pegar `Parameters` de la corrida)* | ROC-AUC *(pegar `cv_best_score`)* | ROC-AUC *(test_roc_auc)* · F1 *(test_f1)* · Accuracy *(test_accuracy)* |
| materia | *(pegar `Parameters` de la corrida)* | ROC-AUC *(pegar `cv_best_score`)* | ROC-AUC *(test_roc_auc)* · F1 *(test_f1)* · Accuracy *(test_accuracy)* |
| examen | *(pegar `Parameters` de la corrida)* | R² *(pegar `cv_best_score`)* | MAE *(test_mae)* · R² *(test_r2)* |
```

- [ ] **Step 2: Completar la tabla de resultados con los valores anotados en Task 6**

Reemplazar cada `*(...)*` de la tabla por el valor real correspondiente (hiperparámetros y métricas que anotaste en Task 6, Step 3). El comentario HTML (`<!-- Completar... -->`) se borra una vez completada la tabla.

- [ ] **Step 3: Commit**

```bash
git add ai-service/docs/Train_models.md
git commit -m "docs(ai-service): documentar busqueda de hiperparametros y resultados de MLflow"
```

---

## Task 8: Actualizar README.md raíz

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: las métricas finales del modelo `examen` anotadas en Task 6, Step 3 (para decidir si la tabla de métricas cambia)

- [ ] **Step 1: Agregar una línea sobre tuning + MLflow en "Capa de IA"**

Reemplazar:
```markdown
### Capa de IA
- **3 modelos** de scikit-learn (GradientBoosting) entrenados para: riesgo de abandono, riesgo de recursada y nota estimada de examen
- **Explicabilidad con SHAP**: cada predicción muestra qué variables la explican y en qué dirección, no es una caja negra
- **Sugerencias accionables generadas con Gemini** a partir de la predicción y el contexto del alumno (ver captura arriba)
- API de predicciones desacoplada (FastAPI), consumida por el backend vía HTTP — se puede reemplazar o escalar sin tocar el resto del sistema
```
Por:
```markdown
### Capa de IA
- **3 modelos** de scikit-learn (GradientBoosting) entrenados para: riesgo de abandono, riesgo de recursada y nota estimada de examen
- **Hiperparámetros ajustados con RandomizedSearchCV** (5-fold cross-validation) y tracking de cada corrida con **MLflow**
- **Explicabilidad con SHAP**: cada predicción muestra qué variables la explican y en qué dirección, no es una caja negra
- **Sugerencias accionables generadas con Gemini** a partir de la predicción y el contexto del alumno (ver captura arriba)
- API de predicciones desacoplada (FastAPI), consumida por el backend vía HTTP — se puede reemplazar o escalar sin tocar el resto del sistema
```

- [ ] **Step 2: Agregar MLflow al stack tecnológico**

Reemplazar:
```markdown
- **AI Service**: Python, FastAPI, scikit-learn, SHAP, Streamlit (exploración local)
```
Por:
```markdown
- **AI Service**: Python, FastAPI, scikit-learn, SHAP, MLflow, Streamlit (exploración local)
```

- [ ] **Step 3: Comparar las métricas nuevas contra la tabla actual y actualizar si mejoraron**

Tabla actual en `README.md`:
```markdown
| Modelo | Tipo | n (test) | Métricas |
|---|---|---|---|
| Abandono de carrera | Clasificación binaria | 200 | ROC-AUC **0.916** · F1 **0.83** · Accuracy 81.5% |
| Recursada de materia | Clasificación binaria | 6.900 | ROC-AUC **0.908** · F1 **0.79** · Accuracy 88.1% |
| Nota de examen | Regresión (escala 0-10) | 15.740 | R² **0.512** · MAE **1.25** |
```

Comparar cada métrica con los valores `test_roc_auc`/`test_f1`/`test_accuracy` (alumno, materia) y `test_r2`/`test_mae` (examen) anotados en Task 6, Step 3:

- Si **mejoraron** (en particular el R² de examen, que era el objetivo principal de este cambio): reemplazar los números en negrita de la tabla por los nuevos valores.
- Si quedaron **iguales o peores**: dejar la tabla como está y no mencionar números nuevos en el README — el valor del cambio para el README pasa a ser únicamente la línea de "búsqueda con validación cruzada + MLflow" del Step 1, no una mejora de métricas.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: mencionar RandomizedSearchCV + MLflow en el README"
```

---

## Notas

- Los smoke tests de Tasks 3-5 quedan logueados en `ai-service/mlruns/` junto a las corridas reales — no importa, `mlruns/` está gitignorado. Se pueden borrar experimentos de prueba desde la MLflow UI si molestan visualmente, pero no es necesario.
- Si al reentrenar con presupuesto real (Task 6) alguna métrica empeora respecto a los valores fijos originales, no es necesariamente un bug: `RandomizedSearchCV` explora un espacio más amplio pero no garantiza superar cualquier configuración fija en cada corrida. Si eso pasa con los 3 modelos a la vez, revisar que `PARAM_DIST` no esté demasiado sesgado hacia modelos más simples de lo que conviene (por ejemplo `max_depth` con techo muy bajo) antes de asumir que el approach no sirve.
