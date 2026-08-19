package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.ImageUploadResponse;
import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.ImageUploadService;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/images")
public class ImageUploadController {

    private final ImageUploadService imageUploadService;
    private final AuthService authService;

    public ImageUploadController(ImageUploadService imageUploadService, AuthService authService) {
        this.imageUploadService = imageUploadService;
        this.authService = authService;
    }

    @PostMapping
    public ImageUploadResponse upload(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                       @RequestParam("file") MultipartFile file) {
        authService.requireAdmin(authorization);
        return new ImageUploadResponse(imageUploadService.upload(file));
    }
}
