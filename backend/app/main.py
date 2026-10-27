from fastapi import FastAPI

app = FastAPI(title="RE-Booking")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
