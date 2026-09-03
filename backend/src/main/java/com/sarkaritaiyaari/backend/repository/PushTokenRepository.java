package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.PushToken;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PushTokenRepository extends JpaRepository<PushToken, UUID> {

    Optional<PushToken> findByUserIdAndExpoToken(UUID userId, String expoToken);

    List<PushToken> findByUserId(UUID userId);
}
