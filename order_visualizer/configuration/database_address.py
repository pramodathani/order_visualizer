"""Where UBI's TimescaleDB listens, read from UBI's own `.env` file.

Only the host, port and database name are taken from that file. UBI's own user name and password are never read, because the viewer logs in as its own read-only role.

Typical usage example:

  address = DatabaseAddress.load(directory)
  print(address.host, address.port)
"""

from pathlib import Path

from dotenv import dotenv_values

_PREFIX = 'UNIFIED_BROKER_INTERFACE_'


class DatabaseAddress:
    """The host, port and database name of UBI's TimescaleDB.

    Attributes:
        host: The database host.
        port: The database port.
        database: The database name.
    """

    def __init__(self, values: dict[str, str | None]):
        """Builds the address from the values of UBI's `.env` file.

        Args:
            values (dict[str, str | None]): The variables read from the file.

        Raises:
            ValueError: A required variable is missing or the port is not a whole number.
        """
        self._values = values
        self.host = self._required('POSTGRES_HOST')
        self.database = self._required('POSTGRES_DB')
        port_text = self._required('POSTGRES_PORT')
        try:
            self.port = int(port_text)
        except ValueError as error:
            raise ValueError(f'Not a whole number in the unified_broker_interface .env file: {_PREFIX}POSTGRES_PORT={port_text!r}') from error

    @classmethod
    def load(cls, project_directory: Path) -> DatabaseAddress:
        """Reads the address from UBI's `.env` file.

        Args:
            project_directory (Path): The unified_broker_interface project directory.

        Returns:
            DatabaseAddress: The address read from the file.

        Raises:
            FileNotFoundError: The project has no `.env` file.
            ValueError: A required variable is missing or the port is not a whole number.
        """
        environment_file = project_directory / '.env'
        if not environment_file.is_file():
            raise FileNotFoundError(f'No .env file in the unified_broker_interface directory: {environment_file}')
        return cls(dotenv_values(environment_file))

    def _required(self, name: str) -> str:
        """Reads a variable that must be present.

        Args:
            name (str): The variable name without the UNIFIED_BROKER_INTERFACE_ prefix.

        Returns:
            str: The value.

        Raises:
            ValueError: The variable is absent or empty.
        """
        value = self._values.get(_PREFIX + name)
        if not value:
            raise ValueError(f'Missing variable in the unified_broker_interface .env file: {_PREFIX + name}')
        return value
