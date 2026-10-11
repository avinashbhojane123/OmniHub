# SafeGuard Family - Deployment & DevOps Architecture

## 1. Local Development Environment

```bash
# 1. Start database and Redis containers
docker-compose up -d postgres redis

# 2. Run backend migrations & start NestJS API
cd server
npm install
npx prisma migrate dev --name init
npm run start:dev

# 3. Start React Native application (Metro + Android)
cd ..
npm install
npm run start
npm run android
```

---

## 2. Production Cloud Architecture

```
                  [ Cloudflare DNS & DDoS Shield ]
                                |
                   [ NGINX Reverse Proxy + SSL ]
                                |
             +------------------+------------------+
             |                                     |
    [ NestJS API Cluster ]               [ Socket.IO Cluster ]
       (PM2 / Kubernetes)                  (Redis Adapter)
             |                                     |
             +------------------+------------------+
                                |
           +--------------------+--------------------+
           |                                         |
[ Managed PostgreSQL (AWS RDS / Supabase) ]   [ Managed Redis (Upstash / ElastiCache) ]
```

---

## 3. Recommended Environment Variables

### Backend (`server/.env`)
```env
NODE_ENV=production
PORT=5000
DATABASE_URL="postgresql://safeguard:secret@localhost:5432/safeguard_db?schema=public"
JWT_ACCESS_SECRET="CHANGE_ME_SUPER_STRONG_ACCESS_SECRET"
JWT_REFRESH_SECRET="CHANGE_ME_SUPER_STRONG_REFRESH_SECRET"
REDIS_HOST="localhost"
REDIS_PORT=6379
CORS_ORIGIN="*"
```

### Mobile App (`.env`)
```env
API_BASE_URL="http://10.0.2.2:5000/api/v1"
SOCKET_BASE_URL="http://10.0.2.2:5000"
```
