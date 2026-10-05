const multer = require("multer");

const allowedMimeTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);

const documentUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, callback) => {
        if (!allowedMimeTypes.has(file.mimetype)) {
            return callback(new Error("Only PDF, JPG, and PNG documents are allowed"));
        }
        callback(null, true);
    },
});

module.exports = documentUpload;
