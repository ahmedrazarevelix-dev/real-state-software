const crypto = require("crypto");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const ApiError = require("../utils/ApiError");

const bucket = process.env.SUPABASE_STORAGE_BUCKET;
const client = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
    })
    : null;

const requireStorageConfig = () => {
    if (!client || !bucket) {
        throw new ApiError(503, "Supabase private document storage is not configured");
    }
};

const uploadPrivateFile = async (file, prefix) => {
    requireStorageConfig();
    const extension = path.extname(file.originalname).toLowerCase();
    const key = `${prefix}/${crypto.randomUUID()}${extension}`;

    const { error } = await client.storage.from(bucket).upload(key, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
    });
    if (error) throw new ApiError(502, `Document upload failed: ${error.message}`);

    return key;
};

const deletePrivateFile = async (key) => {
    if (!key) return;
    requireStorageConfig();
    const { error } = await client.storage.from(bucket).remove([key]);
    if (error) throw new ApiError(502, `Document deletion failed: ${error.message}`);
};

const createPrivateDownloadUrl = async (key, expiresIn = 300) => {
    requireStorageConfig();
    const { data, error } = await client.storage.from(bucket).createSignedUrl(key, expiresIn);
    if (error) throw new ApiError(502, `Signed URL creation failed: ${error.message}`);
    return data.signedUrl;
};

module.exports = { uploadPrivateFile, deletePrivateFile, createPrivateDownloadUrl };
