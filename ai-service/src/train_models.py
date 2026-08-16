"""
Entrena los tres modelos del sistema academico y guarda los artefactos.

  modelo_alumno.pkl  -> GradientBoosting clasificador (target: Abandona)
  modelo_materia.pkl -> GradientBoosting clasificador (target: Recursa)
  modelo_examen.pkl  -> GradientBoosting regresor     (target: Nota)

Artefactos generados:
  src/models/models-trained/modelo_*.pkl
  src/models/dataset-test/X_test_*.csv / y_test_*.csv
"""

import os
import sys
import warnings

warnings.filterwarnings("ignore")

import joblib
import mlflow
import mlflow.sklearn
import numpy as np
import pandas as pd
from scipy.stats import randint, uniform, loguniform
from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor
from sklearn.model_selection import RandomizedSearchCV, StratifiedKFold, KFold
from sklearn.utils.class_weight import compute_sample_weight
from sklearn.metrics import (
    classification_report, roc_auc_score, accuracy_score, f1_score,
    mean_absolute_error, r2_score,
)

# Asegurar que el package feature_engineering sea importable
SRC_DIR    = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SRC_DIR)

from feature_engineering import ft_engineering_procesado

MODELS_DIR      = os.path.join(SRC_DIR, "models", "models-trained")
TEST_DIR        = os.path.join(SRC_DIR, "models", "dataset-test")
MLRUNS_DIR      = os.path.join(SRC_DIR, "..", "mlruns")

os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(TEST_DIR,   exist_ok=True)

# mlflow >=3.x pone el FileStore local en "maintenance mode" y exige este
# opt-in explicito para seguir usando './mlruns' como backend de tracking.
os.environ.setdefault("MLFLOW_ALLOW_FILE_STORE", "true")
mlflow.set_tracking_uri(f"file:{MLRUNS_DIR}")

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
        mlflow.sklearn.log_model(search.best_estimator_, name="model")
        if report_text:
            mlflow.log_text(report_text, "classification_report.txt")


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


if __name__ == "__main__":
    entrenar_clasificador("alumno")
    entrenar_clasificador("materia")
    entrenar_regresor("examen")

    print("\n\nTodos los modelos entrenados y guardados correctamente.")
