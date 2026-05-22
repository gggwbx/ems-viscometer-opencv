import numpy as np
from scipy.optimize import curve_fit
from typing import Callable


def _linear(x, a, b):
    return a * x + b


def _linear_zero(x, k):
    return k * x


def _quadratic(x, a, b, c):
    return a * x * x + b * x + c


def _exponential(x, a, b):
    return a * np.exp(b * x)


def _logarithmic(x, a, b):
    return a * np.log(x) + b


def _reciprocal(x, a, b):
    return a / x + b


MODELS = {
    "linear": (_linear, "ax + b", "y = a x + b", ["a", "b"], [1.0, 0.0]),
    "linear_zero": (_linear_zero, "kx", "y = k x", ["k"], [1.0]),
    "quadratic": (_quadratic, "ax² + bx + c", "y = a x^2 + b x + c", ["a", "b", "c"], [0.0, 1.0, 0.0]),
    "exponential": (_exponential, "a·exp(bx)", "y = a e^{b x}", ["a", "b"], [1.0, 0.1]),
    "logarithmic": (_logarithmic, "a·ln(x) + b", "y = a \\ln(x) + b", ["a", "b"], [1.0, 0.0]),
    "reciprocal": (_reciprocal, "k/x + b", "y = \\frac{k}{x} + b", ["a", "b"], [1.0, 0.0]),
}


def do_fit(x_data: list[float], y_data: list[float], model: str) -> dict:
    if model not in MODELS:
        return {"error": f"Unknown model: {model}"}

    x_arr = np.array(x_data, dtype=np.float64)
    y_arr = np.array(y_data, dtype=np.float64)

    fn, formula, formula_latex, param_names, initial_guess = MODELS[model]

    # Filter out invalid points
    if model == "logarithmic":
        mask = x_arr > 0
        x_arr = x_arr[mask]
        y_arr = y_arr[mask]
    if model == "reciprocal":
        mask = x_arr != 0
        x_arr = x_arr[mask]
        y_arr = y_arr[mask]

    if len(x_arr) < len(param_names) + 1:
        return {"error": "Not enough data points for this model"}

    try:
        popt, pcov = curve_fit(fn, x_arr, y_arr, p0=initial_guess, maxfev=10000)
        residuals = y_arr - fn(x_arr, *popt)
        ss_res = np.sum(residuals ** 2)
        ss_tot = np.sum((y_arr - np.mean(y_arr)) ** 2)
        r_squared = 1 - ss_res / ss_tot if ss_tot > 0 else 0
        rmse = np.sqrt(np.mean(residuals ** 2))

        std_errs = np.sqrt(np.diag(pcov)) if pcov is not None else [None] * len(popt)

        x_fit = np.linspace(x_arr.min(), x_arr.max(), 200)
        y_fit = fn(x_fit, *popt)

        params = []
        for name, val, err in zip(param_names, popt, std_errs):
            params.append({
                "name": name,
                "value": round(float(val), 6),
                "std_err": round(float(err), 6) if err is not None else None,
            })

        return {
            "model": model,
            "formula": formula,
            "formula_latex": formula_latex,
            "params": params,
            "r_squared": round(float(r_squared), 6),
            "rmse": round(float(rmse), 6),
            "fit_x": [round(float(v), 4) for v in x_fit],
            "fit_y": [round(float(v), 4) for v in y_fit],
        }
    except Exception as e:
        return {"error": f"Fitting failed: {str(e)}"}
