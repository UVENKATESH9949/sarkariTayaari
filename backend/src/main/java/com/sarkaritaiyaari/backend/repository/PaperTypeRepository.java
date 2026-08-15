package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.PaperType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PaperTypeRepository extends JpaRepository<PaperType, String> {

    List<PaperType> findAllByOrderByDisplayOrderAsc();
}
