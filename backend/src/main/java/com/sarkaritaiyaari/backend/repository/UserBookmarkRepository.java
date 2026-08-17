package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.UserBookmark;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserBookmarkRepository extends JpaRepository<UserBookmark, String> {

    Optional<UserBookmark> findByUserIdAndQuestionId(UUID userId, UUID questionId);

    List<UserBookmark> findByUserIdAndDeletedFalse(UUID userId);
}
