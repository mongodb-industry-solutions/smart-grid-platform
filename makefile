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

# Generate the operational dataset and load it into Atlas (reads MONGODB_URI/DATABASE_NAME from frontend/.env.local).
seed_data:
	cd backend && uv run scripts/data_pipeline/pipeline.py && uv run scripts/data_pipeline/load_to_mongo.py

# Sanity-check the seeded data.
check_seed:
	cd backend && uv run scripts/data_pipeline/check_seed.py

# Stream live readings on top of the seeded history (Ctrl+C to stop).
feeder:
	cd backend && uv run scripts/data_pipeline/feeder.py