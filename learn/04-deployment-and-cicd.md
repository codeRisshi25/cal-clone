# 🚀 Chapter 4: Deployment & CI/CD Pipeline

When an interviewer asks you about how your code turns into a live website, they are asking about DevOps, CI/CD (Continuous Integration / Continuous Deployment), and Cloud Infrastructure.

---

## 🏗️ 1. Containerization (Docker)

If you look at the root of your project, there is a `Dockerfile`. This is the single most important file for backend deployment.

**What does it do?**
Instead of installing Node.js, setting up standard libraries, and installing pnpm heavily on a live server manually, a Dockerfile creates a "Virtual Box" (container).
- The `Dockerfile` tells Docker exactly what to download, what to copy, how to compile TypeScript into plain JavaScript, and how to execute the server.
- The outcome is a **Docker Image**: a perfectly sealed, self-contained snapshot of your code. You can run that exact same image on your local machine, on an AWS server, or an Azure server, and it behaves exactly the same way without the dreaded *"It works on my machine!"* excuse.

---

## 🛠️ 2. Automated Pipeline (GitHub Actions CI/CD)

We replaced the manual shell scripts with a fully automated **GitHub Actions CI/CD Pipeline**.

If you check `.github/workflows/main.yml`, you'll see a Yaml configuration that listens for any push to the `main` branch. 
When you merge a PR, GitHub spins up a temporary virtual machine in the cloud (a Runner) and does the following:

### Step A: Continuous Integration (CI)
1. **Installs dependencies:** Runs `pnpm install`.
2. **Generates Client:** Runs `npx prisma generate` to map the DB schema.
3. **Tests Safety:** Spun up a strictly isolated PostgreSQL database and Redis server just for testing. It runs `npx prisma db push` against the test database, and fires the Jest Automated Tests (`pnpm test`)!

If *any* test fails, the GitHub Action throws a giant red X, blocks the pipeline, and completely halts the deployment to prevent you from breaking the production server.

### Step B: Continuous Deployment (CD)
If the tests pass, GitHub instantly moves to deployment:
1. **Azure Login:** Uses the GitHub securely stored secrets to authenticate into Azure CLI.
2. **Docker Build:** It packages your Express API, compiles it, creates your Docker Image, and does `docker push` into Azure Container Registries (`calcloneacr25.azurecr.io/cal-clone-api:latest`).
3. **Azure ACI Update:** Finally, it triggers `az container create`, instructing Microsoft Azure to grab the fresh Docker image, allocate it 1.5GB of RAM, and restart the production server for you!

And you do absolutely nothing except click **"Merge Pull Request"**.

---

## 🌥️ 3. Azure Container Instances (ACI)

We chose to deploy our backend, our PostgreSQL database, and our Redis server natively using Azure Container Instances (via `deploy/aci-group.yaml`).

### The Architecture: "Container Group"
In Azure, we deployed **one** singular "Container Group". Inside this one group, we defined 3 closely-connected containers:
- `api`
- `postgres`
- `redis`

*Interview Question: "Why put them all in the same container group? Isn't it safer to split them up?"*

**Your Answer:** "Placing them in the same container group allows them to share the exact same internal `localhost` network. The API container can securely talk to the Redis cache and Postgres database using `localhost:5432` without ever exposing the raw database to the public internet. This drastically improves network latency and locks down the database behind our secure API server layer."

### Handling Secrets securely
Notice that we never expose our `RESEND_API_KEY` or `POSTGRES_PASSWORD` in the repository itself. They are saved in GitHub Secrets.
When the GitHub Action workflow runs `envsubst < deploy/aci-group.yaml > deploy/aci-group-final.yaml`, it securely injects those real production keys exactly at deploy time. That way, humans can read `deploy/aci-group.yaml` safely without knowing the secure passwords!
