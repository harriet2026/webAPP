# ==========================================
# 阶段 1: 构建阶段 (Builder)
# ==========================================
ARG IMAGE_REGISTRY=dev-harbor.rd.cm:8443/osgateway/x86
ARG TMPL_BUILDER=${IMAGE_REGISTRY}/osgateway-tmpl-webapp-builder:1.0.0
FROM ${TMPL_BUILDER} AS builder

# TARGETPLATFORM 由 Docker Buildx 自动注入 (如 linux/amd64, linux/arm64)
ARG TARGETPLATFORM
ARG NEXT_PUBLIC_API_URL
WORKDIR /app

# 3. 复制源码并构建
COPY . .

# 禁用 Next.js 匿名遥测，减少构建日志打扰
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ==========================================
# 阶段 2: 运行阶段 (Runtime)
# ==========================================
FROM ${IMAGE_REGISTRY}/osgateway-tmpl-webapp-runtime:1.0.0 AS runtime

WORKDIR /app

# 复制构建产物 (需在 next.config.js 中配置 output: 'standalone')
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/messages ./messages
COPY custom-server.js ./

RUN chown -R osg:osg /app

USER osg

EXPOSE 80 443

CMD ["node", "custom-server.js"]
