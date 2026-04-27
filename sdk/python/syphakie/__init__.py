"""SyphaKie Python SDK — AI aggregator client."""
from .client import SyphaKie
from .exceptions import SyphaKieError, AuthError, CreditError, ModelNotFoundError

__all__ = ["SyphaKie", "SyphaKieError", "AuthError", "CreditError", "ModelNotFoundError"]
__version__ = "0.1.0"
