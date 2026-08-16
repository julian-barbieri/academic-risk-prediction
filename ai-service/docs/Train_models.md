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

Para inspeccionar las corridas (MLflow 3.x requiere `MLFLOW_ALLOW_FILE_STORE`):

**bash:**
```bash
cd ai-service
MLFLOW_ALLOW_FILE_STORE=true mlflow ui --backend-store-uri file:./mlruns
```

**PowerShell:**
```powershell
cd ai-service
$env:MLFLOW_ALLOW_FILE_STORE="true"; mlflow ui --backend-store-uri file:./mlruns
```

## Resultados (última corrida)

| Modelo | Mejores hiperparámetros | CV score (best, 5-fold) | Métricas en test |
|---|---|---|---|
| alumno | `n_estimators=187, max_depth=4, learning_rate=0.015958, subsample=0.733483, min_samples_leaf=11, max_features=None` | ROC-AUC **0.896132** | ROC-AUC **0.919078** · F1 **0.840183** · Accuracy **0.825** |
| materia | `n_estimators=164, max_depth=2, learning_rate=0.022860, subsample=0.606255, min_samples_leaf=45, max_features=None` | ROC-AUC **0.909022** | ROC-AUC **0.911120** · F1 **0.784324** · Accuracy **0.879565** |
| examen | `n_estimators=286, max_depth=5, learning_rate=0.096160, subsample=0.877914, min_samples_leaf=32, max_features='sqrt'` | R² **0.529781** | MAE **1.233140** · R² **0.521627** |
