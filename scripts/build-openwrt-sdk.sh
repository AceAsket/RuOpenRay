#!/bin/sh
set -eu

# SDK make recipes interpolate PATH; Windows entries with spaces break its Go
# configure step in WSL. Build with a Linux-only tool path.
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
repo_dir="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
work_dir="${RUOPENRAY_SDK_WORK_DIR:-$repo_dir/.private/openwrt-sdk}"
sdk_url="${OPENWRT_SDK_URL:-https://downloads.openwrt.org/releases/25.12.4/targets/x86/64/openwrt-sdk-25.12.4-x86-64_gcc-14.3.0_musl.Linux-x86_64.tar.zst}"
sdk_sha="${OPENWRT_SDK_SHA256:-28e004c1be4d215d19c1f12a6aa4c8d8f80689549eb707d0ff5a71f16fa8d05f}"
mkdir -p "$work_dir"
archive="$work_dir/sdk.tar.zst"
if ! [ -f "$archive" ] || ! printf '%s  %s\n' "$sdk_sha" "$archive" | sha256sum -c --status; then
    curl --fail --location --retry 3 --connect-timeout 15 --max-time 600 "$sdk_url" -o "$archive.next"
    printf '%s  %s\n' "$sdk_sha" "$archive.next" | sha256sum -c --strict
    mv "$archive.next" "$archive"
fi
set -- "$work_dir"/openwrt-sdk-*
if [ "$#" -ne 1 ] || ! [ -d "$1" ]; then
    tar --zstd -xf "$archive" -C "$work_dir"
    set -- "$work_dir"/openwrt-sdk-*
fi
[ "$#" -eq 1 ] && [ -d "$1" ] || { echo 'Expected exactly one SDK directory' >&2; exit 1; }
cd "$1"
./scripts/feeds update packages
./scripts/feeds install golang
mkdir -p package/ruopenray-ui
cp "$repo_dir/packaging/openwrt/Makefile" package/ruopenray-ui/Makefile
cp -a "$repo_dir/packaging/openwrt/files" package/ruopenray-ui/
touch .config
# This dedicated SDK builds the UI and its dependencies. Old all-kmods runs
# leave individual selections enabled even after CONFIG_ALL_KMODS is cleared.
# defconfig will reselect the kernel modules required by the package.
sed -i '/^CONFIG_ALL=/d; /^CONFIG_ALL_KMODS=/d; /^CONFIG_ALL_NONSHARED=/d; /^CONFIG_PACKAGE_kmod-/d; /^CONFIG_PACKAGE_ruopenray-ui=/d' .config
cat >> .config <<'EOF'
# CONFIG_ALL is not set
# CONFIG_ALL_KMODS is not set
# CONFIG_ALL_NONSHARED is not set
CONFIG_PACKAGE_ruopenray-ui=m
EOF
make defconfig
# Fetches the immutable Git source from the recipe; no working-tree override.
make package/ruopenray-ui/compile V=s -j"${JOBS:-2}"
mkdir -p "$repo_dir/dist/openwrt"
find bin -type f \( -name 'ruopenray-ui*.apk' -o -name 'ruopenray-ui*.ipk' \) -exec cp '{}' "$repo_dir/dist/openwrt/" \;
find "$repo_dir/dist/openwrt" -type f \( -name '*.apk' -o -name '*.ipk' \) -exec sha256sum '{}' \;
