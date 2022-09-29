FROM node:16.17.0-slim
RUN npm i -g @nestjs/cli
WORKDIR /api
COPY package*.json /api/
RUN npm install
COPY . ./
RUN npm run build
CMD ["npm", "run", "start:prod"]
