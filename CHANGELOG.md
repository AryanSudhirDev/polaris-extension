# Changelog

## [1.5.4] - 2026-01-05

### 🆕 Time-Limited Premium Tokens

#### Added
- **90 Time-Limited Premium Tokens**: Added 3 batches of 30 tokens each that expire after 1 month
- **Expiration Checking**: Built-in token expiration validation (no server required)
- **Organized Batches**: Tokens separated into 3 groups for easier distribution
- **Expiration Date**: All tokens expire on February 6, 2026

#### Technical Details
- Implemented `TOKEN_EXPIRATION` map with token -> expiry date mapping
- Enhanced `validateAccessToken()` to check expiration dates before granting access
- Time-based validation using JavaScript Date objects
- Clear error messages when tokens expire
- Maintains backward compatibility with permanent premium tokens

#### Token Distribution
- **Batch 1**: 30 tokens (expires 2026-02-06)
- **Batch 2**: 30 tokens (expires 2026-02-06)
- **Batch 3**: 30 tokens (expires 2026-02-06)
- **Total**: 90 time-limited tokens + 90 permanent tokens = 180 premium access tokens

#### Benefits
- ✅ **Trial Access**: Provide temporary premium access for testing
- ✅ **Time-Bound Offers**: Create promotional campaigns with expiration
- ✅ **Better Control**: Tokens automatically expire without server intervention
- ✅ **Clear Messaging**: Users get informed when tokens expire

---

## [1.5.2] - 2026-01-02

### 🚀 Major Security & Architecture Update

#### Changed
- **Secure Backend Architecture**: Migrated from embedded API keys to Vercel serverless backend proxy
- **No Client-Side Keys**: OpenAI API key now stored securely server-side only
- **Production-Ready**: Extension now safe for public distribution without key exposure

#### Technical Details
- Implemented `/api/chat.ts` Vercel serverless function
- Removed `PROMPTR_MASTER_KEY` from webpack environment plugin
- Updated default API base to `https://promptr-api.vercel.app`
- Authorization header now handled by backend proxy
- CORS enabled for extension access

#### Benefits
- ✅ **Secure**: API keys never exposed in extension bundle
- ✅ **Scalable**: Vercel handles all API traffic
- ✅ **Reliable**: Auto-deploys on git push
- ✅ **Professional**: Enterprise-grade architecture

---

## [1.5.0] - 2025-11-22

### Added
- **30 New Premium Bypass Tokens**: Added additional batch of cryptographically secure premium access codes
- **Extended Premium Access**: Total of 120+ premium tokens now available for unlimited usage

### Technical Details
- Maintained Set-based exact matching for optimal O(1) performance
- Synchronized token sets across files
- Premium tokens continue to bypass all usage limits and authentication

---

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
