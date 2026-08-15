package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.PaperSection;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PaperSectionRepository extends JpaRepository<PaperSection, UUID> {

    List<PaperSection> findByPaperIdOrderByDisplayOrderAsc(UUID paperId);

    Optional<PaperSection> findByPaperIdAndNameIgnoreCase(UUID paperId, String name);
}
