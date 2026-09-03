package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.UserDocumentStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface UserDocumentStatusRepository extends JpaRepository<UserDocumentStatus, String> {

    /**
     * Every status this user has recorded, across every cycle. Filtering to one cycle's
     * documents happens in the service by intersecting with that cycle's requirement ids
     * — a join here would need document_requirement -> recruitment_cycle, which is a
     * small enough set that the extra join isn't worth it for how rarely this is called.
     */
    List<UserDocumentStatus> findByUserId(UUID userId);
}
