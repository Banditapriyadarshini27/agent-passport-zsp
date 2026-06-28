# Build Stage for Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# Final Stage
FROM node:20-alpine
WORKDIR /app

# Copy backend package and install dependencies
COPY backend/package*.json ./
RUN npm install --production

# Copy backend source files
COPY backend/ .

# Copy built frontend assets to where backend expects them (matches ../../frontend/dist relative to server.js)
COPY --from=frontend-builder /frontend/dist ./frontend/dist

# Define environment variables (Hugging Face default port is 7860)
ENV PORT=7860
EXPOSE 7860

# Start Express gateway
CMD ["npm", "start"]
