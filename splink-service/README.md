# DATALINK Splink service

Standalone Splink 4 worker used by the Node DATALINK API.

Run locally:

    python -m venv .venv
    . .venv/bin/activate
    pip install -r requirements.txt
    uvicorn app:app --host 0.0.0.0 --port 8000

Docker:

    docker build -t datalink-splink .
    docker run --rm -p 8000:8000 datalink-splink

The Node API uses SPLINK_SERVICE_URL=http://localhost:8000.

Important: blocking fields are mandatory by design. Splink documentation notes that unblocked comparisons can become quadratic and potentially infeasible on large datasets. 
