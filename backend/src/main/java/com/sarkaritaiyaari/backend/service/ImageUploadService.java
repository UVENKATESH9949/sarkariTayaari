package com.sarkaritaiyaari.backend.service;

import com.cloudinary.Cloudinary;
import com.cloudinary.utils.ObjectUtils;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Map;

/**
 * One generic upload used by any admin form that needs an image (exam cards today;
 * question diagrams, profile pictures, etc. can reuse this later) — callers just store
 * the returned URL on whichever entity needs it, nothing here is exam/question-specific.
 */
@Service
public class ImageUploadService {

    private final Cloudinary cloudinary;

    public ImageUploadService(Cloudinary cloudinary) {
        this.cloudinary = cloudinary;
    }

    public String upload(MultipartFile file) {
        try {
            Map<?, ?> result = cloudinary.uploader().upload(file.getBytes(), ObjectUtils.emptyMap());
            return (String) result.get("secure_url");
        } catch (IOException e) {
            throw new IllegalStateException("Image upload failed: " + e.getMessage(), e);
        }
    }
}
