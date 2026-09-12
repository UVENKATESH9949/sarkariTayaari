package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.AiTaskFlagDtos.AiTaskFlagView;
import com.sarkaritaiyaari.backend.dto.AiTaskFlagDtos.ClientConfigResponse;
import com.sarkaritaiyaari.backend.entity.AiTaskFlag;
import com.sarkaritaiyaari.backend.entity.AiTaskId;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.repository.AiTaskFlagRepository;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * TASK-2701 Phase 4. Per-task AI enable/disable, and the public client-config feed built from
 * the same data. "Unknown means off" is enforced simply by never materializing a row for a task
 * nobody has toggled yet — {@link #listFlags()}/{@link #clientConfig()} both synthesize a
 * disabled, version-0 view for any {@link AiTaskId} with no row, so every known task always
 * appears exactly once, never silently missing.
 */
@Service
public class AiTaskFlagService {

    private final AiTaskFlagRepository repository;

    public AiTaskFlagService(AiTaskFlagRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public List<AiTaskFlagView> listFlags() {
        Map<AiTaskId, AiTaskFlag> byId = new LinkedHashMap<>();
        repository.findAll().forEach(flag -> byId.put(flag.getTaskId(), flag));

        return Arrays.stream(AiTaskId.values())
                .map(id -> toView(id, byId.get(id)))
                .toList();
    }

    @Transactional(readOnly = true)
    public ClientConfigResponse clientConfig() {
        Map<AiTaskId, AiTaskFlag> byId = new LinkedHashMap<>();
        repository.findAll().forEach(flag -> byId.put(flag.getTaskId(), flag));

        Map<String, Boolean> aiTasks = new LinkedHashMap<>();
        for (AiTaskId id : AiTaskId.values()) {
            AiTaskFlag flag = byId.get(id);
            aiTasks.put(id.name(), flag != null && flag.isEnabled());
        }
        return new ClientConfigResponse(aiTasks);
    }

    @Transactional
    public AiTaskFlagView setFlag(User admin, String rawTaskId, boolean enabled, long expectedVersion) {
        AiTaskId taskId = parseTaskId(rawTaskId);

        var existing = repository.findById(taskId);
        AiTaskFlag flag = existing.orElseGet(() -> {
            AiTaskFlag created = new AiTaskFlag();
            created.setTaskId(taskId);
            created.setEnabled(false);
            return created;
        });

        long currentVersion = flag.getVersion() != null ? flag.getVersion() : 0L;
        if (currentVersion != expectedVersion) {
            throw new ObjectOptimisticLockingFailureException(AiTaskFlag.class, taskId);
        }

        flag.setEnabled(enabled);
        flag.setUpdatedAt(OffsetDateTime.now());
        flag.setUpdatedByEmail(admin.getEmail());
        if (existing.isEmpty()) {
            // Hibernate's @Version is never bumped by the initial INSERT itself, only by a
            // later UPDATE -- left alone, the very first save would persist at version 0,
            // making a second "expectedVersion: 0" call wrongly succeed instead of conflicting.
            // Hibernate honors an already-non-null version on a transient entity as its seed,
            // so assigning 1 here makes the row start "already written once".
            flag.setVersion(1L);
        }

        AiTaskFlag saved;
        try {
            saved = repository.save(flag);
        } catch (OptimisticLockingFailureException e) {
            throw new ObjectOptimisticLockingFailureException(AiTaskFlag.class, taskId);
        }
        return toView(taskId, saved);
    }

    private static AiTaskId parseTaskId(String rawTaskId) {
        try {
            return AiTaskId.valueOf(rawTaskId.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new IllegalArgumentException("Unknown AI task: " + rawTaskId);
        }
    }

    private static AiTaskFlagView toView(AiTaskId id, AiTaskFlag flag) {
        if (flag == null) {
            return new AiTaskFlagView(id.name(), false, null, null, 0L);
        }
        return new AiTaskFlagView(id.name(), flag.isEnabled(), flag.getUpdatedAt(), flag.getUpdatedByEmail(),
                flag.getVersion() != null ? flag.getVersion() : 0L);
    }
}
