package com.sarkaritaiyaari.backend.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Allowed origins are configuration, not a constant, because the admin app is served
 * from a different origin in every environment: localhost:5173 in dev, a real hosted
 * URL in production. This was hardcoded to localhost only, which meant a deployed
 * admin site would have every request rejected by the browser before it ever reached
 * a controller — the failure looks like a backend outage but is entirely CORS.
 *
 * Set as a comma-separated list. On Cloud Run that is the environment variable
 * APP_CORS_ALLOWED_ORIGINS (Spring's relaxed binding maps it to this property):
 *
 *   APP_CORS_ALLOWED_ORIGINS=https://admin.example.com,http://localhost:5173
 *
 * Origins must be exact and scheme-qualified — http://127.0.0.1:5173 is a different
 * origin from http://localhost:5173, and a trailing slash makes it a third one.
 */
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    private final String[] allowedOrigins;

    public CorsConfig(@Value("${app.cors.allowed-origins}") String[] allowedOrigins) {
        this.allowedOrigins = allowedOrigins;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(allowedOrigins)
                .allowedMethods("GET", "POST", "PUT", "DELETE")
                .allowedHeaders("*");
    }
}
