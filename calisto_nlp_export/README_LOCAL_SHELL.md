# Local Rasa Shell Quick Start

Use this when you want to run the Calisto bot locally without repeating the full recovery flow.

## One command

From `calisto_nlp_export/` run:

```bash
./scripts/run_local_rasa_shell.sh
```

What the script does:

1. Creates a temporary Python 3.10 environment outside the repo if needed.
2. Installs the exact Rasa and Hugging Face package versions that work with this project.
3. Starts the action server on port `5055` if one is not already running.
4. Finds the newest trained model under `models/*.tar.gz`.
5. Launches `rasa shell` with the correct model and `endpoints.yml`.

## Requirements

- Python 3.10 must be available as `python3.10`, or you can point to it with:

```bash
export CALISTO_RASA_PYTHON=/full/path/to/python3.10
```

- PostgreSQL should already be running locally with the Calisto KB loaded.

Default DB settings used by the action server:

```bash
KB_DB_HOST=localhost
KB_DB_PORT=5432
KB_DB_NAME=calisto_kb
KB_DB_USER=calisto
KB_DB_PASSWORD=calisto
```

## Useful overrides

Use these only if you need to change the defaults:

```bash
export CALISTO_RASA_ENV_DIR=/tmp/calisto-rasa310
export CALISTO_SHELL_PORT=5006
export CALISTO_ACTION_PORT=5055
export CALISTO_ACTION_LOG=/tmp/calisto-action-server.log
```

Then run:

```bash
./scripts/run_local_rasa_shell.sh
```

## When it starts

You should eventually see:

```text
Bot loaded. Type a message and press enter (use '/stop' to exit):
```

Then type messages normally.

## Troubleshooting

If the action server fails to start, inspect:

```bash
cat /tmp/calisto-action-server.log
```

If no model exists yet, train one first:

```bash
/tmp/calisto-rasa310/bin/rasa train
```

If PostgreSQL is not reachable, export the correct `KB_DB_*` values before starting the script.