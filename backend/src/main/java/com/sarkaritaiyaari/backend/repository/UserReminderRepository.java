package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.UserReminder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserReminderRepository extends JpaRepository<UserReminder, UUID> {

    List<UserReminder> findByUserIdOrderByRemindAtAsc(UUID userId);

    Optional<UserReminder> findByIdAndUserId(UUID id, UUID userId);

    /** The dispatch job's read: every unsent reminder due by now, oldest-due first. */
    @Query("select r from UserReminder r where r.sent = false and r.remindAt <= :now order by r.remindAt asc")
    List<UserReminder> findDue(@Param("now") OffsetDateTime now);
}
