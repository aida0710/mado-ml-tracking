"""Experiments looked up by name, and which Experiment a new Run goes into.

Choosing an Experiment by name follows MLflow's ``set_experiment``: the Experiment with that name
is used, and created when it does not exist yet. ``Client.ensure_model`` reuses or creates a Model
by name the same way.
"""

from __future__ import annotations

import os
from typing import TYPE_CHECKING, Any

from .errors import ApiError, ConfigurationError

if TYPE_CHECKING:
    from .client import Client

# Set by the worker for a Job's Run, and by people who record into one Experiment from a shell.
EXPERIMENT_ID_VARIABLE = "MMT_EXPERIMENT_ID"
# What the API strips from both ends of a name before saving and comparing it (zod's .trim(), that
# is JavaScript's String.prototype.trim): its white space and line terminators. Python's own
# str.strip() differs at the edges (it keeps U+FEFF and also strips U+001C-U+001F and U+0085).
API_TRIMMED_CHARACTERS = (
    "\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a"
    "\u2028\u2029\u202f\u205f\u3000\ufeff"
)


def find_experiment(client: Client, project_id: str, *, name: str) -> dict[str, Any] | None:
    """The active Experiment named exactly ``name``, or None.

    Deleted (MLflow soft-deleted) Experiments are not listed, as in the Web list.
    """
    experiments = client.list_project_items(project_id, "experiments")
    return next((experiment for experiment in experiments if experiment.get("name") == name), None)


def ensure_experiment(client: Client, project_id: str, *, name: str, description: str = "") -> dict[str, Any]:
    """Return the Experiment named ``name``, creating it when absent.

    White space at either end is dropped first, as the API does when it saves and compares names;
    otherwise ``"exp "`` would be created as ``"exp"`` and never found again by its own name.
    A concurrent creator can win between the lookup and the POST; the 409 is then resolved by
    reading the Experiment it created. A deleted Experiment keeps its name, so it is reported
    instead of being silently replaced.
    """
    name = name.strip(API_TRIMMED_CHARACTERS)
    if not name:
        raise ConfigurationError("experiment_name must not be empty")
    experiment = find_experiment(client, project_id, name=name)
    if experiment is not None:
        return experiment
    try:
        return client.create_experiment(project_id, name=name, description=description)
    except ApiError as error:
        if error.status_code != 409:
            raise
    experiment = find_experiment(client, project_id, name=name)
    if experiment is None:
        raise ConfigurationError(
            f"Experiment {name!r} exists but is deleted; restore it or use another experiment_name"
        )
    return experiment


def validate_experiment_choice(experiment_id: str | None, experiment_name: str | None) -> None:
    if experiment_id and experiment_name is not None:
        raise ConfigurationError("Specify either experiment_id or experiment_name, not both")


def experiment_id_for_new_run(
    client: Client,
    project_id: str,
    *,
    experiment_id: str | None,
    experiment_name: str | None,
) -> str | None:
    """The Experiment a new Run goes into: the given ID, the one named (created when absent), or
    MMT_EXPERIMENT_ID. An argument wins over the environment, so a name in the code is used even
    inside a worker Job, whose MMT_EXPERIMENT_ID is the Job's own Experiment.
    """
    validate_experiment_choice(experiment_id, experiment_name)
    if experiment_name is not None:
        experiment: dict[str, Any] = ensure_experiment(client, project_id, name=experiment_name)
        return str(experiment["id"])
    return experiment_id or os.environ.get(EXPERIMENT_ID_VARIABLE)
