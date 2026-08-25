from pymongo import ASCENDING, DESCENDING
from pymongo.errors import CollectionInvalid
from bson.codec_options import CodecOptions
from bson.datetime_ms import DatetimeConversion
from db.mdb import MongoDBConnector

import logging

import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


class TimeSeriesCollectionCreator(MongoDBConnector):
    """Class to create a time series collection in MongoDB."""
    def __init__(self, uri=None, database_name=None, appname=None):
        super().__init__(uri, database_name, appname)

    def create_timeseries_collection(self, collection_name: str, time_field: str, granularity: str = "minutes", expire_after_seconds=None, meta_field: str = None):
        """
        Create a time series collection if it doesn't exist.

        Args:
            collection_name (str): Collection name.
            time_field (str): Time field.
            granularity (str, optional): Granularity. Defaults to "minutes".
            expire_after_seconds (int, optional): Document expiration time in seconds. Defaults to None.
            meta_field (str, optional): Metadata field constant per series (e.g. an
                id). Lets MongoDB bucket and index by series, greatly speeding up
                per-series queries/lookups. Defaults to None.
        """
        codec_options = CodecOptions(
            datetime_conversion=DatetimeConversion.DATETIME_AUTO)

        if collection_name in self.db.list_collection_names():
            logger.info(f"The '{collection_name}' collection already exists.")
            return

        try:
            timeseries_opts = {'timeField': time_field, 'granularity': granularity}
            if meta_field is not None:
                timeseries_opts['metaField'] = meta_field
            collection_options = {
                'timeseries': timeseries_opts,
                'codec_options': codec_options
            }
            if expire_after_seconds is not None:
                collection_options['expireAfterSeconds'] = expire_after_seconds

            self.db.create_collection(
                collection_name,
                **collection_options
            )
            self.db[collection_name].create_index(
                [(time_field, ASCENDING)]
            )
            logger.info(
                f"Time series collection '{collection_name}' and index created successfully.")

    def ensure_secondary_indexes(self, collection_name: str):
        """Create secondary compound indexes for common query patterns.

        Idempotent — MongoDB's create_index is a no-op when the index already
        exists with the same spec."""
        col = self.db[collection_name]
        indexes = [
            # Per-customer lookups: getCustomerDetail, getConsumptionTrend, etc.
            ([("dataid", ASCENDING), ("timestamp", DESCENDING)], "dataid_ts_desc"),
            # Outage detection: $match on power <= 0
            ([("power", ASCENDING)], "power_asc"),
            # Anomaly / grid-stability: latest docs with voltage filter
            ([("timestamp", DESCENDING), ("voltage", ASCENDING)], "ts_desc_voltage"),
            # Demand forecast: per-substation time-range queries
            ([("substation_id", ASCENDING), ("timestamp", DESCENDING)], "substation_ts_desc"),
        ]
        for spec, name in indexes:
            col.create_index(spec, name=name)
            logger.info(f"Index '{name}' ensured on '{collection_name}'.")
        logger.info(f"All secondary indexes ensured on '{collection_name}'.")
        except CollectionInvalid:
            logger.error(
                f"Time series collection '{collection_name}' already exists.")
        except Exception as e:
            logger.error(
                f"An error occurred while creating the time series collection: {e}")


if __name__ == "__main__":
    # Example usage
    creator = TimeSeriesCollectionCreator()
    creator.create_timeseries_collection(
        collection_name="telemetry_data",
        time_field="timestamp",
        granularity="minutes",
    )
    creator.ensure_secondary_indexes("readings")