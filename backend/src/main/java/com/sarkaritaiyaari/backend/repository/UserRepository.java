package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {

    /** Email is stored lower-cased, so callers must normalise before looking up. */
    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);
}
