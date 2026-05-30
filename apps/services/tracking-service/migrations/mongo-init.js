db = db.getSiblingDB("tracking_service");
db.createCollection("tracking_events");
db.createCollection("delivery_attempts");
db.createCollection("tracking_journey");
