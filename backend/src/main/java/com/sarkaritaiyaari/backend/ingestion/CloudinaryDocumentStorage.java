package com.sarkaritaiyaari.backend.ingestion;

import com.cloudinary.Cloudinary;
import com.cloudinary.utils.ObjectUtils;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.Map;

/**
 * TASK-2401 Document 5 -- reuses the existing {@code Cloudinary} bean/credential
 * ({@code CloudinaryConfig}, already configured for {@code ImageUploadService}) rather
 * than a new vendor. {@code resource_type: "raw"} is what makes Cloudinary accept a PDF
 * -- its default image pipeline doesn't.
 */
@Component
public class CloudinaryDocumentStorage implements DocumentStorage {

    private final Cloudinary cloudinary;

    public CloudinaryDocumentStorage(Cloudinary cloudinary) {
        this.cloudinary = cloudinary;
    }

    @Override
    public String upload(byte[] bytes, String filename) {
        try {
            Map<?, ?> result = cloudinary.uploader().upload(bytes, ObjectUtils.asMap(
                    "resource_type", "raw",
                    "public_id", "ingestion/" + filename));
            return (String) result.get("secure_url");
        } catch (IOException e) {
            throw new IllegalStateException("Document upload failed: " + e.getMessage(), e);
        }
    }
}
