# macOS Hardened Runtime Entitlements

## Purpose

This directory manages the Apple Hardened Runtime property list (`entitlements.mac.plist` and `entitlements.mac.inherit.plist`) required for Apple notarization and Gatekeeper clearance.

## Future Entitlements Ownership

When macOS packaging is implemented, this directory will define the minimal, justified set of entitlements:

1. **Hardened Runtime Basics:**
   - `com.apple.security.cs.allow-jit`: Just-In-Time compilation (if required by V8 JavaScript engine for PDF/EPUB rendering).
   - `com.apple.security.cs.allow-unsigned-executable-memory`: WebAssembly / dynamic code generation.
2. **File Access Permissions:**
   - Read-only user-selected document access (`com.apple.security.files.user-selected.read-only` if app sandboxed).
   - External data root access (`READ_WATCH_DATA_ROOT`).
3. **Network Boundary:**
   - `com.apple.security.network.client`: Internal localhost client requests.
   - `com.apple.security.network.server`: Binding internal 127.0.0.1 loopback desktop service.

## Security Rule

- Do NOT preemptively grant broad or dangerous entitlements.
- Do NOT add entitlements until actual macOS runtime execution and notarization diagnostics prove they are necessary.
- Actual `.plist` files will be introduced only under verified macOS build evidence.
