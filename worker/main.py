import os
import sys
import time
import signal
import logging
from bson.objectid import ObjectId
from pymongo import MongoClient
import redis
import google.generativeai as genai
from dotenv import load_dotenv
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

# Load Environment Variables
load_dotenv()

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

# Connection strings
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/ai_tasks")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
QUEUE_NAME = "task_queue"

# Global flags
running = True

def signal_handler(signum, frame):
    global running
    logger.info(f"Received signal {signum}. Shutting down worker gracefully...")
    running = False

# Register signal handlers for graceful shutdown
signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

def connect_mongodb(uri):
    logger.info("Connecting to MongoDB...")
    try:
        client = MongoClient(uri, serverSelectionTimeoutMS=5000)
        # Check connection
        client.admin.command('ping')
        db = client.get_default_database()
        if db is None or db.name == 'test' and uri.endswith('/'):
            db = client['ai_tasks']
        logger.info(f"Connected to MongoDB database: {db.name}")
        return client, db
    except Exception as e:
        logger.error(f"Failed to connect to MongoDB: {e}")
        sys.exit(1)

def connect_redis(url, exit_on_fail=True):
    logger.info("Connecting to Redis...")
    try:
        r = redis.Redis.from_url(url, decode_responses=True, socket_connect_timeout=5)
        r.ping()
        logger.info("Connected to Redis successfully")
        return r
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e}")
        if exit_on_fail:
            sys.exit(1)
        raise e

def run_operation(operation, input_text, logs):
    """
    Executes the specified text operation.
    """
    operation = operation.lower()
    logs.append(f"[Worker] Running operation '{operation}'...")
    
    if operation == 'uppercase':
        result = input_text.upper()
        logs.append("[Worker] Conversion to UPPERCASE complete.")
    elif operation == 'lowercase':
        result = input_text.lower()
        logs.append("[Worker] Conversion to lowercase complete.")
    elif operation == 'reverse':
        result = input_text[::-1]
        logs.append("[Worker] Text reversed successfully.")
    elif operation == 'word_count':
        # Split text by space and remove empty entries
        words = [w for w in input_text.split() if w.strip()]
        count = len(words)
        result = str(count)
        logs.append(f"[Worker] Word count completed. Total: {count} words.")
    elif operation == 'gemini_ai':
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable is not set.")
        logs.append("[Worker] Configuring Google Gemini API Client...")
        genai.configure(api_key=api_key)
        logs.append("[Worker] Initializing model gemini-1.5-flash...")
        model = genai.GenerativeModel('gemini-1.5-flash')
        logs.append("[Worker] Generating content with AI studio key...")
        response = model.generate_content(input_text)
        result = response.text
        logs.append("[Worker] Gemini response generated successfully.")
    else:
        raise ValueError(f"Unknown operation: {operation}")
        
    return result

def process_task(task_id, db):
    """
    Retrieves task, processes it, and updates task record in DB.
    """
    try:
        # Convert task_id string to ObjectId
        task_oid = ObjectId(task_id)
    except Exception as e:
        logger.error(f"Invalid task ID format: {task_id}. Error: {e}")
        return

    task = db.tasks.find_one({"_id": task_oid})
    if not task:
        logger.warning(f"Task with ID {task_id} not found in database.")
        return

    logger.info(f"Processing Task: {task_id} | Operation: {task.get('operationType')}")
    
    # Initialize execution logs and update status to Running
    logs = list(task.get('logs', []))
    logs.append(f"[Worker] Task claimed by worker process (PID: {os.getpid()})")
    logs.append("[Worker] Status updated to RUNNING")
    
    db.tasks.update_one(
        {"_id": task_oid},
        {"$set": {"status": "running", "logs": logs}}
    )
    
    start_time = time.perf_counter()
    
    try:
        input_text = task.get("inputText", "")
        operation = task.get("operationType", "")
        
        # Execute the AI operations
        result = run_operation(operation, input_text, logs)
        
        # Calculate execution time
        end_time = time.perf_counter()
        execution_time_ms = round((end_time - start_time) * 1000, 2)
        
        logs.append(f"[Worker] Task completed successfully in {execution_time_ms} ms")
        logs.append("[Worker] Saving results...")
        
        db.tasks.update_one(
            {"_id": task_oid},
            {
                "$set": {
                    "status": "success",
                    "result": result,
                    "logs": logs,
                    "executionTimeMs": execution_time_ms
                }
            }
        )
        logger.info(f"Task {task_id} completed successfully.")
        
    except Exception as err:
        end_time = time.perf_counter()
        execution_time_ms = round((end_time - start_time) * 1000, 2)
        
        logger.error(f"Error processing task {task_id}: {err}")
        logs.append(f"[Error] Operation failed: {str(err)}")
        logs.append("[Worker] Status updated to FAILED")
        
        db.tasks.update_one(
            {"_id": task_oid},
            {
                "$set": {
                    "status": "failed",
                    "logs": logs,
                    "executionTimeMs": execution_time_ms
                }
            }
        )

class HealthCheckHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(b"healthy")

    # Disable standard logging to stdout to keep worker logs clean
    def log_message(self, format, *args):
        return

def start_health_server():
    port = int(os.getenv("PORT", "8000"))
    server = HTTPServer(('0.0.0.0', port), HealthCheckHandler)
    logger.info(f"Starting health check web server on port {port}...")
    server.serve_forever()

def main():
    logger.info("Starting AI Task Processing Python Worker...")
    
    # Start background health server for Render Free Web Service compatibility
    threading.Thread(target=start_health_server, daemon=True).start()
    
    # Establish connections
    mongo_client, db = connect_mongodb(MONGO_URI)
    r = connect_redis(REDIS_URL)
    
    logger.info(f"Worker is active and listening on Redis queue: '{QUEUE_NAME}'")
    
    # Touch file for readiness/liveness probe
    probe_file = "/tmp/worker-ready"
    try:
        with open(probe_file, "w") as f:
            f.write("ready")
    except Exception:
        pass # In case permissions fail on local machine (running windows)

    while running:
        try:
            # BRPOP blocks and returns a tuple (queue_name, item)
            # We set timeout=2 so that the loop regularly checks the global 'running' flag
            result = r.brpop(QUEUE_NAME, timeout=2)
            
            if result:
                _, task_id = result
                process_task(task_id, db)
                
        except redis.ConnectionError:
            logger.error("Redis connection lost. Attempting to reconnect...")
            time.sleep(5)
            try:
                r = connect_redis(REDIS_URL, exit_on_fail=False)
            except Exception:
                pass
        except Exception as e:
            logger.error(f"Unexpected error in main loop: {e}")
            time.sleep(2)
            
    # Cleanup on exit
    logger.info("Worker shutting down.")
    try:
        os.remove(probe_file)
    except Exception:
        pass
    mongo_client.close()
    logger.info("Resources cleaned. Bye!")

if __name__ == "__main__":
    main()
