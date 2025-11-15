# Changelog

## [1.4.6] - 2025-09-01

### Changed
- Version bump and release packaging for 1.4.6.
- Minor metadata tidy-up.

---

## [1.4.5] - 2025-08-31

### Changed
- Optimized Marketplace metadata: updated `displayName`, categories to `Productivity`, and refined `keywords` (removed unsupported `tags`).
- README now front-loads descriptor and search keywords for better indexing.

### Added
- One-time "Rate Promptr" prompt after first successful use to improve discoverability (opt-in, non-modal).

---

## [1.4.3] - 2025-08-27

### Added
- **Premium Bypass Tokens**: 30 cryptographically secure premium access tokens
- **Unlimited Access**: Premium tokens bypass all usage limits and authentication
- **Enhanced Status Bar**: 💎 icon for premium bypass tokens
- **Exact Token Validation**: Secure Set-based token matching (O(1) performance)

### Changed
- Token validation now supports 'pro' status for premium bypass tokens
- Improved security with exact token matching instead of prefix checking
- Updated description to include premium bypass functionality

### Technical Details
- Hardcoded 30 premium tokens in both validation files
- Set.has() implementation for optimal performance
- Premium tokens grant instant access without server validation

---

## Previous Versions
[Previous changelog entries...]
