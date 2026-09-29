from fastapi import FastAPI

app = FastAPI(title="svc", openapi_url="/api/openapi.json")
