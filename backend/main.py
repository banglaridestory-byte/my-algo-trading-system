from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def home():
    return {"message": "Algo Trading Backend is Running!"}