from fastapi import HTTPException


class InvalidAPIKeyError(HTTPException):
    def __init__(self):
        super().__init__(status_code=401, detail={
            "code": "INVALID_API_KEY",
            "message": "API key is missing, invalid, or inactive.",
        })


class InsufficientCreditsError(HTTPException):
    def __init__(self, balance: int, required: int):
        super().__init__(status_code=402, detail={
            "code": "INSUFFICIENT_CREDITS",
            "message": f"Insufficient credits. Balance: {balance}, required: {required}.",
        })


class ModelNotFoundError(HTTPException):
    def __init__(self, model_id: str):
        super().__init__(status_code=404, detail={
            "code": "MODEL_NOT_FOUND",
            "message": f"Model '{model_id}' not found or is inactive.",
        })


class ProviderError(HTTPException):
    def __init__(self, provider: str, detail: str):
        super().__init__(status_code=502, detail={
            "code": "PROVIDER_ERROR",
            "message": f"Provider '{provider}' returned an error: {detail}",
        })


class ForbiddenError(HTTPException):
    def __init__(self):
        super().__init__(status_code=403, detail={
            "code": "FORBIDDEN",
            "message": "You do not have permission to perform this action.",
        })
