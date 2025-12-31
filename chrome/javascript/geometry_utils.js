// Rectangle validation and sanitization utilities
// Pure functions with no Chrome API dependencies

// Sanitize rectangle values to be within reasonable bounds
function sanitizeRect(rect) {
  return {
    left: isFinite(rect.left) ? Math.max(0, Math.min(rect.left, 10000)) : 0,
    top: isFinite(rect.top) ? Math.max(0, Math.min(rect.top, 10000)) : 0,
    width: isFinite(rect.width) ? Math.max(1, Math.min(rect.width, 10000)) : 1,
    height: isFinite(rect.height) ? Math.max(1, Math.min(rect.height, 10000)) : 1
  };
}

// Validate rectangle against image bounds for cropping
function validateRect(rect, imgWidth, imgHeight) {
  const validated = {
    left: Math.max(0, Math.min(rect.left, imgWidth)),
    top: Math.max(0, Math.min(rect.top, imgHeight)),
    width: Math.max(1, Math.min(rect.width, imgWidth - Math.max(0, rect.left))),
    height: Math.max(1, Math.min(rect.height, imgHeight - Math.max(0, rect.top)))
  };

  // Ensure cropped rectangle is valid
  if (validated.width <= 0 || validated.height <= 0) {
    validated.width = Math.max(1, validated.width);
    validated.height = Math.max(1, validated.height);
  }

  return validated;
}

// Export for module usage (ESM)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    sanitizeRect: sanitizeRect,
    validateRect: validateRect
  };
}

// Export for ES6 modules
if (typeof window === 'undefined' && typeof exports !== 'undefined') {
  exports.sanitizeRect = sanitizeRect;
  exports.validateRect = validateRect;
}
