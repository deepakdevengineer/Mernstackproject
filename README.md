# AI Task Processing Platform

A production-ready asynchronous text processing platform built using the MERN stack (MongoDB, Express, React, Node.js), a Python background task consumer, Docker containerization, Kubernetes orchestration, and Argo CD (GitOps) synchronization.

---

## Project Structure

```text
├── backend/                   # Node.js + Express API
│   ├── models/                # MongoDB Mongoose Schemas
│   ├── routes/                # Auth & Task API Routes
│   ├── middleware/            # Auth middleware
│   ├── server.js              # Server entry point
│   └── Dockerfile             # Multi-stage Backend Dockerfile
├── worker/                    # Python task processor
│   ├── main.py                # Processing loop & Redis client
│   ├── requirements.txt       # Python dependencies
│   └── Dockerfile             # Multi-stage Python Dockerfile
├── frontend/                  # React (Vite) client
│   ├── src/                   # React components & Vanilla CSS
│   ├── nginx.conf             # Production serving configuration
│   └── Dockerfile             # Multi-stage Frontend Dockerfile
├── infra/                     # Kubernetes Manifests (Infrastructure Repo)
│   ├── namespace.yaml
│   ├── configmap.yaml
│   ├── secrets.yaml
│   ├── mongodb.yaml
│   ├── redis.yaml
│   ├── backend.yaml
│   ├── worker.yaml
│   ├── frontend.yaml
│   ├── ingress.yaml
│   └── argocd-app.yaml
├── .github/workflows/         # CI/CD Workflows
│   └── ci-cd.yml
├── docker-compose.yml         # Local container orchestrator
├── architecture-document.md   # Architectural design document
└── README.md                  # Setup & operations guide
```

---

## 1. Local Development Setup (Manual / No Docker)

Since Docker might not be active, follow these steps to run the platform components natively.

### Prerequisites
* **Node.js** (v18+)
* **Python** (3.10+)
* **MongoDB** running locally on `localhost:27017`
* **Redis** running locally on `localhost:6379`

### Setup Steps

#### Step 1: Run Backend API
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file inside the `backend` directory:
   ```env
   PORT=5000
   MONGO_URI=mongodb://localhost:27017/ai_tasks
   REDIS_URL=redis://localhost:6379
   JWT_SECRET=development_jwt_secret_key_123
   ```
4. Start the server in development mode:
   ```bash
   npm run dev
   ```
   *The backend will boot on `http://localhost:5000`.*

#### Step 2: Run Python Background Worker
1. Open a new terminal and navigate to the worker directory:
   ```bash
   cd worker
   ```
2. Create and activate a virtual environment (optional but recommended):
   ```bash
   python -m venv venv
   # On Windows:
   .\venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```
3. Install required libraries:
   ```bash
   pip install -r requirements.txt
   ```
4. Create a `.env` file inside the `worker` directory:
   ```env
   MONGO_URI=mongodb://localhost:27017/ai_tasks
   REDIS_URL=redis://localhost:6379
   ```
5. Run the worker script:
   ```bash
   python main.py
   ```
   *The worker will connect and wait for tasks to process.*

#### Step 3: Run Frontend Web Client
1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite React development server:
   ```bash
   npm run dev
   ```
   *Open [http://localhost:3000](http://localhost:3000) in your browser.*

---

## 2. Local Container Setup (Docker Compose)

To run the complete platform, databases, and worker services in isolated containers, run the following command in the root project directory:

```bash
docker-compose up --build
```

* **Frontend**: accessible on [http://localhost:3000](http://localhost:3000)
* **Backend API**: accessible on [http://localhost:5000](http://localhost:5000)
* **MongoDB**: mapped on `localhost:27017`
* **Redis**: mapped on `localhost:6379`

To tear down services:
```bash
docker-compose down -v
```

---

## 3. Kubernetes Deployment (kubectl)

We deploy in the dedicated `ai-task-platform` namespace using the Kubernetes files under `infra/`.

### Steps
1. Create the Namespace:
   ```bash
   kubectl apply -f infra/namespace.yaml
   ```
2. Deploy ConfigMaps and Secrets:
   ```bash
   kubectl apply -f infra/configmap.yaml
   kubectl apply -f infra/secrets.yaml
   ```
3. Deploy persistent database layers (MongoDB and Redis):
   ```bash
   kubectl apply -f infra/mongodb.yaml
   kubectl apply -f infra/redis.yaml
   ```
4. Deploy the application components:
   ```bash
   kubectl apply -f infra/backend.yaml
   kubectl apply -f infra/worker.yaml
   kubectl apply -f infra/frontend.yaml
   ```
5. Apply Ingress configurations (assumes ingress-nginx is installed on the cluster):
   ```bash
   kubectl apply -f infra/ingress.yaml
   ```

---

## 4. GitOps Setup (Argo CD)

Argo CD manages deployments inside the cluster by watching a Git infrastructure repository.

### Install Argo CD
1. Create the `argocd` namespace:
   ```bash
   kubectl create namespace argocd
   ```
2. Apply the official Argo CD installation manifests:
   ```bash
   kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
   ```
3. Expose the Argo CD API Server (optional, for local testing):
   ```bash
   kubectl port-forward svc/argocd-server -n argocd 8080:443
   ```
   *Login credentials can be retrieved via standard Argo CD CLI instructions.*

### Apply the GitOps Application Manifest
Run:
```bash
kubectl apply -f infra/argocd-app.yaml
```
Argo CD will automatically discover the `infra/` manifests in the repository, create the `ai-task-platform` namespace (if missing), and synchronise the deployments to match the Git state.

---

## 5. API Endpoints

### Authentication Routes
* `POST /api/auth/register` - Create a new user profile
  * Request Body: `{ "username": "...", "email": "...", "password": "..." }`
* `POST /api/auth/login` - Authenticate profile and receive token
  * Request Body: `{ "email": "...", "password": "..." }`
  * Returns: `{ "token": "...", "username": "..." }`
* `GET /api/auth/me` (Private) - Get logged-in user profile

### Task Management Routes (JWT Authorized)
* `POST /api/tasks` - Create a new string processing task
  * Headers: `Authorization: Bearer <JWT_TOKEN>`
  * Request Body: `{ "title": "Review Job", "inputText": "sample string", "operationType": "uppercase" }`
  * Valid operations: `uppercase`, `lowercase`, `reverse`, `word_count`
* `GET /api/tasks` - Retrieve tasks created by current user
* `GET /api/tasks/:id` - Get specific task details, status, result, and console logs.
