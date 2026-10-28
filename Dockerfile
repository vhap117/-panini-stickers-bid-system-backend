FROM node:22

WORKDIR /app

# Install dependencies during image build so the anonymous volume trick in
# docker-compose.yml gives the container a complete node_modules even though
# the host source mount shadows /app.
COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
