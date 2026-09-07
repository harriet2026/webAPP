# ==========================================
# 阶段 1: 构建阶段 (Builder)
# ==========================================
ARG IMAGE_REGISTRY=dev-harbor.rd.cm:8443/osgateway/x86
ARG TMPL_BUILDER=${IMAGE_REGISTRY}/osgateway-tmpl-webapp-builder:1.0.0
ARG TMPL_RUNTIME=${IMAGE_REGISTRY}/osgateway-tmpl-webapp-runtime:1.0.0
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
FROM ${TMPL_RUNTIME} AS runtime

WORKDIR /app

# 复制构建产物 (需在 next.config.js 中配置 output: 'standalone')
# 在 COPY 时直接写入最终 uid/gid，避免后续 chown 触发 overlayfs copy-up，
# 把约 90 MB 的 standalone 产物再完整复制成一个镜像层。
COPY --from=builder --chown=osg:osg /app/.next/standalone ./
COPY --from=builder --chown=osg:osg /app/.next/static ./.next/static
COPY --from=builder --chown=osg:osg /app/public ./public
COPY --from=builder --chown=osg:osg /app/messages ./messages
COPY --chown=osg:osg custom-server.js ./

USER osg

EXPOSE 80 443

CMD ["node", "custom-server.js"]
