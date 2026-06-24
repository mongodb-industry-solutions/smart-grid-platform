from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.cors import CORSMiddleware
from fastapi import APIRouter
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from db.mdb import MongoDBConnector


load_dotenv()
app = FastAPI()
router = APIRouter()
mdb = MongoDBConnector()


@app.get("/")
async def read_root(request: Request):
    return {"message":"Server is running"}


#  Retrieve recent logs from 'readings' collection
@app.get("/api/readings/recent")
def get_recent_readings(limit: int = 2):
    collection = mdb.get_collection("readings")  
    docs = (
        collection.find(
            {},
            {
                "_id": 1,
                "timestamp": 1,
                "dataid": 1,
                "avg_reading": 1,
                "volt_leg_1": 1,
                "volt_leg_2": 1,
            },
        )
        .sort("timestamp", -1)
        .limit(limit)
    )

    results = []
    for doc in docs:
        ts = doc.get("timestamp")

        if hasattr(ts, "isoformat"):
            ts = ts.isoformat()
        elif isinstance(ts, dict) and "$date" in ts:
            ts = ts["$date"]

        results.append(
            {
                "id": str(doc.get("_id")),
                "timestamp": ts,
                "dataid": doc.get("dataid"),
                "avg_reading": doc.get("avg_reading"),
                "volt_leg_1": doc.get("volt_leg_1"),
                "volt_leg_2": doc.get("volt_leg_2"),
            }
        )

    return results
