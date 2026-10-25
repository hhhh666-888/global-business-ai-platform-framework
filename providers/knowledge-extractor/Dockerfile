# syntax=docker/dockerfile:1.7
FROM python:3.12.11-slim-bookworm@sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7

ARG GBAP_DEBIAN_MAIN_MIRROR=https://mirrors.tuna.tsinghua.edu.cn/debian
ARG GBAP_DEBIAN_SECURITY_MIRROR=https://security.debian.org/debian-security

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOME=/home/gbap \
    KNOWLEDGE_EXTRACTOR_DATA=/data \
    KNOWLEDGE_EXTRACTOR_PORT=8093 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=60 \
    PIP_RETRIES=8

# Keep Debian's signed package authority while making cold builds resilient:
# - Debian-signed packages through a Debian-listed nearby HTTPS mirror;
# - security updates remain on Debian's official security authority;
# - both endpoints are build-arg overridable for another deployment region;
# - BuildKit caches package indexes/archives across interrupted builds;
# - smaller dependency groups commit independently instead of redownloading
#   the entire 292 MB toolchain after a transient failure.
RUN set -eux; \
    if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
      sed -ri "s#https?://deb\\.debian\\.org/debian-security#${GBAP_DEBIAN_SECURITY_MIRROR}#g; s#https?://security\\.debian\\.org/debian-security#${GBAP_DEBIAN_SECURITY_MIRROR}#g; s#https?://deb\\.debian\\.org/debian#${GBAP_DEBIAN_MAIN_MIRROR}#g" /etc/apt/sources.list.d/debian.sources; \
    fi; \
    if [ -f /etc/apt/sources.list ]; then \
      sed -ri "s#https?://deb\\.debian\\.org/debian-security#${GBAP_DEBIAN_SECURITY_MIRROR}#g; s#https?://security\\.debian\\.org/debian-security#${GBAP_DEBIAN_SECURITY_MIRROR}#g; s#https?://deb\\.debian\\.org/debian#${GBAP_DEBIAN_MAIN_MIRROR}#g" /etc/apt/sources.list; \
    fi; \
    rm -f /etc/apt/apt.conf.d/docker-clean; \
    printf '%s\n' \
      'Acquire::Retries "5";' \
      'Acquire::http::Timeout "30";' \
      'Acquire::https::Timeout "30";' \
      'Acquire::Languages "none";' \
      'Binary::apt::APT::Keep-Downloaded-Packages "true";' \
      > /etc/apt/apt.conf.d/80-gbap-network-resilience

RUN --mount=type=cache,id=gbap-knowledge-apt-lists,target=/var/lib/apt/lists,sharing=locked \
    --mount=type=cache,id=gbap-knowledge-apt-cache,target=/var/cache/apt,sharing=locked \
    set -eux; \
    success=0; \
    for attempt in 1 2 3 4; do \
      echo "GBAP_APT_CORE_ATTEMPT=${attempt}/4"; \
      if apt-get update \
        && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
          default-jre-headless \
          ghostscript \
          qpdf \
          tesseract-ocr \
          tesseract-ocr-eng \
          tesseract-ocr-chi-sim; then \
        success=1; \
        break; \
      fi; \
      if [ "${attempt}" -lt 4 ]; then sleep $((attempt * 10)); fi; \
    done; \
    test "${success}" = "1"

RUN --mount=type=cache,id=gbap-knowledge-apt-lists,target=/var/lib/apt/lists,sharing=locked \
    --mount=type=cache,id=gbap-knowledge-apt-cache,target=/var/cache/apt,sharing=locked \
    set -eux; \
    success=0; \
    for attempt in 1 2 3 4; do \
      echo "GBAP_APT_OFFICE_ATTEMPT=${attempt}/4"; \
      if apt-get update \
        && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
          libreoffice-core \
          libreoffice-writer \
          libreoffice-calc \
          libreoffice-impress; then \
        success=1; \
        break; \
      fi; \
      if [ "${attempt}" -lt 4 ]; then sleep $((attempt * 10)); fi; \
    done; \
    test "${success}" = "1"

RUN --mount=type=cache,id=gbap-knowledge-apt-lists,target=/var/lib/apt/lists,sharing=locked \
    --mount=type=cache,id=gbap-knowledge-apt-cache,target=/var/cache/apt,sharing=locked \
    set -eux; \
    success=0; \
    for attempt in 1 2 3 4; do \
      echo "GBAP_APT_FONTS_ATTEMPT=${attempt}/4"; \
      if apt-get update \
        && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
          fonts-noto-core \
          fonts-noto-cjk; then \
        success=1; \
        break; \
      fi; \
      if [ "${attempt}" -lt 4 ]; then sleep $((attempt * 10)); fi; \
    done; \
    test "${success}" = "1"

WORKDIR /app
COPY providers/knowledge-extractor/requirements.txt ./requirements.txt
RUN --mount=type=cache,id=gbap-knowledge-pip-cache,target=/root/.cache/pip,sharing=locked \
    set -eux; \
    success=0; \
    for attempt in 1 2 3 4; do \
      echo "GBAP_PIP_ATTEMPT=${attempt}/4"; \
      if pip install -r requirements.txt; then \
        success=1; \
        break; \
      fi; \
      if [ "${attempt}" -lt 4 ]; then sleep $((attempt * 10)); fi; \
    done; \
    test "${success}" = "1"

COPY providers/knowledge-extractor/server.py ./server.py

RUN groupadd --gid 10001 gbap \
 && useradd --uid 10001 --gid 10001 --home-dir /home/gbap --create-home --shell /usr/sbin/nologin gbap \
 && mkdir -p /data \
 && chown -R 10001:10001 /data /home/gbap

USER 10001:10001
VOLUME ["/data"]
EXPOSE 8093
CMD ["python", "/app/server.py"]
