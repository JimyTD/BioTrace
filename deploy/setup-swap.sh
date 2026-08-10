#!/usr/bin/env bash
# Optional 2G swap for 2GB Lighthouse instances.
set -euo pipefail
if swapon --show | grep -q .; then
  echo "Swap already configured:"
  swapon --show
  exit 0
fi
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
echo "2G swap enabled."
swapon --show
