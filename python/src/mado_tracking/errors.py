"""エラーは無害化した診断情報を持ち、HTTPリクエストの認証情報は決して含めない。"""


class ConfigurationError(ValueError):
    """SDK・workerに必要な設定が無いか、安全でない。"""


class ApiError(RuntimeError):
    def __init__(self, message: str, *, status_code: int | None = None, code: str | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.code = code


class LeaseRejected(ApiError):
    """APIが所有を拒んだ。Jobを始めることも変更することも許されない。"""


class TransportError(RuntimeError):
    """transportの操作が失敗した。既存のリモートのプロセスはまだ動いているかもしれない。"""
