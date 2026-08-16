package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.UserToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

public interface UserTokenRepository extends JpaRepository<UserToken, String> {

    /**
     * Loads the token with its user already attached.
     *
     * `UserToken.user` is lazy and `open-in-view` is off, so a plain findById returns a
     * proxy that throws LazyInitializationException the moment a caller reads a field
     * after the transaction closes. Every authenticated endpoint does exactly that, so
     * the join fetch is required, not an optimisation.
     */
    @Query("select t from UserToken t join fetch t.user where t.token = :token")
    Optional<UserToken> findByTokenWithUser(@Param("token") String token);

    void deleteByUserId(UUID userId);

    /** Housekeeping: expired tokens are dead weight and nothing should ever accept them. */
    @Modifying
    @Query("delete from UserToken t where t.expiresAt < :now")
    int deleteExpired(@Param("now") OffsetDateTime now);
}
