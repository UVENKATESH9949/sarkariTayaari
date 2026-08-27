package com.sarkaritaiyaari.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.List;
import java.util.UUID;

public class TopicRequest {

    @NotNull
    private UUID subjectId;

    @NotBlank
    private String name;

    private int displayOrder;

    /** Optional. Another topic under the same subject, or null for a top-level topic. */
    private UUID parentId;

    /**
     * Optional. Full replacement list, like the exam syllabus endpoint — the admin sends
     * the complete set of prerequisites it wants, not a delta. Null means "leave
     * unchanged" so an older client that doesn't know about this field can't silently
     * wipe curated edges; an empty list means "clear them".
     */
    private List<UUID> prerequisiteTopicIds;

    public UUID getParentId() {
        return parentId;
    }

    public void setParentId(UUID parentId) {
        this.parentId = parentId;
    }

    public List<UUID> getPrerequisiteTopicIds() {
        return prerequisiteTopicIds;
    }

    public void setPrerequisiteTopicIds(List<UUID> prerequisiteTopicIds) {
        this.prerequisiteTopicIds = prerequisiteTopicIds;
    }

    public UUID getSubjectId() {
        return subjectId;
    }

    public void setSubjectId(UUID subjectId) {
        this.subjectId = subjectId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public int getDisplayOrder() {
        return displayOrder;
    }

    public void setDisplayOrder(int displayOrder) {
        this.displayOrder = displayOrder;
    }
}
