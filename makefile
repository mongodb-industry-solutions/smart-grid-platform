build:
	docker-compose up --build -d

start: 
	docker-compose start

stop:
	docker-compose stop

clean:
	docker-compose down --rmi all -v

install_uv:
	curl -LsSf https://astral.sh/uv/install.sh | sh

uv_init:
	cd backend && uv venv

uv_sync:
	cd backend && uv sync

uv_update:
	cd backend && uv lock --upgrade

# Export the operational collections into ./dump (maintainers only; needs cluster access).
dump_data:
	./scripts/dump-data.sh

# Restore the operational collections from ./dump into your own cluster.
restore_data:
	./scripts/restore-data.sh