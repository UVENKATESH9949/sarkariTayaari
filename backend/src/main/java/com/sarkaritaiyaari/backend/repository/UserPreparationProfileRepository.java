package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.UserPreparationProfile;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

/** One profile per account (TASK-3301, V48). The user id is the primary key, so this is enough. */
public interface UserPreparationProfileRepository extends JpaRepository<UserPreparationProfile, UUID> {

    Optional<UserPreparationProfile> findByUserId(UUID userId);
}
