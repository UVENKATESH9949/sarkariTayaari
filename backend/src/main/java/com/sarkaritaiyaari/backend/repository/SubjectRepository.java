package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.Subject;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SubjectRepository extends JpaRepository<Subject, UUID> {

    Optional<Subject> findByNameIgnoreCase(String name);

    List<Subject> findAllByOrderByDisplayOrderAscNameAsc();
}
