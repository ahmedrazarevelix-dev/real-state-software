class ApiError extends Error {
    /**
     * @param {number} statusCode  - HTTP status code
     * @param {string} message     - Human-readable message
     * @param {Array}  errors      - Optional array of field/validation errors
     * @param {string} stack       - Optional stack override
     */
    constructor(statusCode, message = "Something went wrong", errors = [], stack = "") {
        super(message);
        this.statusCode = statusCode;
        this.message = message;
        this.errors = errors;
        this.success = false;

        if (stack) {
            this.stack = stack;
        } else {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}

module.exports = ApiError;

