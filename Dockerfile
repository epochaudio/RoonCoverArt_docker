FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN apk add --no-cache git su-exec

RUN npm install --omit=dev --no-audit --no-fund

COPY . .

RUN chmod +x /app/entrypoint.sh

# 创建运行时需要的默认文件（实际生产环境建议通过 volume 挂载持久化）
RUN mkdir -p /app/images && \
    echo '{}' > /app/config.json && \
    chmod 755 /app/images

EXPOSE 3666

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "app.js"]
