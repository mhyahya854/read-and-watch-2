# macOS Code Signing and Notarization

## Strict Credential Boundary

> **ZERO CREDENTIALS IN GIT POLICY:** Under NO circumstances may signing keys, certificates, or Apple Developer credentials ever be committed to the repository.

### Strictly Forbidden from Version Control:

- `.p12` / `.pfx` certificate bundles containing Developer ID Application identities.
- Private keys (`.key`, `.pem`).
- Provisioning profiles (`.provisionprofile`, `.mobileprovision`).
- Apple ID usernames, passwords, or App-Specific Passwords.
- App Store Connect API keys (`AuthKey_*.p8`).
- Keychain dumps or password-protected archive exports.

---

## Secure Automation Architecture

For future automated macOS builds on GitHub-hosted runners:
- Certificates and API credentials must be provisioned ephemeral-only via encrypted **GitHub Secrets**.
- The build runner will decode base64-encoded identities into a temporary keychain that is deleted immediately upon job completion.
- Notarization will be performed via `xcrun notarytool` using App Store Connect API keys passed through environment variables.
- Local developer builds may run ad-hoc / self-signed during development, but release certification requires notarized artifacts.
