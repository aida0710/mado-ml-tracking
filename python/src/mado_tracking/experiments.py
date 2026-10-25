"""名前で探す実験と、新しいRunがどの実験に入るか。

名前での実験の選び方はMLflowの``set_experiment``に従う。その名前の実験を使い、まだ無ければ作る。
``Client.ensure_model``も同じやり方で、名前で登録モデルを使い回すか作る。
"""

from __future__ import annotations

import os
from typing import TYPE_CHECKING, Any

from .errors import ApiError, ConfigurationError
from .names import trim_name

if TYPE_CHECKING:
    from .client import Client

# JobのRunではworkerが設定する。シェルから1つの実験に記録する人も設定する。
EXPERIMENT_ID_VARIABLE = "MMT_EXPERIMENT_ID"


def find_experiment(client: Client, project_id: str, *, name: str) -> dict[str, Any] | None:
    """名前がちょうど``name``である、有効な実験。無ければNone。

    画面の一覧と同じく、削除された（MLflowで論理削除された）実験は含めない。
    """
    experiments = client.list_project_items(project_id, "experiments")
    return next((experiment for experiment in experiments if experiment.get("name") == name), None)


def ensure_experiment(client: Client, project_id: str, *, name: str, description: str = "") -> dict[str, Any]:
    """``name``という名前の実験を返す。無ければ作る。

    APIが名前を保存・比較するときと同じく、両端の空白を先に取り除く。検索とPOSTの間に別の作成者が
    先に作ることがあり、そのときは409を受けて、作られた実験を読んで解決する。削除された実験も
    名前を持ち続けるので、黙って置き換えずに報告する。
    """
    name = trim_name(name)
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
    """新しいRunが入る実験。渡されたID、名前で指定したもの（無ければ作る）、または
    MMT_EXPERIMENT_ID。引数が環境変数より優先するので、workerのJobの中でも、コードに書いた名前を
    使う。JobのMMT_EXPERIMENT_IDはJob自身の実験を指す。
    """
    validate_experiment_choice(experiment_id, experiment_name)
    if experiment_name is not None:
        experiment: dict[str, Any] = ensure_experiment(client, project_id, name=experiment_name)
        return str(experiment["id"])
    return experiment_id or os.environ.get(EXPERIMENT_ID_VARIABLE)
