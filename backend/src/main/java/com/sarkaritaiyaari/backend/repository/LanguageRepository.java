package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.Language;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface LanguageRepository extends JpaRepository<Language, String> {

    List<Language> findByActiveTrue();
}
