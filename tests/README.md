# Tests

This directory is reserved for integration and end-to-end checks that do not belong to a single Go package.

Current Go unit tests stay next to the files they cover. When backend code moves into `internal/...` packages, package tests should move with those packages, while router/OpenWrt smoke tests can live here.

Run `npm run test:installer` (or `node --test tests/installer-regression.mjs`) for the shell installer regression suite. It executes the real installer in a temporary filesystem with fake package, HTTP, UCI, process and service commands; it does not contact a router or start installed services. UCI staging, download-time setting changes, update locks, candidate checks, startup failures and rollback are covered.

This suite needs a POSIX shell: `/bin/sh` on Linux, Git for Windows `sh.exe` on Windows, or an explicit `RUOPENRAY_TEST_SHELL` path. It runs separately from the frontend suite so ordinary frontend tests do not require a shell.
