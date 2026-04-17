class RoutingConfig:
    DEFAULT_MODE = "manual"

    AUTO_WEIGHTS = {
        "cost": 0.4,
        "latency": 0.4,
        "quality": 0.2,
    }

    # Providers never used in auto mode
    BLACKLISTED_PROVIDERS: list[str] = []

    # Force a specific provider for a modality in auto mode
    # e.g. {"image": "openai"} forces openai for all auto image requests
    PREFERRED_PROVIDER: dict[str, str] = {}
