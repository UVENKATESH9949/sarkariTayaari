package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.UserProfileSummary;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserProfileSummaryRepository extends JpaRepository<UserProfileSummary, String> {
}
