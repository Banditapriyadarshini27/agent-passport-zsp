# Build Stage for Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /frontend
COPY agent-passport/frontend/package*.json ./
RUN npm install
COPY agent-passport/frontend/ .
RUN npm run build

# Final Stage
FROM node:20-alpine
WORKDIR /app

# Copy backend package and install dependencies
COPY agent-passport/backend/package*.json ./backend/
RUN cd backend && npm install --production

# Copy all backend source files into /app/backend/
COPY agent-passport/backend/ ./backend/

# Copy built frontend assets to /app/frontend/dist (sibling to backend/)
COPY --from=frontend-builder /frontend/dist ./frontend/dist

# Define environment variables (Hugging Face default port is 7860)
ENV PORT=7860
EXPOSE 7860

# Start Express gateway
WORKDIR /app/backend
CMD ["npm", "start"]
