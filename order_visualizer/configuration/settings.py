"""The viewer's own settings, read from ORDER_VISUALIZER_* environment variables.

The values come from the process environment first and then from the `.env` file in the working directory. `bin/order-visualizer` changes into the project directory before starting, so the relative paths below resolve against the project root.

Typical usage example:

  settings = Settings()
  settings.require_security_values()
"""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """The viewer's settings.

    Attributes:
        host: The address the web server listens on.
        port: The port the web server listens on.
        password_hash: The argon2 hash of the viewer password, produced by bin/set-password.
        session_secret: The secret that signs the session cookie.
        session_max_age_seconds: How long a login lasts, in seconds.
        unified_broker_interface_directory: The directory of the unified_broker_interface project.
        database_username: The read-only database role the viewer logs in as.
        database_password: The password of the read-only database role, produced by bin/create-reader-role.
        poll_interval_seconds: How often the viewer asks the event table for new rows.
        lookback_hours: How many hours of orders are loaded when the viewer starts.
        frontend_directory: The directory holding the built React application.
    """

    model_config = SettingsConfigDict(
        env_prefix='ORDER_VISUALIZER_',
        env_file='.env',
        extra='ignore',
    )

    host: str = '0.0.0.0'
    port: int = 8105
    password_hash: str = ''
    session_secret: str = ''
    session_max_age_seconds: int = 43200
    unified_broker_interface_directory: Path = Path(
        '/home/pramod/Projects/unified_broker_interface'
    )
    database_username: str = 'order_visualizer_reader'
    database_password: str = ''
    poll_interval_seconds: float = 2.0
    lookback_hours: float = 72.0
    frontend_directory: Path = Path('frontend/dist')

    def require_security_values(self) -> None:
        """Checks that the password hash, session secret and database password are set.

        Raises:
            ValueError: One of the three values is empty.
        """
        if not self.password_hash:
            raise ValueError('ORDER_VISUALIZER_PASSWORD_HASH is empty; run bin/set-password and add the hash to .env.')
        if not self.session_secret:
            raise ValueError('ORDER_VISUALIZER_SESSION_SECRET is empty; run bin/set-password and add the secret to .env.')
        if not self.database_password:
            raise ValueError('ORDER_VISUALIZER_DATABASE_PASSWORD is empty; run bin/create-reader-role and add the password to .env.')
