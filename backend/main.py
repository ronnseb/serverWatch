from fastapi import FastAPI

app = FastAPI(title="ServerWatch API")

@app.get("/")
def read_root():
    return {"message": "ServerWatch API is running"}

@app.get("/health")
def health_check():
    return {"status": "ok"}
