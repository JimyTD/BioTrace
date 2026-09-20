#!/usr/bin/env bash
# Run on the production host as root. Start it with nohup and inspect the
# status/log files documented in docs/OPS.md instead of tailing forever.
set -Eeuo pipefail

APP_ROOT=/opt/biotrace
STATE_DIR=/var/lib/biotrace
LOG_DIR=/var/log/biotrace
LOCK_FILE=/var/lock/biotrace-deploy.lock
WEB_ROOT=/var/www/biotrace
OPS_ENV=/etc/biotrace/ops.env
PHASE=bootstrap
BEFORE_COMMIT=
AFTER_COMMIT=
FORCE_ALL=false

require_root() {
  if [[ $(id -u) -ne 0 ]]; then
    echo 'deploy-server.sh must run as root.' >&2
    exit 1
  fi
}

if [[ ${1:-} == --all ]]; then
  FORCE_ALL=true
elif [[ $# -gt 0 ]]; then
  echo "unknown argument: $1 (expected --all)" >&2
  exit 2
fi

write_state() {
  local result=$1
  local temporary
  temporary=$(mktemp "$STATE_DIR/.deploy-status.XXXXXX")
  {
    printf 'result=%s\n' "$result"
    printf 'phase=%s\n' "$PHASE"
    printf 'pid=%s\n' "$$"
    printf 'started_at=%s\n' "$STARTED_AT"
    printf 'before_commit=%s\n' "$BEFORE_COMMIT"
    printf 'after_commit=%s\n' "$AFTER_COMMIT"
    printf 'log_file=%s\n' "$LOG_FILE"
  } > "$temporary"
  mv -f "$temporary" "$STATE_DIR/deploy.status"
}

on_error() {
  local exit_code=$?
  printf 'deployment failed at phase=%s exit=%s command=%s\n' "$PHASE" "$exit_code" "$BASH_COMMAND" >&2
  write_state failed
  exit "$exit_code"
}

fail_deployment() {
  echo "$1" >&2
  write_state failed
  exit 1
}

has_changed_path() {
  local pattern
  for pattern in "$@"; do
    if grep -Eq "$pattern" <<< "$CHANGED_PATHS"; then
      return 0
    fi
  done
  return 1
}

load_ops_config() {
  if [[ ! -r $OPS_ENV ]]; then
    fail_deployment "missing server-local operations configuration: $OPS_ENV"
  fi
  # This root-owned file contains only host-local operational expectations.
  # It is deliberately outside git so topology changes do not leak into the repo.
  # shellcheck disable=SC1090
  source "$OPS_ENV"
  if [[ -z ${BIOTRACE_PROXY_EGRESS_IP:-} ]]; then
    fail_deployment "BIOTRACE_PROXY_EGRESS_IP is required in $OPS_ENV"
  fi
}

build_api() {
  PHASE=build_api
  write_state running
  docker compose build api
  PHASE=restart_api
  write_state running
  docker compose up -d api
}

build_web() {
  local stage_dir
  local -a env_args=()

  PHASE=build_web
  write_state running
  if [[ -f deploy/.env.web.production ]]; then
    env_args=(--env-file deploy/.env.web.production)
  else
    echo 'warning: deploy/.env.web.production is absent; VITE_* production values are not injected.' >&2
  fi

  docker run --rm -v "$APP_ROOT:/app" -w /app \
    "${env_args[@]}" \
    -e npm_config_registry=https://registry.npmmirror.com \
    node:22-bookworm-slim \
    bash -lc 'corepack enable && pnpm install --frozen-lockfile --filter @biotrace/web... && pnpm --filter @biotrace/web build'

  PHASE=publish_web
  write_state running
  stage_dir=$(mktemp -d /var/www/.biotrace-stage.XXXXXX)
  trap 'rm -rf "$stage_dir"' RETURN
  rsync -a apps/web/dist/ "$stage_dir/"
  rsync -a --delete-delay --exclude=/index.html "$stage_dir/" "$WEB_ROOT/"
  install -m 0644 "$stage_dir/index.html" "$WEB_ROOT/index.html"
  chown -R www-data:www-data "$WEB_ROOT"
  rm -rf "$stage_dir"
  trap - RETURN
}

verify_runtime() {
  local proxy_ip
  PHASE=verify
  write_state running
  curl -fsS http://127.0.0.1:8787/api/health
  docker compose exec -T api sh -c 'test -n "$HTTPS_PROXY"; getent hosts host.docker.internal'
  proxy_ip=$(curl -fsS -m 12 -x http://127.0.0.1:10809 https://api.ipify.org)
  printf 'proxy_egress_ip=%s expected_proxy_egress_ip=%s\n' "$proxy_ip" "$BIOTRACE_PROXY_EGRESS_IP"
  test "$proxy_ip" = "$BIOTRACE_PROXY_EGRESS_IP"
  curl -fsSI http://127.0.0.1/ | grep -qi '^Cache-Control: no-store'
  test "$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1/assets/nope-not-here.js)" = 404
}

require_root
command -v flock >/dev/null
mkdir -p "$STATE_DIR" "$LOG_DIR" "$WEB_ROOT"
STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
LOG_FILE="$LOG_DIR/deploy-$STARTED_AT-$$.log"
exec > >(tee -a "$LOG_FILE") 2>&1
trap on_error ERR

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo 'another BioTrace deployment is running.' >&2
  exit 1
fi

cd "$APP_ROOT"
PHASE=preflight
load_ops_config
BEFORE_COMMIT=$(git rev-parse HEAD)
if [[ -n $(git status --porcelain --untracked-files=no) ]]; then
  git status --short --untracked-files=no >&2
  fail_deployment 'tracked changes exist in /opt/biotrace; stop and investigate before deploying.'
fi

PHASE=pull
write_state running
git -c http.proxy=http://127.0.0.1:10809 pull --ff-only
AFTER_COMMIT=$(git rev-parse HEAD)
CHANGED_PATHS=$(git diff --name-only "$BEFORE_COMMIT" "$AFTER_COMMIT")
printf 'before_commit=%s\nafter_commit=%s\n' "$BEFORE_COMMIT" "$AFTER_COMMIT"
printf '%s\n' "$CHANGED_PATHS"

API_CHANGED=false
WEB_CHANGED=false
MOBILE_CHANGED=false
if has_changed_path '^apps/api/' '^Dockerfile$' '^docker-compose(\.override)?\.yml$' '^deploy/Dockerfile\.cn$' '^package\.json$' '^pnpm-lock\.yaml$' '^pnpm-workspace\.yaml$' '^packages/'; then
  API_CHANGED=true
fi
if has_changed_path '^apps/web/' '^packages/' '^package\.json$' '^pnpm-lock\.yaml$' '^pnpm-workspace\.yaml$'; then
  WEB_CHANGED=true
fi
if has_changed_path '^apps/mobile/'; then
  MOBILE_CHANGED=true
fi
if [[ $FORCE_ALL == true ]]; then
  API_CHANGED=true
  WEB_CHANGED=true
fi

printf 'api_changed=%s\nweb_changed=%s\nmobile_changed=%s\n' "$API_CHANGED" "$WEB_CHANGED" "$MOBILE_CHANGED"
if [[ $API_CHANGED == true ]]; then build_api; fi
if [[ $WEB_CHANGED == true ]]; then build_web; fi
verify_runtime

PHASE=complete
write_state success
if [[ $MOBILE_CHANGED == true ]]; then
  echo 'mobile_changed=true: publish a new Android APK through GitHub Actions and update /opt/biotrace/data/android-release/.'
fi
echo "deployment succeeded; log=$LOG_FILE"
