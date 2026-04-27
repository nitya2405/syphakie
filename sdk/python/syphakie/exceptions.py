class SyphaKieError(Exception):
    def __init__(self, message: str, status: int | None = None, code: str | None = None):
        super().__init__(message)
        self.status = status
        self.code = code


class AuthError(SyphaKieError):
    pass


class CreditError(SyphaKieError):
    pass


class ModelNotFoundError(SyphaKieError):
    pass
