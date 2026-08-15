package com.sarkaritaiyaari.backend.dto;

import jakarta.validation.constraints.NotNull;

import java.util.List;
import java.util.UUID;

/**
 * The complete set of subjects an exam covers. Sent whole rather than as add/remove
 * operations — the admin screen edits a checklist, so replacing the list is what it
 * actually means. An empty list is valid: it clears the syllabus.
 */
public class SyllabusRequest {

    @NotNull
    private List<UUID> subjectIds;

    public List<UUID> getSubjectIds() {
        return subjectIds;
    }

    public void setSubjectIds(List<UUID> subjectIds) {
        this.subjectIds = subjectIds;
    }
}
