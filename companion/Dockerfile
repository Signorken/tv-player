FROM node:20-alpine
WORKDIR /app
COPY companion/ ./companion/
COPY www/ ./www/
ENV PORT=8787 WWW=/app/www
EXPOSE 8787
CMD ["node", "companion/server.js"]
