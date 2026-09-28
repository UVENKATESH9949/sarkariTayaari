package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.LessonVideoUpload;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.Set;
import java.util.UUID;

/**
 * Staged video files.
 *
 * <p>Deliberately no "find all" method. Every read here is by a known video id, because loading a
 * page of these would pull megabytes of file bytes into memory for a listing that only ever needs
 * to know whether a row exists - which {@link #existsById} answers without the bytes.
 */
public interface LessonVideoUploadRepository extends JpaRepository<LessonVideoUpload, UUID> {

    /**
     * Which of these videos still have a staged file, as ids only.
     *
     * <p>Selecting the id rather than the entity is the whole point: the admin list needs a yes/no
     * per row, and loading the entities to answer it would pull every pending video's bytes into
     * memory to look at a primary key.
     */
    @Query("SELECT u.videoId FROM LessonVideoUpload u WHERE u.videoId IN :videoIds")
    Set<UUID> findAllStagedVideoIds(@Param("videoIds") Collection<UUID> videoIds);
}
